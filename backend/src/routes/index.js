import express from 'express';
import { requireApiKey } from '../middleware/requireApiKey.js';
import ingestRoutes from './ingest.routes.js';
import processRoutes from './process.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import { listCalls } from '../controllers/dashboard.controller.js';
import { asyncHandler } from '../middleware/errors.js';

// Every /api route needs the API key
const api = express.Router();
api.use(requireApiKey);

api.use('/ingest', ingestRoutes);       // dialer: send calls, get summaries
api.use('/process', processRoutes);     // you: run / stop / status
api.use('/dashboard', dashboardRoutes); // the dashboard website
api.get('/calls', asyncHandler(listCalls)); // quick check in Postman (latest 50)

export default api;
