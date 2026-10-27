import { Call } from '../models/Call.js';
import { cleanPayload, getCallId, readPayload, toCallFields } from '../services/payload.js';
import { getRemarkTarget, syncRemarkLater } from '../services/zoho.service.js';

// Dialer fields minus the recording link and undefined values (for updating an existing call)
function withoutRecording({ recordUrl, ...rest }) {
    return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
}
// Zoho fields for the remark (empty when the call has no SD/SML portal ID or no remark)
function zohoFields(d) {
    const t = getRemarkTarget(d);
    return t ? { portalId: t.portalId, zohoBrand: t.brand, zohoStatus: 'pending', zohoAttempts: 0 } : {};
}

// Save one call from the dialer as "queued". NOTHING is required: whatever arrives is saved.
async function saveCall(req, res, { payload, rawBody, repaired }) {
    const d = cleanPayload(payload);
    const { callId, callIdSource } = getCallId(d);
    const fields = toCallFields(d);
    const zoho = zohoFields(d);

    console.log(
        `[ingest] ${req.method} from ${req.ip} | type=${req.get('content-type') || 'none'} | ` +
        `fields=${Object.keys(d).length} | callId=${callId} (${callIdSource})` +
        `${zoho.portalId ? ` | remark for ${zoho.zohoBrand} ${zoho.portalId}` : ''}` +
        `${repaired ? ' | JSON was repaired' : ''}${rawBody ? ' | body was not JSON (saved as rawBody)' : ''}`
    );

    try {
        await Call.create({ callId, callIdSource, rawBody, ...fields, ...zoho, dialerData: d });
        if (zoho.portalId) syncRemarkLater(callId);
        return res.status(202).json({ message: 'Call saved', callId, status: 'queued' });
    } catch (err) {
        if (err.code !== 11000) throw err;

        // Same call sent again with a new / changed remark -> save it and send it to Zoho
        if (zoho.portalId) {
            const changed = await Call.findOneAndUpdate(
                { callId, $or: [{ remark: { $ne: fields.remark } }, { portalId: { $ne: zoho.portalId } }] },
                { $set: { ...withoutRecording(fields), ...zoho } } // recording link is handled just below
            );
            if (changed) {
                console.log(`[ingest] ${callId}: remark changed, sending to Zoho again`);
                syncRemarkLater(callId);
            }
        }

        // Same call sent again. If it now brings the recording link that was missing before,
        // add it and put the call back in the queue (dialers often send before the recording is ready).
        if (fields.recordUrl) {
            const updated = await Call.findOneAndUpdate(
                { callId, recordUrl: { $in: [null, ''] } },
                {
                    $set: { recordUrl: fields.recordUrl, dialerData: d, status: 'queued' },
                    $unset: { skipReason: '', errorMessage: '' },
                },
                { returnDocument: 'after' }
            );
            if (updated) {
                console.log(`[ingest] ${callId}: recording link added, queued again`);
                return res.status(200).json({ message: 'Call updated with recording', callId, status: 'queued' });
            }
        }
        return res.status(200).json({ message: 'Call already received', callId });
    }
}

// POST /api/ingest/calls  (body read as raw text, then parsed / repaired)
export const ingestPost = (req, res) => saveCall(req, res, readPayload(req.get('content-type'), req.body));

// GET /api/ingest/calls?...  (fields as URL params)
export const ingestGet = (req, res) => {
    const { api_key, ...params } = req.query;
    return saveCall(req, res, { payload: params });
};

// GET /api/ingest/calls/:callId/summary
export async function getSummary(req, res) {
    const call = await Call.findOne(
        { callId: req.params.callId },
        { callId: 1, status: 1, summary: 1, audioSeconds: 1, skipReason: 1, errorMessage: 1, updatedAt: 1 }
    ).lean();

    if (!call) return res.status(404).json({ error: 'Call not found', callId: req.params.callId });

    const base = { callId: call.callId, status: call.status };
    if (['queued', 'processing', 'transcribed'].includes(call.status)) {
        return res.status(202).json({ ...base, message: 'Summary not ready yet, try again later' });
    }
    if (call.status === 'done') {
        return res.json({ ...base, summary: call.summary, durationSeconds: call.audioSeconds, processedAt: call.updatedAt });
    }
    if (call.status === 'skipped') return res.json({ ...base, summary: null, reason: call.skipReason });

    const failedStage = String(call.errorMessage || 'unknown').split(':')[0];
    return res.json({ ...base, summary: null, reason: `processing_failed_at_${failedStage}` });
}