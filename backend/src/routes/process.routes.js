import express from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { retryCall, runNow, status, stopNow } from '../controllers/process.controller.js';
import { resendRemark } from '../controllers/zoho.controller.js';

const router = express.Router();

router.post('/run', asyncHandler(runNow));
router.post('/stop', asyncHandler(stopNow));
router.post('/retry/:callId', asyncHandler(retryCall));
router.get('/status', asyncHandler(status));
// Send remark + summary to Zoho again. Optional JSON body { "summary": "..." } sets the summary first.
router.post('/zoho/:callId', express.json({ limit: '200kb' }), asyncHandler(resendRemark));

export default router;