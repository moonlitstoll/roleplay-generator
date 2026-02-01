const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

async function verifyRegionalGeneration() {
    try {
        console.log("Starting Regional Audio Generation Verification...");

        const scenarios = [
            { label: 'North_Standard', accentMode: 'all-standard', speaker: 'A', text: 'Chào bạn, đây là giọng Hà Nội.' },
            { label: 'South_Simulated', accentMode: 'all-simulated', speaker: 'B', text: 'Chào bạn, đây là giọng Sài Gòn.' }
        ];

        const filePaths = [];

        for (const scenario of scenarios) {
            console.log(`Processing scenario: ${scenario.label}...`);

            let voiceName = (scenario.speaker === 'A') ? 'vi-VN-HoaiMyNeural' : 'vi-VN-NamMinhNeural';
            let pitch = '0Hz';
            let rate = '0%';

            if (scenario.accentMode === 'all-simulated') {
                pitch = '-20Hz';
                rate = '+10%';
            }

            const tts = new EdgeTTS({ voice: voiceName, pitch, rate });
            const filePath = path.join(__dirname, `verify_gen_${scenario.label}.mp3`);

            await tts.ttsPromise(scenario.text, filePath);

            if (fs.existsSync(filePath)) {
                console.log(`Saved ${scenario.label} to: ${filePath}`);
                filePaths.push(filePath);
            } else {
                throw new Error(`Failed to generate audio for ${scenario.label}`);
            }
        }

        console.log("Merging regional clips to verify ffmpeg compatibility...");
        const mergedPath = path.join(__dirname, 'verify_gen_merged.mp3');

        await new Promise((resolve, reject) => {
            const command = ffmpeg();
            filePaths.forEach(fp => command.input(fp));
            command
                .on('end', resolve)
                .on('error', reject)
                .mergeToFile(mergedPath, __dirname);
        });

        console.log("Success! Merged regional audio saved to:", mergedPath);

        // Final check: confirm file size > 0
        const stats = fs.statSync(mergedPath);
        console.log(`Merged file size: ${stats.size} bytes`);

    } catch (error) {
        console.error("Verification Failed:", error);
    }
}

verifyRegionalGeneration();
