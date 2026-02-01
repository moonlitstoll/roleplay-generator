const axios = require('axios');

async function listVoices() {
    try {
        const url = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36 Edg/91.0.864.41'
            }
        });
        const vnVoices = res.data.filter(v => v.Locale === 'vi-VN');
        console.log(JSON.stringify(vnVoices, null, 2));
    } catch (e) {
        console.error("Failed to list voices:", e.message);
    }
}

listVoices();
