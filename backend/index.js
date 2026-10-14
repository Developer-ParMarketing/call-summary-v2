import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import { Call, Control, connectDb } from './db.js';
import { getWindow, isInsideWindow } from './schedule.js';

const app = express();
app.set('trust proxy', 'loopback'); // behind nginx: log the real client IP

// The dialer body is read as RAW TEXT (any content type) and parsed by us,
// so broken JSON never causes an error page - it is repaired or stored as-is.
const readRawBody = express.text({ type: () => true, limit: '1mb' });

const PORT = process.env.PORT || 8030;

// Clean one value: trim it; treat empty or unfilled template placeholders
// like "{{Phone}}" or "@Phone@" as missing
function cleanValue(value) {
    if (value == null) return undefined;
    const text = String(Array.isArray(value) ? value[0] : value).trim();
    if (!text) return undefined;
    if (/^\{\{.*\}\}$/.test(text) || /^@.*@$/.test(text)) return undefined;
    return text;
}

// Keep every field the dialer sent that has a real value (max 100 fields, 2000 chars each)
function cleanPayload(payload) {
    const data = {};
    for (const [key, value] of Object.entries(payload || {}).slice(0, 100)) {
        if (key === 'api_key' || key.startsWith('$') || key.includes('.')) continue; // never store these
        const v = cleanValue(value);
        if (v !== undefined) data[key] = v.slice(0, 2000);
    }
    return data;
}

