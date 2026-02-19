'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, RefreshCw, MessageSquare, Mic, History as HistoryIcon, Trash2, X, ChevronRight, Settings, Globe, Pause, Volume2, Music, BookOpen, Languages } from 'lucide-react';
import { mergeAudioToWav } from '../utils/audioMerge';
import { saveSession, getSessions, deleteSession, clearSessions, SavedSession } from '../utils/storage';
import { generateExportHTML } from '../utils/exportTemplate';

interface ScriptItem {
  speaker: string;
  text: string;
  translation: string;

  word_analysis?: string | WordAnalysisObj[];
  segmentIndex?: number;
}

export interface WordAnalysisObj {
  word: string;
  meaning: string;
  grammar: string;
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

  // Merged Audio Mode State
  const [isMergedMode, setIsMergedMode] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const [audioTimeline, setAudioTimeline] = useState<{ start: number, end: number, index: number }[]>([]);
  const mergedAudioRef = useRef<HTMLAudioElement | null>(null);

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
  const [showInputModal, setShowInputModal] = useState(false);
  const [tempInput, setTempInput] = useState('');

  // Dual Audio Refs for Ping-Pong Playback
  const audioRefA = useRef<HTMLAudioElement | null>(null);
  const audioRefB = useRef<HTMLAudioElement | null>(null);
  const activePlayerRef = useRef<'A' | 'B' | 'Merged'>('A');

  const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // To avoid rapid switching issues
  const isSwitchingRef = useRef(false);
  const boundaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPlayedUrlRef = useRef<string | null>(null);

  // REFS for Direct Drive (Background Playback)
  // We need these to be accessible in event handlers without depending on closure state
  // which might be stale if the UI thread is throttled.
  const generatedSetsRef = useRef(generatedSets);
  const audioUrlsRef = useRef(audioUrls);
  const audioUrlsSouthRef = useRef(audioUrlsSouth);
  const currentSentenceIndexRef = useRef(currentSentenceIndex);
  const isGapActiveRef = useRef(isGapActive);
  const repeatModeRef = useRef(repeatMode);
  const languageRef = useRef(language);
  const vietnameseAccentRef = useRef(vietnameseAccent);

  // Auto-play Trigger Ref
  const isGeneratingRef = useRef(false);

  // Sync Refs with State
  useEffect(() => {
    generatedSetsRef.current = generatedSets;
    audioUrlsRef.current = audioUrls;
    audioUrlsSouthRef.current = audioUrlsSouth;
    currentSentenceIndexRef.current = currentSentenceIndex;
    isGapActiveRef.current = isGapActive;
    repeatModeRef.current = repeatMode;
    languageRef.current = language;
    vietnameseAccentRef.current = vietnameseAccent;
  }, [generatedSets, audioUrls, audioUrlsSouth, currentSentenceIndex, isGapActive, repeatMode, language, vietnameseAccent]);


  useEffect(() => {
    if (audioRefA.current) audioRefA.current.playbackRate = playbackSpeed;
    if (audioRefB.current) audioRefB.current.playbackRate = playbackSpeed;
  }, [playbackSpeed, isPlaying]);



  // Helper: Merge Audio
  const mergeAudio = async (urls: AudioMap) => {
    if (Object.keys(urls).length === 0) return;
    setIsMerging(true);
    try {
      const sortedIndices = Object.keys(urls).map(Number).sort((a, b) => a - b);

      // 1. Fetch all blobs
      const blobs: Blob[] = [];
      for (const idx of sortedIndices) {
        const blob = await fetch(urls[idx]).then(r => r.blob());
        blobs.push(blob);
      }

      // 2. Transcode to WAV (Client-side)
      const { blob, duration, timeline: wavTimeline } = await mergeAudioToWav(blobs);

      // 3. Update Timeline
      const mappedTimeline = wavTimeline.map((item, i) => ({
        ...item,
        index: sortedIndices[i]
      }));

      const combinedUrl = URL.createObjectURL(blob);

      setMergedAudioUrl(combinedUrl);
      setAudioTimeline(mappedTimeline);
      console.log('Audio Merged (WAV):', mappedTimeline, 'Duration:', duration);

      // Enable merged mode automatically for stability
      setIsMergedMode(true);

    } catch (e) {
      console.error("Merge failed", e);
      setIsMergedMode(false);
    } finally {
      setIsMerging(false);
    }
  };

  // Effect: Auto-trigger merge when generation finishes
  useEffect(() => {
    if (!loading && !audioLoading && generatedSets.length > 0 && Object.keys(audioUrls).length > 0) {
      const activeUrls = (language === 'Vietnamese' && vietnameseAccent === 'south') ? audioUrlsSouth : audioUrls;
      if (Object.keys(activeUrls).length === totalSentences && totalSentences > 0) {
        mergeAudio(activeUrls);
      }
    }
  }, [loading, audioLoading, audioUrls, audioUrlsSouth, totalSentences, language, vietnameseAccent]);

