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

        // Dialer Remark -> Zoho (SD_Portal / SML_Portal, field Agent_Comments)
        remark: String,             // dialer "Remark" (or "Remarks")
        sdPortalId: String,         // dialer "SD_Portal_ID", e.g. Cus_No_328357
        smlPortalId: String,        // dialer "SML_Portal_ID"
        portalId: String,
        clientNameZoho: String,     // client name as in Zoho
        clientNumberZoho: String,   // client number as in Zoho
        creditorsBankName: String,
        creditorLandlineNumber: String,         // the one used for Zoho (SD or SML)
        zohoBrand: String,          // 'sd' | 'sml'
        zohoStatus: String,         // 'pending' | 'updated' | 'not_found' | 'failed'
        zohoRecordId: String,
        zohoError: String,
        zohoAttempts: Number,
        zohoSyncedAt: Date,
    },
    { timestamps: true }
);

// Indexes so the worker queue and the dashboard stay fast as data grows
callSchema.index({ status: 1, createdAt: 1 });            // worker: oldest queued call
callSchema.index({ createdAt: -1 });                       // dashboard: newest first
callSchema.index({ firstDisposition: 1, createdAt: -1 });  // dashboard: disposition filter
callSchema.index({ firstDisposition: 1, status: 1 });      // stats: counts per status
callSchema.index({ zohoStatus: 1, updatedAt: 1 });          // Zoho remark auto-retry

export const Call = mongoose.model('Call', callSchema);