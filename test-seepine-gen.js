const { EdgeTTS } = require('@seepine/edge-tts');
const fs = require('fs');

async function testGen() {
    console.log("Testing @seepine/edge-tts generation...");
    try {
        const tts = new EdgeTTS({
            voice: 'vi-VN-NamMinhNeural',
            lang: 'vi-VN',
            outputFormat: 'audio-24khz-96kbitrate-mono-mp3'
        });

        console.log("Calling TTS...");
        const result = await tts.call("Xin chào, đây là bài kiểm tra giọng nói.");

        if (result && result.data) {
            console.log("Success! Audio buffer received, length:", result.data.length);
            fs.writeFileSync('test_seepine_gen.mp3', result.data);
            console.log("Saved to test_seepine_gen.mp3");
        } else {
            console.error("Failed: No data in result");
        }
    } catch (e) {
        console.error("Error during generation:", e);
    }
}

testGen();