  // Handle accent switching
  const handleAccentSwitch = (newAccent: 'north' | 'south') => {
    if (newAccent === vietnameseAccent) return;
    setVietnameseAccent(newAccent);

    // Reset merged audio if accent changes
    if (isMergedMode) {
      setMergedAudioUrl(null);
      // Effect will trigger re-merge
    }

    // With Dual Audio, simple switch might be complex. 
    // Re-trigger playSentence of current index to reload correct accent into Active Player
    if (currentSentenceIndex !== -1) {
      playSentence(currentSentenceIndex);
    }
  };

  // Helper: Get URL for an index (handles accents)
  const getUrlForIndex = React.useCallback((index: number) => {
    if (index < 0) return undefined;
    if (language === 'Vietnamese' && vietnameseAccent === 'south') {
      return audioUrlsSouth[index] || audioUrls[index];
    }
    return audioUrls[index];
  }, [language, vietnameseAccent, audioUrls, audioUrlsSouth]);

  // Helper: Determine next Step (Index)
  // Returns { index, url }
  const getNextStep = React.useCallback((currentIdx: number, total: number, sets: GeneratedSet[], mode: 'session' | 'sentence' | 'none') => {
    let nextIdx = currentIdx;

    // Handle Sentence Loop IMMEDIATELY
    if (mode === 'sentence') {
      return { index: currentIdx, url: getUrlForIndex(currentIdx) };
    }

    // Check for set boundary
    // In this simplified version, we just go to next index. 
    // If we wanted to "pause" between sets, we'd need a timer, not a silent audio track.
    // For now, continuous playback.

    nextIdx = currentIdx + 1;

    // Loop Handling
    if (nextIdx >= total) {
      nextIdx = 0; // Always loop
    }

    // Resolve URL
    let url = getUrlForIndex(nextIdx);
    // If no URL found (error?), stop? or skip? 
    // For robustness, if no URL, we might want to skip or just stop. 
    // Let's return what we have.

    return { index: nextIdx, url };
  }, [getUrlForIndex]);

  // Preload Next Track helper
  const preloadNextTrack = React.useCallback((nextStep: { index: number, url?: string } | null, targetPlayer: 'A' | 'B') => {
    const targetAudio = targetPlayer === 'A' ? audioRefA.current : audioRefB.current;
    if (!targetAudio || !nextStep || !nextStep.url) return;

    // console.log(`[Playback] Preloading ${targetPlayer}: Idx=${nextStep.index}`);
    targetAudio.src = nextStep.url;
    targetAudio.load();
  }, []);



