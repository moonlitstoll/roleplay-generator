const { EdgeTTS } = require('@seepine/edge-tts');
const fs = require('fs');
const path = require('path');

async function testAudio() {
    try {
        console.log("Starting Edge TTS test...");
        const tts = new EdgeTTS({
            voice: 'en-US-AvaNeural'
        });

        console.log("Calling tts.call()...");
        const { data } = await tts.call("Hello, this is a test audio generation.");

        const outputPath = path.join(__dirname, 'test_output.mp3');
        fs.writeFileSync(outputPath, data);
        console.log("Success! Audio saved to:", outputPath);
    } catch (error) {
        console.error("Test Failed:", error);
    }
}

testAudio();
