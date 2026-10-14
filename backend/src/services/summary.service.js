import { chatCompletion } from './openai.js';

const PROMPT = `You summarise recorded phone calls from a debt-settlement / loan advisory company in India.

The transcript comes from speech-to-text, so:
- It is in Hinglish (Hindi in Roman letters mixed with English) or in Hindi.
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

export async function summarise(transcript, context = {}) {
    const known = Object.entries(context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

    const res = await chatCompletion({
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: `${known ? `Known from the dialer:\n${known}\n\n` : ''}Call transcript:\n\n${transcript}` },
        ],
    });

    const parsed = JSON.parse(res.data.choices?.[0]?.message?.content || '{}');
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) throw new Error('OpenAI returned no summary');
    return parsed.summary.trim();
}
