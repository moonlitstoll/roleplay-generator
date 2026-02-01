
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

interface Voice {
    name: string;
    lang: string;
    voice: string;
}

interface Configure {
    voice?: string;
    lang?: string;
    outputFormat?: string;
    rate?: string;
    pitch?: string;
    volume?: string;
    timeout?: number;
    proxy?: string;
}

export class EdgeTTS {
    private voice: string;
    private lang: string;
    private outputFormat: string;
    private rate: string;
    private pitch: string;
    private volume: string;
    private timeout: number;

    constructor({
        voice = 'en-US-AriaNeural',
        lang = 'en-US',
        outputFormat = 'audio-24khz-96kbitrate-mono-mp3',
        rate = 'default',
        pitch = 'default',
        volume = 'default',
        timeout = 60000
    }: Configure = {}) {
        this.voice = voice;
        this.lang = lang;
        this.outputFormat = outputFormat;
        this.rate = rate;
        this.pitch = pitch;
        this.volume = volume;
        this.timeout = timeout;
    }

    private _getSecMSGEC(): string {
        const date = BigInt(Math.floor(Date.now() / 1000) + 11644473600);
        const ticks = date * 10000000n;
        const roundedTicks = ticks - (ticks % 3000000000n);
        const str = `${roundedTicks}6A5AA1D4EAFF4E9FB37E23D68491D6F4`;

        const hash = crypto.createHash('sha256');
        hash.update(str);
        return hash.digest('hex').toUpperCase();
    }

    private _connectWebSocket(): Promise<WebSocket> {
        const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        // Updated version to fix 403 error
        const SEC_MS_GEC_VERSION = "1-132.0.2957.140";
        const secMSGEC = this._getSecMSGEC();
        const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMSGEC}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0",
            "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
            "Host": "speech.platform.bing.com"
        };

        const ws = new WebSocket(url, { headers });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket connection timeout'));
            }, 10000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n
                    {
                        "context": {
                            "synthesis": {
                                "audio": {
                                    "metadataoptions": {
                                        "sentenceBoundaryEnabled": "false",
                                        "wordBoundaryEnabled": "true"
                                    },
                                    "outputFormat": "${this.outputFormat}"
                                }
                            }
                        }
                    }
                `);
                resolve(ws);
            });

            ws.on('error', (err: Error) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    async call(text: string): Promise<{ data: Buffer }> {
        const ws = await this._connectWebSocket();
        const requestId = uuidv4().replace(/-/g, '');

        return new Promise((resolve, reject) => {
            const dataChunks: Buffer[] = [];

            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('TTS Generation timeout'));
            }, this.timeout);

            ws.on('message', (data: Buffer, isBinary: boolean) => {
                if (isBinary) {
                    dataChunks.push(data);
                } else {
                    const str = data.toString();
                    if (str.includes('Path:turn.end')) {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({ data: Buffer.concat(dataChunks) });
                    }
                }
            });

            ws.on('error', (err: Error) => {
                clearTimeout(timeout);
                ws.close();
                reject(err);
            });

            const ssml = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n
            <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${this.lang}">
                <voice name="${this.voice}">
                    <prosody rate="${this.rate}" pitch="${this.pitch}" volume="${this.volume}">
                        ${text}
                    </prosody>
                </voice>
            </speak>`;

            ws.send(ssml);
        });
    }
}
