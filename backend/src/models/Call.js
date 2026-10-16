import mongoose from 'mongoose';

export const STATUSES = ['queued', 'processing', 'transcribed', 'done', 'failed', 'skipped'];

const callSchema = new mongoose.Schema(
    {
        callId: { type: String, required: true, unique: true },
        callIdSource: String, // 'dialer' | 'record_url' | 'generated'
        firstDisposition: String,
        secondDisposition: String,
        recordUrl: String,

        // Main details from the dialer (for search / dashboard)
        customerName: String,
        phone: String,
        email: String,
        agentName: String,
        agentUsername: String,
        agentId: String,
        campaign: String,
        campaignId: String,
        brand: String,
        callType: String,
        source: String,
        extensionNo: String,
        zohoRefId: String,
        callStartTime: Date,
        callEndTime: Date,

        dialerData: Object, // everything the dialer sent, cleaned
        rawBody: String,    // the body as text, only if it was not valid JSON

        status: { type: String, enum: STATUSES, default: 'queued' },
        skipReason: String,   // why a call was skipped
        errorMessage: String, // why a call failed
        audioBytes: Number,
        audioSeconds: Number,
        language: String,
        transcript: String,         // Bhashini output (Devanagari Hindi)
        transcriptHinglish: String, // same text in Hinglish (Roman Hindi + English words)
        transcriptSource: String,   // 'ai' (AI listened to the audio) | 'bhashini'
        summary: String,            // English summary from OpenAI
    },
    { timestamps: true }
);

// Indexes so the worker queue and the dashboard stay fast as data grows
callSchema.index({ status: 1, createdAt: 1 });            // worker: oldest queued call
callSchema.index({ createdAt: -1 });                       // dashboard: newest first
callSchema.index({ firstDisposition: 1, createdAt: -1 });  // dashboard: disposition filter
callSchema.index({ firstDisposition: 1, status: 1 });      // stats: counts per status

export const Call = mongoose.model('Call', callSchema);