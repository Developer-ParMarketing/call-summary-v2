import mongoose from 'mongoose';

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

        status: {
            type: String,
            enum: ['queued', 'processing', 'done', 'failed', 'skipped'],
            default: 'queued',
        },
        skipReason: String,   // why a call was skipped
        errorMessage: String, // why a call failed
        audioFile: String,    // where the recording was saved
        audioBytes: Number,   // size of the recording
        audioSeconds: Number, // call length
        language: String,     // e.g. "hi"
        transcript: String,   // full text from Bhashini
        summary: String,      // English summary from OpenAI
    },
    { timestamps: true } // adds createdAt and updatedAt automatically
);

export const Call = mongoose.model('Call', callSchema);

// One small document the API uses to tell the worker "start processing now"
const controlSchema = new mongoose.Schema(
    {
        _id: String,                                   // always "worker"
        runRequested: { type: Boolean, default: false },
        requestedAt: Date,
        lastRunFinishedAt: Date,
    },
    { versionKey: false }
);

export const Control = mongoose.model('Control', controlSchema, 'control');

export async function connectDb() {
    await mongoose.connect(process.env.MONGODB_URI);
    const { name, port } = mongoose.connection;
    console.log(`Database ready: ${name} on port ${port}`);
}