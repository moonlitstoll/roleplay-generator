'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, RefreshCw, MessageSquare, Mic, History as HistoryIcon, Trash2, X, ChevronRight, Settings, Globe, Layers, Pause } from 'lucide-react';
import { saveSession, getSessions, deleteSession, SavedSession } from '../utils/storage';
import { generateExportHTML } from '../utils/exportTemplate';

interface ScriptItem {
  speaker: string;
  text: string;
  translation: string;
  grammar_patterns?: string;
  word_analysis?: string;
  segmentIndex?: number;
}

interface GeneratedSet {
  id: string;
  script: ScriptItem[];
  timestamp: Date;
  input: string;
}

// Map of segmentIndex -> Blob URL
type AudioMap = { [key: number]: string };

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64 = base64String.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function Home() {
  const [language, setLanguage] = useState<'Vietnamese' | 'English'>('Vietnamese');
  const [modelType, setModelType] = useState('gemini-2.5-flash');
  const [input, setInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [turnCount, setTurnCount] = useState(4);
  const [setCount, setSetCount] = useState(1);
  const [accentMode, setAccentMode] = useState('standard-simulated');
  const [loading, setLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [generatedSets, setGeneratedSets] = useState<GeneratedSet[]>([]);

  // New Audio State: Store URLs per segment
  const [audioUrls, setAudioUrls] = useState<AudioMap>({});
  const [audioUrlsSouth, setAudioUrlsSouth] = useState<AudioMap>({});

  const [vietnameseAccent, setVietnameseAccent] = useState<'north' | 'south'>('south');

  // Playback Control States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0); // Current Sentence Duration
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [repeatMode, setRepeatMode] = useState<'none' | 'sentence' | 'session'>('session');

  // Active state
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const [totalSentences, setTotalSentences] = useState(0);

  const [showSpeedPopup, setShowSpeedPopup] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // To avoid rapid switching issues
  const isSwitchingRef = useRef(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, isPlaying]);

  // Handle accent switching
  const handleAccentSwitch = (newAccent: 'north' | 'south') => {
    if (newAccent === vietnameseAccent) return;
    setVietnameseAccent(newAccent);

    // Playback will update automatically because src depends on accent
    // But we might need to seek to 0 of the current sentence
    if (audioRef.current) {
      // Allow a microtick for state to update src
      setTimeout(() => {
        if (isPlaying) audioRef.current?.play().catch(() => { });
      }, 50);
    }
  };

  // Get Current Active URL
  const activeUrl = (() => {
    if (currentSentenceIndex === -1) return undefined;
    // Handle Pause Segments (idx exists but no audio url?)
    // If audioUrls has it, use it. Pause segments generally don't have URL unless generated?
    // Our logic generates pause segments too?
    // Check logic: we skip fetching if !text && !pause. But pause has pause.
    // Pause segments DO return audio (silence). So they have URL.
    if (language === 'Vietnamese' && vietnameseAccent === 'south') {
      return audioUrlsSouth[currentSentenceIndex] || audioUrls[currentSentenceIndex];
    }
    return audioUrls[currentSentenceIndex];
  })();

  // Audio Event Handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      if (isSwitchingRef.current) {
        isSwitchingRef.current = false;
        if (isPlaying) audio.play().catch(() => { });
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);

      if (repeatMode === 'sentence') {
        audio.currentTime = 0;
        audio.play().catch(() => { });
        setIsPlaying(true);
      } else {
        // Proceed to next
        handleNext();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [repeatMode, currentSentenceIndex, isPlaying, audioUrls, audioUrlsSouth, vietnameseAccent]);

  // Auto-scroll
  useEffect(() => {
    if (currentSentenceIndex !== -1) {
      const activeElement = scrollRefs.current[`${currentSentenceIndex}`];
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [currentSentenceIndex]);

  const togglePlay = () => {
    if (!audioRef.current || !activeUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(e => console.error("Play failed", e));
      setIsPlaying(true);
    }
  };

  const playSentence = (index: number) => {
    if (index < 0 || index >= totalSentences) return;
    setCurrentSentenceIndex(index);
    isSwitchingRef.current = true;
    setIsPlaying(true);
  };

  const handleNext = () => {
    let nextIdx = currentSentenceIndex + 1;
    if (nextIdx >= totalSentences) {
      // End of session logic
      if (repeatMode === 'session') {
        nextIdx = 0; // Loop back
      } else {
        return; // Stop
      }
    }
    playSentence(nextIdx);
  };

  const handlePrev = () => {
    if (audioRef.current && audioRef.current.currentTime > 2) {
      audioRef.current.currentTime = 0;
      return;
    }
    let prevIdx = currentSentenceIndex - 1;
    if (prevIdx < 0) {
      prevIdx = totalSentences - 1; // Loop to end
    }
    playSentence(prevIdx);
  };

  const [history, setHistory] = useState<SavedSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadHistory();
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) setApiKey(storedKey);
  }, []);

  useEffect(() => {
    if (apiKey) localStorage.setItem('gemini_api_key', apiKey);
  }, [apiKey]);

  const loadHistory = async () => {
    const sessions = await getSessions();
    setHistory(sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  };

  // FETCHERS (Batched)
  // Fix: accept React state setter signature
  const generateAudioForSegments = async (segments: any[], mode: 'north' | 'south', updateMap: React.Dispatch<React.SetStateAction<AudioMap>>) => {
    // We process in small batches of 3 to avoid flooding connection but keep speed
    const BATCH_SIZE = 3;
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const batch = segments.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (seg) => {
        try {
          // Only fetch if meaningful
          if (!seg.text && !seg.pause) return null;

          const res = await fetch('/api/generate-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              segments: [seg], // Single segment array
              speakers: seg.speakers,
              language,
              accentMode: mode === 'south' ? 'south' : (language === 'Vietnamese' ? 'all-standard' : accentMode)
            })
          });
          if (!res.ok) throw new Error('Fetch failed');
          const data = await res.json();
          const blob = await (await fetch(`data:audio/mpeg;base64,${data.audioContent}`)).blob();
          return {
            idx: seg.idx,
            url: URL.createObjectURL(blob)
          };
        } catch (e) {
          console.error(`Audio fail ${seg.idx}`, e);
          return null;
        }
      });

      const results = await Promise.all(promises);

      // Update state incrementally
      updateMap((prev) => {
        const next = { ...prev };
        results.forEach(r => {
          if (r) next[r.idx] = r.url;
        });
        return next;
      });

      // Update progress UI
      setProgress(`Audio (${Math.min(i + BATCH_SIZE, segments.length)}/${segments.length})...`);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setAudioLoading(true);
    setProgress('Initializing...');
    setGeneratedSets([]);
    setAudioUrls({});
    setAudioUrlsSouth({});
    setCurrentSentenceIndex(-1);

    try {
      const newSets: GeneratedSet[] = [];
      const allSegmentData: any[] = []; // Metadata for fetching
      let finalSpeakersInfo: any = null;
      let globalSegIdx = 0;

      for (let i = 0; i < setCount; i++) {
        setProgress(`Generating script set ${i + 1}/${setCount}...`);

        const scriptRes = await fetch('/api/generate-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input, language, count: turnCount, apiKey, model: modelType, accentMode }),
        });

        if (!scriptRes.ok) {
          const errData = await scriptRes.json();
          throw new Error(errData.details || 'Failed to generate script');
        }

        const data = await scriptRes.json();
        const { script, speakers } = data;
        if (!finalSpeakersInfo) finalSpeakersInfo = speakers;

        if (i > 0) {
          // Pause segment
          allSegmentData.push({ idx: globalSegIdx, pause: 2000, speakers });
          globalSegIdx++;
        }

        const scriptWithIndices = script.map((item: ScriptItem) => {
          const idx = globalSegIdx++;
          allSegmentData.push({ idx, text: item.text, speaker: item.speaker, speakers });
          return { ...item, segmentIndex: idx };
        });

        newSets.push({
          id: crypto.randomUUID(),
          script: scriptWithIndices,
          timestamp: new Date(),
          input: input || "Random Topic",
        });
      }

      setGeneratedSets(newSets);
      setTotalSentences(globalSegIdx); // Total count

      // Start Parallel Generation
      setProgress('Generating Audio...');

      // 1. South Audio (If VN)
      if (language === 'Vietnamese') {
        // Pass the setter directly
        generateAudioForSegments(allSegmentData, 'south', setAudioUrlsSouth);
      }

      // 2. Standard Audio
      await generateAudioForSegments(allSegmentData, 'north', setAudioUrls);

      setAudioLoading(false);
      setProgress('');

      // Select first sentence to start
      if (globalSegIdx > 0) {
        setCurrentSentenceIndex(0);
      }

    } catch (error: any) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      // Save Session on completion (if we have audio)
      if (Object.keys(setAudioUrls).length > 0) {
        // Convert URL back to blob? No, we have URLs. 
        // We need to fetch blob from URL to save.
        // OPTIMIZATION: We should probably store blobs as we go or fetch them back.
        // Since we used createObjectURL, the blob is in memory. We can fetch(url).blob()

        const saveAudioMap = async (urlMap: AudioMap) => {
          const blobMap: { [key: number]: Blob } = {};
          for (const [key, url] of Object.entries(urlMap)) {
            try {
              const b = await fetch(url).then(r => r.blob());
              blobMap[Number(key)] = b;
            } catch (e) { console.error("Blob save fail", e); }
          }
          return blobMap;
        };

        const northBlobs = await saveAudioMap(audioUrls); // We need access to state, but state might not be updated yet in this closure? 
        // Actually we don't have access to the *latest* audioUrls state here inside useEffect/handler easily unless we use ref or the local vars.
        // But we passed setAudioUrls. The `generateAudioForSegments` doesn't return the map.
        // Let's rely on a "Save" button or auto-save effect? 
        // Auto-save effect is better.
      }

      setLoading(false);
      setAudioLoading(false);
    }
  };

  // Effect to auto-save when generation finishes and we have data
  useEffect(() => {
    if (!loading && !audioLoading && generatedSets.length > 0 && Object.keys(audioUrls).length > 0) {
      const autoSave = async () => {
        // Avoid saving duplicates? We check if ID exists? storage.ts put overwrites.
        // We need to convert URLs to Blobs.
        const saveMap = async (map: AudioMap) => {
          const blobMap: { [key: number]: Blob } = {};
          for (const [k, url] of Object.entries(map)) {
            const b = await fetch(url).then(r => r.blob());
            blobMap[Number(k)] = b;
          }
          return blobMap;
        };

        const northMap = await saveMap(audioUrls);
        const southMap = await saveMap(audioUrlsSouth);

        const session: SavedSession = {
          id: generatedSets[0].id, // Use set ID as session ID or random
          timestamp: new Date(),
          input: input || "Random",
          language,
          sets: generatedSets,
          audioBlob: null, // Legacy
          audioMap: northMap,
          audioMapSouth: southMap,
          lastAccent: vietnameseAccent
        };
        await saveSession(session);
        loadHistory(); // Refresh list
      };
      autoSave();
    }
  }, [loading, audioLoading, generatedSets]); // Depend on completion flags

  const loadSession = (session: SavedSession) => {
    setGeneratedSets(session.sets);
    setLanguage(session.language as any);
    setInput(session.input || '');
    setVietnameseAccent(session.lastAccent || 'north');

    // Restore Audio
    if (session.audioMap) {
      const restoreMap = (blobMap: { [key: number]: Blob }) => {
        const urlMap: AudioMap = {};
        for (const [k, blob] of Object.entries(blobMap)) {
          urlMap[Number(k)] = URL.createObjectURL(blob);
        }
        return urlMap;
      };
      setAudioUrls(restoreMap(session.audioMap));
      if (session.audioMapSouth) {
        setAudioUrlsSouth(restoreMap(session.audioMapSouth));
      }
      // Set first sentence active
      setCurrentSentenceIndex(0);
    } else {
      alert("Audio regeneration required for old history items.");
    }
    setShowHistory(false);
  };

  const handleExportHTML = async () => {
    if (Object.keys(audioUrls).length === 0) return;
    alert("Audio export is not supported in this optimization mode yet.");
  };

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this history item?')) {
      await deleteSession(id);
      loadHistory();
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-6 flex flex-col gap-6 relative overflow-x-hidden bg-gray-50">
      {/* Background decoration */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-blue-200/40 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-purple-200/40 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header & Controls */}
      <div className="w-full space-y-4 z-10 transition-all">
        <div className="glass px-6 py-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 bg-white shadow-sm border border-gray-200">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 tracking-tighter">
                RealWait
              </h1>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Roleplay Gen</p>
            </div>

            <div className="h-8 w-px bg-gray-100 hidden md:block" />

            {/* Main Action Bar */}
            <div className="flex items-center gap-3">
              <div className="relative w-64 md:w-96">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Enter topic or word (Empty = Random)..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-4 text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className={`px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm shadow-md transition-all ${loading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.02]'
                  }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{progress.split(' ')[0]}</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Generate</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language / Counts / History / Settings */}
            <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200">
              <div className="flex items-center px-1.5 text-gray-400">
                <Globe className="w-3.5 h-3.5" />
              </div>
              {['Vietnamese', 'English'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang as any)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-tighter transition-all ${language === lang ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {lang === 'Vietnamese' ? 'VN' : 'EN'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm group hover:border-blue-200 transition-colors">
              <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
              <input
                type="number"
                min="1"
                max="10"
                value={turnCount}
                onChange={(e) => setTurnCount(parseInt(e.target.value) || 1)}
                className="w-8 bg-transparent text-center text-xs font-bold text-gray-700 outline-none"
              />
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Turns</span>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm group hover:border-indigo-200 transition-colors">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <input
                type="number"
                min="1"
                max="5"
                value={setCount}
                onChange={(e) => setSetCount(parseInt(e.target.value) || 1)}
                className="w-8 bg-transparent text-center text-xs font-bold text-gray-700 outline-none"
              />
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Sets</span>
            </div>

            <button
              onClick={() => setShowHistory(true)}
              className="p-2.5 rounded-xl border bg-white border-gray-200 text-gray-500 hover:bg-gray-50 relative group"
            >
              <HistoryIcon className="w-5 h-5" />
              {/* Tooltip */}
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">History</span>
            </button>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="p-2.5 rounded-xl border bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* History Sidebar */}
        {showHistory && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in transition-all" onClick={() => setShowHistory(false)}>
            <div
              className="w-full max-w-sm bg-white h-full shadow-2xl p-6 flex flex-col gap-4 animate-in slide-in-from-right duration-300 transform"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                  <HistoryIcon className="w-5 h-5 text-blue-500" />
                  History
                </h2>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                {/* Empty State */}
                {history.length === 0 && (
                  <div className="text-center text-gray-400 py-10 text-sm">No history yet.</div>
                )}

                {history.map(session => (
                  <div key={session.id} onClick={() => loadSession(session)} className="group p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 cursor-pointer transition-all relative">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wide">{session.language}</span>
                      <button onClick={(e) => deleteHistoryItem(e, session.id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 text-red-500 rounded-md transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <h3 className="font-bold text-gray-800 line-clamp-2 leading-snug mb-1">{session.input || "Random Topic"}</h3>
                    <p className="text-[10px] text-gray-400 font-medium">{new Date(session.timestamp).toLocaleString()}</p>
                    {/* Indicator for saved audio */}
                    {session.audioMap && <div className="mt-2 flex items-center gap-1 text-[10px] text-green-600 font-bold"><Mic className="w-3 h-3" /> <span>Audio Saved</span></div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Advanced Settings (Simplified) */}
        {showAdvanced && (
          <div className="glass p-4 rounded-xl bg-white border border-gray-200 mb-4 text-xs text-gray-500">
            Settings: Model {modelType}, API Key set.
          </div>
        )}
      </div>

      {/* Result Panel */}
      <div className="flex-1 space-y-6 z-10 min-w-0">
        {generatedSets.length > 0 && (
          <div className="glass p-6 md:p-10 rounded-3xl min-h-screen flex flex-col bg-white shadow-sm border border-gray-200 mb-20">

            <div className="flex items-center justify-between mb-10 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase">Conversation</h2>
              </div>

              {/* Analysis Toggle */}
              <button
                onClick={() => setShowAnalysis(!showAnalysis)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${showAnalysis ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-xs font-bold uppercase">{showAnalysis ? 'Hide Analysis' : 'Show Analysis'}</span>
              </button>
            </div>

            {/* Script Viewer */}
            <div className="space-y-12">
              {generatedSets.map((set, setIdx) => (
                <div key={set.id} className="space-y-6">
                  {/* Set Divider */}
                  <div className="relative flex items-center justify-center pt-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200"></div>
                    </div>
                    <span className="relative bg-white px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Set {setIdx + 1}: {set.input}
                    </span>
                  </div>

                  {set.script.map((line, idx) => {
                    const isActive = currentSentenceIndex === line.segmentIndex;
                    const segmentKey = `${line.segmentIndex}`;

                    return (
                      <div
                        key={idx}
                        ref={el => { scrollRefs.current[segmentKey] = el; }}
                        className={`flex gap-4 group transition-all duration-500 scroll-mt-32 ${line.speaker === 'A' ? 'flex-row' : 'flex-row-reverse'} ${isActive ? 'scale-[1.02]' : ''}`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm shadow-md transition-all ${isActive
                          ? 'ring-4 ring-blue-500/20 ring-offset-2 scale-110'
                          : ''
                          } ${line.speaker === 'A' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' : 'bg-gradient-to-br from-pink-500 to-pink-600 text-white'
                          }`}>
                          {line.speaker}
                        </div>
                        <div
                          className={`max-w-[90%] p-5 rounded-2xl transition-all relative group/item shadow-sm border-2 cursor-pointer ${isActive
                            ? 'border-blue-400 bg-white ring-4 ring-blue-500/5 shadow-lg'
                            : (line.speaker === 'A' ? 'bg-white border-gray-100 hover:shadow-md' : 'bg-blue-50/50 border-blue-50 hover:shadow-md')
                            }`}
                          onClick={() => playSentence(line.segmentIndex!)}
                        >
                          <div className="flex justify-between items-start gap-4">
                            <p className="text-xl font-medium text-gray-900 mb-2 leading-relaxed flex-1">{line.text}</p>
                          </div>
                          {showAnalysis && (
                            <p className="text-base text-gray-600 italic block mb-4">{line.translation}</p>
                          )}

                          {showAnalysis && (
                            <div className="space-y-3 pt-3 border-t border-gray-100/50 animate-in fade-in duration-300">
                              {line.grammar_patterns && (
                                <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100/50">
                                  <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest block mb-1">Grammar</span>
                                  <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{line.grammar_patterns}</div>
                                </div>
                              )}
                              {line.word_analysis && (
                                <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50">
                                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block mb-1">Vocab</span>
                                  <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{line.word_analysis}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="h-24" />
            </div>
          </div>
        )}

        {generatedSets.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-6 animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center shadow-inner border border-gray-200">
              <MessageSquare className="w-10 h-10 opacity-30 text-gray-400" />
            </div>
            <div className="text-center max-w-md">
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Ready to Roleplay?</h3>
              <p className="text-gray-500">Enter a word or topic on the left to generate native-level conversations tailored to your needs.</p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden Audio Element - Controlled via src prop */}
      <audio
        ref={audioRef}
        src={activeUrl}
        className="hidden"
      />

      {/* Fixed Playback Controller Bar */}
      {
        totalSentences > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-200 z-50 p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom duration-500">
            <div className="max-w-4xl mx-auto">
              {/* Progress Bar (Sentence Level) */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100">
                <div
                  className="h-full bg-blue-500 transition-all duration-100"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSpeedPopup(!showSpeedPopup)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-100 w-24 justify-center"
                  >
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                    {playbackSpeed.toFixed(1)}x
                  </button>
                  {showSpeedPopup && (
                    <div className="absolute bottom-16 left-4 bg-white border p-2 grid grid-cols-4 gap-1 w-64 shadow-xl rounded-xl">
                      {[0.5, 0.8, 1.0, 1.2, 1.5, 2.0].map(s => (
                        <button key={s} onClick={() => { setPlaybackSpeed(s); setShowSpeedPopup(false) }} className="p-2 hover:bg-gray-100 text-xs rounded">{s}x</button>
                      ))}
                    </div>
                  )}

                  {/* Accent selector hidden in Safe Mode (Google TTS Only) 
                        Note: We conditionally render empty here to keep cleanup logic simple */}
                  {language === 'Vietnamese' && false && (
                    <div className="flex bg-gray-200/50 p-1.5 rounded-full">
                      <button onClick={() => handleAccentSwitch('north')} className={`px-4 py-1 text-[10px] font-bold rounded-full ${vietnameseAccent === 'north' ? 'bg-white shadow' : 'text-gray-500'}`}>HANOI</button>
                      <button onClick={() => handleAccentSwitch('south')} className={`px-4 py-1 text-[10px] font-bold rounded-full ${vietnameseAccent === 'south' ? 'bg-white shadow' : 'text-gray-500'}`}>SAIGON</button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <button onClick={handlePrev} className="p-3 text-gray-400 hover:bg-gray-100 rounded-full">
                    <ChevronRight className="w-8 h-8 rotate-180" />
                  </button>
                  <button onClick={togglePlay} className="w-14 h-14 bg-blue-500 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 transition-all">
                    {isPlaying ? <div className="flex gap-1"><div className="w-1.5 h-6 bg-white animate-pulse" /><div className="w-1.5 h-6 bg-white animate-pulse delay-75" /></div> : <Play className="w-8 h-8 ml-1 fill-current" />}
                  </button>
                  <button onClick={handleNext} className="p-3 text-gray-400 hover:bg-gray-100 rounded-full">
                    <ChevronRight className="w-8 h-8" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setRepeatMode(prev => prev === 'sentence' ? 'session' : 'sentence')}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl border bg-blue-50 border-blue-200 text-blue-600"
                  >
                    <RefreshCw className={`w-6 h-6 stroke-[2.5] ${repeatMode === 'session' ? 'animate-spin-slow' : ''}`} />
                    <span className="text-[8px] font-black uppercase">{repeatMode === 'sentence' ? '1-LOOP' : 'ALL-LOOP'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </main>
  );
}
