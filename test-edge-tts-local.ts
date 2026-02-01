
const { EdgeTTS } = require('./src/utils/edge-tts.ts'); // Will require compilation or ts-node, but let's try direct require if using .js or transpiling. 
// Actually this is a TS file, so I can't just require it in JS node script without TS support.
// I should rename the test script to .ts or compile it.
// Or just creating a temporary JS version of the class would have been easier for testing...
// Let's rely on the project's ability to run TS?
// The project is Next.js.
// I can make a test-seepine-gen-local.ts and run it with npx tsx test-seepine-gen-local.ts
const fs = require('fs');
const path = require('path');

async function testSeepineTTS() {
    console.log('Testing @seepine/edge-tts...');

    try {
        const tts = new EdgeTTS({
            voice: 'en-US-AriaNeural', // Standard Edge voice
            lang: 'en-US',
            outputFormat: 'audio-24khz-96kbitrate-mono-mp3'
        });

        const text = "This is a test of the Vercel compatible Edge TTS library.";
        console.log(`Generating audio for: "${text}"`);

        const res = await tts.call(text);

        if (res && res.data) {
            const outputPath = path.join(__dirname, 'test_seepine_output.mp3');
            fs.writeFileSync(outputPath, res.data);
            console.log(`Success! Audio written to ${outputPath}`);
            console.log(`Audio size: ${res.data.length} bytes`);
        } else {
            console.error('Failed: No data received');
        }

    } catch (error) {
        console.error('Error testing @seepine/edge-tts:', error);
    }
}

testSeepineTTS();
