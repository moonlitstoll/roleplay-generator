'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, RefreshCw, MessageSquare, Mic, History as HistoryIcon, Trash2, X, ChevronRight, Settings, Globe, Layers } from 'lucide-react';
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
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const [southAudioUrl, setSouthAudioUrl] = useState<string | null>(null);
  const [audioOffsets, setAudioOffsets] = useState<number[]>([]);
  const [audioOffsetsSouth, setAudioOffsetsSouth] = useState<number[]>([]);
  const [vietnameseAccent, setVietnameseAccent] = useState<'north' | 'south'>('south');
  const [audioLoadingSouth, setAudioLoadingSouth] = useState(false);

  // Playback Control States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [repeatMode, setRepeatMode] = useState<'none' | 'sentence' | 'session'>('session');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const [showSpeedPopup, setShowSpeedPopup] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Sync speed with audio ref
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, isPlaying]);

  // Handle accent switching
  const handleAccentSwitch = (newAccent: 'north' | 'south') => {
    if (!audioRef.current || newAccent === vietnameseAccent || loading) return;
    if (newAccent === 'south' && !southAudioUrl) return;

    const wasPlaying = isPlaying;
    const activeSentenceIdx = currentSentenceIndex;
    const offsets = language === 'Vietnamese' ? (newAccent === 'south' ? audioOffsetsSouth : audioOffsets) : audioOffsets;

    setVietnameseAccent(newAccent);

    setTimeout(() => {
      if (audioRef.current) {
        if (activeSentenceIdx !== -1 && offsets[activeSentenceIdx] !== undefined) {
          (audioRef.current as any)._pendingSyncTime = offsets[activeSentenceIdx];
        } else {
          (audioRef.current as any)._pendingSyncTime = 0;
        }
        (audioRef.current as any)._pendingWasPlaying = wasPlaying;
        audioRef.current.load();
      }
    }, 0);
  };


  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);

      // Check for pending sync
      const pendingTime = (audio as any)._pendingSyncTime;
      const pendingPlay = (audio as any)._pendingWasPlaying;
      if (typeof pendingTime === 'number') {
        audio.currentTime = pendingTime;
        delete (audio as any)._pendingSyncTime;
        if (pendingPlay) {
          audio.play().catch(() => { });
          delete (audio as any)._pendingWasPlaying;
        }
      }
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);

      const offsets = language === 'Vietnamese' ? (vietnameseAccent === 'south' ? audioOffsetsSouth : audioOffsets) : audioOffsets;

      if (offsets.length > 0) {
        let index = -1;
        for (let i = 0; i < offsets.length; i++) {
          if (time >= offsets[i]) {
            index = i;
          } else {
            break;
          }
        }

        // Loop Logic (Sentence Mode)
        if (repeatMode === 'sentence' && currentSentenceIndex !== -1) {
          const currentStart = offsets[currentSentenceIndex];
          const currentEnd = offsets[currentSentenceIndex + 1] || audio.duration;

          // 1. Pre-emptive check: clearly approaching end
          if (time >= currentEnd - 0.25 && time < currentEnd + 1.0) {
            audio.currentTime = currentStart;
            return; // Do not update index
          }

          // 2. Overshoot check: we technically entered the next index (index > currentSentenceIndex)
          // but we are very close to the start of it (within 0.5s), implies natural playback overflow
          if (index > currentSentenceIndex && (time - currentEnd) < 0.5) {
            audio.currentTime = currentStart;
            return; // Do not update index
          }
        }

        if (index !== currentSentenceIndex) {
          setCurrentSentenceIndex(index);
        }
      }
    };

    const handleEnded = () => {
      if (repeatMode === 'session') {
        audio.currentTime = 0;
        audio.play().catch(() => { });
        setIsPlaying(true);
      } else if (repeatMode === 'sentence') {
        const offsets = audioOffsets;
        audio.currentTime = offsets[currentSentenceIndex] || 0;
        audio.play().catch(() => { });
        setIsPlaying(true);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [audioOffsets, audioOffsetsSouth, repeatMode, language, vietnameseAccent, currentSentenceIndex, isPlaying]);

  // Auto-scroll logic
  useEffect(() => {
    if (currentSentenceIndex !== -1) {
      const activeElement = scrollRefs.current[`${currentSentenceIndex}`];
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [currentSentenceIndex]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(e => console.error("Play failed", e));
  };

  const handleNext = () => {
    if (!audioRef.current) return;
    const offsets = language === 'Vietnamese' ? (vietnameseAccent === 'south' ? audioOffsetsSouth : audioOffsets) : audioOffsets;
    if (offsets.length === 0) return;
    const nextIdx = currentSentenceIndex + 1;
    if (nextIdx < offsets.length) {
      audioRef.current.currentTime = offsets[nextIdx];
    } else {
      // Loop to start
      audioRef.current.currentTime = offsets[0];
    }
  };

  const handlePrev = () => {
    if (!audioRef.current) return;
    const offsets = language === 'Vietnamese' ? (vietnameseAccent === 'south' ? audioOffsetsSouth : audioOffsets) : audioOffsets;
    if (offsets.length === 0) return;
    const timeInSegment = audioRef.current.currentTime - (offsets[currentSentenceIndex] || 0);
    if (timeInSegment > 2) {
      audioRef.current.currentTime = offsets[currentSentenceIndex];
    } else {
      const prevIdx = currentSentenceIndex - 1;
      if (prevIdx >= 0) {
        audioRef.current.currentTime = offsets[prevIdx];
      } else {
        // Loop to end
        audioRef.current.currentTime = offsets[offsets.length - 1];
      }
    }
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
    // Sort by new
    setHistory(sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setAudioLoading(true);
    setAudioLoadingSouth(false);
    setProgress('Initializing...');
    setGeneratedSets([]);
    setMergedAudioUrl(null);
    setSouthAudioUrl(null);
    setCurrentSetIndex(0);

    try {
      const newSets: GeneratedSet[] = [];
      const allSegments: any[] = [];
      let finalSpeakersInfo: any = null;

      let currentSegmentIdx = 0;
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
          allSegments.push({ pause: 2000 });
          currentSegmentIdx++; // Skip indexing for pause segment
        }

        const scriptWithIndices = script.map((item: ScriptItem) => {
          const newItem = { ...item, segmentIndex: currentSegmentIdx++ };
          allSegments.push({ text: item.text, speaker: item.speaker });
          return newItem;
        });

        newSets.push({
          id: crypto.randomUUID(),
          script: scriptWithIndices,
          timestamp: new Date(),
          input: input || "Random Topic",
        });
      }

      setGeneratedSets(newSets);

      // --- Audio Generation ---
      let blob: Blob | null = null;
      let data: any = null;
      let finalBlobSouth: Blob | null = null;
      let finalOffsetsSouth: number[] | undefined = undefined;

      // 1. Generate Southern Audio FIRST (If Vietnamese)
      if (language === 'Vietnamese') {
        console.log("Starting South Generation...");
        setAudioLoadingSouth(true);
        setProgress('Generating audio (Southern - Edge TTS)...');
        try {
          const audioResSouth = await fetch('/api/generate-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              segments: allSegments,
              speakers: finalSpeakersInfo,
              language,
              accentMode: 'south'
            }),
          });
          if (audioResSouth.ok) {
            const dataS = await audioResSouth.json();
            finalOffsetsSouth = dataS.offsets;
            finalBlobSouth = await (await fetch(`data:audio/mpeg;base64,${dataS.audioContent}`)).blob();
            setSouthAudioUrl(URL.createObjectURL(finalBlobSouth));
            setAudioOffsetsSouth(finalOffsetsSouth!);
          } else {
            console.error('South gen failed');
          }
        } catch (e) {
          console.error('South gen error', e);
        }
        setAudioLoadingSouth(false);
      }

      // 2. Generate Northern/Standard Audio (Secondary)
      setProgress('Generating audio (Northern/Standard)...');
      setAudioLoading(true);
      const audioRes = await fetch('/api/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: allSegments,
          speakers: finalSpeakersInfo,
          language,
          accentMode: language === 'Vietnamese' ? 'all-standard' : accentMode
        }),
      });

      if (!audioRes.ok) {
        const errJson = await audioRes.json();
        console.error('Failed to generate primary audio:', errJson.error);
        setAudioLoading(false);
      } else {
        data = await audioRes.json();
        blob = await (await fetch(`data:audio/mpeg;base64,${data.audioContent}`)).blob();
        setMergedAudioUrl(URL.createObjectURL(blob));
        setAudioOffsets(data.offsets);
        setDuration(data.totalDuration);
        setAudioLoading(false);

        // Save to History
        const session: SavedSession = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          input: input || "Random Topic",
          language,
          sets: newSets,
          audioBlob: blob,
          audioBlobSouth: finalBlobSouth,
          offsets: data.offsets,
          offsetsSouth: finalOffsetsSouth,
          lastAccent: vietnameseAccent,
        };
        await saveSession(session);
        loadHistory();
      }
    } catch (error: any) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setAudioLoading(false);
      setAudioLoadingSouth(false);
    }
  };

  const loadSession = (session: SavedSession) => {
    setGeneratedSets(session.sets);
    setLanguage(session.language as any);
    setInput(session.input || '');
    setCurrentSetIndex(0);
    setCurrentSentenceIndex(-1);

    if (session.audioBlob) {
      setMergedAudioUrl(URL.createObjectURL(session.audioBlob));
    } else {
      setMergedAudioUrl(null);
    }

    setAudioOffsets(session.offsets || []);

    setShowHistory(false);
  };

  const handleExportHTML = async () => {
    if (!mergedAudioUrl || generatedSets.length === 0) {
      alert('Please generate a session first.');
      return;
    }

    try {
      setLoading(true);
      setProgress('Preparing Export...');

      const responseNorth = await fetch(mergedAudioUrl);
      const blobNorth = await responseNorth.blob();
      const base64North = await blobToBase64(blobNorth);

      const htmlContent = generateExportHTML(
        input || 'Random Roleplay',
        language,
        generatedSets,
        base64North,
        '',
        audioOffsets,
        []
      );

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RealWait_${language}_Focus_${new Date().getTime()}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProgress('Export Complete!');
      setTimeout(() => setProgress(''), 2000);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export HTML. Please try again.');
    } finally {
      setLoading(false);
    }
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
              className="p-2.5 hover:bg-gray-100 bg-white border border-gray-200 rounded-xl transition-all relative group"
              title="History"
            >
              <HistoryIcon className="w-5 h-5 text-gray-500 group-hover:text-blue-600" />
              {history.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
                  {history.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 text-sm font-medium ${showAdvanced ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              title="Settings"
            >
              <Settings className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Collapsible Advanced Settings */}
        {showAdvanced && (
          <div className="glass p-6 rounded-2xl bg-white shadow-lg border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 duration-300">
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Accent Mode (EN)</label>
                <select
                  value={accentMode}
                  disabled={language === 'Vietnamese'}
                  onChange={(e) => setAccentMode(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50"
                >
                  <option value="all-standard">Standard</option>
                  <option value="all-simulated">Regional</option>
                  <option value="standard-simulated">Mix A(Std)+B(Reg)</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-2 tracking-wider">AI Model</label>
                <select
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
              </div>
            </div>

            <div className="md:col-span-1 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Gemini API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Gemini API key..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700 outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300"
                />
                <p className="text-[10px] text-gray-400 mt-1 font-medium italic">* Key is only used for current session.</p>
              </div>
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-start gap-3">
              <div className="p-1.5 bg-blue-100 rounded-lg">
                <Mic className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-blue-700 uppercase tracking-tight">Hybrid Voice Engine Active</p>
                <p className="text-[10px] text-blue-500/80 mt-0.5 leading-relaxed">
                  Hanoi (Google) & Saigon (Edge) integration for maximum regional immersion.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Result Panel */}
      <div className="flex-1 space-y-6 z-10 min-w-0">
        {generatedSets.length > 0 && (
          <div className="glass p-6 md:p-10 rounded-3xl min-h-screen flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white shadow-sm border border-gray-200 mb-20">

            <div className="flex items-center justify-between mb-10 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase">Generated Conversation</h2>
              </div>
              <button
                onClick={handleExportHTML}
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl border border-gray-200 hover:border-blue-200 transition-all text-sm font-bold shadow-sm"
              >
                <Download className="w-4 h-4" />
                Export HTML
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
                          onClick={() => {
                            if (audioRef.current && typeof line.segmentIndex === 'number') {
                              audioRef.current.currentTime = audioOffsets[line.segmentIndex] || 0;
                              audioRef.current.play().catch(() => { });
                            }
                          }}
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
                                  <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest block mb-2">Grammar & Patterns</span>
                                  <div className="space-y-1">
                                    {line.grammar_patterns.split('\n').filter(item => item.trim()).map((item, i) => (
                                      <p key={i} className="text-[13px] text-gray-700 leading-relaxed flex items-start gap-2">
                                        <span className="text-orange-300 mt-1">•</span>
                                        {item.replace(/^[•\-\*]\s*/, '')}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {line.word_analysis && (
                                <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50">
                                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block mb-2">Word Analysis</span>
                                  <div className="space-y-1">
                                    {line.word_analysis.split('\n').filter(item => item.trim()).map((item, i) => (
                                      <p key={i} className="text-[13px] text-gray-700 font-medium leading-relaxed flex items-start gap-2">
                                        <span className="text-indigo-300 mt-1">•</span>
                                        {item.replace(/^[•\-\*]\s*/, '')}
                                      </p>
                                    ))}
                                  </div>
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

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={(language === 'Vietnamese' && vietnameseAccent === 'south' && southAudioUrl) ? southAudioUrl : (mergedAudioUrl || undefined)}
        className="hidden"
      />

      {/* Fixed Playback Controller Bar */}
      {
        mergedAudioUrl && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-200 z-50 p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom duration-500">
            <div className="max-w-4xl mx-auto">
              {/* Progress Bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1 bg-gray-100 cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = x / rect.width;
                  if (audioRef.current) audioRef.current.currentTime = percentage * audioRef.current.duration;
                }}
              >
                <div
                  className="h-full bg-blue-500 rounded-r-full transition-all duration-100 group-hover:bg-blue-600"
                  style={{ width: `${(currentTime / duration || 0) * 100}%` }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowSpeedPopup(!showSpeedPopup)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors w-24 justify-center"
                    >
                      <RefreshCw className="w-4 h-4 text-blue-500" />
                      {playbackSpeed.toFixed(1)}x
                    </button>
                    {showSpeedPopup && (
                      <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-2xl shadow-2xl p-2 grid grid-cols-4 gap-1 w-64 animate-in zoom-in-95 duration-200">
                        {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0].map(s => (
                          <button
                            key={s}
                            onClick={() => {
                              setPlaybackSpeed(s);
                              setShowSpeedPopup(false);
                            }}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all ${playbackSpeed === s ? 'bg-blue-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                          >
                            {s.toFixed(1)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {language === 'Vietnamese' && (
                    <div className="flex bg-gray-200/50 p-1.5 rounded-full shadow-inner ring-1 ring-black/5">
                      <button
                        onClick={() => handleAccentSwitch('north')}
                        className={`px-5 py-1.5 rounded-full text-[11px] font-black tracking-wider transition-all duration-300 ${vietnameseAccent === 'north' ? 'bg-white text-blue-600 shadow-md scale-105' : 'text-gray-400 hover:text-gray-500 hover:bg-gray-200'}`}
                      >
                        HANOI
                      </button>
                      <button
                        onClick={() => handleAccentSwitch('south')}
                        disabled={audioLoadingSouth && !southAudioUrl}
                        className={`px-5 py-1.5 rounded-full text-[11px] font-black tracking-wider transition-all duration-300 flex items-center gap-1.5 ${vietnameseAccent === 'south' ? 'bg-white text-blue-600 shadow-md scale-105' : 'text-gray-400 hover:text-gray-500 hover:bg-gray-200 disabled:opacity-30'}`}
                      >
                        {audioLoadingSouth && !southAudioUrl ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span className="animate-pulse">LOADING</span>
                          </>
                        ) : (
                          "SAIGON"
                        )}
                      </button>
                    </div>
                  )}

                </div>

                <div className="flex items-center gap-6">
                  <button
                    onClick={handlePrev}
                    className="p-3 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
                  >
                    <ChevronRight className="w-8 h-8 rotate-180" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="w-14 h-14 bg-blue-500 text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-blue-600 hover:scale-110 active:scale-95 transition-all"
                  >
                    {isPlaying ? (
                      <div className="flex gap-1 items-center">
                        <div className="w-1.5 h-6 bg-white rounded-full animate-pulse" />
                        <div className="w-1.5 h-6 bg-white rounded-full animate-pulse delay-75" />
                      </div>
                    ) : (
                      <Play className="w-8 h-8 fill-current ml-1" />
                    )}
                  </button>
                  <button
                    onClick={handleNext}
                    className="p-3 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
                  >
                    <ChevronRight className="w-8 h-8" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {/* Analysis Toggle */}
                  <button
                    onClick={() => setShowAnalysis(!showAnalysis)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${showAnalysis ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-100 border-gray-200 text-gray-400 opacity-60'}`}
                    title={showAnalysis ? "Hide Analysis" : "Show Analysis"}
                  >
                    <MessageSquare className="w-6 h-6 stroke-[2.5]" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">Analysis</span>
                  </button>

                  <button
                    onClick={() => setRepeatMode(prev => prev === 'sentence' ? 'session' : 'sentence')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all bg-blue-50 border-blue-200 text-blue-600 shadow-sm shadow-blue-100`}
                  >
                    {repeatMode === 'sentence' ? (
                      <div className="relative">
                        <RefreshCw className="w-6 h-6 stroke-[3]" />
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-black">1</span>
                      </div>
                    ) : (
                      <RefreshCw className={`w-6 h-6 stroke-[3] ${repeatMode === 'session' ? 'animate-spin-slow' : ''}`} />
                    )}
                    <span className="text-[9px] font-black uppercase tracking-tighter tracking-widest">{repeatMode === 'sentence' ? '1-LOOP' : 'S-LOOP'}</span>
                  </button>

                </div>
              </div>

              <div className="flex justify-between mt-1 px-1">
                <span className="text-[10px] font-mono text-gray-400">{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
                <span className="text-[10px] font-mono text-gray-400">{new Date(duration * 1000).toISOString().substr(14, 5)}</span>
              </div>
            </div>
          </div>
        )
      }

      {/* History Slide-over */}
      {
        showHistory && (
          <div className="absolute inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
            <div className="w-full md:w-96 bg-white border-l border-gray-200 h-full ml-auto relative z-10 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <HistoryIcon className="w-5 h-5" /> History
                </h2>
                <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {history.map(item => (
                  <div key={item.id} onClick={() => loadSession(item)} className="p-4 bg-gray-50 hover:bg-white hover:shadow-md rounded-xl border border-gray-200 cursor-pointer group transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono text-gray-400">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => deleteHistoryItem(e, item.id)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-gray-800 font-medium line-clamp-2 mb-1">{item.input}</p>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">{item.language}</span>
                      <span>{item.sets.length} Sets</span>
                    </div>
                  </div>
                ))}
                {history.length === 0 && (
                  <p className="text-center text-gray-400 mt-10">No history yet.</p>
                )}
              </div>
            </div>
          </div>
        )
      }
    </main >
  );
}
