import axios from 'axios';
import { config } from '../config/index.js';

// FREE Hinglish: Bhashini transliteration (Devanagari -> Roman letters), plus spelling clean-up.
// Bhashini already writes English words well ("website", "quality") but spells common Hindi words
// oddly ("kyaa", "haye", "seey"), so we fix those with a word list.

const CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';

// Common words: Devanagari -> how people actually type them in Hinglish
const WORDS = {
    'हलो': 'hello', 'हेलो': 'hello', 'हैलो': 'hello', 'हलोलो': 'hello', 'सर': 'sir', 'मैडम': 'madam', 'जी': 'ji',
    'क्या': 'kya', 'है': 'hai', 'हैं': 'hain', 'हूँ': 'hoon', 'हूं': 'hoon', 'हो': 'ho', 'था': 'tha', 'थी': 'thi', 'थे': 'the',
    'मैं': 'main', 'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere', 'मुझे': 'mujhe', 'हम': 'hum',
    'हमारा': 'hamara', 'हमारी': 'hamari', 'हमारे': 'hamare',
    'आप': 'aap', 'आपका': 'aapka', 'आपकी': 'aapki', 'आपके': 'aapke', 'आपने': 'aapne', 'आपको': 'aapko',
    'से': 'se', 'पे': 'pe', 'पर': 'par', 'के': 'ke', 'की': 'ki', 'का': 'ka', 'को': 'ko', 'में': 'mein', 'ने': 'ne',
    'ये': 'ye', 'यह': 'yeh', 'वो': 'wo', 'वह': 'woh', 'जो': 'jo', 'तो': 'to', 'भी': 'bhi', 'और': 'aur', 'या': 'ya',
    'नहीं': 'nahi', 'हाँ': 'haan', 'हां': 'haan', 'ना': 'na', 'बात': 'baat', 'कर': 'kar', 'करो': 'karo',
    'करना': 'karna', 'करने': 'karne', 'करते': 'karte', 'करता': 'karta', 'करती': 'karti', 'किया': 'kiya',
    'लिया': 'liya', 'दिया': 'diya', 'लिए': 'liye', 'रहा': 'raha', 'रही': 'rahi', 'रहे': 'rahe',
    'रहेगा': 'rahega', 'रहेगी': 'rahegi', 'रहेंगे': 'rahenge', 'सकते': 'sakte', 'सकता': 'sakta', 'चाहता': 'chahta',
    'बताया': 'bataya', 'बताइए': 'bataiye', 'बोलिए': 'boliye', 'बोल': 'bol', 'बोलता': 'bolta', 'ठीक': 'theek',
    'अच्छा': 'accha', 'कितना': 'kitna', 'कितनी': 'kitni', 'कितने': 'kitne', 'कौन': 'kaun', 'कब': 'kab',
    'कहाँ': 'kahan', 'क्यों': 'kyon', 'कैसे': 'kaise', 'अभी': 'abhi', 'पहले': 'pehle', 'बाद': 'baad', 'दिन': 'din',
    'सब': 'sab', 'कुछ': 'kuch', 'एक': 'ek', 'दो': 'do', 'मतलब': 'matlab', 'इससे': 'isse', 'उसको': 'usko',
    'लोग': 'log', 'पैसे': 'paise', 'महीने': 'mahine', 'महीना': 'mahina', 'घर': 'ghar', 'काम': 'kaam',
    // English words spoken in Hindi calls
    'लोन': 'loan', 'लोन्स': 'loans', 'कॉल': 'call', 'ओके': 'ok', 'थैंक': 'thank', 'यू': 'you', 'प्रॉब्लम': 'problem',
    'अमाउंट': 'amount', 'बैंक': 'bank', 'सैलरी': 'salary', 'पर्सनल': 'personal', 'इंक्वायरी': 'inquiry',
    'वेबसाइट': 'website', 'रिकॉर्ड': 'record', 'रिकॉर्डेड': 'recorded', 'क्वालिटी': 'quality',
    'इंफॉर्मेशन': 'information', 'इन्फॉर्मेशन': 'information', 'कॉन्फिडेंशियल': 'confidential',
    'सेटल': 'settle', 'सेटलमेंट': 'settlement', 'एप्लीकेशन': 'application', 'क्रेडिट': 'credit', 'कार्ड': 'card',
    'सिबिल': 'CIBIL', 'सिविल': 'CIBIL', 'इंटरेस्ट': 'interest', 'फाइनेंशियल': 'financial',
    'एडवाइजर': 'advisor', 'टीम': 'team', 'प्लान': 'plan', 'सर्विस': 'service', 'ईएमआई': 'EMI',
};

