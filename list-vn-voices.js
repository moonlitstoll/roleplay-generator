const { EdgeTTS } = require('node-edge-tts');

async function listVoices() {
    const tts = new EdgeTTS();
    // In node-edge-tts, there might not be a direct listVoices method but let's check the constructor or prototypes
    // Most edge-tts wrappers fetch from https://speech.platform.bing.com/consumer/speech/v1/voice/list
    const axios = require('axios');
    try {
        const res = await axios.get('https://speech.platform.bing.com/consumer/speech/v1/voice/list', {
            headers: {
                'TrustedClientToken': '6A2EAA5D-9459-4A51-8933-4FA0A39C47E4'
            }
        });
        const vnVoices = res.data.filter(v => v.Locale === 'vi-VN');
        console.log(JSON.stringify(vnVoices, null, 2));
    } catch (e) {
        console.error("Failed to fetch voices", e.message);
    }
}

listVoices();
