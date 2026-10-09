import 'dotenv/config';
import express from 'express';
import { Call, Control, connectDb } from './db.js';
import { getWindow, isInsideWindow } from './schedule.js';

const app = express();
const PORT = process.env.PORT || 8030;

// Every field the dialer can send (names exactly as the dialer uses them)
const DIALER_FIELDS = [
    'Alternate_Phone_Number', 'Alternate_Phone_Number2', 'City',
    'Client_Name_As_Mentioned_In_ZOHO', 'Client_Number_As_Mentioned_In_ZOHO',
    'Concerned_About', 'Created_On', 'Creditors_Bank_Name', 'Creditor_Landline_Number',
    'Credit_Score', 'Customer_Name', 'Data_Type', 'Debt_Causes', 'Debt_Level',
    'EMI_Payments', 'Employed', 'Experiencing_Harassment', 'E_mail', 'First_Name',
    'Harassment_Type', 'Job_Status', 'Last_Name', 'Living_Status', 'Missed_EMI',
    'Missed_Payment', 'Monthly_Expense', 'Monthly_Income', 'No_Of_Loans', 'Number_Debt',
    'Phone', 'Prospect', 'Received_Threats', 'SD_Portal_ID', 'Service_Type',
    'SML_Portal_ID', 'Source', 'State', 'State_Name', 'Time_Slot', 'Whats_App_Number',
    'zoho_refrence_id', 'agent_name', 'CallType', 'campaign_id', 'campaign',
    'agent_id', 'did_no', 'crm_uniqe_id', 'emp_code', 'process',
];

// Clean one value: trim it; treat empty or unfilled placeholders (like "@City@") as missing
function cleanValue(value) {
    if (value == null) return undefined;
    const text = String(Array.isArray(value) ? value[0] : value).trim();
    if (!text || /^@.*@$/.test(text)) return undefined;
    return text;
}

// Keep only the known dialer fields that actually have a value
function pickDialerData(query) {
    const data = {};
    for (const field of DIALER_FIELDS) {
        const value = cleanValue(query[field]);
        if (value !== undefined) data[field] = value;
    }
    return data;
}

// Only requests with the correct API key get through
function requireApiKey(req, res, next) {
    if (req.get('X-API-Key') !== process.env.INGEST_API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
}

// 1) Dialer hits this when a call ends -> we save it as "queued"
app.get('/api/ingest/calls', requireApiKey, async (req, res) => {
    const callId = cleanValue(req.query._id);
    if (!callId) {
        return res.status(400).json({ error: '_id is required' });
    }

    const d = pickDialerData(req.query);
    const fullName = [d.First_Name, d.Last_Name].filter(Boolean).join(' ');

    try {
        await Call.create({
            callId,
            firstDisposition: cleanValue(req.query.first_disposition),
            recordUrl: cleanValue(req.query.record_url),

            customerName: d.Customer_Name || fullName || undefined,
            phone: d.Phone,
            email: d.E_mail,
            agentName: d.agent_name,
            agentId: d.agent_id,
            campaign: d.campaign,
            campaignId: d.campaign_id,
            crmId: d.crm_uniqe_id,
            zohoRefId: d.zoho_refrence_id,

            dialerData: d,
            rawPayload: { ...req.query },
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
});

// 2) Dialer polls this to get the summary
app.get('/api/ingest/calls/:callId/summary', requireApiKey, async (req, res) => {
    try {
        const call = await Call.findOne({ callId: req.params.callId }).lean();

        if (!call) {
            return res.status(404).json({ error: 'Call not found', callId: req.params.callId });
        }

        const base = { callId: call.callId, status: call.status };

        if (call.status === 'queued' || call.status === 'processing') {
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
//    Add ?retryFailed=true to also re-queue failed calls first
app.post('/api/process/run', requireApiKey, async (req, res) => {
    try {
        let retried = 0;
        if (req.query.retryFailed === 'true') {
            const r = await Call.updateMany({ status: 'failed' }, { $set: { status: 'queued' } });
            retried = r.modifiedCount;
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
            counts, // e.g. { queued: 5, done: 12, failed: 1 }
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

// See what's saved (temporary, the dashboard will replace this later)
app.get('/api/calls', requireApiKey, async (req, res) => {
    const calls = await Call.find().sort({ createdAt: -1 }).limit(50);
    res.json(calls);
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