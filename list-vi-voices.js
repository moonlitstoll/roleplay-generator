const { EdgeTTS } = require('node-edge-tts');

async function checkVoices() {
    try {
        // node-edge-tts internally uses a list of voices. 
        // Let's try to find if we can access them or just test known ones.
        const tts = new EdgeTTS();
        // Since there's no direct list method, I'll try to guess Northern voices
        // Based on typical MS Azure/Edge voice lists:
        // vi-VN-HoaiMyNeural (South)
        // vi-VN-NamMinhNeural (South)
        // Are there others? Some regions have more.
        console.log("Testing voices...");
    } catch (e) {
        console.error(e);
    }
}
checkVoices();
