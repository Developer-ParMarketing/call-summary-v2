// Speech to text with Bhashini: cut the recording into 30-second WAV pieces and transcribe each.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import { config } from '../config/index.js';

const CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';

// Cut a piece of the audio and convert it to the format Bhashini wants:
// WAV, 16000 Hz, mono
export function toWavChunk(inputPath, outputPath, startSec, durationSec) {
    return new Promise((resolve, reject) => {
        const args = [
            '-y', '-ss', String(startSec), '-t', String(durationSec),
            '-i', inputPath,
            '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
            outputPath,
        ];
        const ff = spawn('ffmpeg', args);
        let errText = '';
        ff.stderr.on('data', (d) => (errText += d));
        ff.on('error', reject); // e.g. ffmpeg not installed
        ff.on('close', (code) =>
            code === 0 ? resolve(outputPath) : reject(new Error(`ffmpeg failed: ${errText.slice(-300)}`))
        );
    });
}

// How long is the recording? (seconds)
export function getDurationSeconds(filePath) {
    return new Promise((resolve, reject) => {
        const p = spawn('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath,
        ]);
        let out = '';
        let errText = '';
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (errText += d));
        p.on('error', reject);
        p.on('close', (code) => {
            const sec = parseFloat(out);
            if (code === 0 && Number.isFinite(sec)) resolve(sec);
            else reject(new Error(`ffprobe failed: ${errText.slice(-200)}`));
        });
    });
}

// Bhashini step 1: ask "which ASR service handles this language?"
// Cached for 30 minutes so we don't ask again for every chunk.
const asrCache = new Map(); // language -> { cfg, at }

async function getAsrConfig(language) {
    const cached = asrCache.get(language);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.cfg;

    const res = await axios.post(
        CONFIG_URL,
        {
            pipelineTasks: [{ taskType: 'asr', config: { language: { sourceLanguage: language } } }],
            pipelineRequestConfig: { pipelineId: config.bhashini.pipelineId },
        },
        {
            headers: {
                userID: config.bhashini.userId,
                ulcaApiKey: config.bhashini.udyatKey,
            },
            timeout: 30000,
        }
    );

    const asr = res.data.pipelineResponseConfig?.find((t) => t.taskType === 'asr');
    const endpoint = res.data.pipelineInferenceAPIEndPoint;
    if (!asr?.config?.[0]?.serviceId || !endpoint?.callbackUrl) {
        throw new Error(`No Bhashini ASR service for language: ${language}`);
    }

    const cfg = {
        serviceId: asr.config[0].serviceId,
        callbackUrl: endpoint.callbackUrl,
        authName: endpoint.inferenceApiKey?.name,
        authValue: endpoint.inferenceApiKey?.value,
    };
    asrCache.set(language, { cfg, at: Date.now() });
    return cfg;
}

// Bhashini step 2: send one WAV piece and get text back
export async function transcribeWav(wavPath, language = 'hi') {
    const cfg = await getAsrConfig(language);
    const audioContent = fs.readFileSync(wavPath).toString('base64');

    const headers = {};
    if (cfg.authName) headers[cfg.authName] = cfg.authValue;

    const res = await axios.post(
        cfg.callbackUrl,
        {
            pipelineTasks: [
                {
                    taskType: 'asr',
                    config: {
                        language: { sourceLanguage: language },
                        serviceId: cfg.serviceId,
                        audioFormat: 'wav',
                        samplingRate: 16000,
                    },
                },
            ],
            inputData: { audio: [{ audioContent }] },
        },
        { headers, timeout: 120000, maxBodyLength: Infinity, maxContentLength: Infinity }
    );

    return (res.data.pipelineResponse?.[0]?.output?.[0]?.source || '').trim();
}

// Transcribe the whole file, 30 seconds at a time, and join the text
export async function transcribeFile(inputPath, durationSec, language = 'hi', chunkSec = 30) {
    const name = path.parse(inputPath).name;
    const totalChunks = Math.ceil(durationSec / chunkSec);
    const parts = [];

    for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(path.dirname(inputPath), `${name}_chunk${i}.wav`);
        try {
            await toWavChunk(inputPath, chunkPath, i * chunkSec, chunkSec);
            const text = await transcribeWav(chunkPath, language);
            if (text) parts.push(text);
            console.log(`[${name}] chunk ${i + 1}/${totalChunks} transcribed`);
        } finally {
            fs.rmSync(chunkPath, { force: true }); // always delete the chunk file
        }
    }

    return parts.join(' ');
}
