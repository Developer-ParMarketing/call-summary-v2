import { Call } from '../models/Call.js';
import { config } from '../config/index.js';
import { syncRemark } from '../services/zoho.service.js';

// POST /api/process/zoho/:callId  -> send this call's remark to Zoho again, right now
export async function resendRemark(req, res) {
    if (!config.zoho.enabled) return res.status(400).json({ error: 'Zoho remark sync is off (ZOHO_REMARK_ENABLED=true in .env)' });

    const call = await Call.findOneAndUpdate(
        { callId: req.params.callId, remark: { $nin: [null, ''] }, portalId: { $nin: [null, ''] } },
        { $set: { zohoStatus: 'pending', zohoAttempts: 0 }, $unset: { zohoError: '' } },
        { returnDocument: 'after' }
    );
    if (!call) return res.status(404).json({ error: 'Call not found, or it has no remark / portal ID' });

    await syncRemark(call.callId);
    const after = await Call.findOne({ callId: call.callId }, { zohoStatus: 1, zohoError: 1 }).lean();
    const text = { updated: 'Remark added to Zoho', not_found: 'Portal ID not found in Zoho', failed: 'Zoho update failed' };
    res.json({ message: text[after.zohoStatus] || after.zohoStatus, zohoStatus: after.zohoStatus, zohoError: after.zohoError });
}