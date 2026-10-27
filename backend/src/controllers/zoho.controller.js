import { Call } from '../models/Call.js';
import { config } from '../config/index.js';
import { syncRemark, syncSummary } from '../services/zoho.service.js';

const TEXT = { updated: 'added to Zoho', not_found: 'portal ID not found in Zoho', failed: 'Zoho update failed' };

// POST /api/process/zoho/:callId  -> send this call's remark AND AI summary to Zoho again, right now
// Optional JSON body { "summary": "..." } -> save that text as the call's summary first (for testing)
export async function resendRemark(req, res) {
    const manualSummary = typeof req.body?.summary === 'string' ? req.body.summary.trim() : '';
    if (manualSummary) {
        await Call.updateOne({ callId: req.params.callId }, { $set: { summary: manualSummary.slice(0, 32000) } });
    }

    const call = await Call.findOne({ callId: req.params.callId }).lean();
    if (!call) return res.status(404).json({ error: 'Call not found' });
    if (!call.portalId || !call.zohoBrand) return res.status(400).json({ error: 'This call has no SD/SML portal ID' });

    const sent = [];
    if (config.zoho.enabled && call.remark) {
        await Call.updateOne({ callId: call.callId }, { $set: { zohoStatus: 'pending', zohoAttempts: 0 }, $unset: { zohoError: '' } });
        await syncRemark(call.callId);
        sent.push('remark');
    }
    if (config.zoho.summaryEnabled && call.summary) {
        await Call.updateOne({ callId: call.callId }, { $set: { zohoSummaryStatus: 'pending', zohoSummaryAttempts: 0 }, $unset: { zohoSummaryError: '' } });
        await syncSummary(call.callId);
        sent.push('summary');
    }
    if (!sent.length) return res.status(400).json({ error: 'Nothing to send (no remark / summary, or Zoho sync is off in .env)' });

    const after = await Call.findOne({ callId: call.callId },
        { zohoStatus: 1, zohoError: 1, zohoSummaryStatus: 1, zohoSummaryError: 1 }).lean();
    const parts = [];
    if (sent.includes('remark')) parts.push(`Remark: ${TEXT[after.zohoStatus] || after.zohoStatus}`);
    if (sent.includes('summary')) parts.push(`Summary: ${TEXT[after.zohoSummaryStatus] || after.zohoSummaryStatus}`);
    res.json({ message: parts.join(' · '), ...after });
}