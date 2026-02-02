const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');

async function testNodeEdge() {
    console.log("Testing node-edge-tts...");
    try {
        const tts = new EdgeTTS({
            voice: 'vi-VN-NamMinhNeural',
            lang: 'vi-VN'
        });

        // Check prototype or methods
        console.log("Methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(tts)));

        const outputPath = path.resolve(__dirname, 'test_node_edge_out.mp3');
        await tts.ttsPromise("Xin chào, đây là node-edge-tts.", outputPath);

        console.log("Success! File written to", outputPath);

        // Check if we can get buffer directly?
        // Usually these libs just wrap the command or WS.

    } catch (e) {
        console.error("Error:", e);
    }
}

testNodeEdge();
