import axios from 'axios';
import { config } from '../config/index.js';

// One place for all AI calls. Works with any OpenAI-compatible API (OpenAI, Gemini, Groq, Ollama),
// chosen with AI_BASE_URL / AI_API_KEY / AI_MODEL in .env.
//
// Temporary problems (503 "overloaded", 500, timeouts, per-minute 429) are retried with growing
// waits: 10s, 30s, 60s. The last try uses AI_FALLBACK_MODEL if set.
// "No credits / quota used up" is NOT retried - it can't succeed until someone fixes the account.

const RETRY_WAITS_MS = [10000, 30000, 60000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;
async function respectRateLimit() {
    const wait = lastRequestAt + config.ai.minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
}

function isTemporary(err) {
    const status = err.response?.status;
    const info = JSON.stringify(err.response?.data?.error || err.response?.data || '').toLowerCase();
    const quotaGone = info.includes('insufficient_quota') || info.includes('per day') || info.includes('perday');
    if (status === 429) return !quotaGone;
    return status >= 500 || ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code);
}

export async function chatCompletion(body) {
    if (!config.ai.apiKey) throw new Error('AI_API_KEY is not set');

    const send = async (model) => {
        await respectRateLimit();
        return axios.post(`${config.ai.baseUrl}/chat/completions`, { model, ...body }, {
            headers: { Authorization: `Bearer ${config.ai.apiKey}` },
            timeout: 180000,
        });
    };

    let lastError;
    for (let attempt = 0; attempt <= RETRY_WAITS_MS.length; attempt++) {
        const isLast = attempt === RETRY_WAITS_MS.length;
        const model = isLast && config.ai.fallbackModel ? config.ai.fallbackModel : config.ai.model;
        try {
            return await send(model);
        } catch (err) {
            lastError = err;
            if (!isTemporary(err) || isLast) break;
            console.log(`[ai] ${err.response?.status || err.code} from ${model} - retrying in ${RETRY_WAITS_MS[attempt] / 1000}s`);
            await sleep(RETRY_WAITS_MS[attempt]);
        }
    }
    throw lastError;
}