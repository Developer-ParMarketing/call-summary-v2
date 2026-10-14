import { config } from '../config/index.js';
import { downloadRecording, removeFile } from '../services/recording.service.js';
import { getDurationSeconds, transcribeFile } from '../services/transcribe.service.js';
import { toHinglish } from '../services/hinglish.service.js';
import { summarise } from '../services/summary.service.js';

// Steps for one call. Each finished step is saved, so a retry continues where it stopped:
//   download -> transcribe (Bhashini) -> Hinglish (OpenAI) -> summary (OpenAI) -> done

async function skip(call, reason, logText) {
    call.status = 'skipped';
    call.skipReason = reason;
    await call.save();
    console.log(`[${call.callId}] skipped: ${logText}`);
}

export async function processCall(call) {
    console.log(`[${call.callId}] processing`);
    let stage = 'download';
    let filePath;

    try {
        // 1) Transcript (skipped when an earlier attempt already saved it)
        if (!call.transcript?.trim()) {
            if (!call.recordUrl) return await skip(call, 'missing_record_url', 'no recording URL');

            const downloaded = await downloadRecording(call.recordUrl, call.callId);
            filePath = downloaded.filePath;
            call.audioBytes = downloaded.bytes;

            stage = 'duration';
            const seconds = await getDurationSeconds(filePath);
            call.audioSeconds = Math.round(seconds);
            if (seconds <= config.minCallSeconds) {
                return await skip(call, 'audio_too_short', `only ${call.audioSeconds}s`);
            }

            stage = 'transcribe';
            console.log(`[${call.callId}] transcribing ${call.audioSeconds}s of audio...`);
            call.language = 'hi';
            call.transcript = await transcribeFile(filePath, seconds, call.language);
            await call.save();
            console.log(`[${call.callId}] transcript ready (${call.transcript.length} characters)`);
        }

        if (!call.transcript.trim()) return await skip(call, 'no_speech', 'no speech found');

        // AI switched off (e.g. no OpenAI credits): keep the transcript, finish later
        if (!config.aiEnabled) {
            call.status = 'transcribed';
            call.errorMessage = undefined;
            await call.save();
            console.log(`[${call.callId}] transcribed - AI steps off (SUMMARY_ENABLED=false)`);
            return;
        }

        // 2) Hinglish version of the transcript
        if (config.hinglishEnabled && !call.transcriptHinglish?.trim()) {
            stage = 'hinglish';
            call.transcriptHinglish = await toHinglish(call.transcript);
            await call.save();
            console.log(`[${call.callId}] Hinglish ready (${call.transcriptHinglish.length} characters)`);
        }

        // 3) English summary (from the Hinglish text when available - easier to read for the model)
        stage = 'summary';
        call.summary = await summarise(call.transcriptHinglish || call.transcript, {
            Customer: call.customerName,
            Agent: call.agentName,
            Campaign: call.campaign,
        });

        call.status = 'done';
        call.errorMessage = undefined;
        await call.save();
        console.log(`[${call.callId}] done - summary ready (${call.summary.length} characters)`);
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
