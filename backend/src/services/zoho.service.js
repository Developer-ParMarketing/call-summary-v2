// Dialer data -> Zoho portal record (SD_Portal / SML_Portal), same flow as lead-upload:
//   1) search the brand's portal module by Name = portal ID (e.g. Cus_No_328357)
//   2) PUT fields on that record:
//        - dialer Remark  -> Agent_Comments   (as soon as the call arrives)
//        - AI summary     -> AI_Summery       (after the call is summarised)
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

// Find the portal record by Name and update the given fields on it
export async function updatePortalFields(brand, portalId, fields) {
    const { module, getToken } = ZOHO_CONFIG[brand];

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
            { data: [{ id: found.id, ...fields }] },
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

// Same as lead-upload: remark -> Agent_Comments
export const updatePortalComment = (brand, portalId, comment) =>
    updatePortalFields(brand, portalId, { [ZOHO_CONFIG[brand].commentField]: comment });

// Which Zoho portal record does this dialer payload belong to? (null = none)
// Brand: dialer "brand" text (SD / SingleDebt, SML / SettleMyLoan), else whichever portal ID is present.
export function getZohoTarget(d = {}) {
    const anyPortal = d.portal_id || d.portalId; // generic name, brand decides SD or SML
    const b = String(d.brand || '').toLowerCase().replace(/\s+/g, '');
    const brand = b === 'sd' || b.includes('singledebt') ? 'sd'
        : b === 'sml' || b.includes('settlemyloan') ? 'sml'
            : d.SD_Portal_ID ? 'sd'
                : d.SML_Portal_ID ? 'sml'
                    : null;
    const portalId = brand ? (d[ZOHO_CONFIG[brand].portalKey] || anyPortal) : undefined;
    return brand && portalId ? { brand, portalId } : null;
}

// Portal record + remark (null when there is no remark to send)
export function getRemarkTarget(d = {}) {
    const remark = d.Remark || d.Remarks || d.remark;
    const target = getZohoTarget(d);
    return target && remark ? { ...target, remark } : null;
}

// Run one Zoho update and turn any error into a 'failed' result
async function tryUpdate(brand, portalId, fields) {
    try {
        return await updatePortalFields(brand, portalId, fields);
    } catch (err) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : '';
        return { status: 'failed', error: `${err.message}${detail ? ` - ${detail}` : ''}`.slice(0, 500) };
    }
}

// Send one call's remark to Zoho and save the result on the call
export async function syncRemark(callId) {
    if (!config.zoho.enabled) return;
    const call = await Call.findOne({ callId });
    if (!call?.remark || !call.portalId || !call.zohoBrand) return;

    const result = await tryUpdate(call.zohoBrand, call.portalId, { [ZOHO_CONFIG[call.zohoBrand].commentField]: call.remark });

    call.zohoStatus = result.status;
    call.zohoRecordId = result.zohoRecordId || call.zohoRecordId;
    call.zohoError = result.error;
    call.zohoAttempts = (call.zohoAttempts || 0) + 1;
    call.zohoSyncedAt = new Date();
    await call.save();
    console.log(`[zoho] remark ${callId} ${call.zohoBrand} ${call.portalId}: ${result.status}${result.error ? ` (${result.error})` : ''}`);
}

// Send one call's AI summary to Zoho (field AI_Summery) and save the result on the call
export async function syncSummary(callId) {
    if (!config.zoho.summaryEnabled) return;
    const call = await Call.findOne({ callId });
    if (!call?.summary || !call.portalId || !call.zohoBrand) return;

    const result = await tryUpdate(call.zohoBrand, call.portalId, { [config.zoho.summaryField]: call.summary.slice(0, 32000) });

    call.zohoSummaryStatus = result.status;
    call.zohoRecordId = result.zohoRecordId || call.zohoRecordId;
    call.zohoSummaryError = result.error;
    call.zohoSummaryAttempts = (call.zohoSummaryAttempts || 0) + 1;
    call.zohoSummarySyncedAt = new Date();
    await call.save();
    console.log(`[zoho] summary ${callId} ${call.zohoBrand} ${call.portalId}: ${result.status}${result.error ? ` (${result.error})` : ''}`);
}

// Called by the worker right after a call gets its summary. Never fails the call.
export async function sendSummaryToZoho(call) {
    if (!config.zoho.summaryEnabled || !call.portalId || !call.zohoBrand || !call.summary) return;
    try {
        await Call.updateOne({ callId: call.callId }, { $set: { zohoSummaryStatus: 'pending', zohoSummaryAttempts: 0 } });
        await syncSummary(call.callId);
    } catch (err) {
        console.error(`[zoho] summary ${call.callId}:`, err.message);
    }
}

// Fire and forget (the dialer gets its answer without waiting for Zoho)
export function syncRemarkLater(callId) {
    if (!config.zoho.enabled) return;
    setImmediate(() => syncRemark(callId).catch((e) => console.error(`[zoho] ${callId}:`, e.message)));
}

// Every 5 minutes: try failed / not-found remarks and summaries again (like lead-upload's startZohoAutoRetry)
export function startZohoAutoRetry() {
    const { enabled, summaryEnabled, summaryField, retryMinutes, maxAttempts } = config.zoho;
    console.log(`[zoho] remark -> Agent_Comments: ${enabled ? 'ON' : 'OFF'} | summary -> ${summaryField}: ${summaryEnabled ? 'ON' : 'OFF'}`);
    if (!enabled && !summaryEnabled) return;

    const retryable = ['pending', 'failed', 'not_found'];
    let running = false;
    setInterval(async () => {
        if (running) return;
        running = true;
        try {
            if (enabled) {
                const due = await Call.find({ zohoStatus: { $in: retryable }, zohoAttempts: { $lt: maxAttempts } }, { callId: 1 })
                    .sort({ updatedAt: 1 }).limit(50).lean();
                for (const c of due) await syncRemark(c.callId);
            }
            if (summaryEnabled) {
                const due = await Call.find({ zohoSummaryStatus: { $in: retryable }, zohoSummaryAttempts: { $lt: maxAttempts } }, { callId: 1 })
                    .sort({ updatedAt: 1 }).limit(50).lean();
                for (const c of due) await syncSummary(c.callId);
            }
        } catch (err) {
            console.error('[zoho] auto-retry error:', err.message);
        } finally {
            running = false;
        }
    }, retryMinutes * 60 * 1000);
}