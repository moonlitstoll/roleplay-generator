const { EdgeTTS } = require('@seepine/edge-tts');

async function listVoices() {
    const tts = new EdgeTTS();
    try {
        const voices = await tts.listVoices();
        const vnVoices = voices.filter(v => v.Locale === 'vi-VN');
        console.log(JSON.stringify(vnVoices, null, 2));
    } catch (e) {
        console.error("Failed to list voices", e.message);
    }
}

listVoices();
