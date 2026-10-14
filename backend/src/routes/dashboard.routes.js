import express from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { filters, getCall, listCalls, stats } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/calls', asyncHandler(listCalls));
router.get('/calls/:callId', asyncHandler(getCall));
router.get('/stats', asyncHandler(stats));
router.get('/filters', asyncHandler(filters));

export default router;
