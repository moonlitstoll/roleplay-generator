const { EdgeTTS } = require('node-edge-tts');
const path = require('path');
const fs = require('fs');

async function testDebug() {
    try {
        console.log("Testing with empty pitch and rate...");
        const tts = new EdgeTTS({
            voice: 'vi-VN-HoaiMyNeural',
            pitch: '+0Hz',
            rate: '+0%'
        });
        const outputPath = path.resolve(__dirname, 'test_debug_audio.mp3');
        await tts.ttsPromise("Xin chào, đây là thử nghiệm.", outputPath);
        console.log("Success! Audio saved to:", outputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (error) {
        console.error("Test Failed:", error);
    }
}

testDebug();
