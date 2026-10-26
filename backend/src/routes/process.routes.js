import express from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { retryCall, runNow, status, stopNow } from '../controllers/process.controller.js';
import { resendRemark } from '../controllers/zoho.controller.js';

const router = express.Router();

router.post('/run', asyncHandler(runNow));
router.post('/stop', asyncHandler(stopNow));
router.post('/retry/:callId', asyncHandler(retryCall));
router.get('/status', asyncHandler(status));
router.post('/zoho/:callId', asyncHandler(resendRemark)); // send the remark to Zoho again

export default router;