// Odd spellings Bhashini produces -> normal Hinglish (used for words not in the list above)
const ROMAN_FIXES = {
    surr: 'sir', coll: 'call', lone: 'loan', kyaa: 'kya', haye: 'hai', paye: 'pe', seey: 'se', hoe: 'ho',
    joe: 'jo', voe: 'wo', yeye: 'ye', jee: 'ji', kii: 'ki', thee: 'thi', bhee: 'bhi', merrie: 'meri',
    rahee: 'rahi', aapaki: 'aapki', aapake: 'aapke', aapane: 'aapne', karane: 'karne', halo: 'hello', haa: 'haan',
};

// "ई एम आई" (letters spoken one by one) -> "EMI"
const joinSpelledEmi = (text) => text.replace(/ई\s*एम\s*आई/g, 'ईएमआई');

const cache = { cfg: null, at: 0 };

async function getConfig() {
    if (cache.cfg && Date.now() - cache.at < 30 * 60 * 1000) return cache.cfg;

    const res = await axios.post(CONFIG_URL, {
        pipelineTasks: [{ taskType: 'transliteration', config: { language: { sourceLanguage: 'hi', targetLanguage: 'en' } } }],
        pipelineRequestConfig: { pipelineId: config.bhashini.pipelineId },
    }, { headers: { userID: config.bhashini.userId, ulcaApiKey: config.bhashini.udyatKey }, timeout: 30000 });

    const task = res.data.pipelineResponseConfig?.find((t) => t.taskType === 'transliteration');
    const ep = res.data.pipelineInferenceAPIEndPoint;
    if (!task?.config?.[0]?.serviceId || !ep?.callbackUrl) throw new Error('Bhashini transliteration not available');

    cache.cfg = { serviceId: task.config[0].serviceId, url: ep.callbackUrl, authName: ep.inferenceApiKey?.name, authValue: ep.inferenceApiKey?.value };
    cache.at = Date.now();
    return cache.cfg;
}

async function transliterateChunk(text) {
    const cfg = await getConfig();
    const headers = cfg.authName ? { [cfg.authName]: cfg.authValue } : {};
    const res = await axios.post(cfg.url, {
        pipelineTasks: [{
            taskType: 'transliteration',
            config: { language: { sourceLanguage: 'hi', targetLanguage: 'en' }, serviceId: cfg.serviceId, isSentence: true },
        }],
        inputData: { input: [{ source: text }] },
    }, { headers, timeout: 60000 });
    const target = res.data.pipelineResponse?.[0]?.output?.[0]?.target;
    return String(Array.isArray(target) ? target[0] : target || '');
}

// Combine Bhashini's words with our word list (only when both have the same number of words)
function cleanUp(hindiWords, romanWords) {
    const aligned = hindiWords.length === romanWords.length;
    return romanWords.map((w, i) => {
        if (aligned && WORDS[hindiWords[i]]) return WORDS[hindiWords[i]];
        return ROMAN_FIXES[w.toLowerCase()] || w;
    }).join(' ');
}

// Whole transcript -> Hinglish, in pieces of ~120 words
export async function transliterateToHinglish(transcript) {
    const words = joinSpelledEmi(transcript).split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < words.length; i += 120) {
        const piece = words.slice(i, i + 120);
        const roman = (await transliterateChunk(piece.join(' '))).split(/\s+/).filter(Boolean);
        out.push(cleanUp(piece, roman));
    }
    return out.join(' ').trim();
}

export { cleanUp as _cleanUpForTests };