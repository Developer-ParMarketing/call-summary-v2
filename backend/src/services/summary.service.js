import { chatCompletion } from './openai.js';

// What a good summary looks like - shared by the text summary and the "AI listens" engine
export const SUMMARY_FORMAT = `Write the summary in English so that someone who did NOT hear the call
fully understands what happened - clear and specific, but without filler.

Start with:
Overview: 2-3 sentences (max 60 words) - who called whom and why, what was discussed, how it ended.

Then key points, ONE sentence each (max 25 words), using these labels in this order.
LEAVE OUT any label the call did not cover:
Customer situation: their problem in their own terms (job, salary delays, medical, business loss...)
Loans: how many, type (personal / credit card / app loans), banks or apps named, total outstanding
EMI & income: current monthly EMI vs monthly income, missed EMIs, recovery or harassment calls
Agent explained: the service or plan explained (e.g. combining EMIs into one, new EMI, fees, tenure)
Customer concerns: questions, doubts or objections the customer raised
Outcome: customer's decision or mood (interested / unsure / not interested / wants a call back)
Next step: what happens next and when (documents, transfer to advisor, call back time)

Rules: keep exact numbers (Rs amounts, counts, dates) and names of banks/apps. Don't guess -
leave a label out if it is unclear. For a very short call, the Overview and Outcome are enough.`;

const PROMPT = `You summarise recorded phone calls from a debt-settlement / loan advisory company in India.

The transcript comes from speech-to-text: it is in Hinglish or Hindi, and some words may be misheard.
Agent = the company's advisor. Customer = the borrower talking about THEIR loans and EMIs.

${SUMMARY_FORMAT}

Return ONLY a JSON object: {"summary": "Overview: ...\nCustomer situation: ...\nOutcome: ..."}`;

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