import { config } from '../config/index.js';

// Which dispositions get transcribed / summarised. Set PROCESS_DISPOSITIONS in .env.
// Matching ignores upper/lower case and extra spaces: "explained  dmp" = "Explained DMP".

const normalise = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const selected = config.dispositions.map(normalise);

// Same list as MongoDB regexes, so the database can filter (and use its index)
const regexes = selected.map((d) => new RegExp(`^\\s*${escapeRegex(d).replace(/ /g, '\\s+')}\\s*$`, 'i'));

export const selectedDispositions = config.dispositions;
export const isSelectedDisposition = (disposition) => selected.includes(normalise(disposition));
export const selectedDispositionQuery = () => ({ $in: regexes });
export const otherDispositionQuery = () => ({ $nin: regexes }); // also matches calls with no disposition
