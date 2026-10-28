import fs from 'fs';
import { spawn } from 'child_process';
import { chatCompletion } from './openai.js';
import { ROLES, SUMMARY_FORMAT } from './summary.service.js';

// The AI listens to the recording itself and returns, in ONE request:
//   - a Hinglish transcript with "Executive:" / "Creditor:" (or "Client:") labels
//   - the short key-point summary
// Much more accurate than Bhashini for calls that mix Hindi and English.

const PROMPT = `This is a recorded phone call of a debt-settlement company in India. People mix Hindi and English.

${ROLES}

Reply in EXACTLY this format (plain text, no JSON, no code fences):

=== SUMMARY ===
${SUMMARY_FORMAT}

=== TRANSCRIPT ===
The whole call in Hinglish: Hindi words in Roman letters (as typed on WhatsApp), English words in
normal English spelling, numbers and amounts as digits. Start each turn on a new line with
"Executive:" (our side) and "Creditor:" for the bank / app / recovery side - or "Client:" if the
other person is our client. Use "Other:" only if it is really unclear.

If there is no real conversation (silence, ringing, voicemail), write only: NO CONVERSATION`;

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

// Read "=== SUMMARY === ... === TRANSCRIPT === ..." (plain text is much more reliable than JSON for
// long transcripts full of quotes and line breaks). Summary comes first, so even if a very long
// answer gets cut off at the end, the summary survives.
function parseAnswer(content) {
    const text = String(content || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
    if (/^\s*NO CONVERSATION\s*$/i.test(text)) return { transcript: '', summary: '' };

    const summary = /===\s*SUMMARY\s*===\s*([\s\S]*?)(?:===\s*TRANSCRIPT\s*===|$)/i.exec(text)?.[1] || '';
    let transcript = /===\s*TRANSCRIPT\s*===\s*([\s\S]*)$/i.exec(text)?.[1] || '';

    // No markers at all -> treat the whole answer as the transcript (the summary step fills the gap)
    if (!summary && !transcript) transcript = text;
    if (/^\s*NO CONVERSATION\s*$/i.test(transcript)) transcript = '';
    return { transcript: transcript.trim(), summary: summary.trim() };
}

export { parseAnswer as _parseAnswerForTests };

export async function transcribeAndSummarise(filePath, seconds, context = {}) {
    const mp3Path = `${filePath}.mp3`;
    try {
        await toSpeechMp3(filePath, mp3Path, seconds);
        const audio = fs.readFileSync(mp3Path).toString('base64');
        const known = Object.entries(context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

        const res = await chatCompletion({
            temperature: 0.2,
            max_tokens: 32000, // long calls give long transcripts
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: `${known ? `Known from the dialer:\n${known}\n\n` : ''}${PROMPT}` },
                    { type: 'input_audio', input_audio: { data: audio, format: 'mp3' } },
                ],
            }],
        });

        const choice = res.data.choices?.[0];
        const out = parseAnswer(choice?.message?.content);
        if (choice?.finish_reason === 'length') {
            console.log('[ai] answer was cut off (very long call) - the end of the transcript may be missing');
        }
        const said = String(choice?.message?.content || '');
        if (!out.transcript && !out.summary && said.trim() && !/NO CONVERSATION/i.test(said)) {
            throw new Error('AI answer could not be read');
        }
        return out;
    } finally {
        fs.rmSync(mp3Path, { force: true });
    }
}