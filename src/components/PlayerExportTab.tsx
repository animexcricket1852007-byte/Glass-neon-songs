import React, { useRef, useState, useEffect } from 'react';
import { ProjectState, ExportProgress } from '../types/lyrics';
import { renderFrame, ensureFontsLoaded } from '../utils/renderer';
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Download,
  Film,
  Volume2,
  Volume1,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

interface PlayerExportTabProps {
  state: ProjectState;
  assets: Record<string, HTMLImageElement>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  selectedTimestamp?: number;
  onNavigateToInputs?: () => void;
}

export const PlayerExportTab: React.FC<PlayerExportTabProps> = ({
  state,
  assets,
  audioRef,
  selectedTimestamp,
  onNavigateToInputs,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    isExporting: false,
    progress: 0,
    currentSeconds: 0,
    totalSeconds: 0,
    statusText: '',
  });

  const currentBlobUrlRef = useRef<string | null>(null);
  const revokeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<any>(null);

  const duration = state.metadata.duration || 38;

  // Ensure fonts are loaded and audio starts unmuted at volume 1.0
  useEffect(() => {
    ensureFontsLoaded();
    const audio = audioRef.current;
    if (audio) {
      audio.muted = false;
      audio.volume = 1.0;
    }
  }, [audioRef]);

  // Cleanup blob URLs and wake lock on unmount
  useEffect(() => {
    return () => {
      if (revokeTimeoutRef.current) {
        clearTimeout(revokeTimeoutRef.current);
      }
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  // Jump to selected timestamp if passed from contact sheet
  useEffect(() => {
    if (selectedTimestamp !== undefined && audioRef.current) {
      audioRef.current.currentTime = selectedTimestamp;
      setCurrentTime(selectedTimestamp);
    }
  }, [selectedTimestamp, audioRef]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!exportProgress.isExporting) {
        setCurrentTime(audio.currentTime);
      }
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
  }, [audioRef, exportProgress.isExporting]);

  // Animation frame rendering loop during live preview
  useEffect(() => {
    let animId: number;

    const loop = () => {
      if (canvasRef.current && !exportProgress.isExporting) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const t = audioRef.current ? audioRef.current.currentTime : currentTime;
          renderFrame(ctx, t, state, assets, 1920, 1080);
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [state, assets, audioRef, currentTime, exportProgress.isExporting]);

  // Play / Pause toggle
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.muted = isMuted;
      audio.volume = isMuted ? 0 : volume;
      audio.play().catch((err) => {
        console.error('Play error:', err);
        setErrorMessage('Audio playback was prevented by the browser. Please interact with the page and try again.');
      });
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audio.muted = nextMuted;
    if (!nextMuted && volume === 0) {
      setVolume(1.0);
      audio.volume = 1.0;
    } else if (!nextMuted) {
      audio.volume = volume;
    }
  };

  // Volume range adjustment
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = val;
      if (val > 0 && isMuted) {
        setIsMuted(false);
        audio.muted = false;
      } else if (val === 0) {
        setIsMuted(true);
        audio.muted = true;
      }
    }
  };

  // Rewind
  const handleRewind = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  };

  // Seek bar scrub
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekVal = Number(e.target.value);
    setCurrentTime(seekVal);
    if (audioRef.current) {
      audioRef.current.currentTime = seekVal;
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  // Trigger manual download using an <a download="..."> click
  const handleManualDownload = () => {
    if (!exportProgress.downloadUrl) return;
    const a = document.createElement('a');
    a.href = exportProgress.downloadUrl;
    a.download = exportProgress.fileName || 'arz-kiya-hai.webm';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Export video with pause-proofing, wake lock, memory optimization, and audio mixing
  const handleExport = async (targetResolution: '1080p' | '720p', isTest: boolean = false) => {
    if (exportProgress.isExporting) return;
    setErrorMessage(null);

    const audio = audioRef.current;
    if (!audio || !state.metadata.audioUrl) {
      setErrorMessage('Please upload your song MP3 in the Inputs tab first. Export requires original singer vocals and music.');
      return;
    }

    const exportTotalDuration = isTest ? Math.min(10.0, duration) : duration;
    const width = targetResolution === '1080p' ? 1920 : 1280;
    const height = targetResolution === '1080p' ? 1080 : 720;
    const fps = 30;

    // Exact requested video bitrates: 6,000,000 bps for 1080p, 2,000,000 bps for 720p
    const videoBitsPerSecond = targetResolution === '1080p' ? 6_000_000 : 2_000_000;

    // Request Screen Wake Lock to prevent sleep/throttling during export
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake Lock request notice:', err);
      }
    }

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };

    // Ensure audio element starts unmuted at volume 1.0
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 1.0;

    // Create offscreen rendering canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx = exportCanvas.getContext('2d')!;

    // Wait for Google Fonts to be ready
    await ensureFontsLoaded();

    // Capture video stream from canvas at 30 fps
    const canvasStream = exportCanvas.captureStream(fps);

    // Capture audio stream from the uploaded MP3 HTML audio element via captureStream()
    const audioEl = audio as any;
    let audioStream: MediaStream | null = null;
    if (typeof audioEl.captureStream === 'function') {
      audioStream = audioEl.captureStream();
    } else if (typeof audioEl.mozCaptureStream === 'function') {
      audioStream = audioEl.mozCaptureStream();
    }

    let audioTrackIncluded = false;
    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((track: MediaStreamTrack) => {
          canvasStream.addTrack(track);
        });
        audioTrackIncluded = true;
      }
    }

    // Resilient Web Audio fallback if captureStream yielded no tracks before play
    if (!audioTrackIncluded) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();
        const sourceNode = audioCtx.createMediaElementSource(audio);
        sourceNode.connect(dest);
        sourceNode.connect(audioCtx.destination);
        dest.stream.getAudioTracks().forEach((track) => {
          canvasStream.addTrack(track);
        });
        audioTrackIncluded = canvasStream.getAudioTracks().length > 0;
      } catch (err) {
        console.warn('Audio capture fallback note:', err);
      }
    }

    // MIME type check: video/webm;codecs=vp9,opus with fallback to video/webm
    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }
    }

    const options: MediaRecorderOptions = {
      mimeType: mimeType || undefined,
      videoBitsPerSecond,
    };

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(canvasStream, options);
    } catch (e) {
      recorder = new MediaRecorder(canvasStream);
    }

    // Collect chunks with start(1000) chunking and release memory on stop
    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    recorder.onerror = (e) => {
      releaseWakeLock();
      console.error('Recorder error:', e);
      setErrorMessage('MediaRecorder encountered an error during recording. Try the Test Export first or export at 720p.');
      setExportProgress((prev) => ({
        ...prev,
        isExporting: false,
        statusText: 'Recording failed',
      }));
    };

    recorder.onstop = () => {
      releaseWakeLock();

      // Create a single blob and clear chunks array immediately to free memory
      const blob = new Blob(recordedChunks, { type: recorder.mimeType || 'video/webm' });
      recordedChunks.length = 0;

      // Revoke any previous blob URL
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }

      const downloadUrl = URL.createObjectURL(blob);
      currentBlobUrlRef.current = downloadUrl;

      // Revoke the blob URL only after 60 seconds as required
      if (revokeTimeoutRef.current) {
        clearTimeout(revokeTimeoutRef.current);
      }
      revokeTimeoutRef.current = setTimeout(() => {
        if (currentBlobUrlRef.current === downloadUrl) {
          URL.revokeObjectURL(downloadUrl);
          currentBlobUrlRef.current = null;
        }
      }, 60000);

      const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
      const safeTitle = (state.metadata.title ? state.metadata.title.trim().replace(/\s+/g, '-') : 'arz-kiya-hai').toLowerCase();
      const fileName = isTest ? `${safeTitle || 'arz-kiya-hai'}-test-10s.webm` : `${safeTitle || 'arz-kiya-hai'}.webm`;

      setExportProgress({
        isExporting: false,
        progress: 1.0,
        currentSeconds: exportTotalDuration,
        totalSeconds: exportTotalDuration,
        statusText: `Complete! (${sizeMB} MB)`,
        downloadUrl,
        fileName,
        fileSizeEstimate: `${sizeMB} MB`,
        audioTrackIncluded,
      });

      // Auto trigger download via <a download="..."> click
      try {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        console.warn('Auto download trigger note:', err);
      }
    };

    // Start Recording with start(1000) chunks and start Audio at the exact same moment
    recorder.start(1000);
    try {
      await audio.play();
    } catch (e) {
      console.warn('Audio play trigger notice:', e);
    }

    setExportProgress({
      isExporting: true,
      progress: 0,
      currentSeconds: 0,
      totalSeconds: exportTotalDuration,
      statusText: isTest ? 'Recording Test Export (First 10s at 30 fps)...' : `Exporting ${targetResolution} (30 fps)...`,
      audioTrackIncluded,
    });

    // Render loop: keep canvas time equal to audioElement.currentTime and stop both together at the end
    let isFinished = false;
    const fadeOutDuration = isTest ? 1.5 : 2.0;

    const renderLoop = () => {
      if (isFinished) return;

      const currentAudioTime = audio.currentTime;
      renderFrame(exportCtx, currentAudioTime, state, assets, width, height);

      // Apply 0.8s audio fade-in & 2.0s audio fade-out during export
      if (currentAudioTime < 0.8) {
        audio.volume = Math.max(0, Math.min(1.0, currentAudioTime / 0.8));
      } else if (currentAudioTime > exportTotalDuration - fadeOutDuration) {
        audio.volume = Math.max(0, Math.min(1.0, (exportTotalDuration - currentAudioTime) / fadeOutDuration));
      } else {
        audio.volume = 1.0;
      }

      const progress = Math.min(1.0, currentAudioTime / exportTotalDuration);
      setExportProgress((prev) => ({
        ...prev,
        progress,
        currentSeconds: Number(currentAudioTime.toFixed(1)),
        totalSeconds: exportTotalDuration,
        statusText: `Recording: ${currentAudioTime.toFixed(1)}s / ${exportTotalDuration.toFixed(1)}s (${Math.round(
          progress * 100
        )}%)`,
      }));

      if (currentAudioTime >= exportTotalDuration - 0.15 || audio.ended) {
        isFinished = true;
        audio.pause();
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }

      requestAnimationFrame(renderLoop);
    };

    requestAnimationFrame(renderLoop);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* On-screen error alert banner */}
      {errorMessage && (
        <div className="p-4 bg-rose-950/80 border border-rose-600 rounded-xl flex items-center justify-between gap-3 text-rose-200 text-xs shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="px-2.5 py-1 text-[11px] bg-rose-900/60 hover:bg-rose-800 text-white rounded transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Audio upload prompt if no audio loaded */}
      {!state.metadata.audioUrl && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>No song audio loaded yet. Upload your song MP3 to hear original singer voice and music in preview and export.</span>
          </div>
          {onNavigateToInputs && (
            <button
              onClick={onNavigateToInputs}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
            >
              Upload MP3 in Inputs Tab
            </button>
          )}
        </div>
      )}

      {/* Top Bar with Export Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-rose-950/40">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Video Preview & Export Suite</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
              16:9 • 30 FPS
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time preview rendered via HTML5 canvas with glass reflections, animated stars, destination mask, and pink neon floor ripples.
          </p>
        </div>

        {/* Export Buttons Suite */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick 10s Test Export Button */}
          <button
            onClick={() => handleExport('720p', true)}
            disabled={exportProgress.isExporting}
            className="px-3.5 py-2 text-xs font-semibold text-amber-300 hover:text-white bg-amber-950/50 hover:bg-amber-900/60 border border-amber-800/60 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Fast test render of first 10 seconds to verify audio sync, font shaping, and download"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Export (First 10s)</span>
          </button>

          <button
            onClick={() => handleExport('720p', false)}
            disabled={exportProgress.isExporting}
            className="px-3.5 py-2 text-xs font-semibold text-rose-200 hover:text-white bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/60 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Export 720p (2,000,000 bps)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export 720p</span>
          </button>

          <button
            onClick={() => handleExport('1080p', false)}
            disabled={exportProgress.isExporting}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Export full 1080p (6,000,000 bps)"
          >
            <Film className="w-4 h-4" />
            <span>Export 1080p Full HD</span>
          </button>
        </div>
      </div>

      {/* 16:9 Video Canvas Screen */}
      <div
        ref={containerRef}
        className="relative bg-black rounded-2xl overflow-hidden border border-rose-950/70 shadow-2xl shadow-rose-950/20 aspect-video group"
      >
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className="w-full h-full object-contain block select-none"
        />

        {/* Big Center Play Overlay (when paused) */}
        {!isPlaying && !exportProgress.isExporting && (
          <div
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px] cursor-pointer transition-opacity"
          >
            <div className="p-5 rounded-full bg-rose-600/90 text-white hover:scale-110 hover:bg-rose-500 shadow-xl shadow-rose-950 transition-all">
              <Play className="w-8 h-8 ml-1" />
            </div>
          </div>
        )}

        {/* Video Scrim Controls Bar */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent space-y-2 opacity-95 transition-opacity">
          {/* Timeline Range Scrubber */}
          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={currentTime}
            onChange={handleSeek}
            disabled={exportProgress.isExporting}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
          />

          {/* Transport Controls Row */}
          <div className="flex items-center justify-between text-xs text-white">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                disabled={exportProgress.isExporting}
                className="p-1.5 text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <button
                onClick={handleRewind}
                className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Restart"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Volume Button & Slider (Starts Unmuted at 1.0) */}
              <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-full border border-white/10">
                <button
                  onClick={toggleMute}
                  className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute Song' : 'Mute Song'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="w-4 h-4 text-slate-200" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-rose-300" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-20 h-1 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                />
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline w-7 text-right">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>

              {/* Time display */}
              <div className="font-mono text-[11px] text-slate-300">
                <span className="text-rose-400 font-bold">{currentTime.toFixed(1)}s</span> / {duration.toFixed(1)}s
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                {state.metadata.title ? `${state.metadata.title} — ${state.metadata.artists || 'Vocalist'}` : 'Uploaded Song'}
              </span>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Toggle Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Export Progress Modal / Pause-Proof Banner */}
      {exportProgress.isExporting && (
        <div className="p-6 bg-gradient-to-r from-[#1d030c] to-[#120207] border border-rose-800/80 rounded-2xl shadow-2xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-rose-400 animate-spin" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  Rendering & Recording Lyric Video...
                </h3>
                <p className="text-xs text-rose-300">{exportProgress.statusText}</p>
              </div>
            </div>
            <span className="font-mono text-sm font-extrabold text-rose-400">
              {Math.round(exportProgress.progress * 100)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-rose-950">
            <div
              className="h-full bg-gradient-to-r from-rose-600 to-pink-500 rounded-full transition-all duration-150"
              style={{ width: `${exportProgress.progress * 100}%` }}
            />
          </div>

          {/* Elapsed Time & Pause-proof Warning */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-300 pt-1">
            <div className="flex items-center gap-1.5 text-amber-300 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Keep this tab open and in view during recording to prevent browser throttling. Screen wake-lock active.</span>
            </div>
            <div className="font-mono text-slate-400">
              Elapsed: <span className="text-rose-300 font-bold">{exportProgress.currentSeconds.toFixed(1)}s</span> / {exportProgress.totalSeconds.toFixed(1)}s
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-1 border-t border-rose-950/60">
            <span>Audio track status:</span>
            <span className={`font-semibold ${exportProgress.audioTrackIncluded ? 'text-emerald-400' : 'text-amber-400'}`}>
              {exportProgress.audioTrackIncluded ? '✓ Audio track included (Singer voice & music)' : '⚠️ Audio track not detected'}
            </span>
          </div>
        </div>
      )}

      {/* Download Ready Banner with Dual Buttons & Direct Link */}
      {!exportProgress.isExporting && exportProgress.downloadUrl && (
        <div className="p-6 bg-[#0a1d12] border-2 border-emerald-600/70 rounded-2xl shadow-2xl space-y-4 animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="space-y-1">
                <div className="text-sm font-extrabold text-emerald-300">
                  Video Export Ready ({exportProgress.fileSizeEstimate})
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  {exportProgress.fileName}
                </div>
                <div className="text-xs flex items-center gap-2 pt-0.5">
                  <span className="text-slate-300">Audio track included:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] uppercase tracking-wider ${
                      exportProgress.audioTrackIncluded
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/60'
                        : 'bg-amber-950 text-amber-300 border border-amber-600/60'
                    }`}
                  >
                    {exportProgress.audioTrackIncluded ? 'yes' : 'no'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons: Big Download Video + Open in New Tab */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Big Download Video button that uses <a download="arz-kiya-hai.webm"> click */}
              <button
                onClick={handleManualDownload}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-5 h-5" />
                <span>Download Video</span>
              </button>

              {/* Second button: Open video in new tab */}
              <a
                href={exportProgress.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3.5 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-slate-400" />
                <span>Open video in new tab</span>
              </a>
            </div>
          </div>

          <div className="p-3 bg-black/40 rounded-lg border border-emerald-900/40 text-[11px] text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <span>
              💡 If the download did not start automatically, click <strong>Download Video</strong> above or <strong>Open video in new tab</strong> and long-press (or right-click) to save.
            </span>
            <span className="text-emerald-400/90 font-mono text-[10px] shrink-0">
              Blob active for 60 seconds
            </span>
          </div>
        </div>
      )}

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="p-4 bg-[#120408] border border-rose-950/60 rounded-xl space-y-1.5">
          <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
            Part 1: 3D Frosted Glass
          </span>
          <p className="text-xs text-slate-400">
            Floating wine-red frosted card with tilt perspective, scrolling lyric wall, Apple Music metadata, and glass shatter explosion into Part 2.
          </p>
        </div>

        <div className="p-4 bg-[#120408] border border-rose-950/60 rounded-xl space-y-1.5">
          <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
            Part 2 & Climax
          </span>
          <p className="text-xs text-slate-400">
            Natural image clips cropped around subjects, twinkling stars, and giant destination-in mask with fiery embers.
          </p>
        </div>

        <div className="p-4 bg-[#120408] border border-rose-950/60 rounded-xl space-y-1.5">
          <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
            Part 3: Pink Neon Ending
          </span>
          <p className="text-xs text-slate-400">
            Pink duotone photography, rain streaks on glass, multi-pass neon typography, landing bounce, and mirrored floor ripples.
          </p>
        </div>
      </div>
    </div>
  );
};
