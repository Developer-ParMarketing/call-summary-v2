import { config } from '../config/index.js';

// Which calls get transcribed / summarised:
//   first disposition in PROCESS_DISPOSITIONS   OR   campaign in PROCESS_CAMPAIGNS
// Matching ignores upper/lower case and extra spaces: "explained  dmp" = "Explained DMP".

const normalise = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toRegexes = (names) => names.map(normalise)
    .map((d) => new RegExp(`^\\s*${escapeRegex(d).replace(/ /g, '\\s+')}\\s*$`, 'i'));

const dispositionRegexes = toRegexes(config.dispositions);
const campaignRegexes = toRegexes(config.campaigns);

export const selectedDispositions = config.dispositions;
export const selectedCampaigns = config.campaigns;

// MongoDB conditions (spread into a query): calls we process / calls we don't
const selectedParts = () => [
    { firstDisposition: { $in: dispositionRegexes } },
    ...(campaignRegexes.length ? [{ campaign: { $in: campaignRegexes } }] : []),
];
export const selectedCallQuery = () => ({ $or: selectedParts() });
export const otherCallQuery = () => ({ $nor: selectedParts() }); // also matches calls with no disposition/campaign

// Kept for older imports
export const selectedDispositionQuery = () => ({ $in: dispositionRegexes });