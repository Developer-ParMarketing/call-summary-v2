import axios from 'axios';
import { config } from '../config/index.js';

// One place for all OpenAI calls. Retries once for temporary problems,
// but NOT for "no credits" (insufficient_quota) - retrying that only wastes time.
export async function chatCompletion(body) {
    if (!config.openai.apiKey) throw new Error('OPENAI_API_KEY is not set');

    const send = () =>
        axios.post('https://api.openai.com/v1/chat/completions', { model: config.openai.model, ...body }, {
            headers: { Authorization: `Bearer ${config.openai.apiKey}` },
            timeout: 180000,
        });

    try {
        return await send();
    } catch (err) {
        const status = err.response?.status;
        const code = err.response?.data?.error?.code;
        const temporary =
            (status === 429 && code !== 'insufficient_quota') || status >= 500 ||
            err.code === 'ECONNABORTED' || err.code === 'ECONNRESET';
        if (!temporary) throw err;
        await new Promise((r) => setTimeout(r, 5000));
        return send();
    }
}
