const fs = require('fs');
const path = require('path');
const os = require('os');
const { EdgeTTS } = require('node-edge-tts');
const googleTTS = require('google-tts-api');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

// Setup FFmpeg
console.log("Setting up FFmpeg...");
try {
    console.log("ffmpeg-static path:", ffmpegStatic);
    if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

    console.log("ffprobe-static path:", ffprobeStatic.path);
    ffmpeg.setFfprobePath(ffprobeStatic.path);
} catch (e) {
    console.error("Error setting up FFmpeg paths:", e);
}

// Get duration of an audio file in seconds
const getAudioDuration = (filePath) => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata.format.duration || 0);
        });
    });
};

async function testGoogleTTS() {
    console.log("\n--- Testing Google TTS ---");
    try {
        const url = googleTTS.getAudioUrl("Xin chào, đây là kiểm tra.", {
            lang: 'vi',
            slow: false,
            host: 'https://translate.google.com',
        });
        console.log("Google TTS URL generated:", url);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const dest = path.join(__dirname, 'test_google.mp3');
        fs.writeFileSync(dest, buffer);
        console.log("Google TTS saved to:", dest);
        const dur = await getAudioDuration(dest);
        console.log("Google TTS duration:", dur);
    } catch (e) {
        console.error("Google TTS FAILED:", e);
    }
}

async function testEdgeTTS() {
    console.log("\n--- Testing Edge TTS ---");
    try {
        const tts = new EdgeTTS({ voice: 'vi-VN-NamMinhNeural' });
        const dest = path.join(__dirname, 'test_edge.mp3');
        await tts.ttsPromise("Xin chào, đây là kiểm tra.", dest);
        console.log("Edge TTS saved to:", dest);
        const dur = await getAudioDuration(dest);
        console.log("Edge TTS duration:", dur);
    } catch (e) {
        console.error("Edge TTS FAILED:", e);
    }
}

async function run() {
    await testGoogleTTS();
    await testEdgeTTS();
}

run();
