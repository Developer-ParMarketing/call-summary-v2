import fs from 'fs';
import path from 'path';
import https from 'https';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { config } from '../config/index.js';

export const TEMP_DIR = path.resolve('temp');
fs.mkdirSync(TEMP_DIR, { recursive: true });

// PBX has an incomplete SSL chain -> optional skip of the check, for recordings only
const recordingAgent = new https.Agent({ rejectUnauthorized: config.recordingTlsVerify });

// Stream the recording straight to disk (a 1-hour call never sits in memory)
export async function downloadRecording(url, callId) {
    const safeName = String(callId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(TEMP_DIR, `${safeName}.audio`);

    const res = await axios.get(url, { responseType: 'stream', timeout: 60000, httpsAgent: recordingAgent });
    await pipeline(res.data, fs.createWriteStream(filePath));

    return { filePath, bytes: fs.statSync(filePath).size };
}

export const removeFile = (filePath) => filePath && fs.rmSync(filePath, { force: true });
