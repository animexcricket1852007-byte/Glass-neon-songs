import React, { useState, useEffect, useRef } from 'react';
import { ProjectState, WordTiming } from './types/lyrics';
import { DEFAULT_PRESET } from './data/defaultPreset';
import { preloadProjectImages } from './utils/renderer';
import { detectBeatsFromBuffer } from './utils/audioEngine';
import { Header } from './components/Header';
import { InputsTab } from './components/InputsTab';
import { TapSyncTab } from './components/TapSyncTab';
import { PlanTab } from './components/PlanTab';
import { PlayerExportTab } from './components/PlayerExportTab';

export default function App() {
  // Start on inputs tab for uploading song MP3 and lyrics
  const [currentTab, setCurrentTab] = useState<'inputs' | 'tapsync' | 'plan' | 'preview'>('inputs');
  const [projectState, setProjectState] = useState<ProjectState>(() => {
    // Attempt to load saved word timings from localStorage if present
    try {
      const savedTimings = localStorage.getItem('glass_to_neon_lyrics_timings');
      if (savedTimings) {
        const parsed = JSON.parse(savedTimings) as WordTiming[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return {
            ...DEFAULT_PRESET,
            wordTimings: parsed,
          };
        }
      }
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
    }
    return DEFAULT_PRESET;
  });

  const [assets, setAssets] = useState<Record<string, HTMLImageElement>>({});
  const [isDetectingBeats, setIsDetectingBeats] = useState<boolean>(false);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | undefined>(undefined);

  // Single Master HTML audio element for uploaded MP3
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioBufferRef = useRef<AudioBuffer | null>(null);

  // Preload image assets
  useEffect(() => {
    preloadProjectImages(projectState).then((cached) => {
      setAssets(cached);
    });
  }, [projectState.clips, projectState.metadata.coverUrl]);

  // Synchronize audio element duration and run beat detection when an MP3 is uploaded
  const handleUploadedAudio = async (file: File) => {
    const audioUrl = URL.createObjectURL(file);
    try {
      setIsDetectingBeats(true);
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);
      activeAudioBufferRef.current = buffer;
      const beatData = await detectBeatsFromBuffer(buffer);

      setProjectState((prev) => ({
        ...prev,
        metadata: {
          ...prev.metadata,
          audioUrl,
          audioFileName: file.name,
          duration: Number(buffer.duration.toFixed(1)) || prev.metadata.duration || 30,
        },
        beatData,
      }));
    } catch (err) {
      console.error('Failed to parse uploaded audio:', err);
      // Fallback simple assignment
      setProjectState((prev) => ({
        ...prev,
        metadata: {
          ...prev.metadata,
          audioUrl,
          audioFileName: file.name,
        },
      }));
    } finally {
      setIsDetectingBeats(false);
    }
  };

  // Re-run beat detection if requested
  const handleDetectBeats = async () => {
    if (!activeAudioBufferRef.current && projectState.metadata.audioUrl) {
      try {
        setIsDetectingBeats(true);
        const response = await fetch(projectState.metadata.audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        activeAudioBufferRef.current = buffer;
        const beatData = await detectBeatsFromBuffer(buffer);
        setProjectState((prev) => ({ ...prev, beatData }));
      } catch (e) {
        console.error('Beat detection failed:', e);
      } finally {
        setIsDetectingBeats(false);
      }
      return;
    }

    if (activeAudioBufferRef.current) {
      setIsDetectingBeats(true);
      const beatData = await detectBeatsFromBuffer(activeAudioBufferRef.current);
      setProjectState((prev) => ({ ...prev, beatData }));
      setIsDetectingBeats(false);
    }
  };

  // Primary Action in Header
  const handlePrimaryAction = () => {
    if (currentTab !== 'preview') {
      setCurrentTab('preview');
    } else {
      if (audioRef.current) {
        if (audioRef.current.paused) {
          audioRef.current.play().catch(console.error);
        } else {
          audioRef.current.pause();
        }
      }
    }
  };

  const primaryActionLabel = currentTab === 'preview' ? 'Play / Pause Video' : 'Launch Preview';

  return (
    <div className="min-h-screen bg-[#070204] text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onPrimaryAction={handlePrimaryAction}
        primaryActionLabel={primaryActionLabel}
      />

      {/* Hidden Master Audio Element: Single HTML audio element for uploaded MP3 */}
      <audio
        ref={audioRef}
        src={projectState.metadata.audioUrl || undefined}
        preload="auto"
      />

      {/* Main Tab Content */}
      <main className="flex-1 pb-16">
        {currentTab === 'inputs' && (
          <InputsTab
            state={projectState}
            onChange={setProjectState}
            onAudioUploaded={handleUploadedAudio}
            onProceedToTapSync={() => setCurrentTab('tapsync')}
          />
        )}

        {currentTab === 'tapsync' && (
          <TapSyncTab
            state={projectState}
            onChange={setProjectState}
            audioRef={audioRef}
            onDetectBeats={handleDetectBeats}
            isDetectingBeats={isDetectingBeats}
          />
        )}

        {currentTab === 'plan' && (
          <PlanTab
            state={projectState}
            onChange={setProjectState}
            assets={assets}
            onSelectTimestamp={(ts) => {
              setSelectedTimestamp(ts);
              setCurrentTab('preview');
            }}
            onProceedToPreview={() => setCurrentTab('preview')}
          />
        )}

        {currentTab === 'preview' && (
          <PlayerExportTab
            state={projectState}
            assets={assets}
            audioRef={audioRef}
            selectedTimestamp={selectedTimestamp}
            onNavigateToInputs={() => setCurrentTab('inputs')}
          />
        )}
      </main>
    </div>
  );
}
