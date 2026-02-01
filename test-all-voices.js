const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');

async function testVoice(voiceName, filename, text = "Xin chào, đây là thử nghiệm giọng nói.") {
    try {
        console.log(`Testing ${voiceName}...`);
        const tts = new EdgeTTS({ voice: voiceName });
        const outputPath = path.resolve(__dirname, filename);
        await tts.ttsPromise(text, outputPath);
        console.log(`Success: ${voiceName}`);
    } catch (e) {
        console.log(`Failed: ${voiceName} - ${e.message || e}`);
    }
}

async function runTests() {
    // Current ones
    await testVoice('vi-VN-HoaiMyNeural', 'test-hoaimy.mp3');
    await testVoice('vi-VN-NamMinhNeural', 'test-namminh.mp3');

    // Potential ones
    await testVoice('vi-VN-AnNeural', 'test-an.mp3');
    await testVoice('vi-VN-HieuNeural', 'test-hieu.mp3');
    await testVoice('vi-VN-PhuongNeural', 'test-phuong.mp3');
    await testVoice('vi-VN-MaoNeural', 'test-mao.mp3');
    await testVoice('vi-VN-GiaHuyNeural', 'test-giahuy.mp3');
    await testVoice('vi-VN-MinhNeural', 'test-minh.mp3');
}

runTests();
