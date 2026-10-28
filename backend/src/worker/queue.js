import { Call } from '../models/Call.js';
import { Control } from '../models/Control.js';
import { config } from '../config/index.js';
import { isInsideWindow } from '../services/schedule.js';
import { otherCallQuery, selectedCallQuery } from '../services/dispositions.js';

// Skip ALL waiting calls with other dispositions in ONE database update
// (instead of loading and saving them one by one). Returns how many were skipped.
export async function skipOtherDispositions() {
    // Remark already in Zoho -> "Completed"; the rest -> "Skipped"
    const done = await Call.updateMany(
        { status: 'queued', zohoStatus: 'updated', ...otherCallQuery() },
        { $set: { status: 'completed', skipReason: 'disposition_not_selected' } }
    );
    const r = await Call.updateMany(
        { status: 'queued', ...otherCallQuery() },
        { $set: { status: 'skipped', skipReason: 'disposition_not_selected' } }
    );
    return r.modifiedCount + done.modifiedCount;
}

// Take the oldest waiting call with a selected disposition and mark it "processing" in ONE step,
// so two workers can never grab the same call
// In real-time mode only calls older than PROCESS_DELAY_MINUTES (recording must be ready on the PBX)
export function claimNextCall(mode) {
    const ready = mode === 'realtime'
        ? { createdAt: { $lte: new Date(Date.now() - config.realtimeDelayMinutes * 60 * 1000) } }
        : {};
    return Call.findOneAndUpdate(
        { status: 'queued', ...ready, ...selectedCallQuery() },
        { $set: { status: 'processing' } },
        { sort: { createdAt: 1 }, returnDocument: 'after' }
    );
}

// Calls left in "processing" by a crash/restart go back to the queue at startup
export async function requeueStuckCalls() {
    const r = await Call.updateMany({ status: 'processing' }, { $set: { status: 'queued' } });
    return r.modifiedCount;
}

// Should we be processing right now? -> 'manual', 'schedule', 'realtime', or null (wait)
export async function getRunMode() {
    const control = await Control.findById('worker').lean();
    if (control?.runRequested) return 'manual';
    if (isInsideWindow()) return 'schedule';
    if (config.realtime) return 'realtime';
    return null;
}

// Night run safety net: failed calls get one more try each night
export async function requeueFailedCalls() {
    const r = await Call.updateMany({ status: 'failed' }, { $set: { status: 'queued' }, $unset: { errorMessage: '' } });
    return r.modifiedCount;
}

export function finishManualRun() {
    return Control.updateOne({ _id: 'worker' }, { $set: { runRequested: false, lastRunFinishedAt: new Date() } });
}

export const aiEnabled = () => config.aiEnabled;