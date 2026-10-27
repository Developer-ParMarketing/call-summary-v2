// Dialer "Remark" -> Zoho portal record's Agent_Comments field.
// Same flow as lead-upload (controllers/dialerLead.js):
//   1) search the brand's portal module by Name = portal ID (e.g. Cus_No_328357)
//   2) PUT Agent_Comments = remark on that record (overwrites the old value)
import axios from 'axios';
import { getZohoToken, getSmlToken } from '../config/tokenService.js';
import { config } from '../config/index.js';
import { Call } from '../models/Call.js';

const ZOHO_BASE = 'https://www.zohoapis.in/crm/v2';

// Per-brand Zoho setup: which module to search/update and which token to use
const ZOHO_CONFIG = {
    sd: { module: 'SD_Portal', getToken: getZohoToken, commentField: 'Agent_Comments', portalKey: 'SD_Portal_ID' },
    sml: { module: 'SML_Portal', getToken: getSmlToken, commentField: 'Agent_Comments', portalKey: 'SML_Portal_ID' }, // confirm SML module API name
};

// Run a Zoho call with the brand's token; on INVALID_TOKEN fetch a fresh token once and retry
async function zohoCall(getToken, fn) {
    const token = await getToken();
    try {
        return await fn(token);
    } catch (err) {
        if (err.response?.data?.code === 'INVALID_TOKEN') return fn(await getToken(true));
        throw err;
    }
}

export async function updatePortalComment(brand, portalId, comment) {
    const { module, getToken, commentField } = ZOHO_CONFIG[brand];

    const searchRes = await zohoCall(getToken, (token) =>
        axios.get(`${ZOHO_BASE}/${module}/search`, {
            params: { criteria: `(Name:equals:${portalId})` },
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
            timeout: 20000,
        })
    );

    // Zoho returns 204 with an empty body when nothing matches
    const found = searchRes.data?.data?.[0];
    if (!found?.id) return { status: 'not_found' };

    const putRes = await zohoCall(getToken, (token) =>
        axios.put(`${ZOHO_BASE}/${module}`,
            { data: [{ id: found.id, [commentField]: comment }] },
            {
                headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
                timeout: 20000,
            }
        )
    );

    const result = putRes.data?.data?.[0];
    return result?.code === 'SUCCESS'
        ? { status: 'updated', zohoRecordId: found.id }
        : { status: 'failed', zohoRecordId: found.id, error: JSON.stringify(result) };
}

// Which brand + portal ID + remark does this dialer payload have? (null = nothing to send)
// Brand: dialer "brand" text (SD / SingleDebt, SML / SettleMyLoan), else whichever portal ID is present.
export function getRemarkTarget(d = {}) {
    const remark = d.Remark || d.Remarks || d.remark;
    const anyPortal = d.portal_id || d.portalId; // generic name, brand decides SD or SML
    const b = String(d.brand || '').toLowerCase().replace(/\s+/g, '');
    let brand = b === 'sd' || b.includes('singledebt') ? 'sd'
        : b === 'sml' || b.includes('settlemyloan') ? 'sml'
            : d.SD_Portal_ID ? 'sd'
                : d.SML_Portal_ID ? 'sml'
                    : null;
    const portalId = brand ? (d[ZOHO_CONFIG[brand].portalKey] || anyPortal) : undefined;
    if (!brand || !portalId || !remark) return null;
    return { brand, portalId, remark };
}

// Send one call's remark to Zoho and save the result on the call
export async function syncRemark(callId) {
    if (!config.zoho.enabled) return;
    const call = await Call.findOne({ callId });
    if (!call?.remark || !call.portalId || !call.zohoBrand) return;

    let result;
    try {
        result = await updatePortalComment(call.zohoBrand, call.portalId, call.remark);
    } catch (err) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : '';
        result = { status: 'failed', error: `${err.message}${detail ? ` - ${detail}` : ''}`.slice(0, 500) };
    }

    call.zohoStatus = result.status;
    call.zohoRecordId = result.zohoRecordId || call.zohoRecordId;
    call.zohoError = result.error;
    call.zohoAttempts = (call.zohoAttempts || 0) + 1;
    call.zohoSyncedAt = new Date();
    await call.save();
    console.log(`[zoho] ${callId} ${call.zohoBrand} ${call.portalId}: ${result.status}${result.error ? ` (${result.error})` : ''}`);
}

// Fire and forget (the dialer gets its answer without waiting for Zoho)
export function syncRemarkLater(callId) {
    if (!config.zoho.enabled) return;
    setImmediate(() => syncRemark(callId).catch((e) => console.error(`[zoho] ${callId}:`, e.message)));
}

// Every 5 minutes: try failed / not-found remarks again (like lead-upload's startZohoAutoRetry)
export function startZohoAutoRetry() {
    if (!config.zoho.enabled) {
        console.log('[zoho] remark sync OFF (ZOHO_REMARK_ENABLED is not true)');
        return;
    }
    console.log(`[zoho] remark sync ON, auto-retry every ${config.zoho.retryMinutes} min`);
    let running = false;
    setInterval(async () => {
        if (running) return;
        running = true;
        try {
            const due = await Call.find(
                { zohoStatus: { $in: ['pending', 'failed', 'not_found'] }, zohoAttempts: { $lt: config.zoho.maxAttempts } },
                { callId: 1 }
            ).sort({ updatedAt: 1 }).limit(50).lean();
            for (const c of due) await syncRemark(c.callId);
        } catch (err) {
            console.error('[zoho] auto-retry error:', err.message);
        } finally {
            running = false;
        }
    }, config.zoho.retryMinutes * 60 * 1000);
}