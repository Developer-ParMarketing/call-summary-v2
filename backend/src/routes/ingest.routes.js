import express from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { getSummary, ingestGet, ingestPost } from '../controllers/ingest.controller.js';

const router = express.Router();

// Body is read as raw text (any content type) and parsed by us, so broken JSON never errors
const readRawBody = express.text({ type: () => true, limit: '1mb' });

router.post('/calls', readRawBody, asyncHandler(ingestPost));
router.get('/calls', asyncHandler(ingestGet));
router.get('/calls/:callId/summary', asyncHandler(getSummary));

export default router;
