import { config } from '../config/index.js';

// API key in the X-API-Key header OR in the URL as ?api_key=... (the dialer has no headers)
export function requireApiKey(req, res, next) {
    const key = req.get('X-API-Key') || req.query.api_key;
    if (!config.ingestApiKey || key !== config.ingestApiKey) {
        console.log(`[auth] rejected ${req.method} ${req.path} from ${req.ip}: wrong or missing api_key`);
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
}
