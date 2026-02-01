const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

// Manual setup similar to route.ts
let resolvedFfmpegPath = ffmpegPath;
if (process.platform === 'win32' && (!resolvedFfmpegPath || !fs.existsSync(resolvedFfmpegPath || ''))) {
    resolvedFfmpegPath = path.resolve(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
}

console.log("ffmpeg path:", resolvedFfmpegPath);
ffmpeg.setFfmpegPath(resolvedFfmpegPath);

console.log("ffprobe path:", ffprobePath);
ffmpeg.setFfprobePath(ffprobePath);


async function testFlow() {
    try {
        console.log("1. Generating Google Audio...");
        // Generate two small files
        const googleTTS = require('google-tts-api');
        const url1 = googleTTS.getAudioUrl('Hello part one', { lang: 'en', host: 'https://translate.google.com' });
        const url2 = googleTTS.getAudioUrl('Hello part two', { lang: 'en', host: 'https://translate.google.com' });

        // Download
        const fetch = global.fetch || require('node-fetch'); // Node 18 has fetch globally usually.
        // If not, we might fail here if node version is old, but Next.js 16 uses Node 18+.

        const b1 = await (await fetch(url1)).arrayBuffer();
        const b2 = await (await fetch(url2)).arrayBuffer();

        const p1 = path.join(__dirname, 'test_part1.mp3');
        const p2 = path.join(__dirname, 'test_part2.mp3');

        fs.writeFileSync(p1, Buffer.from(b1));
        fs.writeFileSync(p2, Buffer.from(b2));

        console.log("2. Merging Audio...");
        const out = path.join(__dirname, 'test_full_merge.mp3');

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(p1)
                .input(p2)
                .on('end', resolve)
                .on('error', reject)
                .mergeToFile(out, __dirname);
        });

        console.log("Success! Merged file created at:", out);

        // Cleanup
        fs.unlinkSync(p1);
        fs.unlinkSync(p2);

    } catch (e) {
        console.error("Test Flow Failed:", e);
    }
}

testFlow();
