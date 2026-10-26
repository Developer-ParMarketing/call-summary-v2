// Zoho access tokens - same source as the lead-upload project.
// The tokens come ready-made from our own token services (they handle Zoho OAuth themselves).
import axios from 'axios';

const SD_TOKEN_URL = process.env.ZOHO_SD_TOKEN_URL || 'https://api.singledebt.in/token';
const SML_TOKEN_URL = process.env.ZOHO_SML_TOKEN_URL || 'https://platform-api.settlemyloan.in/token/';

const CACHE_MS = 870 * 1000; // ~14.5 min, same as lead-upload

function makeTokenGetter(name, url) {
    let token = null;
    let expiry = 0;

    // force = true skips the cache (used once when Zoho says INVALID_TOKEN)
    return async function getToken(force = false) {
        const now = Date.now();
        if (!force && token && now < expiry) return token;

        try {
            console.log(`[zoho] fetching ${name} token...`);
            const response = await axios.get(url, { timeout: 15000 });
            const newToken = response?.data?.token?.[0]?.token;
            if (!newToken) throw new Error(`No ${name} token received.`);

            token = newToken;
            expiry = now + CACHE_MS;
            return token;
        } catch (error) {
            token = null;
            console.error(`[zoho] error fetching ${name} token:`, error.response?.data || error.message);
            throw new Error(`Failed to fetch ${name} token`);
        }
    };
}

export const getZohoToken = makeTokenGetter('SD', SD_TOKEN_URL);
export const getSmlToken = makeTokenGetter('SML', SML_TOKEN_URL);