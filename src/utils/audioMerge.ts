export const mergeAudioToWav = async (blobs: Blob[]): Promise<{ blob: Blob, duration: number, timeline: { start: number, end: number, index: number }[] }> => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffers: AudioBuffer[] = [];
    const timeline: { start: number, end: number, index: number }[] = [];
    let currentOffset = 0;

    // 1. Decode all blobs to AudioBuffers
    for (let i = 0; i < blobs.length; i++) {
        const arrayBuffer = await blobs[i].arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBuffers.push(audioBuffer);

        timeline.push({
            start: currentOffset,
            end: currentOffset + audioBuffer.duration,
            index: i
        });
        currentOffset += audioBuffer.duration;
    }

    // 2. Calculate Total Length
    const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
    const numberOfChannels = audioBuffers[0]?.numberOfChannels || 2;
    const sampleRate = audioBuffers[0]?.sampleRate || 44100;

    // 3. Create Output Buffer
    // We do manual interleaving to create WAV data
    // WAV format: 16-bit PCM
    const buffer = new ArrayBuffer(44 + totalLength * numberOfChannels * 2);
    const view = new DataView(buffer);

    // Helper to write string
    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    // RIFF Chunk Descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalLength * numberOfChannels * 2, true); // File size - 8
    writeString(view, 8, 'WAVE');

    // fmt Sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, numberOfChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * numberOfChannels * 2, true); // ByteRate
    view.setUint16(32, numberOfChannels * 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data Sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, totalLength * numberOfChannels * 2, true); // Subchunk2Size

    // 4. Interleave and Write Samples
    let offset = 44;
    for (const buf of audioBuffers) {
        for (let i = 0; i < buf.length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = buf.getChannelData(channel)[i];
                // Clamp and scale to 16-bit
                const s = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                offset += 2;
            }
        }
    }

    const wavBlob = new Blob([view], { type: 'audio/wav' });
    return { blob: wavBlob, duration: currentOffset, timeline };
};
