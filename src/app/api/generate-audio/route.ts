import { NextRequest, NextResponse } from 'next/server';
import { EdgeTTS } from 'node-edge-tts';
import * as googleTTS from 'google-tts-api';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// --- CONSTANTS ---
// ~100ms of Silence (MPEG 1 Layer III, 44.1kHz, 64kbps) - valid MP3 frame
const SILENCE_FRAME_BASE64 = "//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const SILENCE_FRAME_BUFFER = Buffer.from(SILENCE_FRAME_BASE64, 'base64');
const SILENCE_DURATION_SEC = 0.1; // Approx duration of one frame above

// File Logger
function log(message: string) {
    console.log(message);
}

// Helper to download Google TTS audio to buffer directly
async function downloadGoogleTTS(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buffer);
}

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
                let voiceName = (gender === 'female') ? 'vi-VN-HoaiMyNeural' : 'vi-VN-NamMinhNeural';
                const tts = new EdgeTTS({
                    voice: voiceName,
                    pitch: '+0Hz',
                    rate: '+0%'
                });
                await tts.ttsPromise(segment.text, filePath);
            } else {
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

// Batch processing helper
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
    try {
        const body = await req.json();
        const { segments, speakers, language, accentMode = 'north' } = body;
        log(`Req: Lang=${language}, Segs=${segments?.length}`);

        if (!segments || !Array.isArray(segments)) {
            return NextResponse.json({ error: 'Invalid segments' }, { status: 400 });
        }

        const tempDir = os.tmpdir();
        const sessionId = uuidv4();

        // Processing Function
        const processItem = async (segment: any, index: number) => {
            // Case 1: Silence
            if (segment.pause) {
                const pauseSec = segment.pause / 1000;
                // Repeat silence frame to match duration roughly
                const count = Math.ceil(pauseSec / SILENCE_DURATION_SEC);
                // Concat silence frames
                const silenceChunk = Buffer.concat(Array(count).fill(SILENCE_FRAME_BUFFER));
                // Client handles actual duration via audio element metadata
                return { buffer: silenceChunk, duration: pauseSec };
            }

            // Case 2: TTS
            if (segment.text && segment.speaker) {
                const filePath = path.join(tempDir, `${sessionId}_${index}.mp3`);
                try {
                    await generateSegment(segment, filePath, language, accentMode, speakers);
                    if (fs.existsSync(filePath)) {
                        const buf = fs.readFileSync(filePath);
                        fs.unlinkSync(filePath); // Delete immediately to save space
                        // No server-side duration calc needed safely
                        return { buffer: buf, duration: 0 };
                    }
                } catch (e) {
                    console.error(`Gen error seg ${index}`, e);
                }
            }

            // Fallback
            return { buffer: Buffer.alloc(0), duration: 0 };
        };

        // Run in batches of 5 (Though page.tsx calls with 1 usually)
        const results = await processInBatches(segments, 5, processItem);

        // Merge
        const allBuffers = results.map(r => r.buffer);
        const mergedBuffer = Buffer.concat(allBuffers);
        const mergedBase64 = mergedBuffer.toString('base64');

        // Basic offsets (duration will be 0 for TTS segments, but client logic ignores this
        // as strictly segment-based fetching is now used in page.tsx)
        const offsets: number[] = [];
        let currentOffset = 0;
        results.forEach(r => {
            offsets.push(currentOffset);
            currentOffset += r.duration;
        });

        return NextResponse.json({
            audioContent: mergedBase64,
            offsets: offsets,
            totalDuration: currentOffset
        });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Generation failed', details: error.message }, { status: 500 });
    }
}
