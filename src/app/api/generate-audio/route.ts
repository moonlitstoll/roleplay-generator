import { NextRequest, NextResponse } from 'next/server';
// Force rebuild trigger
import { EdgeTTS } from 'node-edge-tts';
import * as googleTTS from 'google-tts-api';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
const ffprobeStatic = require('ffprobe-static');

// File Logger
const logFile = path.join(process.cwd(), 'server_debug.log');
function log(message: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFile, line);
    console.log(message);
}

log("Server Module Loaded");
// Fix path for Next.js/Webpack environment
// ffprobe-static .path indicates the executable path
let ffprobePath = ffprobeStatic.path;
let ffmpegPath = ffmpegStatic;

// Debug and fix potential raw module path issues
if (os.platform() === 'win32') {
    if (ffprobePath && ffprobePath.includes('\\ROOT')) {
        ffprobePath = ffprobePath.replace('\\ROOT', process.cwd());
    }
    if (ffprobePath && !fs.existsSync(ffprobePath)) {
        // Fallback: try to find it in node_modules explicitly if the above failed
        const possiblePath = path.join(process.cwd(), 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');
        if (fs.existsSync(possiblePath)) {
            ffprobePath = possiblePath;
        }
    }

    if (ffmpegPath && ffmpegPath.includes('\\ROOT')) {
        ffmpegPath = ffmpegPath.replace('\\ROOT', process.cwd());
    }
    if (ffmpegPath && !fs.existsSync(ffmpegPath)) {
        // Fallback for ffmpeg
        const possiblePath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
        if (fs.existsSync(possiblePath)) {
            ffmpegPath = possiblePath;
        }
    }
}

log("FFmpeg Static Path Raw: " + ffmpegStatic);
log("FFmpeg Resolved Path: " + ffmpegPath);

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
} else {
    log("FFPROBE PATH NOT FOUND");
}

// Helper to download Google TTS audio to file
async function downloadGoogleTTS(url: string, destPath: string) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buffer);
}

// Get duration of an audio file in seconds
const getAudioDuration = (filePath: string): Promise<number> => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata.format.duration || 0);
        });
    });
};

async function generateSegment(
    segment: any,
    filePath: string,
    language: string,
    accentMode: string,
    speakers: any
) {
    const spk = segment.speaker; // 'A' or 'B'
    const gender = speakers[spk]?.gender || 'female';
    const isEnglish = language === 'English';

    if (isEnglish) {
        let voiceName = '';
        if (gender === 'female') {
            voiceName = (spk === 'A') ? 'en-US-AvaNeural' : 'en-US-EmmaNeural';
        } else {
            voiceName = (spk === 'A') ? 'en-US-AndrewNeural' : 'en-US-BrianNeural';
        }
        const tts = new EdgeTTS({ voice: voiceName });
        await tts.ttsPromise(segment.text, filePath);
    } else {
        if (language === 'Vietnamese') {
            if (accentMode === 'south') {
                // SOUTHERN (SAIGON) - Use Edge TTS with neutral settings
                // User specifically requested this for the South accent
                let voiceName = (gender === 'female') ? 'vi-VN-HoaiMyNeural' : 'vi-VN-NamMinhNeural';
                const tts = new EdgeTTS({
                    voice: voiceName,
                    pitch: '+0Hz',
                    rate: '+0%'
                });
                await tts.ttsPromise(segment.text, filePath);
            } else {
                // NORTHERN (HANOI) - Default to Google TTS
                // User preferred this for the North accent ("clean/normal")
                const url = googleTTS.getAudioUrl(segment.text, {
                    lang: 'vi',
                    slow: false,
                    host: 'https://translate.google.com',
                });
                await downloadGoogleTTS(url, filePath);
            }
        }
    }
}

// Helper for batch processing
async function processInBatches<T, R>(items: T[], batchSize: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((item, idx) => fn(item, i + idx)));
        results.push(...batchResults);
    }
    return results;
}

export async function POST(req: NextRequest) {
    log("POST Request Received");
    try {
        const body = await req.json();
        const { segments, speakers, language, accentMode = 'north' } = body;
        log(`Parsed Body: Lang=${language}, Accent=${accentMode}, Segments=${segments?.length}`);

        if (!segments || !Array.isArray(segments)) {
            return NextResponse.json({ error: 'Invalid segments' }, { status: 400 });
        }

        // --- PATH FIX LOGIC (OS AWARE) ---
        if (os.platform() === 'win32') {
            // Windows-specific fixes (Local Dev)
            if (ffprobePath && ffprobePath.includes('\\ROOT')) {
                ffprobePath = ffprobePath.replace('\\ROOT', process.cwd());
            }
            if (ffmpegPath && ffmpegPath.includes('\\ROOT')) {
                ffmpegPath = ffmpegPath.replace('\\ROOT', process.cwd());
            }
            // Fallbacks for Windows are already handled in global scope, 
            // but we ensure they don't break Linux by being inside this block or generic checks.
        }

        // Linux/Vercel: Usually ffmpegStatic is correct. 
        // If it's null on Vercel, we might need a specific buildpack, but usually it works.
        if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
        if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);
        // --------------------------------

        const tempDir = os.tmpdir();
        const sessionId = uuidv4();

        // Parallel Processing
        const processSegment = async (segment: any, index: number) => {
            const filePath = path.join(tempDir, `${sessionId}_${index}.mp3`);

            if (segment.pause) {
                await new Promise<void>((resolve, reject) => {
                    ffmpeg()
                        .input('anullsrc')
                        .inputFormat('lavfi')
                        .duration(segment.pause / 1000)
                        .save(filePath)
                        .on('end', () => resolve())
                        .on('error', (err: any) => reject(err));
                });
            } else if (segment.text && segment.speaker) {
                await generateSegment(segment, filePath, language, accentMode, speakers);
            }

            // Get duration immediately to keep mapping consistent
            const duration = await getAudioDuration(filePath);
            return { filePath, duration };
        };

        // Batch size 5 to avoid Rate Limits/Memory overload
        log("Starting Parallel Generation...");
        const results = await processInBatches(segments, 5, processSegment);
        log("Generation Complete. Merging...");

        const filePaths = results.map(r => r.filePath);
        const durations = results.map(r => r.duration);

        // Calculate offsets
        const segmentOffsets: number[] = [];
        let currentOffset = 0;
        durations.forEach(d => {
            segmentOffsets.push(currentOffset);
            currentOffset += d;
        });

        const outputFileName = `${sessionId}_merged.mp3`;
        const outputPath = path.join(tempDir, outputFileName);

        await new Promise<void>((resolve, reject) => {
            const command = ffmpeg();
            filePaths.forEach(fp => command.input(fp));
            command
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .mergeToFile(outputPath, tempDir);
        });

        const audioBase64 = fs.readFileSync(outputPath, { encoding: 'base64' });
        const totalDuration = await getAudioDuration(outputPath);

        // Cleanup
        try {
            filePaths.forEach(fp => {
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
            });
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {
            console.error("Cleanup error", e);
        }

        return NextResponse.json({
            audioContent: audioBase64,
            offsets: segmentOffsets,
            totalDuration: totalDuration
        });

    } catch (error: any) {
        log('TTS Generation Error Stack: ' + error.stack);
        log('TTS Generation Error: ' + error.message);
        return NextResponse.json({ error: 'TTS generation failed', details: error.message, stack: error.stack }, { status: 500 });
    }
}
