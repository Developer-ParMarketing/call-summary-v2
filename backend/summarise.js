import axios from 'axios';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const SYSTEM_PROMPT = `You summarise recorded phone calls from a debt-settlement / loan advisory company in India.

The transcript comes from speech-to-text, so:
- It is mostly in Hindi or Hinglish (Hindi mixed with English words).
- It has NO speaker labels, and some words may be misheard.

Who is who:
- Agent = the company's financial advisor (introduces themselves, says the call is recorded).
- Customer = the borrower talking about THEIR loans, EMIs, income, problems.
- A name the agent mentions ("you spoke with X earlier") may be a colleague, NOT the customer.

Write the summary in ENGLISH, in your own words (do not copy transcript lines).
Cover:
- Why the call happened and the customer's situation
- Loans discussed: bank names, loan types, outstanding amounts, current EMIs
- What the agent proposed (plan, new EMI, fees) and what the customer can afford
- What was agreed, and next steps (documents, follow-up, timelines)
- The customer's overall response (interested, unsure, refused)

Always include exact numbers (amounts, EMIs, fees) when they are mentioned.
If something is unclear in the transcript, say so instead of guessing.

Return ONLY a JSON object: {"summary": "<2-4 paragraphs of plain English>"}`;

// One retry for temporary problems (rate limit, server error, timeout)
async function postToOpenAI(body) {
    const send = () =>
        axios.post('https://api.openai.com/v1/chat/completions', body, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            timeout: 180000,
        });

    try {
        return await send();
    } catch (err) {
        const status = err.response?.status;
        const temporary = status === 429 || status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ECONNRESET';
        if (!temporary) throw err;
        await new Promise((r) => setTimeout(r, 5000));
        return send();
    }
}

export async function summariseTranscript(transcript) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');

    const res = await postToOpenAI({
        model: MODEL,
        temperature: 0.3,
        response_format: { type: 'json_object' }, // forces valid JSON back
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Call transcript:\n\n${transcript}` },
        ],
    });

    const content = res.data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content);

    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
        throw new Error('OpenAI returned no summary');
    }
    return parsed.summary.trim();
}