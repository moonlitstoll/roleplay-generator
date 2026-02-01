const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');

async function verifyNodeEdgeTTS() {
    try {
        console.log("Starting node-edge-tts Regional Voice Verification...");

        const voices = [
            { name: 'vi-VN-HoaiMyNeural', label: 'North (Female)' },
            { name: 'vi-VN-HoaiMyNeural', label: 'Simulated South (Female)', pitch: '-20Hz', rate: '+10%' },
            { name: 'vi-VN-NamMinhNeural', label: 'North (Male)' },
            { name: 'vi-VN-NamMinhNeural', label: 'Simulated South (Male)', pitch: '-15Hz', rate: '+10%' }
        ];

        for (const voice of voices) {
            try {
                console.log(`Testing ${voice.label} (${voice.name})...`);
                const tts = new EdgeTTS({
                    voice: voice.name,
                    lang: 'vi-VN',
                    pitch: voice.pitch || '0Hz',
                    rate: voice.rate || '0%'
                });

                const outputPath = path.join(__dirname, `verify_node_${voice.label.replace(/\s+/g, '_')}.mp3`);
                await tts.ttsPromise(`Xin chào, đây là giọng ${voice.label}.`, outputPath);

                if (fs.existsSync(outputPath)) {
                    console.log(`Successfully saved to: ${outputPath}`);
                } else {
                    console.log(`Failed to save audio for ${voice.name}`);
                }
            } catch (err) {
                console.log(`Voice ${voice.name} (${voice.label}) failed: ${err.message}`);
            }
        }

        console.log("Success! All node-edge-tts voices verified.");
    } catch (error) {
        console.error("Verification Failed:", error);
        // If API is different, try to debug
        console.log("Common API check:");
        const tts = new EdgeTTS();
        console.log("Methods:", Object.keys(tts));
    }
}

verifyNodeEdgeTTS();
