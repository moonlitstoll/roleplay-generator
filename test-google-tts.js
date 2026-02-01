const googleTTS = require('google-tts-api');
const fs = require('fs');
const path = require('path');
const https = require('https');

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function testGoogleTTS() {
    try {
        console.log("Testing Google TTS API...");

        // Vietnamese
        const urlVi = googleTTS.getAudioUrl('Xin chào, đây là kiểm tra âm thanh.', {
            lang: 'vi',
            slow: false,
            host: 'https://translate.google.com',
        });
        console.log("Vi URL:", urlVi);
        await downloadFile(urlVi, path.join(__dirname, 'test_google_vi.mp3'));

        // English
        const urlEn = googleTTS.getAudioUrl('Hello, this is a test audio.', {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
        });
        console.log("En URL:", urlEn);
        await downloadFile(urlEn, path.join(__dirname, 'test_google_en.mp3'));

        console.log("Success! Google TTS audio saved.");

    } catch (error) {
        console.error("Test Failed:", error);
    }
}

testGoogleTTS();
