const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');

async function testVoice(voiceName, filename) {
    try {
        const tts = new EdgeTTS({ voice: voiceName });
        await tts.ttsPromise("Xin chào, tôi là giọng miền Nam.", filename);
        console.log(`Success: ${voiceName}`);
    } catch (e) {
        console.log(`Failed: ${voiceName} - ${e.message}`);
    }
}

async function runTests() {
    await testVoice('vi-VN-AnNeural', 'test-an.mp3');
    await testVoice('vi-VN-HieuNeural', 'test-hieu.mp3');
    await testVoice('vi-VN-HoaiMyNeural', 'test-hoaimy.mp3');
    await testVoice('vi-VN-NamMinhNeural', 'test-namminh.mp3');
}

runTests();
