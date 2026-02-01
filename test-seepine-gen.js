const { EdgeTTS } = require('@seepine/edge-tts');
const fs = require('fs');

async function testVoice(voiceName, filename) {
    try {
        const tts = new EdgeTTS({ voice: voiceName });
        const { data } = await tts.call("Xin chào, tôi là giọng miền Nam.");
        fs.writeFileSync(filename, data);
        console.log(`Success: ${voiceName}`);
    } catch (e) {
        console.log(`Failed: ${voiceName} - ${e.message}`);
    }
}

async function runTests() {
    await testVoice('vi-VN-AnNeural', 'test-an-seepine.mp3');
    await testVoice('vi-VN-HieuNeural', 'test-hieu-seepine.mp3');
    await testVoice('vi-VN-HoaiMyNeural', 'test-hoaimy-seepine.mp3');
}

runTests();
