import 'dotenv/config';
import { toWavChunk, transcribeWav } from './transcribe.js';

const input = process.argv[2];
if (!input) {
    console.log('Usage: node test-transcribe.js temp/<file>.mp3');
    process.exit(1);
}

await toWavChunk(input, 'temp/test-chunk.wav', 0, 30);
console.log('Converted first 30 seconds to WAV');

const text = await transcribeWav('temp/test-chunk.wav', 'hi');
console.log('Transcript:', text || '(empty)');