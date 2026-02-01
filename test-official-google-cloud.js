const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');

async function main() {
    try {
        console.log('Testing Official Google Cloud TTS...');
        const client = new textToSpeech.TextToSpeechClient();
        const text = 'Xin chào, đây là giọng nói miền Bắc từ Google Cloud.';

        const request = {
            input: { text: text },
            // vi-VN-Wavenet-A is generally Northern
            voice: { languageCode: 'vi-VN', name: 'vi-VN-Wavenet-A' },
            audioConfig: { audioEncoding: 'MP3' },
        };

        const [response] = await client.synthesizeSpeech(request);
        const writeFile = util.promisify(fs.writeFile);
        await writeFile('test_official_google_cloud_north.mp3', response.audioContent, 'binary');
        console.log('Audio content written to file: test_official_google_cloud_north.mp3');
    } catch (err) {
        console.error('ERROR:', err);
    }
}

main();
