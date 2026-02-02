
// We need to run this with tsx or equivalent because it imports TS
import { EdgeTTS } from './src/utils/edge-tts';
import fs from 'fs';
import path from 'path';

async function testCustomUtils() {
    console.log("Testing custom src/utils/edge-tts.ts...");
    try {
        const tts = new EdgeTTS({
            voice: 'vi-VN-NamMinhNeural',
            lang: 'vi-VN'
        });

        console.log("Calling TTS...");
        const result = await tts.call("Xin chào, đây là kiểm tra utility tùy chỉnh.");

        if (result && result.data) {
            console.log("Success! Audio buffer received, length:", result.data.length);
            fs.writeFileSync('test_custom_utils.mp3', result.data);
        } else {
            console.error("Failed: No data in result");
        }
    } catch (e) {
        console.error("Error during generation:", e);
    }
}

testCustomUtils();
