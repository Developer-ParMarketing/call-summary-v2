import { chatCompletion } from './openai.js';

// Who is who on our calls - shared by the text summary and the "AI listens" engine
export const ROLES = `Our company is a debt-settlement firm in India. Our EXECUTIVE calls on behalf of OUR CLIENT
(a borrower who has signed up with us). The person on the other side is usually a CREDITOR:
a bank, NBFC or loan app, its collection / recovery department or a recovery agent.
Sometimes the other person is our CLIENT himself/herself (e.g. welcome, PTP or token calls).
Decide from the conversation who the other person is. Never call our executive an "agent" and
never call the creditor a "customer".`;

// What a good summary looks like
export const SUMMARY_FORMAT = `Write a SHORT, factual summary in English for our team: key points only.
No overview, no introduction, no story - start directly with the first label below.

ONE short line per label, in this order. LEAVE OUT any label the call did not cover:
Spoke with: creditor / bank / app name, department and person's name (or "Client" if it was our client)
Client: our client's name and any loan / account / reference number mentioned
Loan details: loan type, outstanding, overdue, EMI, DPD / months unpaid
Amounts & dates: every amount and date said (settlement offer, PTP, token, payment, due dates)
Contacts: phone numbers, emails, branch or address given in the call
Discussion: what we asked or explained (settlement, stop harassment, NOC, closure, payment plan...)
Creditor response: what they agreed, refused or asked for
Outcome: result of the call (agreed / refused / pending / wrong number / not reachable)
Next step: what happens next, who does it and when

Rules: write numbers, amounts (Rs), dates and names EXACTLY as said. Don't guess - leave a label out
if it is unclear. No opinions about tone unless it matters (e.g. abusive / threatening).
For a very short call, "Spoke with" and "Outcome" are enough.`;

const PROMPT = `You summarise recorded phone calls of a debt-settlement company in India.

${ROLES}

The transcript comes from speech-to-text: it is in Hinglish or Hindi, and some words may be misheard.

${SUMMARY_FORMAT}

Return ONLY a JSON object: {"summary": "Spoke with: ...\nDiscussion: ...\nOutcome: ..."}`;

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