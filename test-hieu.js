const { EdgeTTS } = require('node-edge-tts');

async function testHieu() {
    try {
        const tts = new EdgeTTS();
        console.log("Testing vi-VN-HieuNeural...");
        await tts.ttsPromise("Xin chào, tôi là Hiếu. Tôi nói giọng miền Bắc.", "test-hieu.mp3", {
            voice: "vi-VN-HieuNeural",
            pitch: "+0Hz",
            rate: "+0%"
        });
        console.log("Success! test-hieu.mp3 created.");
    } catch (e) {
        console.error("Failed to use vi-VN-HieuNeural:", e.message);
    }
}
testHieu();
