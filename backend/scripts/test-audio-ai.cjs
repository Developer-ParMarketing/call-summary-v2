// TEST ONLY: send one call's recording straight to the AI (Gemini) and print a Hinglish
// transcript + short summary. Saves nothing. Usage:
//   node scripts/test-audio-ai.cjs <callId> [model]
require('dotenv').config();
const fs = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');
const axios = require('axios');
const mongoose = require('mongoose');

const callId = process.argv[2];
const model = process.argv[3] || process.env.AI_MODEL || 'gemini-flash-lite-latest';
if (!callId) { console.log('Usage: node scripts/test-audio-ai.cjs <callId> [model]'); process.exit(1); }

const PROMPT = `This is a recorded phone call between an advisor of a debt-management company in India and a customer.
People mix Hindi and English.

1) Transcribe the whole call in Hinglish: Hindi words in Roman letters (as typed on WhatsApp),
   English words in normal English spelling, numbers as digits. Start each turn with "Agent:" or "Customer:".
2) Then write a short summary as key points (max 6 lines, each under 15 words), using these labels
   and leaving out any the call did not cover:
   Situation, Loans, EMI & income, Offer, Outcome, Next step.

Return ONLY JSON: {"transcript": "...", "summary": "Situation: ...\\nLoans: ..."}`;

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const call = await mongoose.connection.db.collection('calls').findOne({ callId });
    await mongoose.disconnect();
    if (!call?.recordUrl) throw new Error('Call not found, or it has no recording link');

    console.log(`Call ${callId} | model ${model}\nDownloading recording...`);
    const res = await axios.get(call.recordUrl, {
        responseType: 'arraybuffer', timeout: 60000,
        httpsAgent: new https.Agent({ rejectUnauthorized: process.env.RECORDING_TLS_VERIFY !== 'false' }),
    });
    fs.writeFileSync('/tmp/test-call.wav', res.data);

    // Small mono MP3 = small upload
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', '/tmp/test-call.wav', '-ac', '1', '-ar', '16000', '-b:a', '32k', '/tmp/test-call.mp3']);
    const audio = fs.readFileSync('/tmp/test-call.mp3').toString('base64');
    console.log(`Audio ready (${Math.round(audio.length / 1024)} KB). Asking the AI...`);

    const started = Date.now();
    const ai = await axios.post(`${(process.env.AI_BASE_URL || '').replace(/\/+$/, '')}/chat/completions`, {
        model,
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: PROMPT },
                { type: 'input_audio', input_audio: { data: audio, format: 'mp3' } },
            ],
        }],
    }, { headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` }, timeout: 300000 });

    const text = String(ai.data.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let out;
    try { out = JSON.parse(text); } catch { out = { transcript: text, summary: '(not JSON)' }; }
    console.log(`\nTook ${((Date.now() - started) / 1000).toFixed(1)}s\n\n=== SUMMARY ===\n${out.summary}\n\n=== TRANSCRIPT (Hinglish) ===\n${out.transcript}`);
    console.log(`\n=== OLD (Bhashini) TRANSCRIPT, for comparison ===\n${call.transcriptHinglish || call.transcript || '(none)'}`);
})().catch((e) => {
    console.error('ERROR', e.response?.status || '', JSON.stringify(e.response?.data || e.message).slice(0, 500));
    process.exit(1);
});
