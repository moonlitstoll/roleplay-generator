import { WebSocket } from 'ws';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const CHROMIUM_FULL_VERSION = '130.0.2849.68';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WINDOWS_FILE_TIME_EPOCH = 11644473600n;

function generateSecMsGecToken() {
    const ticks = BigInt(Math.floor((Date.now() / 1000) + Number(WINDOWS_FILE_TIME_EPOCH))) * 10000000n;
    const roundedTicks = ticks - (ticks % 3000000000n);
    const strToHash = `${roundedTicks}${TRUSTED_CLIENT_TOKEN}`;
    const hash = crypto.createHash('sha256');
    hash.update(strToHash, 'ascii');
    return hash.digest('hex').toUpperCase();
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
        timeout = 20000
    }: Configure = {}) {
        this.voice = voice;
        this.lang = lang;
        this.outputFormat = outputFormat;
        this.rate = rate;
        this.pitch = pitch;
        this.volume = volume;
        this.timeout = timeout;
    }

    private _connectWebSocket(): Promise<WebSocket> {
        const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${generateSecMsGecToken()}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`;

        const ws = new WebSocket(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
                'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
                'Host': 'speech.platform.bing.com'
            }
        });

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket connection timeout'));
            }, 10000);

            ws.on('open', () => {
                clearTimeout(timer);
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

            ws.on('error', (err) => {
                clearTimeout(timer);
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
                    const separator = 'Path:audio\r\n';
                    const index = data.indexOf(separator);
                    if (index >= 0) {
                        const audioData = data.subarray(index + separator.length);
                        dataChunks.push(audioData);
                    }
                } else {
                    const str = data.toString();
                    if (str.includes('Path:turn.end')) {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({ data: Buffer.concat(dataChunks) });
                    }
                }
            });

            ws.on('error', (err) => {
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
