import { chatCompletion } from './openai.js';

const PROMPT = `You summarise recorded phone calls from a debt-settlement / loan advisory company in India.

The transcript comes from speech-to-text, so:
- It is in Hinglish (Hindi in Roman letters mixed with English) or in Hindi.
- It has NO speaker labels, and some words may be misheard.
- Agent = the company's advisor. Customer = the borrower talking about THEIR loans and EMIs.

Write a SHORT summary in English as key points: at most 6 lines, each line under 15 words.
Use these labels, in this order, and LEAVE OUT any label the call did not cover:
Situation: why the customer enquired / their problem
Loans: how many, type, banks or apps, total outstanding
EMI & income: current monthly EMI vs monthly income
Offer: what the agent proposed
Outcome: customer's response (interested / unsure / not interested / call back)
Next step: what happens next, and when

Rules:
- Keep exact numbers (amounts in Rs, counts, dates). No filler words, no full paragraphs.
- Don't guess. If something is unclear, leave that label out.
- If the call is too short or unclear, write just one line, e.g. "Outcome: customer asked for a call back".

Return ONLY a JSON object: {"summary": "Situation: ...\nLoans: ...\nOutcome: ..."}`;

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

    // Expected: {"summary": "..."}. Some providers wrap it in ```json fences or return plain text.
    const content = String(res.data.choices?.[0]?.message?.content || '').trim();
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let summary;
    try {
        summary = JSON.parse(cleaned).summary;
    } catch {
        summary = cleaned; // not JSON -> use the text as the summary
    }
    if (typeof summary !== 'string' || !summary.trim()) throw new Error('AI returned no summary');
    return summary.trim();
}