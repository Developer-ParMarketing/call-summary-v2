// All settings in one place, read from .env (loaded by index.js / worker.js before this file).

const list = (text, fallback) =>
    String(text || fallback)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

export const config = {
    port: Number(process.env.PORT) || 8030,
    ingestApiKey: process.env.INGEST_API_KEY,
    mongoUri: process.env.MONGODB_URI,

    // PBX has an incomplete SSL chain -> false skips the check for recording downloads only
    recordingTlsVerify: process.env.RECORDING_TLS_VERIFY !== 'false',

    bhashini: {
        userId: process.env.BHASHINI_USER_ID,
        udyatKey: process.env.BHASHINI_UDYAT_KEY,
        pipelineId: process.env.BHASHINI_PIPELINE_ID || '64392f96daac500b55c543cd',
    },

    // AI provider for summaries (any OpenAI-compatible API: OpenAI, Gemini, Groq, Ollama...)
    ai: {
        baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY,
        model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        minGapMs: Number(process.env.AI_MIN_GAP_MS) || 0, // wait between requests (free tiers allow few per minute)
        fallbackModel: process.env.AI_FALLBACK_MODEL || '', // used when the main model is overloaded (503)
    },

    // false = transcribe only (no OpenAI calls at all). Calls stay 'transcribed' until switched on.
    aiEnabled: process.env.SUMMARY_ENABLED !== 'false',
    // false = keep only the Hindi transcript (no Hinglish conversion)
    hinglishEnabled: process.env.HINGLISH_ENABLED !== 'false',
    // 'bhashini' = free, right after transcription (default) | 'openai' = better English words, needs credits
    hinglishSource: process.env.HINGLISH_SOURCE === 'openai' ? 'openai' : 'bhashini',

    // How calls are transcribed:
    //   'ai'       = the AI listens to the recording (Hinglish transcript + summary in ONE request) - best
    //   'bhashini' = Bhashini speech-to-text, then Hinglish + summary as separate steps
    transcribeEngine: process.env.TRANSCRIBE_ENGINE === 'bhashini' ? 'bhashini' : 'ai',

    // Only calls with these dispositions are transcribed / summarised (case doesn't matter)
    dispositions: list(process.env.PROCESS_DISPOSITIONS, 'Explain DMP,Explained DMP'),

    // Night window for automatic processing (India time). Empty = manual only.
    window: {
        start: process.env.PROCESS_WINDOW_START,
        end: process.env.PROCESS_WINDOW_END,
        timezone: process.env.PROCESS_TIMEZONE || 'Asia/Kolkata',
    },

    minCallSeconds: Number(process.env.MIN_CALL_SECONDS) || 30,
};