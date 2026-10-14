import { chatCompletion } from './openai.js';

// Bhashini returns Hindi in Devanagari, and English words also come out in Devanagari
// ("लोन", "ई एम आई"). This rewrites it as Hinglish: Roman-script Hindi + real English words.

const PROMPT = `You convert Hindi speech-to-text output (written in Devanagari) into Hinglish.
The text is a recorded phone call between a loan / debt-management advisor and a customer in India.

Rules:
- Write Hindi words in simple Roman letters, the way people in India type on WhatsApp (e.g. "आपका" -> "aapka", "कितना" -> "kitna", "ठीक है" -> "theek hai").
- Words that were spoken in English must be written as normal English words (e.g. "लोन" -> "loan", "ई एम आई" -> "EMI", "रिकॉर्डेड कॉल" -> "recorded call", "पर्सनल लोन" -> "personal loan", "सैलरी" -> "salary", "कंसॉलिडेट" -> "consolidate").
- Write amounts and numbers as digits (e.g. "फोर्टी फाइव थाउजेंड" -> "45,000", "सिक्स टू सेवन लाख" -> "6-7 lakh").
- Keep the exact meaning and order. Do NOT translate into English, do NOT summarise, do NOT add or remove sentences.
- Output only the converted text, nothing else.`;

const CHUNK_CHARS = 2500;

// Split long transcripts at spaces so each request stays small
function splitText(text) {
    const words = text.split(/\s+/);
    const chunks = [];
    let current = '';
    for (const w of words) {
        if (current && current.length + w.length + 1 > CHUNK_CHARS) {
            chunks.push(current);
            current = w;
        } else {
            current = current ? `${current} ${w}` : w;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

export async function toHinglish(transcript) {
    const parts = [];
    for (const chunk of splitText(transcript.trim())) {
        const res = await chatCompletion({
            temperature: 0.1,
            messages: [
                { role: 'system', content: PROMPT },
                { role: 'user', content: chunk },
            ],
        });
        parts.push((res.data.choices?.[0]?.message?.content || '').trim());
    }
    return parts.join(' ').trim();
}

export { splitText as _splitTextForTests };
