import { config } from '../config/index.js';

// Is it inside the processing window (e.g. 22:00-06:00 India time)?

function toMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h > 23 || min > 59 ? null : h * 60 + min;
}

function nowMinutes() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: config.window.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    return Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
}

// The configured window, or null when not set (= manual only)
export function getWindow() {
    const start = toMinutes(config.window.start);
    const end = toMinutes(config.window.end);
    if (start === null || end === null || start === end) return null;
    return { start, end, label: `${config.window.start}-${config.window.end} (${config.window.timezone})` };
}

export function isInsideWindow() {
    const w = getWindow();
    if (!w) return false;
    const now = nowMinutes();
    return w.start < w.end ? now >= w.start && now < w.end : now >= w.start || now < w.end;
}
