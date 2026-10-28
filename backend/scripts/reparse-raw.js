// Repair calls that arrived as "unreadable body" (saved with a gen-... ID and empty fields).
// Reads each saved raw body again with the fixed JSON reader and fills in the real fields.
//
//   node scripts/reparse-raw.js            -> dry run: only shows what would change
//   node scripts/reparse-raw.js --apply    -> saves the changes
//   node scripts/reparse-raw.js --apply --zoho   -> also sends their remarks to Zoho
//
// Without --zoho the remarks are NOT sent: these are older remarks and Agent_Comments is
// overwritten on every update, so sending them late could replace a newer comment.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { Call } from '../src/models/Call.js';
import { cleanPayload, getCallId, readPayload, toCallFields } from '../src/services/payload.js';
import { getZohoTarget } from '../src/services/zoho.service.js';

const apply = process.argv.includes('--apply');
const sendZoho = process.argv.includes('--zoho');

await connectDb();
const broken = await Call.find({ rawBody: { $nin: [null, ''] } }).lean();
console.log(`Calls with an unreadable body: ${broken.length}${apply ? '' : '  (dry run - add --apply to save)'}`);

let fixed = 0, duplicates = 0, stillBroken = 0;
for (const old of broken) {
    const { payload, rawBody } = readPayload('application/json', old.rawBody);
    if (rawBody) { stillBroken++; continue; } // still not readable

    const d = cleanPayload(payload);
    const { callId, callIdSource } = getCallId(d);
    const fields = toCallFields(d);
    const target = getZohoTarget(d);
    const zoho = target ? { portalId: target.portalId, zohoBrand: target.brand } : {};
    if (target && fields.remark && sendZoho) Object.assign(zoho, { zohoStatus: 'pending', zohoAttempts: 0 });

    // The real call ID already exists (the dialer sent it again correctly) -> just remove the broken copy
    const exists = callId !== old.callId && await Call.exists({ callId });
    if (exists) {
        duplicates++;
        console.log(`  ${old.callId} -> ${callId} already exists, broken copy removed`);
        if (apply) await Call.deleteOne({ _id: old._id });
        continue;
    }

    fixed++;
    console.log(`  ${old.callId} -> ${callId} | ${fields.firstDisposition || 'no disposition'} | ${fields.agentName || '-'}`
        + `${zoho.portalId ? ` | ${zoho.zohoBrand} ${zoho.portalId}` : ''}`);
    if (apply) {
        await Call.updateOne(
            { _id: old._id },
            {
                $set: { callId, callIdSource, ...fields, ...zoho, dialerData: d, status: 'queued' },
                $unset: { rawBody: '', skipReason: '', errorMessage: '' },
            }
        );
    }
}

console.log(`\nFixed: ${fixed} | duplicates removed: ${duplicates} | still unreadable: ${stillBroken}`);
if (apply && fixed) {
    console.log('Fixed calls are "Waiting": the next run summarises the selected dispositions and skips the rest.');
    if (sendZoho) console.log('Their remarks go to Zoho within 5 minutes (cs2-api auto-retry).');
}
await mongoose.disconnect();