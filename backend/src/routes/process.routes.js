import express from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { runNow, status, stopNow } from '../controllers/process.controller.js';

const router = express.Router();

router.post('/run', asyncHandler(runNow));
router.post('/stop', asyncHandler(stopNow));
router.get('/status', asyncHandler(status));

export default router;
