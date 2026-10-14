import mongoose from 'mongoose';

// One small document the API uses to tell the worker "start / stop processing now"
const controlSchema = new mongoose.Schema(
    {
        _id: String, // always "worker"
        runRequested: { type: Boolean, default: false },
        requestedAt: Date,
        lastRunFinishedAt: Date,
    },
    { versionKey: false }
);

export const Control = mongoose.model('Control', controlSchema, 'control');
