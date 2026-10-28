import { config } from '../config/index.js';
import { downloadRecording, removeFile } from '../services/recording.service.js';
import { getDurationSeconds, transcribeFile } from '../services/transcribe.service.js';
import { toHinglish } from '../services/hinglish.service.js';
import { transliterateToHinglish } from '../services/transliterate.service.js';
import { summarise } from '../services/summary.service.js';
import { transcribeAndSummarise } from '../services/audio-ai.service.js';
import { sendSummaryToZoho } from '../services/zoho.service.js';

// Steps for one call. Each finished step is saved, so a retry continues where it stopped.
//   AI engine (default):  download -> AI listens -> Hinglish transcript + summary (one request) -> done
//   Bhashini engine:      download -> Bhashini transcript -> Hinglish -> summary -> done

async function skip(call, reason, logText) {
    // Remark already in Zoho -> nothing left to do for this call: "Completed" instead of "Skipped"
    call.status = call.zohoStatus === 'updated' ? 'completed' : 'skipped';
    call.skipReason = reason;
    await call.save();
    console.log(`[${call.callId}] ${call.status}: ${logText}`);
}
export async function processCall(call) {
    console.log(`[${call.callId}] processing`);
    let stage = 'download';
    let filePath;

    try {
        // 1) Transcript (skipped when an earlier attempt already saved it)
        if (!call.transcript?.trim()) {
            if (!call.recordUrl) return await skip(call, 'missing_record_url', 'no recording URL');

            // Dialer times already show a short call -> skip without downloading anything
            const dialerSeconds = call.callStartTime && call.callEndTime
                ? (call.callEndTime - call.callStartTime) / 1000 : null;
            if (dialerSeconds !== null && dialerSeconds >= 0 && dialerSeconds <= config.minCallSeconds) {
                return await skip(call, 'audio_too_short', `only ${Math.round(dialerSeconds)}s (dialer times)`);
            }

            const downloaded = await downloadRecording(call.recordUrl, call.callId);
            filePath = downloaded.filePath;
            call.audioBytes = downloaded.bytes;
            if (downloaded.bytes < 1024) {
                return await skip(call, 'empty_recording', `recording file is empty (${downloaded.bytes} bytes)`);
            }

            stage = 'duration';
            const seconds = await getDurationSeconds(filePath);
            if (seconds === null) return await skip(call, 'empty_recording', 'recording has no audio length');
            call.audioSeconds = Math.round(seconds);
            if (seconds <= config.minCallSeconds) {
                return await skip(call, 'audio_too_short', `only ${call.audioSeconds}s`);
            }

            // AI listens to the recording: Hinglish transcript + summary in one request
            if (config.transcribeEngine === 'ai' && config.aiEnabled) {
                stage = 'ai-audio';
                console.log(`[${call.callId}] AI listening to ${call.audioSeconds}s of audio...`);
                const out = await transcribeAndSummarise(filePath, seconds, {
                    Agent: call.agentName,
                    Campaign: call.campaign,
                });
                if (!out.transcript && !out.summary) return await skip(call, 'no_speech', 'no conversation in the recording');

                call.transcript = out.transcript || undefined;
                call.transcriptHinglish = out.transcript || undefined;
                call.transcriptSource = 'ai';
                call.language = 'hinglish';
                call.summary = out.summary || undefined;
                if (call.summary) {
                    call.status = 'done';
                    call.errorMessage = undefined;
                    await call.save();
                    console.log(`[${call.callId}] done - AI transcript (${out.transcript.length} chars) + summary`
                        + (out.transcript ? '' : ' (transcript was cut off)'));
                    await sendSummaryToZoho(call);
                    return;
                }
                await call.save(); // transcript saved; the summary step below fills the gap
            } else {
                stage = 'transcribe';
                console.log(`[${call.callId}] transcribing ${call.audioSeconds}s of audio...`);
                call.language = 'hi';
                call.transcriptSource = 'bhashini';
                call.transcript = await transcribeFile(filePath, seconds, call.language);
                await call.save();
                console.log(`[${call.callId}] transcript ready (${call.transcript.length} characters)`);
            }
        }

        if (!call.transcript.trim()) return await skip(call, 'no_speech', 'no speech found');

        // 2a) Free Hinglish with Bhashini (works even when OpenAI is off). A failure here
        //     doesn't fail the call - it just stays without Hinglish.
        if (config.hinglishEnabled && config.hinglishSource === 'bhashini' && !call.transcriptHinglish?.trim()) {
            try {
                call.transcriptHinglish = await transliterateToHinglish(call.transcript);
                await call.save();
                console.log(`[${call.callId}] Hinglish ready (Bhashini, ${call.transcriptHinglish.length} characters)`);
            } catch (err) {
                console.log(`[${call.callId}] Hinglish skipped: ${err.message}`);
            }
        }

        // AI switched off (e.g. no OpenAI credits): keep the transcript, finish later
        if (!config.aiEnabled) {
            call.status = 'transcribed';
            call.errorMessage = undefined;
            await call.save();
            console.log(`[${call.callId}] transcribed - AI steps off (SUMMARY_ENABLED=false)`);
            return;
        }

        // 2b) Hinglish with OpenAI (only when HINGLISH_SOURCE=openai)
        if (config.hinglishEnabled && config.hinglishSource === 'openai' && !call.transcriptHinglish?.trim()) {
            stage = 'hinglish';
            call.transcriptHinglish = await toHinglish(call.transcript);
            await call.save();
            console.log(`[${call.callId}] Hinglish ready (${call.transcriptHinglish.length} characters)`);
        }

        // 3) English summary (from the Hinglish text when available - easier to read for the model)
        stage = 'summary';
        // Only the agent and campaign are shared with the AI - no customer name, phone or email
        call.summary = await summarise(call.transcriptHinglish || call.transcript, {
            Agent: call.agentName,
            Campaign: call.campaign,
        });

        call.status = 'done';
        call.errorMessage = undefined;
        await call.save();
        console.log(`[${call.callId}] done - summary ready (${call.summary.length} characters)`);
        await sendSummaryToZoho(call);
    } catch (err) {
        const detail = err.response?.data?.error?.message; // e.g. OpenAI's own explanation
        call.status = 'failed';
        call.errorMessage = `${stage}: ${err.message}${detail ? ` - ${detail}` : ''}`;
        await call.save();
        console.log(`[${call.callId}] failed at ${call.errorMessage}`);
    } finally {
        removeFile(filePath); // the transcript is saved; the audio is no longer needed
    }
}