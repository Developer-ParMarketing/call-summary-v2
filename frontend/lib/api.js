// Small helper for calling our backend. The API key goes in the URL (?api_key=...).

export class AuthError extends Error {}

export async function apiFetch(path, apiKey, options = {}) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${path}${sep}api_key=${encodeURIComponent(apiKey)}`, options);
    if (res.status === 401) throw new AuthError('That key was not accepted. Check it and try again.');
    if (!res.ok) throw new Error(`Server answered ${res.status}`);
    return res.json();
}

const KEY_NAME = 'cs2_api_key';
export function loadKey() {
    try { return localStorage.getItem(KEY_NAME) || ''; } catch { return ''; }
}
export function saveKey(key) {
    try { localStorage.setItem(KEY_NAME, key); } catch { /* private mode: key lives only in memory */ }
}
