// Labels, colours and formatting used across the dashboard

export const STATUS = {
    queued: { label: 'Waiting', color: 'var(--s-queued)' },
    processing: { label: 'Working on it', color: 'var(--s-processing)' },
    transcribed: { label: 'Transcript only', color: 'var(--s-transcribed)' },
    done: { label: 'Summary ready', color: 'var(--s-done)' },
    skipped: { label: 'Skipped', color: 'var(--s-skipped)' },
    failed: { label: 'Failed', color: 'var(--s-failed)' },
};
export const STATUS_ORDER = ['queued', 'processing', 'transcribed', 'done', 'skipped', 'failed'];

// Dialer remark -> Zoho (Agent_Comments)
export const ZOHO = {
    pending: { label: 'Waiting', color: 'var(--s-queued)', long: 'Waiting to send to Zoho' },
    updated: { label: 'Added', color: 'var(--s-done)', long: 'Added to Zoho' },
    not_found: { label: 'Not found', color: 'var(--s-transcribed)', long: 'Portal ID not found in Zoho (retrying every 5 min for 1 hour)' },
    failed: { label: 'Failed', color: 'var(--s-failed)', long: 'Zoho update failed' },
};
export const ZOHO_ORDER = ['updated', 'pending', 'not_found', 'failed'];

export const SKIP_TEXT = {
    disposition_not_selected: 'Disposition not selected for processing',
    disposition_not_explain_dmp: 'Not an Explain DMP call',
    missing_record_url: 'No recording link from the dialer',
    audio_too_short: 'Call too short (30s or less)',
    no_speech: 'No speech in the recording',
    empty_recording: 'Recording is empty or unreadable',
};

const shortFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
});
const fullFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' });

export const formatShort = (d) => (d ? shortFmt.format(new Date(d)) : '–');
export const formatFull = (d) => (d ? fullFmt.format(new Date(d)) : '');
export const formatLength = (s) =>
    s == null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export const formatCount = (n) => (n || 0).toLocaleString('en-IN');

// Call length: from the recording when we have it, otherwise from the dialer's start/end times
export function callLength(call) {
    if (call.audioSeconds != null) return { text: formatLength(call.audioSeconds), fromDialer: false };
    if (call.callStartTime && call.callEndTime) {
        const seconds = (new Date(call.callEndTime) - new Date(call.callStartTime)) / 1000;
        if (seconds >= 0 && seconds < 6 * 3600) return { text: formatLength(seconds), fromDialer: true };
    }
    return { text: '–', fromDialer: false };
}

// One short sentence explaining why a call is where it is
export function callNote(call) {
    if (call.status === 'skipped') return SKIP_TEXT[call.skipReason] || call.skipReason || '';
    if (call.status === 'failed') return `Stopped at ${String(call.errorMessage || 'unknown').split(':')[0]}`;
    if (call.status === 'transcribed') return 'Transcript ready, summary not written yet';
    if (call.status === 'done' && call.summaryPreview) {
        // First sentence of the summary, without the "Overview:" label
        const first = call.summaryPreview.split('\n')[0].replace(/^[^:]{2,24}:\s*/, '');
        return first.length > 110 ? `${first.slice(0, 110).trim()}…` : first;
    }
    if (call.status === 'queued') return 'Waits for the night run (or Process now)';
    return '';
}