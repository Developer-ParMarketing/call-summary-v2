// Worker: processes waiting calls during the night window, or when /api/process/run is called.
import 'dotenv/config';
import dns from 'dns';
import { config } from './src/config/index.js';
import { connectDb } from './src/config/db.js';
import { getWindow } from './src/services/schedule.js';
import { selectedCampaigns, selectedDispositions } from './src/services/dispositions.js';
import { processCall } from './src/worker/processCall.js';
import {
    claimNextCall, finishManualRun, getRunMode, requeueStuckCalls, skipOtherDispositions,
} from './src/worker/queue.js';

dns.setDefaultResultOrder('ipv4first'); // Zoho / token APIs over IPv4 (summary goes to Zoho from here)

const POLL_MS = 5000;        // while running: check for the next call every 5s
const IDLE_CHECK_MS = 10000; // while waiting: check for a start signal every 10s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let stopping = false;

async function loop() {
    let lastMode;

    while (!stopping) {
        try {
            const mode = await getRunMode();
            if (mode !== lastMode) {
                console.log(mode
                    ? `Processing ON (${mode === 'manual' ? 'manual run' : 'night window'})`
                    : 'Processing OFF - waiting for the night window or /api/process/run');
                lastMode = mode;
            }
            if (!mode) { await sleep(IDLE_CHECK_MS); continue; }

            // Other dispositions are skipped in bulk (one query), not one by one
            const skipped = await skipOtherDispositions();
            if (skipped) console.log(`Skipped ${skipped} calls with other dispositions / campaigns`);

            const call = await claimNextCall();
            if (!call) {
                if (mode === 'manual') {
                    await finishManualRun();
                    console.log('Manual run finished: no more waiting calls');
                }
                await sleep(POLL_MS);
                continue;
            }

            await processCall(call);
        } catch (err) {
            console.error('Worker error:', err.message);
            await sleep(POLL_MS);
        }
    }
    process.exit(0);
}

// PM2 restart / stop: finish the current call first, then exit
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        console.log(`${signal} received - finishing the current call, then stopping`);
        stopping = true;
    });
}

connectDb()
    .then(async () => {
        const w = getWindow();
        console.log(`Worker started. Night window: ${w ? w.label : 'none (manual only)'}`);
        console.log(`Dispositions processed: ${selectedDispositions.join(' | ')}`);
        console.log(`Campaigns processed (any disposition): ${selectedCampaigns.join(' | ') || 'none'}`);
        console.log(`AI summary to Zoho (${config.zoho.summaryField}): ${config.zoho.summaryEnabled ? 'ON' : 'OFF'}`);
        console.log(`AI steps (Hinglish + summary): ${config.aiEnabled ? 'ON' : 'OFF (transcribe only)'}`);
        console.log(`Transcription: ${config.transcribeEngine === 'ai' && config.aiEnabled ? 'AI listens to the recording' : 'Bhashini'}`);

        const stuck = await requeueStuckCalls();
        if (stuck) console.log(`Put ${stuck} unfinished calls back in the queue`);
        loop();
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    });