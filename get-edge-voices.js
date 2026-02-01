const axios = require('axios');

async function listVoices() {
    try {
        const response = await axios.get('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/metadata/voices.list.json', {
            params: {
                'trustedclienttoken': '6A5AA1D4EAFF4E9FB37E23D3C21D3D17'
            }
        });
        const viVoices = response.data.filter(v => v.Locale === 'vi-VN');
        console.log(JSON.stringify(viVoices, null, 2));
    } catch (e) {
        console.error("Failed to list voices:", e.message);
    }
}
listVoices();
