import crypto from 'crypto';

// Turns whatever the dialer sends (JSON, broken JSON, form data, URL params) into clean fields.

// Trim a value; treat empty values and unfilled placeholders like "{{Phone}}" or "@Phone@" as missing
export function cleanValue(value) {
    if (value == null) return undefined;
    const text = String(Array.isArray(value) ? value[0] : value).trim();
    if (!text) return undefined;
    if (/^\{\{.*\}\}$/.test(text) || /^@.*@$/.test(text)) return undefined;
    return text;
}

// Keep every field that has a real value (max 100 fields, 2000 characters each)
export function cleanPayload(payload) {
    const data = {};
    for (const [key, value] of Object.entries(payload || {}).slice(0, 100)) {
        if (key === 'api_key' || key.startsWith('$') || key.includes('.')) continue; // never store these
        const v = cleanValue(value);
        if (v !== undefined) data[key] = v.slice(0, 2000);
    }
    return data;
}

// Line breaks / tabs typed INSIDE a value (e.g. a multi-line Remark) are not allowed in JSON.
// Turn them into \n / \t, only inside "strings" (line breaks between fields stay as they are).
function escapeControlCharsInStrings(text) {
    let out = '';
    let inString = false;
    let escaped = false;
    for (const ch of text) {
        if (!inString) {
            if (ch === '"') inString = true;
            out += ch;
            continue;
        }
        if (escaped) { escaped = false; out += ch; continue; }
        if (ch === '\\') { escaped = true; out += ch; continue; }
        if (ch === '"') { inString = false; out += ch; continue; }
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\r') { out += '\\r'; continue; }
        if (ch === '\t') { out += '\\t'; continue; }
        if (ch < ' ') continue; // other invisible control characters
        out += ch;
    }
    return out;
}

// Read text as JSON; if that fails, repair common mistakes from copied templates:
// invisible spaces, smart quotes, `backticks`, line breaks inside values,
// missing commas between lines, trailing commas.
export function parseJsonLoose(text) {
    try {
        return { data: JSON.parse(text), repaired: false };
    } catch {
        const cleaned = text
            .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
            .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
            .replace(/`/g, '"');
        const fixed = escapeControlCharsInStrings(cleaned)
            .replace(/"\s*\n\s*"/g, '",\n"')
            .replace(/,\s*([}\]])/g, '$1');
        try {
            return { data: JSON.parse(fixed), repaired: true };
        } catch {
            return { data: undefined, repaired: false };
        }
    }
}
// Body (raw text or object) -> { payload, rawBody?, repaired? }
export function readPayload(contentType, body) {
    if (body && typeof body === 'object') return { payload: body };

    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) return { payload: {} };

    if (String(contentType || '').includes('application/x-www-form-urlencoded')) {
        return { payload: Object.fromEntries(new URLSearchParams(text)) };
    }

    const { data, repaired } = parseJsonLoose(text);
    if (data && typeof data === 'object') return { payload: data, repaired };

    return { payload: {}, rawBody: text.slice(0, 10000) }; // could not read it at all
}

// Dialer times like "2026-08-01 10:22:05" have no timezone -> treat them as India time
export function parseDialerTime(text) {
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
        return file.split('/').pop().replace(/\.[a-z0-9]+$/i, '') || undefined;
    } catch {
        return undefined;
    }
}

// Call ID: dialer's ID -> recording file name -> our own generated ID
export function getCallId(d) {
    const fromDialer = d.unique_id || d.call_id || d._id || d.callId || d.uniqueid;
    if (fromDialer) return { callId: fromDialer, callIdSource: 'dialer' };

    const fromRecording = callIdFromRecordUrl(d.record_url);
    if (fromRecording) return { callId: fromRecording, callIdSource: 'record_url' };

    return { callId: `gen-${crypto.randomUUID()}`, callIdSource: 'generated' };
}

// Cleaned dialer fields -> our database fields
// First key that has a value (the dialer may send snake_case, camelCase or Zoho-style names)
const pick = (d, ...keys) => keys.map((k) => d[k]).find((v) => v !== undefined);

// Cleaned dialer fields -> our database fields
export function toCallFields(d) {
    return {
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
        remark: pick(d, 'Remark', 'Remarks', 'remark'),
        sdPortalId: pick(d, 'SD_Portal_ID', 'sd_portal_id'),
        smlPortalId: pick(d, 'SML_Portal_ID', 'sml_portal_id'),
        clientNameZoho: pick(d, 'client_name_zoho', 'clientNameZoho', 'Client_Name_Zoho'),
        clientNumberZoho: pick(d, 'client_number_zoho', 'clientNumberZoho', 'Client_Number_Zoho'),
        creditorsBankName: pick(d, 'creditors_bank_name', 'creditorsBankName', 'Creditors_Bank_Name'),
        creditorLandlineNumber: pick(d, 'creditor_landline_number', 'creditorLandlineNumber', 'Creditor_Landline_Number'),
        callStartTime: parseDialerTime(d.call_start_time),
        callEndTime: parseDialerTime(d.call_end_time),
    };
}