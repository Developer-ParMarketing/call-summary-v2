import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { Call, Control, connectDb } from './db.js';
import { getDurationSeconds, transcribeFile } from './transcribe.js';
import { summariseTranscript } from './summarise.js';
import { getWindow, isInsideWindow } from './schedule.js';

const TEMP_DIR = path.resolve('temp');
const POLL_MS = 5000;        // while running: check for the next call every 5s
const IDLE_CHECK_MS = 10000; // while waiting: check for a start signal every 10s

// PBX has an incomplete SSL chain -> allow skipping verification for recordings only
const recordingAgent = new https.Agent({
    rejectUnauthorized: process.env.RECORDING_TLS_VERIFY !== 'false',
});

fs.mkdirSync(TEMP_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isExplainDmp(disposition) {
    return /^explain(ed)?\s*dmp$/i.test(String(disposition || '').trim());
}

// Take the oldest queued call and mark it "processing" in ONE step,
// so two workers can never grab the same call
async function claimNextCall() {
    return Call.findOneAndUpdate(
        { status: 'queued' },
        { $set: { status: 'processing' } },
        { sort: { createdAt: 1 }, returnDocument: 'after' }
    );
}

// Stream the file straight to disk (doesn't load a 1-hour recording into RAM)
async function downloadRecording(url, callId) {
    const safeName = String(callId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(TEMP_DIR, `${safeName}.audio`);

    const res = await axios.get(url, {
        responseType: 'stream',
        timeout: 60000,
        httpsAgent: recordingAgent,
    });
    await pipeline(res.data, fs.createWriteStream(filePath));

    return { filePath, bytes: fs.statSync(filePath).size };
}

// Mark a call as skipped with a reason
async function skip(call, reason, logText) {
    call.status = 'skipped';
    call.skipReason = reason;
    await call.save();
    console.log(`[${call.callId}] skipped: ${logText}`);
}

async function processCall(call) {
    console.log(`[${call.callId}] processing`);

    if (!isExplainDmp(call.firstDisposition)) {
        return skip(call, 'disposition_not_explain_dmp', `disposition is "${call.firstDisposition || 'empty'}"`);
    }

    let stage = 'download';
    let filePath; // downloaded recording (deleted at the end)
    try {
        // Retry case: transcript already saved from an earlier attempt -> reuse it
        if (call.transcript && call.transcript.trim()) {
            console.log(`[${call.callId}] reusing saved transcript (${call.transcript.length} characters)`);
        } else {
            if (!call.recordUrl) {
                return skip(call, 'missing_record_url', 'no recording URL');
            }

            const downloaded = await downloadRecording(call.recordUrl, call.callId);
            filePath = downloaded.filePath;
            call.audioBytes = downloaded.bytes;
            console.log(`[${call.callId}] downloaded ${(downloaded.bytes / 1024 / 1024).toFixed(2)} MB`);

            // Check real length; skip calls of 30 seconds or less
            stage = 'duration';
            const seconds = await getDurationSeconds(filePath);
            call.audioSeconds = Math.round(seconds);
            if (seconds <= 30) {
                return skip(call, 'audio_too_short', `only ${call.audioSeconds}s`);
            }

            stage = 'transcribe';
            console.log(`[${call.callId}] transcribing ${call.audioSeconds}s of audio...`);
            call.language = 'hi';
            call.transcript = await transcribeFile(filePath, seconds, call.language);
            await call.save(); // save progress now, so a later failure doesn't lose it
            console.log(`[${call.callId}] transcript ready (${call.transcript.length} characters)`);
        }

        // Nothing was said (silence / music) -> nothing to summarise
        if (!call.transcript.trim()) {
            return skip(call, 'no_speech', 'no speech found');
        }

        stage = 'summary';
        console.log(`[${call.callId}] summarising...`);
        call.summary = await summariseTranscript(call.transcript);

        call.status = 'done';
        call.errorMessage = undefined; // clear any error from an earlier attempt
        await call.save();
        console.log(`[${call.callId}] done - summary ready (${call.summary.length} characters)`);
    } catch (err) {
        const detail = err.response?.data?.error?.message; // e.g. OpenAI's own explanation
        call.status = 'failed';
        call.errorMessage = `${stage}: ${err.message}${detail ? ` - ${detail}` : ''}`;
        await call.save();
        console.log(`[${call.callId}] failed at ${call.errorMessage}`);
    } finally {
        // The transcript is saved in the DB, so the audio file is no longer needed
        if (filePath) fs.rmSync(filePath, { force: true });
    }
}

// Should we be processing right now? -> 'manual', 'schedule', or null (wait)
async function getRunMode() {
    const control = await Control.findById('worker').lean();
    if (control?.runRequested) return 'manual';
    if (isInsideWindow()) return 'schedule';
    return null;
}

async function loop() {
    let lastMode; // only log when the mode changes (avoids log spam)

    while (true) {
        try {
            const mode = await getRunMode();

            if (mode !== lastMode) {
                console.log(
                    mode
                        ? `Processing ON (${mode === 'manual' ? 'manual run' : 'time window'})`
                        : 'Processing OFF - calls stay queued until the time window opens or /api/process/run is called'
                );
                lastMode = mode;
            }

            if (!mode) {
                await sleep(IDLE_CHECK_MS);
                continue;
            }

            const call = await claimNextCall();
            if (!call) {
                // Queue is empty. A manual run ends here.
                if (mode === 'manual') {
                    await Control.updateOne(
                        { _id: 'worker' },
                        { $set: { runRequested: false, lastRunFinishedAt: new Date() } }
                    );
                    console.log('Manual run finished: no more queued calls');
                }
                await sleep(POLL_MS);
                continue;
            }

            await processCall(call);
        } catch (err) {
            console.error('Worker error:', err.message);
            await sleep(POLL_MS);
        }
    }
}

connectDb()
    .then(() => {
        const w = getWindow();
        console.log(`Worker started. Time window: ${w ? w.label : 'none (manual only)'}`);
        loop();
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    });