import express from 'express';
import apiRoutes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errors.js';

export function createApp() {
    const app = express();
    app.set('trust proxy', 'loopback'); // behind nginx: log the real client IP
    app.disable('x-powered-by');

    app.get('/health', (req, res) => res.json({ ok: true }));
    app.use('/api', apiRoutes);
    app.use('/api', notFound);
    app.use(errorHandler);
    return app;
}
