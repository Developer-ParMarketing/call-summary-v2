import { config } from '../config/index.js';
import { Call } from '../models/Call.js';
import { Control } from '../models/Control.js';
import { getWindow, isInsideWindow } from '../services/schedule.js';
import { selectedDispositions } from '../services/dispositions.js';
import { selectedCampaigns, selectedDispositions } from '../services/dispositions.js';

// POST /api/process/run   ?retryFailed=true  ?summarise=true
export async function runNow(req, res) {
    let retriedFailed = 0;
    let sentForSummary = 0;

    if (req.query.retryFailed === 'true') {
        retriedFailed = (await Call.updateMany({ status: 'failed' }, { $set: { status: 'queued' } })).modifiedCount;
    }
    // 'transcribed' calls go back to the queue to get Hinglish + summary (needs SUMMARY_ENABLED=true)
    if (req.query.summarise === 'true') {
        sentForSummary = (await Call.updateMany({ status: 'transcribed' }, { $set: { status: 'queued' } })).modifiedCount;
    }

    const queued = await Call.countDocuments({ status: 'queued' });
    if (!queued) return res.json({ message: 'Nothing to process', queued: 0, retriedFailed, sentForSummary });

    await Control.updateOne({ _id: 'worker' }, { $set: { runRequested: true, requestedAt: new Date() } }, { upsert: true });
    res.status(202).json({ message: 'Processing started (worker picks it up within 10 seconds)', queued, retriedFailed, sentForSummary });
}

// POST /api/process/retry/:callId  -> try one failed call again, right now
export async function retryCall(req, res) {
    const call = await Call.findOneAndUpdate(
        { callId: req.params.callId, status: 'failed' },
        { $set: { status: 'queued' }, $unset: { errorMessage: '' } },
        { returnDocument: 'after' }
    );
    if (!call) return res.status(404).json({ error: 'No failed call with this ID' });

    // Start the worker so it is processed now (already-finished steps like the transcript are reused)
    await Control.updateOne({ _id: 'worker' }, { $set: { runRequested: true, requestedAt: new Date() } }, { upsert: true });
    res.json({ message: 'Call queued again - processing starts within 10 seconds', callId: call.callId });
}

// POST /api/process/stop  (the call in progress finishes first)
export async function stopNow(req, res) {
    await Control.updateOne({ _id: 'worker' }, { $set: { runRequested: false } }, { upsert: true });
    const note = isInsideWindow() ? ' The night window is open, so automatic processing continues until it closes.' : '';
    res.json({ message: `Processing stopped. The call in progress will finish first.${note}` });
}

// GET /api/process/status
export async function status(req, res) {
    const [rows, control] = await Promise.all([
        Call.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Control.findById('worker').lean(),
    ]);
    const w = getWindow();

    res.json({
        counts: Object.fromEntries(rows.map((r) => [r._id, r.count])),
        manualRunActive: Boolean(control?.runRequested),
        lastManualRunFinishedAt: control?.lastRunFinishedAt || null,
        timeWindow: w ? w.label : 'none (manual only)',
        insideTimeWindowNow: isInsideWindow(),
        summariesEnabled: config.aiEnabled,
        hinglishEnabled: config.hinglishEnabled,
        hinglishSource: config.hinglishSource,
        transcribeEngine: config.transcribeEngine,
        dispositions: selectedDispositions,
        campaigns: selectedCampaigns,
        zohoRemarkEnabled: config.zoho.enabled,
        zohoSummaryEnabled: config.zoho.summaryEnabled,
    });
}