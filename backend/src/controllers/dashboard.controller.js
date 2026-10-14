import { Call, STATUSES } from '../models/Call.js';
import { selectedDispositionQuery } from '../services/dispositions.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// Filters shared by the table and the counts:
//   dmpOnly=true      only the dispositions we process (PROCESS_DISPOSITIONS)
//   from / to         India days, e.g. 2026-10-13
//   disposition, search, status (table only)
function buildFilter(q, { withStatus = true } = {}) {
    const and = [];

    if (q.dmpOnly === 'true') and.push({ firstDisposition: selectedDispositionQuery() });
    if (q.disposition) and.push({ firstDisposition: String(q.disposition) });
    if (withStatus && STATUSES.includes(q.status)) and.push({ status: q.status });

    const search = String(q.search || '').trim();
    if (search) {
        const rx = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
        and.push({ $or: [{ callId: rx }, { customerName: rx }, { phone: rx }, { agentName: rx }, { campaign: rx }] });
    }

    if (isDay(q.from) || isDay(q.to)) {
        const range = {};
        if (isDay(q.from)) range.$gte = new Date(`${q.from}T00:00:00+05:30`);
        if (isDay(q.to)) range.$lt = new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86400000);
        and.push({ createdAt: range });
    }

    return and.length ? { $and: and } : {};
}

// GET /api/dashboard/calls  -> one page of calls, light fields only (no transcripts)
export async function listCalls(req, res) {
    const filter = buildFilter(req.query);
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
                    firstDisposition: 1, audioSeconds: 1, callStartTime: 1, callEndTime: 1, createdAt: 1,
                    hasTranscript: hasText('$transcript'),
                    hasSummary: hasText('$summary'),
                },
            },
        ]),
        Call.countDocuments(filter),
    ]);

    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}

// GET /api/dashboard/stats  -> counts per status for the colour bar (same filters, minus status)
export async function stats(req, res) {
    const rows = await Call.aggregate([
        { $match: buildFilter(req.query, { withStatus: false }) },
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    res.json({ counts: Object.fromEntries(rows.map((r) => [r._id, r.count])) });
}

// GET /api/dashboard/calls/:callId  -> everything about one call
export async function getCall(req, res) {
    const call = await Call.findOne({ callId: req.params.callId }, { _id: 0, __v: 0 }).lean();
    if (!call) return res.status(404).json({ error: 'Call not found' });
    res.json(call);
}

// GET /api/dashboard/filters  -> values for the disposition dropdown
export async function filters(req, res) {
    const dispositions = (await Call.distinct('firstDisposition')).filter(Boolean).sort();
    res.json({ dispositions });
}