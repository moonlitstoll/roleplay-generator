export const generateExportHTML = (
    input: string,
    language: string,
    sets: any[],
    audioBase64: string,
    _audioSouthBase64: string, // Kept for signature compatibility
    offsets: number[],
    _offsetsSouth: number[] // Kept for signature compatibility
) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RealWait Export - ${input.slice(0, 20)}</title>
    <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #f9fafb; }
        .glass { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(8px); }
        .sentence-active { border-color: #60a5fa !important; background-color: #ffffff !important; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); transform: scale(1.02); }
        .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
    </style>
</head>
<body class="min-h-screen pb-40">
    <div class="max-w-4xl mx-auto p-4 md:p-8">
        <header class="mb-12 flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-black text-blue-600 tracking-tighter uppercase">RealWait</h1>
                <p class="text-gray-400 text-xs font-bold tracking-widest uppercase">Shadowing Practice</p>
            </div>
            <div class="text-right">
                <p class="text-sm font-bold text-gray-500">${new Date().toLocaleDateString()}</p>
                <div class="flex gap-2 justify-end mt-2">
                    <button onclick="downloadMP3()" class="text-[10px] font-bold text-blue-500 hover:underline">Download MP3</button>
                </div>
            </div>
        </header>

        <div class="glass p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
             <div class="flex items-center gap-3 mb-10 pb-6 border-b border-gray-100">
                <div class="p-2 bg-blue-50 rounded-lg">
                    <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                </div>
                <h2 class="text-xl font-black text-gray-800 tracking-tight uppercase">Topic: ${input}</h2>
            </div>

            <div class="space-y-12">
                ${sets.map((set, setIdx) => `
                    <div class="space-y-6">
                        <div class="relative flex items-center justify-center pt-4">
                            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-100"></div></div>
                            <span class="relative bg-white px-4 text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">Set ${setIdx + 1}</span>
                        </div>
                        ${set.script.map((line: any) => `
                            <div id="sentence-${line.segmentIndex}" 
                                 onclick="seekTo(${line.segmentIndex})"
                                 class="flex gap-4 cursor-pointer transition-all duration-500 border-2 border-transparent p-5 rounded-2xl ${line.speaker === 'A' ? '' : 'flex-row-reverse bg-blue-50/30'}">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm shadow-sm ${line.speaker === 'A' ? 'bg-blue-600 text-white' : 'bg-pink-600 text-white'}">${line.speaker}</div>
                                <div class="flex-1">
                                    <p class="text-xl font-medium text-gray-900 mb-1 leading-relaxed">${line.text}</p>
                                    <p class="text-base text-gray-500 italic mb-3">${line.translation}</p>
                                    ${line.word_analysis ? `
                                        <div class="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1">
                                            ${line.word_analysis.split('\n').filter((it: string) => it.trim()).map((it: string) => `
                                                <p class="text-[12px] text-gray-600 flex items-start gap-2">
                                                    <span class="text-indigo-400 mt-1">•</span>
                                                    ${it.replace(/^[•\-\*]\s*/, '')}
                                                </p>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    </div>

    <!-- Playback Bar -->
    <div class="fixed bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl z-50">
        <div class="bg-white/90 backdrop-blur-xl border border-gray-200 shadow-2xl rounded-3xl p-6">
            <div class="flex items-center justify-center gap-10">
                <!-- Play/Pause -->
                <button onclick="togglePlay()" class="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all">
                    <svg id="play-icon" class="w-8 h-8 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <svg id="pause-icon" class="hidden w-8 h-8 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </button>

                <!-- Speed -->
                <select onchange="setSpeed(this.value)" class="bg-gray-50 border-none text-sm font-bold text-blue-600 focus:ring-0 outline-none cursor-pointer p-2 rounded-xl">
                    <option value="0.8">0.8x</option>
                    <option value="1.0" selected>1.0x</option>
                    <option value="1.2">1.2x</option>
                    <option value="1.5">1.5x</option>
                </select>
            </div>
            <div class="mt-4 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div id="progress-bar" class="h-full bg-blue-500 w-0 transition-all duration-300"></div>
            </div>
        </div>
    </div>

    <audio id="audio-player"></audio>

    <script>
        const audioData = "data:audio/mp3;base64,${audioBase64}";
        const offsets = ${JSON.stringify(offsets)};
        
        const player = document.getElementById('audio-player');
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const progressBar = document.getElementById('progress-bar');

        player.src = audioData;

        function togglePlay() {
            if (player.paused) player.play(); else player.pause();
        }

        player.onplay = () => { playIcon.classList.add('hidden'); pauseIcon.classList.remove('hidden'); };
        player.onpause = () => { playIcon.classList.remove('hidden'); pauseIcon.classList.add('hidden'); };

        player.ontimeupdate = () => {
            const time = player.currentTime;
            const duration = player.duration;
            progressBar.style.width = (time / duration * 100) + '%';
            
            const idx = getSentenceIndex(time);
            updateHighlight(idx);
        };

        function getSentenceIndex(time) {
            let bestIdx = 0;
            for (let i = 0; i < offsets.length; i++) {
                if (time >= offsets[i] - 0.2) bestIdx = i;
            }
            return bestIdx;
        }

        function updateHighlight(idx) {
            document.querySelectorAll('[id^="sentence-"]').forEach(el => el.classList.remove('sentence-active'));
            const active = document.getElementById('sentence-' + idx);
            if (active) active.classList.add('sentence-active');
        }

        function seekTo(idx) {
            player.currentTime = offsets[idx] || 0;
            player.play();
        }

        function setSpeed(s) { player.playbackRate = parseFloat(s); }

        function downloadMP3() {
            const link = document.createElement('a');
            link.href = audioData;
            link.download = 'Shadowing_Audio.mp3';
            link.click();
        }
    </script>
</body>
</html>`;
};
