import axios from 'axios';
import { config } from '../config/index.js';

// One place for all AI calls. Works with any OpenAI-compatible API (OpenAI, Gemini, Groq, Ollama),
// chosen with AI_BASE_URL / AI_API_KEY / AI_MODEL in .env.
// Retries once for temporary problems, but NOT when credits are used up (retrying only wastes time).

let lastRequestAt = 0;

async function respectRateLimit() {
    const wait = lastRequestAt + config.ai.minGapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
}

export async function chatCompletion(body) {
    if (!config.ai.apiKey) throw new Error('AI_API_KEY is not set');

    const send = async () => {
        await respectRateLimit();
        return axios.post(`${config.ai.baseUrl}/chat/completions`, { model: config.ai.model, ...body }, {
            headers: { Authorization: `Bearer ${config.ai.apiKey}` },
            timeout: 180000,
        });
    };

    try {
        return await send();
    } catch (err) {
        const status = err.response?.status;
        const code = err.response?.data?.error?.code;
        const temporary =
            (status === 429 && code !== 'insufficient_quota') || status >= 500 ||
            err.code === 'ECONNABORTED' || err.code === 'ECONNRESET';
        if (!temporary) throw err;
        await new Promise((r) => setTimeout(r, status === 429 ? 30000 : 5000)); // rate limit -> wait longer
        return send();
    }
}