// Dialer times like "2026-08-01 10:22:05" have no timezone -> treat them as India time
function parseDialerTime(text) {
    if (!text) return undefined;
    let t = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? text.replace(' ', 'T') : text;
    const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(t);
    if (!hasTimezone && /T\d{2}:\d{2}/.test(t)) t += '+05:30';
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

// Recording file name -> call ID (fallback when the dialer sends no unique_id)
function callIdFromRecordUrl(url) {
    if (!url) return undefined;
    try {
        const u = new URL(url);
        const file = u.searchParams.get('file') || u.pathname;
        const name = file.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
        return name || undefined;
    } catch {
        return undefined;
    }
}

// Call ID: dialer's ID -> recording file name -> our own generated ID (nothing is required)
function getCallId(d) {
    const fromDialer = d.unique_id || d.call_id || d._id || d.callId || d.uniqueid;
    if (fromDialer) return { callId: fromDialer, callIdSource: 'dialer' };

    const fromRecording = callIdFromRecordUrl(d.record_url);
    if (fromRecording) return { callId: fromRecording, callIdSource: 'record_url' };

    return { callId: `gen-${crypto.randomUUID()}`, callIdSource: 'generated' };
}

// API key: in the X-API-Key header OR in the URL as ?api_key=... (for dialers without headers)
function requireApiKey(req, res, next) {
    const key = req.get('X-API-Key') || req.query.api_key;
    if (key !== process.env.INGEST_API_KEY) {
        console.log(`[auth] rejected ${req.method} ${req.path} from ${req.ip}: wrong or missing api_key`);
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
}

// Try to read text as JSON. If it fails, repair common dialer mistakes:
// `backticks` instead of "quotes", missing commas between lines, trailing commas.
function parseJsonLoose(text) {
    try {
        return { data: JSON.parse(text), repaired: false };
    } catch {
        const fixed = text
            .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ') // invisible / non-standard spaces
            .replace(/[\u201C\u201D\u201E\u2033]/g, '"')   // smart quotes  ->  normal quotes
            .replace(/`/g, '"')                 // `key`:`value`  ->  "key":"value"
            .replace(/"\s*\n\s*"/g, '",\n"')     // missing comma at end of a line
            .replace(/,\s*([}\]])/g, '$1');      // trailing comma before } or ]
        try {
            return { data: JSON.parse(fixed), repaired: true };
        } catch {
            return { data: undefined, repaired: false };
        }
    }
}

// Turn whatever body arrived into an object (JSON, broken JSON, form, or empty)
function readPayload(req, body) {
    if (body && typeof body === 'object') return { payload: body };

    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) return { payload: {} };

    const type = req.get('content-type') || '';
    if (type.includes('application/x-www-form-urlencoded')) {
        return { payload: Object.fromEntries(new URLSearchParams(text)) };
    }

    const { data, repaired } = parseJsonLoose(text);
    if (data && typeof data === 'object') return { payload: data, repaired };

    return { payload: {}, rawBody: text.slice(0, 10000) }; // could not read it at all
}

// Save one call from the dialer as "queued" (used by both POST and GET).
// NOTHING is required: whatever arrives is saved, even an empty or broken body.
async function saveCall(req, body, res) {
    const { payload, rawBody, repaired } = readPayload(req, body);

    const d = cleanPayload(payload);
    const { callId, callIdSource } = getCallId(d);

    // One log line per dialer request -> visible in "pm2 logs cs2-api"
    console.log(
        `[ingest] ${req.method} from ${req.ip} | type=${req.get('content-type') || 'none'} | ` +
        `fields=${Object.keys(d).length} | callId=${callId} (${callIdSource})` +
        `${repaired ? ' | JSON was repaired' : ''}${rawBody ? ' | body was not JSON (saved as rawBody)' : ''}`
    );

    try {
        await Call.create({
            callId,
            callIdSource,
            rawBody,
            firstDisposition: d.first_disposition,
            secondDisposition: d.second_disposition,
            recordUrl: d.record_url,

            customerName: d.cust_name || d.Customer_Name,
            phone: d.phone || d.Phone,
            email: d.email || d.E_mail,
            agentName: d.agent_name,
            agentUsername: d.agent_username,
            agentId: d.agent_id,
            campaign: d.campaign_name || d.campaign,
            campaignId: d.campaign_id,
            brand: d.brand,
            callType: d.call_type || d.CallType,
            source: d.source || d.Source,
            extensionNo: d.extension_no,
            zohoRefId: d.zoho_refrence_id,
            callStartTime: parseDialerTime(d.call_start_time),
            callEndTime: parseDialerTime(d.call_end_time),

            dialerData: d,
        });

        res.status(202).json({ message: 'Call saved', callId, status: 'queued' });
    } catch (err) {
        if (err.code === 11000) {
            // 11000 = duplicate key: this callId already exists
            return res.status(200).json({ message: 'Call already received', callId });
        }
        console.error('Save failed:', err.message);
        res.status(500).json({ error: 'Failed to save call' });
    }
}

// 1) Dialer sends a call when it ends: POST with JSON body (main) or GET with URL params
app.post('/api/ingest/calls', requireApiKey, readRawBody, (req, res) => saveCall(req, req.body, res));
app.get('/api/ingest/calls', requireApiKey, (req, res) => {
    const { api_key, ...params } = req.query; // the key is not call data
    return saveCall(req, params, res);
});

// 2) Get the summary of one call
app.get('/api/ingest/calls/:callId/summary', requireApiKey, async (req, res) => {
    try {
        const call = await Call.findOne({ callId: req.params.callId }).lean();

        if (!call) {
            return res.status(404).json({ error: 'Call not found', callId: req.params.callId });
        }

        const base = { callId: call.callId, status: call.status };

        if (call.status === 'queued' || call.status === 'processing' || call.status === 'transcribed') {
            return res.status(202).json({ ...base, message: 'Summary not ready yet, try again later' });
        }

        if (call.status === 'done') {
            return res.status(200).json({
                ...base,
                summary: call.summary,
                durationSeconds: call.audioSeconds,
                processedAt: call.updatedAt,
            });
        }

        if (call.status === 'skipped') {
            return res.status(200).json({ ...base, summary: null, reason: call.skipReason });
        }

        // failed: only share WHICH stage broke, not internal error details
        const failedStage = String(call.errorMessage || 'unknown').split(':')[0];
        return res.status(200).json({ ...base, summary: null, reason: `processing_failed_at_${failedStage}` });
    } catch (err) {
        console.error('Summary lookup failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

// 3) Start processing all queued calls NOW
//    ?retryFailed=true  also re-queues failed calls
//    ?summarise=true    also re-queues 'transcribed' calls so they get their summary
app.post('/api/process/run', requireApiKey, async (req, res) => {
    try {
        let retried = 0;
        if (req.query.retryFailed === 'true') {
            const r = await Call.updateMany({ status: 'failed' }, { $set: { status: 'queued' } });
            retried = r.modifiedCount;
        }

        // ?summarise=true -> send calls that only have a transcript back to the queue for their summary
        let toSummarise = 0;
        if (req.query.summarise === 'true') {
            const r = await Call.updateMany({ status: 'transcribed' }, { $set: { status: 'queued' } });
            toSummarise = r.modifiedCount;
        }

        const queued = await Call.countDocuments({ status: 'queued' });
        if (!queued) {
            return res.status(200).json({ message: 'Nothing to process', queued: 0 });
        }

        await Control.updateOne(
            { _id: 'worker' },
            { $set: { runRequested: true, requestedAt: new Date() } },
            { upsert: true }
        );

        res.status(202).json({
            message: 'Processing started (worker picks it up within 10 seconds)',
            queued,
            retriedFailed: retried,
            sentForSummary: toSummarise,
        });
    } catch (err) {
        console.error('Run request failed:', err.message);
        res.status(500).json({ error: 'Failed to start processing' });
    }
});

// 4) Stop a manual run (the call in progress finishes first)
app.post('/api/process/stop', requireApiKey, async (req, res) => {
    try {
        await Control.updateOne({ _id: 'worker' }, { $set: { runRequested: false } }, { upsert: true });
        res.json({ message: 'Manual run stopped. The current call will finish first.' });
    } catch (err) {
        console.error('Stop request failed:', err.message);
        res.status(500).json({ error: 'Failed to stop processing' });
    }
});

// 5) See what's waiting and whether processing is on
app.get('/api/process/status', requireApiKey, async (req, res) => {
    try {
        const rows = await Call.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
        const counts = Object.fromEntries(rows.map((r) => [r._id, r.count]));
        const control = await Control.findById('worker').lean();
        const w = getWindow();

        res.json({
            counts,
            manualRunActive: Boolean(control?.runRequested),
            lastManualRunFinishedAt: control?.lastRunFinishedAt || null,
            timeWindow: w ? w.label : 'none (manual only)',
            insideTimeWindowNow: isInsideWindow(),
        });
    } catch (err) {
        console.error('Status failed:', err.message);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// 6) See the latest saved calls (the dashboard will replace this later)
app.get('/api/calls', requireApiKey, async (req, res) => {
    try {
        const calls = await Call.find().sort({ createdAt: -1 }).limit(50).lean();
        res.json(calls);
    } catch (err) {
        console.error('List failed:', err.message);
        res.status(500).json({ error: 'Failed to list calls' });
    }
});
// ---------- Dashboard APIs (used by the dashboard website) ----------

const STATUSES = ['queued', 'processing', 'transcribed', 'done', 'failed', 'skipped'];
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build the MongoDB filter from the dashboard's filter inputs
function dashboardFilter(q) {
    const filter = {};
    if (STATUSES.includes(q.status)) filter.status = q.status;
    if (q.disposition) filter.firstDisposition = String(q.disposition);

    const search = String(q.search || '').trim();
    if (search) {
        const rx = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
        filter.$or = [{ callId: rx }, { customerName: rx }, { phone: rx }, { agentName: rx }, { campaign: rx }];
    }

    // Dates are India days: from=2026-10-13&to=2026-10-13 -> that whole day
    const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
    if (isDay(q.from) || isDay(q.to)) {
        filter.createdAt = {};
        if (isDay(q.from)) filter.createdAt.$gte = new Date(`${q.from}T00:00:00+05:30`);
        if (isDay(q.to)) filter.createdAt.$lt = new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86400000);
    }
    return filter;
}

// List calls (light fields only, paginated)
app.get('/api/dashboard/calls', requireApiKey, async (req, res) => {
    try {
        const filter = dashboardFilter(req.query);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const hasText = (field) => ({ $gt: [{ $strLenCP: { $ifNull: [field, ''] } }, 0] });

        const [items, total] = await Promise.all([
            Call.aggregate([
                { $match: filter },
                { $sort: { createdAt: -1 } },
                { $skip: (page - 1) * limit },
                { $limit: limit },
                {
                    $project: {
                        _id: 0, callId: 1, status: 1, skipReason: 1, errorMessage: 1,
                        customerName: 1, phone: 1, agentName: 1, campaign: 1,
                        firstDisposition: 1, audioSeconds: 1, createdAt: 1, updatedAt: 1,
                        hasTranscript: hasText('$transcript'),
                        hasSummary: hasText('$summary'),
                    },
                },
            ]),
            Call.countDocuments(filter),
        ]);

        res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
    } catch (err) {
        console.error('Dashboard list failed:', err.message);
        res.status(500).json({ error: 'Failed to list calls' });
    }
});

// One call with everything (transcript, summary, dialer fields)
app.get('/api/dashboard/calls/:callId', requireApiKey, async (req, res) => {
    try {
        const call = await Call.findOne({ callId: req.params.callId }, { _id: 0, __v: 0 }).lean();
        if (!call) return res.status(404).json({ error: 'Call not found' });
        res.json(call);
    } catch (err) {
        console.error('Dashboard detail failed:', err.message);
        res.status(500).json({ error: 'Failed to load call' });
    }
});

// Values for the filter dropdowns
app.get('/api/dashboard/filters', requireApiKey, async (req, res) => {
    try {
        const dispositions = (await Call.distinct('firstDisposition')).filter(Boolean).sort();
        res.json({ dispositions });
    } catch (err) {
        console.error('Dashboard filters failed:', err.message);
        res.status(500).json({ error: 'Failed to load filters' });
    }
});
// Any unexpected error -> short JSON answer (never an HTML page with internal details)
app.use((err, req, res, next) => {
    console.error(`[error] ${req.method} ${req.path}: ${err.message}`);
    res.status(err.status || 500).json({ error: 'Request could not be processed' });
});

// Connect to the DB first, then start the server
connectDb()
    .then(() => {
        app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    });