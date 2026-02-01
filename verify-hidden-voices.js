const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');

async function testCandidate(voiceName, fileName) {
    try {
        console.log(`Testing voice: ${voiceName}...`);
        const tts = new EdgeTTS({
            voice: voiceName,
            timeout: 5000
        });
        await tts.ttsPromise("Tôi là người Hà Nội. Đây là giọng nói miền Bắc.", path.join(__dirname, fileName));
        console.log(`SUCCESS: ${voiceName} saved to ${fileName}`);
    } catch (e) {
        console.log(`FAILED: ${voiceName} - ${e.message || e}`);
    }
}

async function run() {
    const candidates = [
        'vi-VN-HieuNeural',
        'vi-VN-PhuongNeural',
        'vi-VN-HoangNeural',
        'vi-VN-HungNeural',
        'vi-VN-AnNeural',
        'vi-VN-TrieuDuongNeural',
        'vi-VN-KieuNhiNeural',
        'vi-VN-ThanhNeural'
    ];

    for (const v of candidates) {
        await testCandidate(v, `verify_node_${v}.mp3`);
    }
}

run();
