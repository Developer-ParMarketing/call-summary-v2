import fs from 'fs';
import { spawn } from 'child_process';
import { chatCompletion } from './openai.js';

// The AI listens to the recording itself and returns, in ONE request:
//   - a Hinglish transcript with "Agent:" / "Customer:" labels
//   - the short key-point summary
// Much more accurate than Bhashini for calls that mix Hindi and English.

const PROMPT = `This is a recorded phone call between an advisor of a debt-management company in India and a customer.
People mix Hindi and English.

1) Transcribe the whole call in Hinglish: Hindi words in Roman letters (as typed on WhatsApp),
   English words in normal English spelling, numbers and amounts as digits.
   Start each turn on a new line with "Agent:" or "Customer:".
2) Write a short summary as key points: at most 6 lines, each under 15 words.
   Use these labels in this order, and LEAVE OUT any label the call did not cover:
   Situation, Loans, EMI & income, Offer, Outcome, Next step.
   Keep exact numbers. Don't guess. If the call is very short, one line is enough,
   e.g. "Outcome: customer asked for a call back".

If there is no real conversation (silence, ringing, voicemail), return an empty transcript.

Return ONLY JSON: {"transcript": "Agent: ...\\nCustomer: ...", "summary": "Situation: ...\\nOutcome: ..."}`;

// Small mono MP3 for upload (lower bitrate for long calls keeps the request small)
function toSpeechMp3(input, output, seconds) {
    const bitrate = seconds > 1800 ? '16k' : '32k';
    return new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-ac', '1', '-ar', '16000', '-b:a', bitrate, output]);
        let errText = '';
        ff.stderr.on('data', (d) => (errText += d));
        ff.on('error', reject);
        ff.on('close', (code) => (code === 0 ? resolve(output) : reject(new Error(`ffmpeg failed: ${errText.slice(-200)}`))));
    });
}

function parseJson(content) {
    const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('AI did not return valid JSON');
    }
}

export async function transcribeAndSummarise(filePath, seconds, context = {}) {
    const mp3Path = `${filePath}.mp3`;
    try {
        await toSpeechMp3(filePath, mp3Path, seconds);
        const audio = fs.readFileSync(mp3Path).toString('base64');
        const known = Object.entries(context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

        const res = await chatCompletion({
            temperature: 0.2,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: `${known ? `Known from the dialer:\n${known}\n\n` : ''}${PROMPT}` },
                    { type: 'input_audio', input_audio: { data: audio, format: 'mp3' } },
                ],
            }],
        });

        const out = parseJson(res.data.choices?.[0]?.message?.content);
        return {
            transcript: String(out.transcript || '').trim(),
            summary: String(out.summary || '').trim(),
        };
    } finally {
        fs.rmSync(mp3Path, { force: true });
    }
}