import { NextRequest, NextResponse } from 'next/server';
import { EdgeTTS } from '@/utils/edge-tts';

// --- CONSTANTS ---
// ~100ms of Silence (MPEG 1 Layer III, 44.1kHz, 64kbps) - valid MP3 frame
const SILENCE_FRAME_BASE64 = "//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const SILENCE_FRAME_BUFFER = Buffer.from(SILENCE_FRAME_BASE64, 'base64');
const SILENCE_DURATION_SEC = 0.1; // Approx duration of one frame above

// File Logger
function log(message: string) {
    console.log(message);
}



async function generateSegment(
    segment: any,
    language: string,
    accentMode: string,
    speakers: any
): Promise<Buffer> {
    const spk = segment.speaker;
    const gender = speakers[spk]?.gender || 'female';

    // Map Voices
    let voice = 'en-US-AriaNeural'; // Default
    if (language === 'English') {
        voice = gender === 'male' ? 'en-US-ChristopherNeural' : 'en-US-AriaNeural';
    } else if (language === 'Vietnamese') {
        // North: NamMinh (Male), HoaiMy (Female)
        if (accentMode === 'south') {
            // SOUTH MODE:
            // Female -> HoaiMy (South) - Perfect
            // Male -> NamMinh (North) - Fallback (No South Male available)
            voice = gender === 'male' ? 'vi-VN-NamMinhNeural' : 'vi-VN-HoaiMyNeural';
        } else {
            // NORTH MODE:
            // Male -> NamMinh (North) - Perfect
            // Female -> HoaiMy (South) - Fallback (No North Female available? Check logic)
            // Actually currently HoaiMy is the only female. 
            voice = gender === 'male' ? 'vi-VN-NamMinhNeural' : 'vi-VN-HoaiMyNeural';
        }
    }

    try {
        const tts = new EdgeTTS({
            voice,
            lang: language === 'Vietnamese' ? 'vi-VN' : 'en-US',
            outputFormat: 'audio-24khz-96kbitrate-mono-mp3'
        });
        const result = await tts.call(segment.text);
        return result.data;
    } catch (e) {
        console.error(`EdgeTTS failed for ${voice}`, e);
        throw e;
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
                try {
                    const buf = await generateSegment(segment, language, accentMode, speakers);
                    if (buf && buf.length > 0) {
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
