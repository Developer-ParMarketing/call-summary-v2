// Unknown /api route -> JSON 404 (instead of an HTML page)
export function notFound(req, res) {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}

// Any unexpected error -> short JSON answer, details only in the server log
export function errorHandler(err, req, res, next) {
    console.error(`[error] ${req.method} ${req.path}: ${err.message}`);
    res.status(err.status || 500).json({ error: 'Request could not be processed' });
}

// Lets async route handlers throw: errors go to errorHandler instead of crashing
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
