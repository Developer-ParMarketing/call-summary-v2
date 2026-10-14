import { Call } from '../models/Call.js';
import { Control } from '../models/Control.js';
import { config } from '../config/index.js';
import { isInsideWindow } from '../services/schedule.js';
import { otherDispositionQuery, selectedDispositionQuery } from '../services/dispositions.js';

// Skip ALL waiting calls with other dispositions in ONE database update
// (instead of loading and saving them one by one). Returns how many were skipped.
export async function skipOtherDispositions() {
    const r = await Call.updateMany(
        { status: 'queued', firstDisposition: otherDispositionQuery() },
        { $set: { status: 'skipped', skipReason: 'disposition_not_selected' } }
    );
    return r.modifiedCount;
}

// Take the oldest waiting call with a selected disposition and mark it "processing" in ONE step,
// so two workers can never grab the same call
export function claimNextCall() {
    return Call.findOneAndUpdate(
        { status: 'queued', firstDisposition: selectedDispositionQuery() },
        { $set: { status: 'processing' } },
        { sort: { createdAt: 1 }, returnDocument: 'after' }
    );
}

// Calls left in "processing" by a crash/restart go back to the queue at startup
export async function requeueStuckCalls() {
    const r = await Call.updateMany({ status: 'processing' }, { $set: { status: 'queued' } });
    return r.modifiedCount;
}

// Should we be processing right now? -> 'manual', 'schedule', or null (wait)
export async function getRunMode() {
    const control = await Control.findById('worker').lean();
    if (control?.runRequested) return 'manual';
    if (isInsideWindow()) return 'schedule';
    return null;
}

export function finishManualRun() {
    return Control.updateOne({ _id: 'worker' }, { $set: { runRequested: false, lastRunFinishedAt: new Date() } });
}

export const aiEnabled = () => config.aiEnabled;