  // Auto-scroll
  // Auto-scroll definition
  const scrollToActive = React.useCallback(() => {
    if (currentSentenceIndex !== -1) {
      const activeElement = scrollRefs.current[`${currentSentenceIndex}`];
      if (activeElement) {
        // Use 'nearest' or 'center' might be better for toggle, but 'start' is fine if we want consistency
        // However, if we toggle off, 'start' might be jarring if it was already visible.
        // Let's stick to 'start' ensuring it moves to the top so user can see context below.
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [currentSentenceIndex]);

  // Auto-scroll Trigger
  useEffect(() => {
    // Delay slightly to allow layout to update after toggle
    const t = setTimeout(() => {
      scrollToActive();
    }, 100);
    return () => clearTimeout(t);
  }, [currentSentenceIndex, showAnalysis, scrollToActive]);

  const togglePlay = React.useCallback(() => {
    // Use ref for latest value to avoid stale closure
    const currentIdx = currentSentenceIndexRef.current;

    // Handling initial start (only when truly never played)
    if (currentIdx === -1 && totalSentences > 0) {
      const url = getUrlForIndex(0);
      if (!url) {
        console.warn("Initial play failed: No URL for index 0");
        return;
      }
      // Use handlersRef to avoid dependency on playSentence (declared later)
      handlersRef.current.playSentence?.(0);
      return;
    }

    if (isPlaying) {
      // PAUSE
      if (activePlayerRef.current === 'Merged' && mergedAudioRef.current) {
        mergedAudioRef.current.pause();
      } else {
        const activeAudio = activePlayerRef.current === 'A' ? audioRefA.current : audioRefB.current;
        activeAudio?.pause();
        const otherAudio = activePlayerRef.current === 'A' ? audioRefB.current : audioRefA.current;
        otherAudio?.pause();
      }
      setIsPlaying(false);
    } else {
      // RESUME from paused position
      if (activePlayerRef.current === 'Merged' && mergedAudioRef.current) {
        mergedAudioRef.current.playbackRate = playbackSpeed;
        mergedAudioRef.current.play().catch(console.error);
      } else if (isMergedMode && mergedAudioRef.current) {
        // Was in merged mode but activePlayerRef got reset — resume merged
        activePlayerRef.current = 'Merged';
        mergedAudioRef.current.playbackRate = playbackSpeed;
        mergedAudioRef.current.play().catch(console.error);
      } else {
        const activeAudio = activePlayerRef.current === 'A' ? audioRefA.current : audioRefB.current;
        if (activeAudio) {
          activeAudio.playbackRate = playbackSpeed;
          activeAudio.play().catch(e => console.error("Play failed", e));
        }
      }
      setIsPlaying(true);
    }
  }, [isPlaying, playbackSpeed, totalSentences, getUrlForIndex, isMergedMode]);

  const playSentence = React.useCallback((index: number) => {
    if (index < 0 || index >= totalSentences) return;

    const url = getUrlForIndex(index);
    if (!url) {
      console.warn(`PlaySentence failed: No URL for index ${index}`);
      return;
    }

    // 1. Reset State
    setIsPlaying(true);
    setCurrentSentenceIndex(index);
    setIsGapActive(false);

    // 2. Setup Active Player
    // For manual jumps, use 'A' to ensure clean slate.
    activePlayerRef.current = 'A';
    const activeAudio = audioRefA.current;
    const inactiveAudio = audioRefB.current;

    if (isMergedMode && mergedAudioRef.current) {
      // Merged Mode Seek
      const segment = audioTimeline.find(s => s.index === index);
      if (segment) {
        activePlayerRef.current = 'Merged';
        // Stop others
        audioRefA.current?.pause();
        audioRefB.current?.pause();

        mergedAudioRef.current.currentTime = segment.start;
        mergedAudioRef.current.playbackRate = playbackSpeed;
        mergedAudioRef.current.play().catch(console.error);
      }
    } else if (activeAudio && inactiveAudio) {
      // Stop B
      inactiveAudio.pause();
      inactiveAudio.currentTime = 0;

      // Play A
      activeAudio.src = url;
      activeAudio.currentTime = 0;
      activeAudio.playbackRate = playbackSpeed;
      activeAudio.play().catch(e => console.error("Manual jump play failed", e));

      // 3. Preload Next into B
      const nextStep = getNextStep(index, totalSentences, generatedSets, repeatMode);
      if (nextStep) {
        preloadNextTrack(nextStep, 'B');
      }
      // 4. Update Media Session Position State (Best Effort)
      if ('mediaSession' in navigator) {
        // We can't know exact duration yet if not loaded, but we try
      }

    }

    // Synchro Refs
    currentSentenceIndexRef.current = index;
    isGapActiveRef.current = false; // Gap logic removed

  }, [totalSentences, getUrlForIndex, getNextStep, generatedSets, repeatMode, playbackSpeed, preloadNextTrack, isMergedMode, audioTimeline]);

  const handleTrackEnded = React.useCallback((playerKey: 'A' | 'B') => {
    // Only handle if this is the active player
    if (playerKey !== activePlayerRef.current) return;

    console.log(`[DualPlayback] ${playerKey} Ended. Idx=${currentSentenceIndexRef.current} Mode=${repeatModeRef.current}`);

    // IMMEDIATE LOOP SHORTCUT (Single Player Loop)
    // If sentnece mode, just replay current audio. No switching needed.
    if (repeatModeRef.current === 'sentence') {
      const activeAudio = playerKey === 'A' ? audioRefA.current : audioRefB.current;
      if (activeAudio) {
        activeAudio.currentTime = 0;
        activeAudio.play().catch(e => console.error("Loop re-play failed", e));
        return;
      }
    }

    // 1. Calculate Next Step based on Recents
    const currIdx = currentSentenceIndexRef.current;
    // const currGap = isGapActiveRef.current; // Removed
    const total = generatedSetsRef.current.reduce((acc, set) => acc + set.script.length, 0);

    const nextStep = getNextStep(currIdx, total, generatedSetsRef.current, repeatModeRef.current);

    if (!nextStep) {
      setIsPlaying(false);
      return;
    }

    // 2. Switch Active Player
    const nextPlayerKey = playerKey === 'A' ? 'B' : 'A';
    activePlayerRef.current = nextPlayerKey;
    const nextAudio = nextPlayerKey === 'A' ? audioRefA.current : audioRefB.current;

    // 3. Play Next (It should be preloaded)
    if (nextAudio) {
      // Just play. It was preloaded.
      nextAudio.playbackRate = playbackSpeed; // Ensure speed persists
      const playPromise = nextAudio.play();
      playPromise.catch(e => {
        console.error(`[DualPlayback] Auto-play failed for ${nextPlayerKey}`, e);
        // Retry logic could go here
        if (nextStep.url) {
          nextAudio.src = nextStep.url;
          nextAudio.play();
        }
      });

      // Metadata Update REMOVED (Background Playback Disabled)
    }

    // 4. Update UI State
    currentSentenceIndexRef.current = nextStep.index;
    isGapActiveRef.current = false;
    setCurrentSentenceIndex(nextStep.index);
    setIsGapActive(false);

    // 5. Preload *Next-Next* into the (now) Inactive Player (the old playerKey)
    const nextNextStep = getNextStep(nextStep.index, total, generatedSetsRef.current, repeatModeRef.current);
    preloadNextTrack(nextNextStep, playerKey);

  }, [getNextStep, playbackSpeed, preloadNextTrack]);

  // Media Session Updates
  useEffect(() => {
    if ('mediaSession' in navigator && currentSentenceIndex !== -1 && generatedSets.length > 0) {
      const total = generatedSetsRef.current.reduce((acc, set) => acc + set.script.length, 0);

      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Sentence ${currentSentenceIndex + 1} of ${total}`,
        artist: "RealWait Roleplay",
        album: generatedSetsRef.current[0]?.input || "Roleplay Session",
        artwork: [
          { src: '/icon.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      // Update position state for better sync on lock screen
      if (activePlayerRef.current === 'Merged' && mergedAudioRef.current && mergedAudioRef.current.duration) {
        try {
          navigator.mediaSession.setPositionState({
            duration: mergedAudioRef.current.duration,
            playbackRate: mergedAudioRef.current.playbackRate || 1.0,
            position: mergedAudioRef.current.currentTime
          });
        } catch (e) {
          console.warn("setPositionState failed", e);
        }
      }

      navigator.mediaSession.setActionHandler('play', () => handlersRef.current.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => handlersRef.current.togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => handlersRef.current.handlePrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => handlersRef.current.handleNext());

      // Add seeking support for background playback
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && activePlayerRef.current === 'Merged' && mergedAudioRef.current) {
          mergedAudioRef.current.currentTime = details.seekTime;
        }
      });
    }
  }, [currentSentenceIndex, generatedSets, isPlaying]);

  const handleNext = React.useCallback(() => {
    // Manual Next Click
    // Logic: Force jump to next index.
    const currIdx = currentSentenceIndex;
    let nextIdx = currIdx + 1;
    const total = generatedSetsRef.current.reduce((acc, set) => acc + set.script.length, 0);

    if (nextIdx >= total) {
      nextIdx = 0;
    }
    playSentence(nextIdx);
  }, [currentSentenceIndex, repeatMode, playSentence]);

  const handlePrev = React.useCallback(() => {
    // Active Audio Check
    const activeAudio = activePlayerRef.current === 'A' ? audioRefA.current : audioRefB.current;
    if (activeAudio && activeAudio.currentTime > 2) {
      activeAudio.currentTime = 0;
      return;
    }
    const total = generatedSetsRef.current.reduce((acc, set) => acc + set.script.length, 0);
    let prevIdx = currentSentenceIndex - 1;
    if (prevIdx < 0) prevIdx = total - 1;
    playSentence(prevIdx);
  }, [currentSentenceIndex, playSentence]);

  // Keyboard Shortcuts
  // Keyboard Shortcuts (Stable via Ref)

  const handlersRef = useRef({ togglePlay, handlePrev, handleNext, setRepeatMode, playSentence, setShowAnalysis });

  // Keep ref updated
  useEffect(() => {
    handlersRef.current = { togglePlay, handlePrev, handleNext, setRepeatMode, playSentence, setShowAnalysis };
    // MediaSession handler removed
  }, [togglePlay, handlePrev, handleNext, setRepeatMode, playSentence, setShowAnalysis]);

  useEffect(() => {
    console.log('[Shortcuts] Initializing keyboard listener on document...');

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore IME composition (CJK)
      if (e.isComposing) return;

      // Ignore if typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]');

      // Special case: if target is input but user is just hitting arrow keys/space 
      // AND they are not actually focused in the text part? (Unlikely to detect)
      // Standard return if focused in input.
      if (isInput) return;

      const key = e.key;
      const code = e.code;

      console.log(`[Shortcuts] Detected: key="${key}" code="${code}"`);

      // Space: Play/Pause
      if (key === ' ' || code === 'Space') {
        e.preventDefault();
        console.log('[Shortcuts] Action: TogglePlay');
        handlersRef.current.togglePlay();
      }
      // ArrowLeft: Prev
      else if (key === 'ArrowLeft' || code === 'ArrowLeft') {
        e.preventDefault();
        console.log('[Shortcuts] Action: Prev');
        handlersRef.current.handlePrev();
      }
      // ArrowRight: Next
      else if (key === 'ArrowRight' || code === 'ArrowRight') {
        e.preventDefault();
        console.log('[Shortcuts] Action: Next');
        handlersRef.current.handleNext();
      }
      // Enter: Repeat Mode
      else if (key === 'Enter' || code === 'Enter') {
        e.preventDefault();
        console.log('[Shortcuts] Action: RepeatMode Toggle');
        handlersRef.current.setRepeatMode(prev => prev === 'sentence' ? 'session' : 'sentence');
      }
      // B: Toggle Word Analysis
      else if (key.toLowerCase() === 'b' || code === 'KeyB') {
        e.preventDefault();
        console.log('[Shortcuts] Action: Toggle Word Analysis');
        handlersRef.current.setShowAnalysis(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []); // Empty dependency array = Stable listener

  // Dual Audio Event Handlers
  useEffect(() => {
    const audioA = audioRefA.current;
    const audioB = audioRefB.current;
    if (!audioA || !audioB) return;

    // Time Update: Only from active player
    const handleTimeUpdateA = () => {
      if (activePlayerRef.current === 'A' && document.visibilityState === 'visible') setCurrentTime(audioA.currentTime);
    };
    const handleTimeUpdateB = () => {
      if (activePlayerRef.current === 'B' && document.visibilityState === 'visible') setCurrentTime(audioB.currentTime);
    };

    // Duration
    const handleDurationA = () => { if (activePlayerRef.current === 'A') setDuration(audioA.duration); };
    const handleDurationB = () => { if (activePlayerRef.current === 'B') setDuration(audioB.duration); };

    // Ended
    const handleEndedA = () => handleTrackEnded('A');
    const handleEndedB = () => handleTrackEnded('B');

    audioA.addEventListener('timeupdate', handleTimeUpdateA);
    audioB.addEventListener('timeupdate', handleTimeUpdateB);
    audioA.addEventListener('durationchange', handleDurationA);
    audioB.addEventListener('durationchange', handleDurationB);
    audioA.addEventListener('ended', handleEndedA);
    audioB.addEventListener('ended', handleEndedB);

    return () => {
      audioA.removeEventListener('timeupdate', handleTimeUpdateA);
      audioB.removeEventListener('timeupdate', handleTimeUpdateB);
      audioA.removeEventListener('durationchange', handleDurationA);
      audioB.removeEventListener('durationchange', handleDurationB);
      audioA.removeEventListener('ended', handleEndedA);
      audioB.removeEventListener('ended', handleEndedB);
    };
  }, [handleTrackEnded]);

  // Merged Audio Listeners
  useEffect(() => {
    const mAudio = mergedAudioRef.current;
    if (!mAudio) return;

    const handleTimeUpdate = () => {
      if (!isMergedMode) return;
      const t = mAudio.currentTime;
      setCurrentTime(t);

      // Loop Logic for Single Sentence (1-L)
      if (repeatModeRef.current === 'sentence') {
        const currentIdx = currentSentenceIndexRef.current;
        const currentSegment = audioTimeline.find(s => s.index === currentIdx);

        if (currentSegment) {
          // If we passed the end of the segment, loop back
          // Use a small buffer (e.g., 0.1s) to prevent jarring loops if data is slightly off
          if (t >= currentSegment.end - 0.1) { // Added small buffer for smoother transition near end
            mAudio.currentTime = currentSegment.start;
            mAudio.play().catch(console.error);
            return;
          }
        }
      }

      // Sync active segment for UI highlighting
      const segment = audioTimeline.find(s => t >= s.start && t < s.end);
      if (segment && segment.index !== currentSentenceIndexRef.current) {
        // Only update if we are NOT in sentence mode (or if logic failed above)
        // Actually, if we are in sentence mode, we shouldn't be here unless we drifted into next segment
        // Enforce current index if sentence mode?
        if (repeatModeRef.current !== 'sentence') {
          setCurrentSentenceIndex(segment.index);
          currentSentenceIndexRef.current = segment.index;
        }
      }
    };

    const handleEnded = () => {
      // Loop logic for merged is simple: 
      // If session loop, just play from 0.
      // If 1-L, seek to start of current segment? (This is hard in merged)
      // Actually, 1-L in merged mode means we keep seeking back to segment.start

      if (repeatModeRef.current === 'session') {
        mAudio.currentTime = 0;
        mAudio.play().catch(console.error);
      } else if (repeatModeRef.current === 'sentence') {
        // Fallback: If for some reason timeupdate didn't catch the loop, seek back to segment start
        const currentIdx = currentSentenceIndexRef.current;
        const currentSegment = audioTimeline.find(s => s.index === currentIdx);
        if (currentSegment) {
          mAudio.currentTime = currentSegment.start;
          mAudio.play().catch(console.error);
        } else {
          mAudio.currentTime = 0;
          mAudio.play().catch(console.error);
        }
      } else {
        setIsPlaying(false);
      }
    };

    // Loop for single sentence check (optional: could do in timeupdate) by checking if t > segment.end -> seek segment.start

    mAudio.addEventListener('timeupdate', handleTimeUpdate);
    mAudio.addEventListener('ended', handleEnded);
    return () => {
      mAudio.removeEventListener('timeupdate', handleTimeUpdate);
      mAudio.removeEventListener('ended', handleEnded);
    }
  }, [audioTimeline, isMergedMode]);

  // Rate update for merged
  useEffect(() => {
    if (mergedAudioRef.current) {
      mergedAudioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);




  const [history, setHistory] = useState<SavedSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) setApiKey(storedKey);

    const storedModel = localStorage.getItem('gemini_model_type');
    if (storedModel) setModelType(storedModel);

    // Initial load
    loadHistory();
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
    // Blur any active input to enable shortcuts immediately
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setLoading(true);
    setAudioLoading(true);
    setProgress('Initializing...');
    setGeneratedSets([]);
    setAudioUrls({});
    setAudioUrlsSouth({});
    setCurrentSentenceIndex(-1);
    setError(null);
    isGeneratingRef.current = true; // Mark as user-initiated generation

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
          // If 0 turns in roleplay mode -> Monologue
          mode,
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

      // Auto-play if initiated by user generation
      if (isGeneratingRef.current) {
        console.log("Auto-playing after generation...");
        playSentence(0);
        isGeneratingRef.current = false;
      }
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
    <main className="min-h-screen px-0 py-2 md:p-2 flex flex-col gap-4 relative overflow-x-hidden bg-gray-50">
      {/* Background decoration */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-blue-200/40 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-purple-200/40 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header & Controls */}
      <div className="w-full space-y-4 z-10 transition-all px-2 md:px-0">
        <div className="glass px-4 lg:px-6 py-4 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white shadow-sm border border-gray-200">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 lg:gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl lg:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-900 to-indigo-900 tracking-tighter">
                  RealWait
                </h1>
                <p className="text-gray-900 text-[10px] font-bold uppercase tracking-widest">Roleplay Gen</p>
              </div>
              <div className="flex lg:hidden gap-2">
                <button onClick={() => setShowHistory(true)} className="p-2 rounded-lg bg-gray-100 border border-gray-300 text-black"><HistoryIcon className="w-4 h-4" /></button>
                <button onClick={() => setShowAdvanced(!showAdvanced)} className="p-2 rounded-lg bg-gray-100 border border-gray-300 text-black"><Settings className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="h-px lg:h-8 w-full lg:w-px bg-gray-100" />

            {/* Main Action Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
              <div
                className="relative flex-1 lg:w-96 cursor-pointer"
                onClick={() => {
                  setTempInput(input);
                  setShowInputModal(true);
                }}
              >
                <div className="w-full bg-white border border-gray-300 rounded-xl py-2.5 px-4 text-sm text-black font-medium transition-all hover:border-gray-400 min-h-[42px] flex items-center overflow-hidden whitespace-nowrap overflow-ellipsis">
                  {input || (mode === 'roleplay' ? "Enter topic or word..." : "Enter sentence to analyze...")}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className={`px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm shadow-md transition-all ${loading ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900 active:scale-95'
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
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all flex items-center gap-1 ${mode === 'roleplay' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'}`}
              >
                <RefreshCw className={`w-3 h-3 ${mode === 'roleplay' && loading ? 'animate-spin' : ''}`} />
                ROLEPLAY
              </button>
              <button
                onClick={() => setMode('analysis')}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all flex items-center gap-1 ${mode === 'analysis' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'}`}
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
                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black transition-all ${language === lang ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'}`}
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
                  <MessageSquare className="w-3 h-3 text-black" />
                  <span className="w-4 text-center text-[10px] font-bold text-black">{turnCount === 0 ? 'M' : turnCount}</span>
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">Turns</span>
                </button>

                {showTurnsPopup && (
                  <div className="fixed inset-0 z-40" onClick={() => setShowTurnsPopup(false)} />
                )}
              </div>
            )}

            <div className="hidden lg:flex items-center gap-2">
              {/* Background Readiness Indicator */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${isMergedMode && mergedAudioUrl ? 'bg-green-50 border-green-200 text-green-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                title={isMerging ? "Preparing Background Play..." : (mergedAudioUrl ? "Background Ready" : "Initializing...")}
              >
                {isMerging ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Music className="w-4 h-4" />
                )}
                <span className="text-[10px] font-black uppercase tracking-tight">
                  {isMerging ? 'Preparing' : (mergedAudioUrl ? 'BG READY' : 'WAIT')}
                </span>
              </div>

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
                onChange={(e) => {
                  const newModel = e.target.value;
                  setModelType(newModel);
                  localStorage.setItem('gemini_model_type', newModel);
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 outline-none font-bold text-black"
              >
                <option value="gemini-2.0-flash">Gemini 2 Flash</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
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
          <div className="glass p-1 md:p-6 rounded-none md:rounded-3xl min-h-screen flex flex-col bg-white shadow-sm border-0 md:border border-gray-300 mb-24 md:mb-20">



            {/* Script Viewer */}
            <div className="space-y-2 md:space-y-4">
              {generatedSets.map((set, setIdx) => (
                <div key={set.id} className="space-y-1">
                  {/* Set Divider - Only show Topic if only one set, or fully labeled if multiple */}
                  {generatedSets.length > 1 ? (
                    <div className="relative flex items-center justify-center pt-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200"></div>
                      </div>
                      <span className="relative bg-white px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Set {setIdx + 1}
                      </span>
                    </div>
                  ) : null}

                  {set.script.map((line, idx) => {
                    const isActive = currentSentenceIndex === line.segmentIndex;
                    const segmentKey = `${line.segmentIndex}`;

                    return (
                      <div
                        key={idx}
                        ref={el => { scrollRefs.current[segmentKey] = el; }}
                        // Mobile: Always flex-col (stacked), No gap.
                        className={`flex flex-col md:gap-2 group transition-all duration-500 scroll-mt-24 md:scroll-mt-28 snap-start snap-always
                          ${line.speaker === 'A' ? 'md:flex-row' : 'md:flex-row-reverse'} 
                          ${isActive ? 'scale-[1.00] md:scale-[1.02]' : ''}`}
                      >
                        <div className={`hidden md:flex w-10 h-10 rounded-full items-center justify-center shrink-0 font-bold text-sm shadow-md transition-all ${isActive
                          ? 'ring-4 ring-black/20 ring-offset-2 scale-110'
                          : ''
                          } ${line.speaker === 'A' ? 'bg-black text-white' : 'bg-gray-200 text-black border border-gray-400'
                          }`}>
                          {line.speaker}
                        </div>
                        <div
                          // Mobile: w-full.
                          className={`w-full md:max-w-[85%] p-2 md:p-3 rounded-none md:rounded-2xl transition-all relative group/item shadow-sm border-b md:border border-gray-200 md:border-gray-200 cursor-pointer ${isActive
                            ? 'border-l-4 border-l-purple-600 bg-purple-50/30 ring-0 md:ring-1 ring-purple-100 shadow-md'
                            : (line.speaker === 'A' ? 'bg-white hover:shadow-md' : 'bg-gray-50 hover:shadow-md')
                            }`}
                          onClick={() => playSentence(line.segmentIndex!)}
                        >
                          <div className="flex flex-col md:block">
                            {/* Mobile Speaker Badge */}
                            <div className={`flex md:hidden items-center gap-2 mb-1`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${line.speaker === 'A' ? 'bg-black text-white' : 'bg-gray-200 text-black border border-gray-400'
                                }`}>
                                {line.speaker}
                              </div>
                            </div>

                            <div className="flex justify-between items-start gap-4">
                              <p className="text-lg md:text-xl font-bold text-black mb-0 leading-relaxed flex-1 text-left">{line.text}</p>
                            </div>
                          </div>
                          {showAnalysis && (
                            <div className="mt-1 pt-1 border-t border-gray-100 space-y-2 animate-in fade-in duration-300">
                              {/* Translation */}
                              <div className="bg-gray-50 rounded-xl p-1.5 md:p-2 border border-gray-200">
                                <div className="flex items-center gap-2 mb-2 text-black">
                                  <Languages className="w-4 h-4" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Translation</span>
                                </div>
                                <p className="text-black font-bold leading-relaxed">{line.translation}</p>
                              </div>





                              {/* Word Analysis */}
                              {line.word_analysis && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-emerald-700 pl-1">
                                    <BookOpen className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Word Analysis</span>
                                  </div>
                                  <div className="bg-white border border-gray-300 rounded-2xl overflow-hidden shadow-sm">
                                    {Array.isArray(line.word_analysis) ? (
                                      line.word_analysis
                                        .filter(item => {
                                          const cleanWord = item.word?.trim();
                                          return cleanWord && !(/^[\p{P}\p{S}]+$/u.test(cleanWord));
                                        })
                                        .map((item, wIdx, arr) => (
                                          <div key={wIdx} className={`px-3 md:px-4 py-1.5 flex items-start gap-2 hover:bg-emerald-50/50 transition-colors ${wIdx !== arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                            <div className="shrink-0 max-w-[30%] w-full break-words">
                                              <span className="text-emerald-700 font-bold text-base">{item.word}</span>
                                            </div>
                                            <div className="flex-1">
                                              <p className="text-black font-bold text-sm leading-snug">{item.meaning}</p>
                                              {item.grammar && (
                                                <p className="text-black text-xs mt-0.5 leading-snug">{item.grammar}</p>
                                              )}
                                            </div>
                                          </div>
                                        ))
                                    ) : (
                                      (line.word_analysis as string).split('\n').filter((w: string) => w.trim()).map((wordLine: string, wIdx: number, arr: string[]) => {
                                        const cleanLine = wordLine.replace(/^•\s*/, '');
                                        const parts = cleanLine.split('|').map((s: string) => s.trim());
                                        const word = parts[0];
                                        const meaning = parts[1] || '';
                                        const grammarRole = parts[2] || '';
                                        return (
                                          <div key={wIdx} className={`px-4 py-3 flex items-start gap-2 hover:bg-emerald-50/50 transition-colors ${wIdx !== arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                            <div className="shrink-0 max-w-[30%] w-full break-words">
                                              <span className="text-emerald-700 font-bold text-base">{word}</span>
                                            </div>
                                            <div className="flex-1">
                                              <p className="text-black font-bold text-sm leading-snug">{meaning}</p>
                                              {grammarRole && (
                                                <p className="text-black text-xs mt-0.5 leading-snug">{grammarRole}</p>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
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

      {/* Dual Audio Engine */}
      <audio
        ref={audioRefA}
        className="hidden"
        preload="auto"
        playsInline
      />
      <audio
        ref={audioRefB}
        className="hidden"
        preload="auto"
        playsInline
      />
      {/* Merged Audio Engine */}
      <audio
        ref={mergedAudioRef}
        src={mergedAudioUrl || undefined}
        className="hidden"
        preload="auto"
        playsInline
        loop={isMergedMode && repeatMode === 'session'}
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
                  <div className="relative">
                    <button
                      onClick={() => setShowSpeedPopup(!showSpeedPopup)}
                      className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-2 bg-gray-50 rounded-full text-[10px] md:text-sm font-bold text-gray-700 hover:bg-gray-100 w-16 md:w-20 justify-center"
                    >
                      <RefreshCw className="w-3 md:w-4 h-3 md:h-4 text-blue-500" />
                      {playbackSpeed.toFixed(1)}x
                    </button>
                    {showSpeedPopup && (
                      <div className="absolute bottom-16 left-0 bg-white border border-gray-200 p-4 w-[280px] shadow-2xl rounded-2xl flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200 origin-bottom-left">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-gray-500 uppercase">Speed Control</span>
                          <span className="text-sm font-black text-blue-600">{playbackSpeed.toFixed(1)}x</span>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          {Array.from({ length: 16 }, (_, i) => (0.5 + i * 0.1).toFixed(1)).map((speedStr) => {
                            const speed = parseFloat(speedStr);
                            const isSelected = Math.abs(playbackSpeed - speed) < 0.01;
                            return (
                              <button
                                key={speedStr}
                                onClick={() => {
                                  setPlaybackSpeed(speed);
                                  // Keep popup open for rapid adjustment, or uncomment to close:
                                  // setShowSpeedPopup(false); 
                                }}
                                className={`py-2 rounded-lg text-xs font-bold transition-all ${isSelected
                                  ? 'bg-blue-600 text-white shadow-md scale-105'
                                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-blue-600'
                                  }`}
                              >
                                {speedStr}
                              </button>
                            );
                          })}
                        </div>

                      </div>
                    )}
                  </div>

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
                    <button onClick={(e) => deleteHistoryItem(e, session.id)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-md transition-all border border-red-100 shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button>
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

      {/* Root Level Turns Popup - Moved here to prevent z-index stacking issues / overflow clipping in the header */}
      {showTurnsPopup && (
        <>
          <div className="fixed inset-0 z-[100] bg-black/10 backdrop-blur-[1px]" onClick={() => setShowTurnsPopup(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] bg-white border border-gray-200 shadow-2xl rounded-2xl p-4 w-72 grid grid-cols-6 gap-2 animate-in zoom-in-95 duration-200">
            <div className="col-span-6 text-center text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest w-full">Select Turns</div>
            <div className="col-span-6 flex justify-center gap-2 flex-wrap">
              {/* Added 0 explicitly for Monologue mode */}
              {[0, 1, 2, 3, 4, 5].map(num => (
                <button
                  key={num}
                  onClick={() => { setTurnCount(num); setShowTurnsPopup(false); }}
                  className={`w-10 h-10 flex items-center justify-center text-sm font-bold rounded-xl transition-all ${turnCount === num ? 'bg-black text-white shadow-lg scale-105' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                >
                  {num === 0 ? 'M' : num}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {/* Root Level Input Modal */}
      {showInputModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowInputModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Enter Context</h3>
                <button onClick={() => setShowInputModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              <textarea
                autoFocus
                value={tempInput}
                onChange={(e) => setTempInput(e.target.value)}
                placeholder={mode === 'roleplay' ? "Describe a situation, conversation topic, or just a word..." : "Paste the sentence you want to analyze verbatim..."}
                className="w-full h-48 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-black font-medium focus:ring-2 focus:ring-black outline-none resize-none"
              />
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setTempInput('')}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-all"
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    setInput(tempInput);
                    setShowInputModal(false);
                  }}
                  className="flex-1 bg-black text-white py-2.5 rounded-xl font-bold text-sm shadow-lg hover:bg-gray-900 active:scale-95 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main >
  );
}
