const googleTTS = require('google-tts-api'); // Use require for JS test script
const fs = require('fs');
const https = require('https');

async function testGoogle() {
    console.log("Testing google-tts-api...");
    try {
        const url = googleTTS.getAudioUrl('Xin chào, đây là kiểm tra Google TTS miễn phí.', {
            lang: 'vi',
            slow: false,
            host: 'https://translate.google.com',
        });
        console.log("URL:", url);

        // Fetch buffer
        https.get(url, (res) => {
            const data = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                console.log("Buffer length:", buffer.length);
                fs.writeFileSync('test_google_free.mp3', buffer);
                console.log("Saved test_google_free.mp3");
            });
        }).on('error', err => {
            console.error("Fetch error:", err);
        });

    } catch (e) {
        console.error("Error:", e);
    }
}

testGoogle();
