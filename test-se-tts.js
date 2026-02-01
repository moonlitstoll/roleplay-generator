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

async function testStreamElements() {
    try {
        console.log("Testing StreamElements TTS...");
        // Voice 'Chi' is standard Vietnamese voice in Polly. Let's see if StreamElements passes it through.
        // English: 'Brian' (Neural?) No, Brian is standard. 'Amy' is standard. 
        // StreamElements usually serves Standard Polly voices.

        const voice = 'Chi'; // Vietnamese
        const text = 'Xin chào, đây là kiểm tra âm thanh.';
        const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(text)}`;

        const outputPath = path.join(__dirname, 'test_se_vi.mp3');
        await downloadFile(url, outputPath);
        console.log("Saved Vietnamese to:", outputPath);

        const voiceEn = 'Amy';
        const textEn = 'Hello, this is a test.';
        const urlEn = `https://api.streamelements.com/kappa/v2/speech?voice=${voiceEn}&text=${encodeURIComponent(textEn)}`;
        const outputPathEn = path.join(__dirname, 'test_se_en.mp3');
        await downloadFile(urlEn, outputPathEn);
        console.log("Saved English to:", outputPathEn);

    } catch (error) {
        console.error("Test Failed:", error);
    }
}

testStreamElements();
