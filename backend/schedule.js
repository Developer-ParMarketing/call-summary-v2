// Decides whether we are inside the processing time window (e.g. 22:00-06:00 India time)

const timezone = () => process.env.PROCESS_TIMEZONE || 'Asia/Kolkata';

// "22:00" -> 1320 (minutes since midnight). Invalid -> null
function toMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

// Current time in the chosen timezone, as minutes since midnight
function nowMinutes() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone(),
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour').value);
    const m = Number(parts.find((p) => p.type === 'minute').value);
    return h * 60 + m;
}

// Returns the configured window, or null if not set (= manual only)
export function getWindow() {
    const start = toMinutes(process.env.PROCESS_WINDOW_START);
    const end = toMinutes(process.env.PROCESS_WINDOW_END);
    if (start === null || end === null || start === end) return null;
    return {
        start,
        end,
        label: `${process.env.PROCESS_WINDOW_START}-${process.env.PROCESS_WINDOW_END} (${timezone()})`,
    };
}

export function isInsideWindow() {
    const w = getWindow();
    if (!w) return false;
    const now = nowMinutes();
    // Normal window (09:00-17:00) or overnight window (22:00-06:00)
    return w.start < w.end ? now >= w.start && now < w.end : now >= w.start || now < w.end;
}