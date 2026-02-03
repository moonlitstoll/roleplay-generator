'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, RefreshCw, MessageSquare, Mic, History as HistoryIcon, Trash2, X, ChevronRight, Settings, Globe, Layers, Pause } from 'lucide-react';
import { saveSession, getSessions, deleteSession, clearSessions, SavedSession } from '../utils/storage';
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
  const [mode, setMode] = useState<'roleplay' | 'analysis'>('roleplay');
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
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0); // Current Sentence Duration
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [repeatMode, setRepeatMode] = useState<'none' | 'sentence' | 'session'>('session');

  // Active state
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const [totalSentences, setTotalSentences] = useState(0);

  const [showSpeedPopup, setShowSpeedPopup] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [isGapActive, setIsGapActive] = useState(false);
  const [showTurnsPopup, setShowTurnsPopup] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // To avoid rapid switching issues
  const isSwitchingRef = useRef(false);
  const boundaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPlayedUrlRef = useRef<string | null>(null);

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

  const playSentence = React.useCallback((index: number) => {
    if (index < 0 || index >= totalSentences) {
      console.log(`[Playback] Index ${index} out of bounds (0-${totalSentences - 1})`);
      setIsPlaying(false);
      return;
    }

    // Clear any pending boundary pause
    if (boundaryTimeoutRef.current) {
      clearTimeout(boundaryTimeoutRef.current);
      boundaryTimeoutRef.current = null;
    }

    console.log(`[Playback] Switching to sentence ${index}`);
    setCurrentSentenceIndex(index);
    isSwitchingRef.current = true;
    setIsPlaying(true);
  }, [totalSentences]);

  const handleNext = React.useCallback(() => {
    let nextIdx = currentSentenceIndex + 1;
    if (nextIdx >= totalSentences) {
      console.log("[Playback] End of session reached");
      if (repeatMode === 'session') {
        console.log("[Playback] Looping to start");
        nextIdx = 0;
      } else {
        setIsPlaying(false);
        return;
      }
    }

    // Identify Sets using a robust lookup (works for old sessions too)
    const getGlobalSetIndex = (idx: number) => {
      let count = 0;
      for (let s = 0; s < generatedSets.length; s++) {
        const setLen = (generatedSets[s].script || []).length;
        if (idx >= count && idx < count + setLen) return s;
        count += setLen;
      }
      return -1;
    };

    const currentSetIdx = getGlobalSetIndex(currentSentenceIndex);
    const nextSetIdx = getGlobalSetIndex(nextIdx);

    console.log(`[Playback] handleNext: currIdx=${currentSentenceIndex}(Set ${currentSetIdx}), nextIdx=${nextIdx}(Set ${nextSetIdx})`);

    // If crossing set boundary, add pause
    if (currentSetIdx !== -1 && nextSetIdx !== -1 && currentSetIdx !== nextSetIdx) {
      console.log(`[Playback] Boundary: Set ${currentSetIdx} -> ${nextSetIdx}. 2s Gap.`);
      setCurrentSentenceIndex(nextIdx);
      setIsGapActive(true);
      if (boundaryTimeoutRef.current) clearTimeout(boundaryTimeoutRef.current);
      boundaryTimeoutRef.current = setTimeout(() => {
        console.log("[Playback] Gap expired. Playing next.");
        setIsGapActive(false);
      }, 2000);
    } else {
      playSentence(nextIdx);
    }
  }, [currentSentenceIndex, totalSentences, repeatMode, generatedSets, playSentence]);

  // Proactive Playback Effect
  useEffect(() => {
    if (currentSentenceIndex !== -1 && isPlaying && !isGapActive && audioRef.current && activeUrl) {
      const audio = audioRef.current;
      console.log(`[Playback] Effect trigger: ${currentSentenceIndex} -> ${activeUrl.substring(0, 30)}...`);

      const playTimer = setTimeout(() => {
        try {
          // Only load if URL changed
          // Check both Ref and actual src to prevent unnecessary reloads (which reset currentTime)
          const alreadyLoaded = audio.src === activeUrl || (audio.currentSrc && audio.currentSrc === activeUrl);

          if (lastPlayedUrlRef.current !== activeUrl && !alreadyLoaded) {
            console.log(`[Playback] New source: ${activeUrl}`);
            // If we are just updating the ref but src is same (rare), don't load
            if (audio.src !== activeUrl) {
              audio.src = activeUrl;
              audio.load();
            }
            lastPlayedUrlRef.current = activeUrl;
          } else {
            console.log(`[Playback] Resuming: ${activeUrl}`);
          }

          audio.play().catch(e => {
            if (e.name !== 'AbortError') console.error("[Playback] Execution failed:", e);
          });
        } catch (e) {
          console.error("[Playback] Setup failed:", e);
        }
      }, 100); // Slightly longer delay for stable src switching
      return () => clearTimeout(playTimer);
    }
  }, [currentSentenceIndex, isPlaying, isGapActive, activeUrl]);

  const handlePrev = React.useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 2) {
      audioRef.current.currentTime = 0;
      return;
    }
    let prevIdx = currentSentenceIndex - 1;
    if (prevIdx < 0) {
      prevIdx = totalSentences - 1;
    }
    playSentence(prevIdx);
  }, [currentSentenceIndex, totalSentences, playSentence]);

  // Audio Event Handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      console.log("[Playback] Sentence ended");
      if (repeatMode === 'sentence') {
        audio.currentTime = 0;
        audio.play().catch(() => { });
      } else {
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
  }, [repeatMode, handleNext, isPlaying]); // Include isPlaying to ensure listeners are clean

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
    setError(null);

    try {
      if ((!apiKey || apiKey.trim() === '') && !process.env.GEMINI_API_KEY) {
        // Check if hidden env is available, if not, warn
        // But we can't check server env from client easily without a request.
        // Reliance on the API to throw correct error.
      }

      const newSets: GeneratedSet[] = [];
      const allSegmentData: any[] = []; // Metadata for fetching
      let finalSpeakersInfo: any = null;
      let globalSegIdx = 0;

      setProgress(`Generating script...`);

      const scriptRes = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          language,
          count: mode === 'analysis' ? 0 : turnCount,
          apiKey,
          model: modelType,
          accentMode
        }),
      });

      if (!scriptRes.ok) {
        const errData = await scriptRes.json();
        throw new Error(errData.details || 'Failed to generate script');
      }

      const data = await scriptRes.json();
      const { script, speakers } = data;
      finalSpeakersInfo = speakers;

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
      console.error(error);
      // alert(`Error: ${error.message}`); // Suppress alert as per user request
    } finally {
      // Save Session on completion (if we have audio)
      if (Object.keys(setAudioUrls).length > 0) {
        // ... (existing save logic can stay, or we rely on the effect)
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

      // Fix: Recalculate and set total sentences for history items
      const totalCount = session.sets.reduce((sum, s) => sum + s.script.length, 0);
      setTotalSentences(totalCount);

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

  const clearHistory = async () => {
    if (confirm('Are you sure you want to delete ALL history? This cannot be undone.')) {
      await clearSessions();
      setHistory([]);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-6 flex flex-col gap-6 relative overflow-x-hidden bg-gray-50">
      {/* Background decoration */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-blue-200/40 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-purple-200/40 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header & Controls */}
      <div className="w-full space-y-4 z-10 transition-all">
        <div className="glass px-4 lg:px-6 py-4 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white shadow-sm border border-gray-200">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 lg:gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl lg:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 tracking-tighter">
                  RealWait
                </h1>
                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Roleplay Gen</p>
              </div>
              <div className="flex lg:hidden gap-2">
                <button onClick={() => setShowHistory(true)} className="p-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-500"><HistoryIcon className="w-4 h-4" /></button>
                <button onClick={() => setShowAdvanced(!showAdvanced)} className="p-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-500"><Settings className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="h-px lg:h-8 w-full lg:w-px bg-gray-100" />

            {/* Main Action Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
              <div className="relative flex-1 lg:w-96">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={mode === 'roleplay' ? "Enter topic or word..." : "Enter sentence to analyze..."}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-4 text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className={`px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm shadow-md transition-all ${loading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
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

          <div className="flex items-center justify-between lg:justify-end gap-3 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 no-scrollbar">
            {/* Mode Selector */}
            <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200 shrink-0">
              <button
                onClick={() => setMode('roleplay')}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all flex items-center gap-1 ${mode === 'roleplay' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <RefreshCw className={`w-3 h-3 ${mode === 'roleplay' && loading ? 'animate-spin' : ''}`} />
                ROLEPLAY
              </button>
              <button
                onClick={() => setMode('analysis')}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all flex items-center gap-1 ${mode === 'analysis' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <MessageSquare className="w-3 h-3" />
                ANALYSIS
              </button>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200 shrink-0">
              {['Vietnamese', 'English'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang as any)}
                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black transition-all ${language === lang ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {lang === 'Vietnamese' ? 'VN' : 'EN'}
                </button>
              ))}
            </div>

            {mode === 'roleplay' && (
              <div className="relative">
                <button
                  onClick={() => setShowTurnsPopup(!showTurnsPopup)}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 px-2.5 py-1.5 rounded-xl shadow-sm hover:border-blue-200 transition-colors"
                >
                  <MessageSquare className="w-3 h-3 text-blue-500" />
                  <span className="w-4 text-center text-[10px] font-bold text-gray-700">{turnCount}</span>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Turns</span>
                </button>

                {showTurnsPopup && (
                  <>
                    <div className="fixed inset-0 z-[60] bg-black/10 backdrop-blur-[1px]" onClick={() => setShowTurnsPopup(false)} />
                    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-white border border-gray-200 shadow-2xl rounded-2xl p-4 w-64 grid grid-cols-5 gap-2 animate-in zoom-in-95 duration-200">
                      <div className="col-span-5 text-center text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">Select Turns</div>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                        <button
                          key={num}
                          onClick={() => { setTurnCount(num); setShowTurnsPopup(false); }}
                          className={`aspect-square flex items-center justify-center text-sm font-bold rounded-xl transition-all ${turnCount === num ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="p-2.5 rounded-xl border bg-white border-gray-200 text-gray-500 hover:bg-gray-50 relative group"
              >
                <HistoryIcon className="w-5 h-5" />
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
        </div>



        {/* Collapsible Advanced Settings (Simplified) */}
        {showAdvanced && (
          <div className="glass p-4 rounded-xl bg-white border border-gray-200 mb-4 text-sm text-gray-700 space-y-4 animate-in slide-in-from-top-2">
            <div className="flex flex-col gap-2">
              <label className="font-bold text-xs uppercase text-gray-400">Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Gemini API Key..."
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-[10px] text-gray-400">Leave empty to use server default (if configured).</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-bold text-xs uppercase text-gray-400">Model</label>
              <select
                value={modelType}
                onChange={(e) => setModelType(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 outline-none"
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-pro">Gemini Pro</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Error Message Banner */}
      {error && (
        <div className="w-full px-4 md:px-6 animate-in slide-in-from-top-2">
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="bg-red-100 p-1 rounded-full"><X className="w-3 h-3" /></span>
              {error}
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 text-xs font-bold uppercase">Dismiss</button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-6 z-10 min-w-0">
        {generatedSets.length > 0 && (
          <div className="glass p-1 md:p-10 rounded-2xl md:rounded-3xl min-h-screen flex flex-col bg-white shadow-sm border border-gray-200 mb-24 md:mb-20">

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
                  {/* Set Divider - Only show Topic if only one set, or fully labeled if multiple */}
                  {generatedSets.length > 1 ? (
                    <div className="relative flex items-center justify-center pt-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200"></div>
                      </div>
                      <span className="relative bg-white px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Set {setIdx + 1}: {set.input}
                      </span>
                    </div>
                  ) : (
                    <div className="pt-2 pb-4 text-center">
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] opacity-50">Topic: {set.input || 'Random'}</span>
                    </div>
                  )}

                  {set.script.map((line, idx) => {
                    const isActive = currentSentenceIndex === line.segmentIndex;
                    const segmentKey = `${line.segmentIndex}`;

                    return (
                      <div
                        key={idx}
                        ref={el => { scrollRefs.current[segmentKey] = el; }}
                        // Mobile: Always flex-col (stacked), No gap.
                        className={`flex flex-col md:gap-4 group transition-all duration-500 scroll-mt-32 
                          ${line.speaker === 'A' ? 'md:flex-row' : 'md:flex-row-reverse'} 
                          ${isActive ? 'scale-[1.00] md:scale-[1.02]' : ''}`}
                      >
                        <div className={`hidden md:flex w-10 h-10 rounded-full items-center justify-center shrink-0 font-bold text-sm shadow-md transition-all ${isActive
                          ? 'ring-4 ring-blue-500/20 ring-offset-2 scale-110'
                          : ''
                          } ${line.speaker === 'A' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' : 'bg-gradient-to-br from-pink-500 to-pink-600 text-white'
                          }`}>
                          {line.speaker}
                        </div>
                        <div
                          // Mobile: w-full.
                          className={`w-full md:max-w-[85%] p-4 md:p-5 rounded-xl md:rounded-2xl transition-all relative group/item shadow-sm border md:border-2 cursor-pointer ${isActive
                            ? 'border-blue-400 bg-white ring-2 md:ring-4 ring-blue-500/5 shadow-lg'
                            : (line.speaker === 'A' ? 'bg-white border-gray-100 hover:shadow-md' : 'bg-blue-50/50 border-blue-50 hover:shadow-md')
                            }`}
                          onClick={() => playSentence(line.segmentIndex!)}
                        >
                          <div className="flex flex-col md:block">
                            {/* Mobile Speaker Badge */}
                            <div className={`flex md:hidden items-center gap-2 mb-2`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${line.speaker === 'A' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' : 'bg-gradient-to-br from-pink-500 to-pink-600 text-white'
                                }`}>
                                {line.speaker}
                              </div>
                            </div>

                            <div className="flex justify-between items-start gap-4">
                              <p className="text-lg md:text-xl font-medium text-gray-900 mb-2 leading-relaxed flex-1 text-justify md:text-left">{line.text}</p>
                            </div>
                          </div>
                          {showAnalysis && (
                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-4 animate-in fade-in duration-300 text-sm text-gray-800 leading-relaxed">

                              {/* Translation */}
                              <div>
                                <h4 className="font-bold text-blue-600 mb-1">[한글 문장 해설]</h4>
                                <p>{line.translation}</p>
                              </div>

                              {/* Grammar Patterns */}
                              {line.grammar_patterns && (
                                <div>
                                  <h4 className="font-bold text-orange-600 mb-1">[회화 문법 패턴 정의]</h4>
                                  <div className="whitespace-pre-wrap">{line.grammar_patterns}</div>
                                </div>
                              )}

                              {/* Word Analysis */}
                              {line.word_analysis && (
                                <div>
                                  <h4 className="font-bold text-indigo-600 mb-1">[상세 단어 및 문법 분석]</h4>
                                  <div className="whitespace-pre-wrap">{line.word_analysis}</div>
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

              <div className="flex items-center justify-between gap-2 md:gap-4 mt-2">
                <div className="flex items-center gap-2">
                  {/* Analysis Toggle (Mobile/Desktop) */}
                  <button
                    onClick={() => setShowAnalysis(!showAnalysis)}
                    className={`flex items-center justify-center p-2 md:p-2 rounded-full transition-all ${showAnalysis ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                    title="Toggle Analysis"
                  >
                    <div className="relative">
                      <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
                      <span className="absolute -bottom-1 -right-1 text-[8px] font-black">{showAnalysis ? 'ON' : 'OFF'}</span>
                    </div>
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setShowSpeedPopup(!showSpeedPopup)}
                      className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-2 bg-gray-50 rounded-full text-[10px] md:text-sm font-bold text-gray-700 hover:bg-gray-100 w-16 md:w-20 justify-center"
                    >
                      <RefreshCw className="w-3 md:w-4 h-3 md:h-4 text-blue-500" />
                      {playbackSpeed.toFixed(1)}x
                    </button>
                    {showSpeedPopup && (
                      <div className="absolute bottom-16 left-0 bg-white border border-gray-200 p-4 w-64 shadow-2xl rounded-2xl flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200 origin-bottom-left">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-500 uppercase">Speed</span>
                          <span className="text-sm font-black text-blue-600">{playbackSpeed.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          value={playbackSpeed}
                          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                          className="w-full accent-blue-600 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-gray-400 font-bold px-1">
                          <span>0.5x</span>
                          <span>1.0x</span>
                          <span>2.0x</span>
                        </div>
                        <button
                          onClick={() => { setPlaybackSpeed(1.0); setShowSpeedPopup(false); }}
                          className="w-full py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-600 transition-colors"
                        >
                          Reset to 1.0x
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 md:gap-6">
                  <button onClick={handlePrev} className="p-2 md:p-3 text-gray-400 hover:bg-gray-100 rounded-full">
                    <ChevronRight className="w-6 md:w-8 h-6 md:h-8 rotate-180" />
                  </button>
                  <button onClick={togglePlay} className="w-10 md:w-14 h-10 md:h-14 bg-blue-600 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all">
                    {isPlaying
                      ? <div className="flex gap-1"><div className="w-1 md:w-1.5 h-4 md:h-6 bg-white animate-pulse" /><div className="w-1 md:w-1.5 h-4 md:h-6 bg-white animate-pulse delay-75" /></div>
                      : <Play className="w-5 md:w-8 h-5 md:h-8 ml-0.5 md:l-1 fill-current" />
                    }
                  </button>
                  <button onClick={handleNext} className="p-2 md:p-3 text-gray-400 hover:bg-gray-100 rounded-full">
                    <ChevronRight className="w-6 md:w-8 h-6 md:h-8" />
                  </button>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={() => setRepeatMode(prev => prev === 'sentence' ? 'session' : 'sentence')}
                    className="flex flex-col items-center gap-0.5 p-1.5 md:p-2 rounded-lg md:rounded-xl border bg-blue-50 border-blue-200 text-blue-600"
                  >
                    <RefreshCw className={`w-4 md:w-6 h-4 md:h-6 stroke-[2.5] ${repeatMode === 'session' ? 'animate-spin-slow' : ''}`} />
                    <span className="text-[6px] md:text-[8px] font-black uppercase">{repeatMode === 'sentence' ? '1-L' : 'ALL'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
      {/* History Sidebar - Moved to Root to fix z-index stacking context */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in transition-all" onClick={() => setShowHistory(false)}>
          <div
            className="w-full md:max-w-sm bg-white h-full shadow-2xl p-6 flex flex-col gap-4 animate-in slide-in-from-right duration-300 transform"
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

            {/* Clear All Button */}
            {history.length > 0 && (
              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={clearHistory}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All History
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Root Level Turns Popup - Moved here to prevent z-index issues / overflow clipping in the header */}
      {showTurnsPopup && (
        <>
          <div className="fixed inset-0 z-[100] bg-black/10 backdrop-blur-[1px]" onClick={() => setShowTurnsPopup(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] bg-white border border-gray-200 shadow-2xl rounded-2xl p-4 w-64 grid grid-cols-5 gap-2 animate-in zoom-in-95 duration-200">
            <div className="col-span-5 text-center text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">Select Turns</div>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
              <button
                key={num}
                onClick={() => { setTurnCount(num); setShowTurnsPopup(false); }}
                className={`aspect-square flex items-center justify-center text-sm font-bold rounded-xl transition-all ${turnCount === num ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
              >
                {num}
              </button>
            ))}
          </div>
        </>
      )}
    </main >
  );
}
