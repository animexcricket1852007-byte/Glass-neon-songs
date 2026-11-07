import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProjectState, WordTiming, LyricLine } from '../types/lyrics';
import {
  Play,
  Pause,
  RotateCcw,
  Undo2,
  Gauge,
  Download,
  Upload,
  Activity,
  Sparkles,
  Trash2,
  AlertCircle,
  Volume2,
  Check,
} from 'lucide-react';

interface TapSyncTabProps {
  state: ProjectState;
  onChange: (updater: (prev: ProjectState) => ProjectState) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onDetectBeats: () => void;
  isDetectingBeats: boolean;
}

export const TapSyncTab: React.FC<TapSyncTabProps> = ({
  state,
  onChange,
  audioRef,
  onDetectBeats,
  isDetectingBeats,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [activeWordGlobalIndex, setActiveWordGlobalIndex] = useState<number>(0);
  const [draggingWordId, setDraggingWordId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMsg, setAiSuccessMsg] = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const duration = state.metadata.duration || 38;

  // Flatten all words across all lines into an ordered array
  const allWords = React.useMemo(() => {
    const list: {
      lineIndex: number;
      wordIndexInLine: number;
      word: string;
      lineText: string;
      globalIndex: number;
    }[] = [];

    let gIdx = 0;
    state.lines.forEach((l) => {
      l.words.forEach((w, wIdx) => {
        list.push({
          lineIndex: l.lineIndex,
          wordIndexInLine: wIdx,
          word: w,
          lineText: l.text,
          globalIndex: gIdx++,
        });
      });
    });
    return list;
  }, [state.lines]);

  // Audio timeupdate tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioRef]);

  // Sync playback rate with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, audioRef]);

  // Find next untimed word index
  useEffect(() => {
    const nextIdx = allWords.findIndex((item) => {
      return !state.wordTimings.some(
        (wt) => wt.lineIndex === item.lineIndex && wt.wordIndexInLine === item.wordIndexInLine
      );
    });
    if (nextIdx !== -1) {
      setActiveWordGlobalIndex(nextIdx);
    } else {
      setActiveWordGlobalIndex(allWords.length);
    }
  }, [state.wordTimings, allWords]);

  // Toggle playback
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  };

  // Rewind 3 seconds
  const rewind3s = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - 3);
  };

  // Record word tap at current audio time
  const handleTapWord = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const t = Number(audio.currentTime.toFixed(3));
    if (activeWordGlobalIndex >= allWords.length) return;

    const target = allWords[activeWordGlobalIndex];
    const newTiming: WordTiming = {
      id: `w-${target.lineIndex}-${target.wordIndexInLine}`,
      word: target.word,
      time: t,
      lineIndex: target.lineIndex,
      wordIndexInLine: target.wordIndexInLine,
    };

    onChange((prev) => {
      const filtered = prev.wordTimings.filter(
        (wt) => !(wt.lineIndex === target.lineIndex && wt.wordIndexInLine === target.wordIndexInLine)
      );
      const updated = [...filtered, newTiming].sort((a, b) => a.time - b.time);

      try {
        localStorage.setItem('glass_to_neon_lyrics_timings', JSON.stringify(updated));
      } catch (err) {
        console.error('localStorage save error:', err);
      }

      return {
        ...prev,
        wordTimings: updated,
      };
    });

    setActiveWordGlobalIndex((prev) => Math.min(allWords.length, prev + 1));
  }, [activeWordGlobalIndex, allWords, audioRef, onChange]);

  // Undo last tap
  const handleUndoTap = () => {
    if (state.wordTimings.length === 0) return;

    onChange((prev) => {
      const sorted = [...prev.wordTimings].sort((a, b) => a.time - b.time);
      sorted.pop();
      try {
        localStorage.setItem('glass_to_neon_lyrics_timings', JSON.stringify(sorted));
      } catch (e) {
        console.error(e);
      }
      return {
        ...prev,
        wordTimings: sorted,
      };
    });

    setActiveWordGlobalIndex((prev) => Math.max(0, prev - 1));
  };

  // Reset all taps
  const handleResetAllTaps = () => {
    if (window.confirm('Are you sure you want to reset all recorded word timings?')) {
      onChange((prev) => {
        try {
          localStorage.removeItem('glass_to_neon_lyrics_timings');
        } catch (e) {
          console.error(e);
        }
        return {
          ...prev,
          wordTimings: [],
        };
      });
      setActiveWordGlobalIndex(0);
      setAiSuccessMsg(null);
    }
  };

  // Keydown listener for spacebar tap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTapWord();
      } else if (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleUndoTap();
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTapWord]);

  // Spread words across lines based on line start times
  const spreadWords = (
    lines: LyricLine[],
    lineStartTimes: { lineIndex: number; startTime: number }[],
    totalDuration: number
  ): WordTiming[] => {
    const timingsMap = new Map<number, number>();
    lineStartTimes.forEach((item) => {
      timingsMap.set(item.lineIndex, item.startTime);
    });

    const newWordTimings: WordTiming[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const startTime = timingsMap.get(line.lineIndex) ?? (i * (totalDuration / lines.length));
      const nextLineStartTime =
        i < lines.length - 1
          ? timingsMap.get(lines[i + 1].lineIndex) ?? startTime + 3.5
          : Math.min(totalDuration - 0.8, startTime + Math.max(2.8, line.words.length * 0.6));

      const lineDuration = Math.max(0.6, nextLineStartTime - startTime);
      const wordsCount = line.words.length;
      const availableTime = Math.max(0.4, lineDuration - 0.25);

      line.words.forEach((word, wIdx) => {
        const wordTime = Number(
          (startTime + (wIdx / Math.max(1, wordsCount)) * availableTime).toFixed(2)
        );
        newWordTimings.push({
          id: `w-${line.lineIndex}-${wIdx}`,
          word,
          time: wordTime,
          lineIndex: line.lineIndex,
          wordIndexInLine: wIdx,
        });
      });
    }

    return newWordTimings.sort((a, b) => a.time - b.time);
  };

  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    currentModel: string;
    attempt: number;
    maxAttempts: number;
    countdown: number | null;
    statusMessage: string;
    fallbackHistory: string[];
  }>({
    isSyncing: false,
    currentModel: 'gemini-3.8-flash',
    attempt: 1,
    maxAttempts: 4,
    countdown: null,
    statusMessage: '',
    fallbackHistory: [],
  });

  const cancelSyncRef = useRef<boolean>(false);

  // Helper sleep with 1-second countdown ticks
  const sleepWithCountdown = async (seconds: number, model: string, nextAttempt: number) => {
    for (let remaining = seconds; remaining > 0; remaining--) {
      if (cancelSyncRef.current) break;
      setSyncStatus((prev) => ({
        ...prev,
        countdown: remaining,
        statusMessage: `Model ${model} is experiencing high demand (503). Retrying attempt ${nextAttempt} of 4 in ${remaining}s...`,
      }));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  // AUTO-SYNC WITH AI (with automatic 4x retries and model fallback)
  const handleAutoSyncAI = async () => {
    if (!state.metadata.audioUrl) {
      setAiError('No song audio found. Please upload an MP3 or generate the demo track first.');
      return;
    }

    cancelSyncRef.current = false;
    setAiError(null);
    setAiSuccessMsg(null);

    const RETRY_WAITS = [3, 8, 15, 30]; // 3s, 8s, 15s, 30s as requested
    const MODEL_CASCADE = [
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];

    setSyncStatus({
      isSyncing: true,
      currentModel: MODEL_CASCADE[0],
      attempt: 1,
      maxAttempts: 4,
      countdown: null,
      statusMessage: 'Preparing audio and lyric lines for Gemini...',
      fallbackHistory: [],
    });

    try {
      // 1. Fetch audio file and convert to base64
      const audioResponse = await fetch(state.metadata.audioUrl);
      const audioBlob = await audioResponse.blob();

      const base64Promise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const audioBase64 = await base64Promise;
      let syncSucceeded = false;
      const historyLog: string[] = [];

      // Loop through fallback models
      for (let mIdx = 0; mIdx < MODEL_CASCADE.length; mIdx++) {
        if (cancelSyncRef.current || syncSucceeded) break;

        const currentModel = MODEL_CASCADE[mIdx];

        // Loop up to 4 attempts per model
        for (let attempt = 1; attempt <= 4; attempt++) {
          if (cancelSyncRef.current || syncSucceeded) break;

          setSyncStatus({
            isSyncing: true,
            currentModel,
            attempt,
            maxAttempts: 4,
            countdown: null,
            statusMessage: `Running ${currentModel} (attempt ${attempt} of 4)...`,
            fallbackHistory: [...historyLog],
          });

          try {
            const apiResp = await fetch('/api/gemini/sync-lyrics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64,
                mimeType: audioBlob.type || 'audio/wav',
                lines: state.lines.map((l) => ({ lineIndex: l.lineIndex, text: l.text })),
                duration,
                model: currentModel,
              }),
            });

            const data = await apiResp.json().catch(() => ({}));

            if (apiResp.ok && data.success && Array.isArray(data.lineTimings) && data.lineTimings.length > 0) {
              // Successfully received line timings!
              const lineTimings: { lineIndex: number; startTime: number }[] = data.lineTimings;
              const calculatedWords = spreadWords(state.lines, lineTimings, duration);

              onChange((prev) => {
                try {
                  localStorage.setItem('glass_to_neon_lyrics_timings', JSON.stringify(calculatedWords));
                } catch (e) {
                  console.error(e);
                }
                return {
                  ...prev,
                  wordTimings: calculatedWords,
                };
              });

              syncSucceeded = true;
              setAiSuccessMsg(
                `Successfully synchronized ${lineTimings.length} lines with ${data.modelUsed || currentModel} (attempt ${attempt} of 4)!`
              );
              break;
            }

            // Failure or 503 High Demand
            const is503 = apiResp.status === 503 || data.isHighDemand || (data.error && /503|high demand|overloaded/i.test(data.error));

            if (attempt < 4) {
              const waitSeconds = RETRY_WAITS[attempt - 1];
              await sleepWithCountdown(waitSeconds, currentModel, attempt + 1);
            } else {
              // Exhausted 4 retries on this model
              const nextModel = MODEL_CASCADE[mIdx + 1];
              historyLog.push(`${currentModel} (4 retries exhausted)`);
              if (nextModel) {
                setSyncStatus({
                  isSyncing: true,
                  currentModel,
                  attempt: 4,
                  maxAttempts: 4,
                  countdown: null,
                  statusMessage: `${currentModel} high demand after 4 attempts. Switching to fallback model: ${nextModel}...`,
                  fallbackHistory: [...historyLog],
                });
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            }
          } catch (fetchErr: unknown) {
            console.warn(`Attempt ${attempt} on ${currentModel} failed:`, fetchErr);
            if (attempt < 4) {
              const waitSeconds = RETRY_WAITS[attempt - 1];
              await sleepWithCountdown(waitSeconds, currentModel, attempt + 1);
            }
          }
        }
      }

      if (!syncSucceeded && !cancelSyncRef.current) {
        throw new Error(
          'All models (gemini-3.8-flash, gemini-2.5-flash, etc.) experienced high demand (503) after multiple retries. You can try again in a moment, or use the manual Spacebar tap tool below.'
        );
      }
    } catch (err: unknown) {
      if (!cancelSyncRef.current) {
        console.error('AI Sync error:', err);
        const msg = err instanceof Error ? err.message : 'Failed to communicate with AI auto-sync service.';
        setAiError(msg);
      }
    } finally {
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        countdown: null,
      }));
    }
  };

  // Cancel running sync
  const handleCancelSync = () => {
    cancelSyncRef.current = true;
    setSyncStatus((prev) => ({
      ...prev,
      isSyncing: false,
      countdown: null,
      statusMessage: 'Auto-sync cancelled.',
    }));
  };

  // Editable Line Start Times Handler
  const handleEditLineStartTime = (lineIdx: number, newStartTime: number) => {
    // Current start times for all lines
    const currentLineStarts = state.lines.map((l) => {
      if (l.lineIndex === lineIdx) {
        return { lineIndex: l.lineIndex, startTime: newStartTime };
      }
      const existingFirstWord = state.wordTimings.find(
        (w) => w.lineIndex === l.lineIndex && w.wordIndexInLine === 0
      );
      return {
        lineIndex: l.lineIndex,
        startTime: existingFirstWord ? existingFirstWord.time : l.lineIndex * 4.0,
      };
    });

    // Re-spread words
    const updatedWords = spreadWords(state.lines, currentLineStarts, duration);
    onChange((prev) => {
      try {
        localStorage.setItem('glass_to_neon_lyrics_timings', JSON.stringify(updatedWords));
      } catch (e) {
        console.error(e);
      }
      return {
        ...prev,
        wordTimings: updatedWords,
      };
    });
  };

  // Jump to specific line and play
  const handlePlayLine = (startTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, startTime - 0.2);
    setCurrentTime(audio.currentTime);
    audio.play().catch(console.error);
  };

  // Download timings as JSON
  const downloadTimingsJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(state.wordTimings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `${state.metadata.title || 'lyrics'}_timings.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Upload timings JSON
  const handleUploadTimings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const timings = JSON.parse(event.target?.result as string) as WordTiming[];
        if (Array.isArray(timings)) {
          onChange((prev) => ({
            ...prev,
            wordTimings: timings,
          }));
          localStorage.setItem('glass_to_neon_lyrics_timings', JSON.stringify(timings));
          setAiSuccessMsg('Imported timings successfully!');
        }
      } catch (err) {
        setAiError('Invalid JSON format in uploaded file.');
      }
    };
    reader.readAsText(file);
  };

  // Timeline Scrubbing & Word Dragging
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !audioRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = ratio * duration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleMouseDownWord = (wordId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingWordId(wordId);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingWordId || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, currentX / rect.width));
      const newTime = Number((ratio * duration).toFixed(3));

      onChange((prev) => ({
        ...prev,
        wordTimings: prev.wordTimings.map((wt) =>
          wt.id === draggingWordId ? { ...wt, time: newTime } : wt
        ),
      }));
    };

    const handleMouseUp = () => {
      if (draggingWordId) {
        setDraggingWordId(null);
      }
    };

    if (draggingWordId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingWordId, duration, onChange]);

  // Active word currently playing (for Check & Audition mode)
  const currentSingingWord = React.useMemo(() => {
    const sorted = [...state.wordTimings].sort((a, b) => a.time - b.time);
    let active: WordTiming | null = null;
    for (let i = 0; i < sorted.length; i++) {
      if (currentTime >= sorted[i].time) {
        active = sorted[i];
      } else {
        break;
      }
    }
    return active;
  }, [currentTime, state.wordTimings]);

  // Current active word & line in view for manual tapping
  const currentTarget = allWords[activeWordGlobalIndex] || allWords[allWords.length - 1];
  const currentLine = state.lines.find((l) => l.lineIndex === currentTarget?.lineIndex);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Top Status & Controls Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-rose-950/40">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span>Tap-Sync & AI Timing Studio</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Auto-sync with Gemini audio understanding, or tap along in real-time with Spacebar. Edit line timers or drag chips to fine-tune.
          </p>
        </div>

        {/* Toolbar: AI Sync, Upload, Export, Beats, Reset */}
        <div className="flex flex-wrap items-center gap-2">
          {/* AUTO-SYNC WITH AI BUTTON */}
          <button
            onClick={handleAutoSyncAI}
            disabled={syncStatus.isSyncing}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 active:scale-95 shadow-md shadow-rose-950 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Send audio and lyric lines to Gemini for automatic acoustic voice synchronization"
          >
            <Sparkles className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {syncStatus.isSyncing
                ? `Syncing (${syncStatus.currentModel} · Att. ${syncStatus.attempt}/4)`
                : 'Auto-sync with AI'}
            </span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            className="hidden"
            onChange={handleUploadTimings}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Upload timings JSON"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload JSON</span>
          </button>

          <button
            onClick={downloadTimingsJson}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download recorded timings JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={onDetectBeats}
            disabled={isDetectingBeats}
            className="px-3 py-1.5 text-xs font-semibold text-rose-300 hover:text-white bg-rose-950/60 border border-rose-800/50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Detect musical beats with Web Audio"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{isDetectingBeats ? 'Analyzing...' : `Beats (${state.beatData.bpm} BPM)`}</span>
          </button>

          {/* Reset All Taps Button */}
          <button
            onClick={handleResetAllTaps}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-300 bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900/60 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Clear all recorded word timings"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset all taps</span>
          </button>
        </div>
      </div>

      {/* AI Live Status & Automatic Retry Banner */}
      {syncStatus.isSyncing && (
        <div className="p-4 bg-gradient-to-r from-rose-950/80 via-pink-950/60 to-[#120408] border border-rose-800/80 rounded-xl space-y-2.5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-rose-400 animate-spin shrink-0" />
              <div>
                <span className="font-bold text-white text-xs block">
                  AI Auto-Syncing with Gemini (Attempt {syncStatus.attempt} of {syncStatus.maxAttempts})
                </span>
                <span className="text-[11px] text-rose-200">
                  {syncStatus.statusMessage}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-950 border border-rose-800/60 text-rose-300">
                Model: {syncStatus.currentModel}
              </span>
              {syncStatus.countdown !== null && (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950/80 border border-amber-600/70 text-amber-300 animate-pulse">
                  Wait: {syncStatus.countdown}s
                </span>
              )}
              <button
                onClick={handleCancelSync}
                className="px-2.5 py-1 text-xs text-rose-300 hover:text-white bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          {syncStatus.fallbackHistory.length > 0 && (
            <div className="text-[10px] text-slate-400 border-t border-rose-900/40 pt-1.5 flex items-center gap-1.5">
              <span className="text-amber-400">Fallback history:</span>
              <span>{syncStatus.fallbackHistory.join(' → ')}</span>
            </div>
          )}
        </div>
      )}

      {/* AI Success Banner */}
      {aiSuccessMsg && !syncStatus.isSyncing && (
        <div className="p-3.5 bg-[#0f1f14] border border-emerald-900/60 rounded-xl flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{aiSuccessMsg}</span>
          </div>
          <button
            onClick={() => setAiSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-300 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* AI Error Banner */}
      {aiError && (
        <div className="p-4 bg-[#23080e] border border-rose-800/80 rounded-xl flex items-start gap-3 text-xs text-rose-200">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <span className="font-bold text-white block">Auto-Sync Issue</span>
            <p>{aiError}</p>
            <p className="text-[11px] text-slate-400">
              You can still use manual Spacebar tapping or adjust the line start times below.
            </p>
          </div>
          <button
            onClick={() => setAiError(null)}
            className="text-rose-400 hover:text-white text-xs px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Focus Area: Real-Time Audition & Word Highlight Card */}
      <div className="p-6 md:p-8 bg-gradient-to-b from-[#1c040b] to-[#100206] border border-rose-900/50 rounded-2xl shadow-xl shadow-black/40 text-center space-y-6">
        <div className="flex items-center justify-between text-xs text-rose-300/80">
          <span>
            {currentSingingWord
              ? `Currently Playing: Line ${currentSingingWord.lineIndex + 1}`
              : `Line ${currentTarget ? currentTarget.lineIndex + 1 : 0} of ${state.lines.length}`}
          </span>
          <span className="font-mono text-rose-300 font-bold">
            {currentTime.toFixed(2)}s / {duration.toFixed(1)}s
          </span>
        </div>

        {/* Large Devanagari Line with Live Singing Word Highlight */}
        <div className="py-4">
          <div className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-wide leading-tight font-sans">
            {currentLine ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                {currentLine.words.map((w, wIdx) => {
                  const timing = state.wordTimings.find(
                    (wt) => wt.lineIndex === currentLine.lineIndex && wt.wordIndexInLine === wIdx
                  );
                  const isRecorded = !!timing;

                  // Is this word currently being sung based on currentTime?
                  const isCurrentlySinging =
                    currentSingingWord &&
                    currentSingingWord.lineIndex === currentLine.lineIndex &&
                    currentSingingWord.wordIndexInLine === wIdx;

                  // Is this the next word waiting for manual tap?
                  const isCurrentTapTarget =
                    currentTarget &&
                    currentTarget.lineIndex === currentLine.lineIndex &&
                    currentTarget.wordIndexInLine === wIdx;

                  return (
                    <span
                      key={wIdx}
                      className={`relative px-3.5 py-1.5 rounded-xl transition-all duration-150 ${
                        isCurrentlySinging
                          ? 'bg-rose-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.9)] scale-110 ring-4 ring-rose-200 font-extrabold'
                          : isCurrentTapTarget && !isPlaying
                          ? 'bg-rose-700 text-white ring-2 ring-rose-300 scale-105'
                          : isRecorded
                          ? currentTime >= (timing?.time || 0)
                            ? 'bg-rose-950/90 text-rose-100 border border-rose-600/60'
                            : 'bg-rose-950/40 text-rose-300/70 border border-rose-900/40'
                          : 'text-slate-500 bg-slate-900/40'
                      }`}
                    >
                      {w}
                      {timing && (
                        <span className="block text-[10px] font-mono opacity-80 mt-0.5">
                          {timing.time.toFixed(1)}s
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-slate-500">All words synchronized!</span>
            )}
          </div>
        </div>

        {/* Tap & Audition Controls */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* Big Tap Button (Manual Fallback) */}
          <button
            onClick={handleTapWord}
            disabled={activeWordGlobalIndex >= allWords.length}
            className="w-full sm:w-auto min-w-[240px] px-8 py-4 text-lg font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 active:scale-95 rounded-xl shadow-lg shadow-rose-600/40 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            TAP WORD (SPACE)
          </button>

          {/* Audition / Check Play Button */}
          <button
            onClick={togglePlay}
            className="w-full sm:w-auto px-6 py-4 text-base font-bold text-slate-100 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 border border-rose-900/60 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
            title="Play song to visually check synchronized words"
          >
            {isPlaying ? <Pause className="w-5 h-5 text-rose-400" /> : <Play className="w-5 h-5 text-rose-400 ml-0.5" />}
            <span>{isPlaying ? 'Pause Check' : 'Play & Check Timings'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-400">
          {isPlaying
            ? 'Auditioning audio: singing words light up brightly as the voice sings.'
            : currentTarget
            ? `Next word to tap: "${currentTarget.word}" (or click Play & Check)`
            : 'All words mapped! Play above to verify, or adjust line timers below.'}
        </p>
      </div>

      {/* Editable Line Start Times Panel */}
      <div className="p-5 bg-[#120408] border border-rose-950/60 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Editable Line Start Times & Audition
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Edit the start second of any line. Words inside will automatically re-spread evenly between lines.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {state.lines.length} total lines
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {state.lines.map((line, idx) => {
            const firstWordTiming = state.wordTimings.find(
              (w) => w.lineIndex === line.lineIndex && w.wordIndexInLine === 0
            );
            const lineStartTime = firstWordTiming ? firstWordTiming.time : Number((idx * 4.0).toFixed(1));
            const isLineActiveNow =
              currentSingingWord && currentSingingWord.lineIndex === line.lineIndex;

            return (
              <div
                key={line.id}
                className={`p-3 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                  isLineActiveNow
                    ? 'bg-rose-950/60 border-rose-500/80 shadow-sm'
                    : 'bg-slate-950/80 border-slate-800 hover:border-rose-900/50'
                }`}
              >
                {/* Line text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-rose-400 font-semibold">
                      L{idx + 1}
                    </span>
                    <span className="text-xs font-medium text-white truncate font-sans">
                      {line.text}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {line.words.length} words
                  </div>
                </div>

                {/* Editable Start Time input + Play Line button */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={duration}
                      value={lineStartTime}
                      onChange={(e) =>
                        handleEditLineStartTime(line.lineIndex, Number(e.target.value))
                      }
                      className="w-14 bg-transparent text-xs font-mono text-rose-200 text-right focus:outline-none"
                    />
                    <span className="text-[10px] font-mono text-slate-400">s</span>
                  </div>

                  <button
                    onClick={() => handlePlayLine(lineStartTime)}
                    className="p-1.5 text-slate-300 hover:text-white bg-slate-900 hover:bg-rose-950 border border-slate-800 rounded transition-colors cursor-pointer"
                    title={`Audition line ${idx + 1} from ${lineStartTime}s`}
                  >
                    <Volume2 className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Playback Controls & Speed Toolbar */}
      <div className="p-4 bg-[#120408] border border-rose-950/60 rounded-xl flex flex-wrap items-center justify-between gap-4">
        {/* Play / Rewind / Undo */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={togglePlay}
            className="p-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer shadow-sm"
            title={isPlaying ? 'Pause (K)' : 'Play (K)'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <button
            onClick={rewind3s}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Rewind 3 seconds"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>-3s</span>
          </button>

          <button
            onClick={handleUndoTap}
            disabled={state.wordTimings.length === 0}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
            title="Undo last recorded word tap (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo Tap</span>
          </button>
        </div>

        {/* Current Time Display */}
        <div className="text-center font-mono text-sm text-slate-200">
          <span className="text-rose-400 font-bold">{currentTime.toFixed(2)}s</span> /{' '}
          {duration.toFixed(1)}s
        </div>

        {/* Slow Playback Switcher */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5" />
            Speed:
          </span>
          {[0.5, 0.75, 1.0].map((rate) => (
            <button
              key={rate}
              onClick={() => setPlaybackRate(rate)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                playbackRate === rate
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Draggable Timeline */}
      <div className="p-5 bg-[#120408] border border-rose-950/60 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Interactive Word Timing Timeline
            </span>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              (Drag word chips left/right to adjust individual word timestamps)
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {state.wordTimings.length} / {allWords.length} words timed
          </span>
        </div>

        {/* Timeline Track */}
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          className="relative h-28 bg-slate-950 border border-slate-800 rounded-lg overflow-x-hidden cursor-crosshair select-none"
        >
          {/* Beat Markers */}
          {state.beatData.times.map((bt, i) => {
            const leftPct = (bt / duration) * 100;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-rose-950/60 pointer-events-none"
                style={{ left: `${leftPct}%` }}
              />
            );
          })}

          {/* Current Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,1)] z-20 pointer-events-none"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 -ml-1 -top-1 absolute" />
          </div>

          {/* Timed Word Chips (Draggable) */}
          {state.wordTimings.map((wt) => {
            const leftPct = (wt.time / duration) * 100;
            const isDragging = draggingWordId === wt.id;
            const isSingingNow =
              currentSingingWord &&
              currentSingingWord.lineIndex === wt.lineIndex &&
              currentSingingWord.wordIndexInLine === wt.wordIndexInLine;

            return (
              <div
                key={wt.id}
                onMouseDown={(e) => handleMouseDownWord(wt.id, e)}
                style={{
                  left: `${leftPct}%`,
                  top: `${(wt.lineIndex % 3) * 32 + 10}px`,
                }}
                className={`absolute px-2 py-0.5 rounded text-[11px] font-sans font-medium whitespace-nowrap cursor-grab active:cursor-grabbing transform -translate-x-1/2 z-10 transition-colors ${
                  isDragging
                    ? 'bg-rose-500 text-white shadow-lg ring-2 ring-white scale-110 z-30'
                    : isSingingNow
                    ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,1)] ring-2 ring-white scale-110 z-20 font-bold'
                    : 'bg-rose-950/80 text-rose-200 border border-rose-800/50 hover:bg-rose-900'
                }`}
                title={`Word: "${wt.word}" at ${wt.time.toFixed(2)}s. Drag to move.`}
              >
                {wt.word}
              </div>
            );
          })}
        </div>

        {/* Timeline Legend / Helper */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>Click anywhere along the timeline to seek audio immediately.</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Current Audio Position</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-950 border border-rose-800" />
              <span>Word Chip (Draggable)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
