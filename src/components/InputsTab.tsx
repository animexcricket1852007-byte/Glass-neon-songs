import React, { useRef } from 'react';
import { ProjectState, ImageClip, LyricLine, TextZone } from '../types/lyrics';
import { Upload, Music, Image as ImageIcon, Plus, Trash2, ArrowRight } from 'lucide-react';

interface InputsTabProps {
  state: ProjectState;
  onChange: (updater: (prev: ProjectState) => ProjectState) => void;
  onAudioUploaded: (file: File) => void;
  onProceedToTapSync: () => void;
}

export const InputsTab: React.FC<InputsTabProps> = ({
  state,
  onChange,
  onAudioUploaded,
  onProceedToTapSync,
}) => {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Parse raw lyrics into LyricLine objects
  const handleLyricsChange = (rawText: string) => {
    const rawLines = rawText.split('\n');
    const newLines: LyricLine[] = [];
    let lineIdx = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const trimmed = rawLines[i].trim();
      if (!trimmed) {
        if (newLines.length > 0) {
          newLines[newLines.length - 1].sectionBreakAfter = true;
        }
        continue;
      }
      const words = trimmed.split(/\s+/).filter(Boolean);
      newLines.push({
        id: `line-${lineIdx}`,
        lineIndex: lineIdx,
        text: trimmed,
        words,
        scriptFlourishWord: state.lines[lineIdx]?.scriptFlourishWord || 'shayar',
      });
      lineIdx++;
    }

    onChange((prev) => {
      // Re-map word timings if possible
      return {
        ...prev,
        lyricsText: rawText,
        lines: newLines,
        keyLineIndex: Math.min(prev.keyLineIndex, Math.max(0, newLines.length - 1)),
      };
    });
  };

  // Audio file upload handler
  const handleAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onAudioUploaded(file);
  };

  // Cover image upload
  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const coverUrl = URL.createObjectURL(file);
    onChange((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        coverUrl,
      },
    }));
  };

  // Clip image file upload
  const handleClipImageFile = (clipId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onChange((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId ? { ...c, url, name: file.name } : c)),
    }));
  };

  // Update clip fields
  const updateClip = (clipId: string, partial: Partial<ImageClip>) => {
    onChange((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId ? { ...c, ...partial } : c)),
    }));
  };

  // Add a clip
  const addClip = () => {
    if (state.clips.length >= 6) return;
    const newId = `clip-${Date.now()}`;
    const newClip: ImageClip = {
      id: newId,
      url: state.clips[0]?.url || '',
      name: `Clip ${state.clips.length + 1}`,
      moodNote: 'Atmospheric scene',
      lineStart: Math.min(state.lines.length - 1, state.clips.length),
      lineEnd: Math.min(state.lines.length - 1, state.clips.length + 1),
      textZone: 'below',
    };
    onChange((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }));
  };

  // Remove a clip
  const removeClip = (clipId: string) => {
    if (state.clips.length <= 4) return;
    onChange((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => c.id !== clipId),
    }));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      {/* Intro Hero Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-rose-950/40">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Song & Visual Configuration
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Upload your song MP3, paste your Hindi Devanagari lyrics, and assign 4–6 visual clips.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onProceedToTapSync}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Tap-Sync Timings</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid: Audio & Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Audio Input Card */}
        <div className="md:col-span-2 p-5 bg-[#120408] border border-rose-950/50 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5" />
              Song Audio (MP3 / WAV)
            </span>
            <span className="text-xs text-slate-400">
              Duration: {state.metadata.duration ? `${state.metadata.duration.toFixed(1)}s` : 'Upload file to load'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="file"
              ref={audioInputRef}
              accept="audio/*"
              className="hidden"
              onChange={handleAudioFile}
            />
            <button
              onClick={() => audioInputRef.current?.click()}
              className="w-full sm:w-auto px-4 py-2.5 bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
            >
              <Upload className="w-4 h-4 text-white" />
              <span>{state.metadata.audioFileName ? 'Replace Song Audio' : 'Upload Song MP3'}</span>
            </button>

            <span className="text-xs text-slate-400">
              Original singer voice and music used for preview & export
            </span>
          </div>

          {state.metadata.audioFileName && (
            <div className="text-xs text-slate-300 bg-slate-950/80 px-3 py-2 rounded border border-rose-950/40 truncate">
              Active: <span className="text-rose-300 font-medium">{state.metadata.audioFileName}</span>
            </div>
          )}
        </div>

        {/* Cover Art Card */}
        <div className="p-5 bg-[#120408] border border-rose-950/50 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              Cover Image
            </span>
            <span className="text-xs text-slate-500">Optional</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg overflow-hidden border border-rose-900/40 bg-slate-950 shrink-0">
              {state.metadata.coverUrl ? (
                <img
                  src={state.metadata.coverUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-600">
                  None
                </div>
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <input
                type="file"
                ref={coverInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleCoverFile}
              />
              <button
                onClick={() => coverInputRef.current?.click()}
                className="w-full px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs rounded transition-colors cursor-pointer"
              >
                Upload Cover
              </button>
              <p className="text-[11px] text-slate-500">Falls back to first clip if empty</p>
            </div>
          </div>
        </div>
      </div>

      {/* Song Title and Artists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-[#120408] border border-rose-950/50 rounded-xl">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Song Title (Hindi or Roman)
          </label>
          <input
            type="text"
            value={state.metadata.title}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                metadata: { ...prev.metadata, title: e.target.value },
              }))
            }
            placeholder="उदा. आपका गाना (Song Title)"
            className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Artists / Vocalists
          </label>
          <input
            type="text"
            value={state.metadata.artists}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                metadata: { ...prev.metadata, artists: e.target.value },
              }))
            }
            placeholder="उदा. गायक / कलाकार (Artists)"
            className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>
      </div>

      {/* Lyrics Textarea */}
      <div className="p-5 bg-[#120408] border border-rose-950/50 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Hindi Devanagari Lyrics
            </label>
            <p className="text-xs text-slate-400 mt-0.5">
              One line per row. Blank lines represent emotional section breaks.
            </p>
          </div>
          <span className="text-xs text-slate-400">
            {state.lines.length} lines · {state.lines.reduce((a, b) => a + b.words.length, 0)} words
          </span>
        </div>

        <textarea
          rows={9}
          value={state.lyricsText}
          onChange={(e) => handleLyricsChange(e.target.value)}
          placeholder="यहाँ अपने देवनागरी हिंदी बोल लिखें..."
          className="w-full p-4 bg-slate-950/90 border border-slate-800 rounded-lg text-base md:text-lg font-medium text-slate-100 placeholder-slate-700 leading-relaxed font-sans focus:outline-none focus:border-rose-500 transition-colors"
          style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}
        />
      </div>

      {/* Key Line Selector */}
      <div className="p-5 bg-[#120408] border border-rose-950/50 rounded-xl space-y-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-rose-400">
            Emotional Key Line (Climax Destination-In Cutout)
          </label>
          <p className="text-xs text-slate-400 mt-0.5">
            Pick the peak line of the song. The letters will act as a giant frame cutting through the brightest image, surrounded by rising fiery embers, before exploding to fill the screen.
          </p>
        </div>

        <select
          value={state.keyLineIndex}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              keyLineIndex: Number(e.target.value),
            }))
          }
          className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-lg text-sm text-rose-200 focus:outline-none focus:border-rose-500 cursor-pointer"
        >
          {state.lines.map((line, idx) => (
            <option key={line.id} value={idx}>
              Line {idx + 1}: {line.text}
            </option>
          ))}
        </select>
      </div>

      {/* 4-6 Visual Clips Configuration */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Visual Clips ({state.clips.length} of 4–6)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Each image is used once in Part 2 or Part 3 with slow push-in, animated stars, and empty space lyrics.
            </p>
          </div>

          {state.clips.length < 6 && (
            <button
              onClick={addClip}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Clip</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {state.clips.map((clip, index) => (
            <div
              key={clip.id}
              className="p-4 bg-[#120408] border border-rose-950/50 rounded-xl space-y-3.5"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-300">
                  Clip #{index + 1}: {clip.name}
                </span>
                {state.clips.length > 4 && (
                  <button
                    onClick={() => removeClip(clip.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Thumbnail + Upload */}
              <div className="flex items-center gap-3">
                <div className="w-24 h-14 rounded-lg overflow-hidden border border-rose-900/40 bg-slate-950 shrink-0">
                  {clip.url ? (
                    <img
                      src={clip.url}
                      alt={clip.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600">
                      No Image
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <label className="block w-full px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-300 text-xs text-center rounded cursor-pointer transition-colors">
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleClipImageFile(clip.id, e)}
                    />
                  </label>
                </div>
              </div>

              {/* Mood Note */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Mood Note
                </label>
                <input
                  type="text"
                  value={clip.moodNote}
                  onChange={(e) => updateClip(clip.id, { moodNote: e.target.value })}
                  placeholder="e.g. Solitary misty horizon"
                  className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Line Range & Text Zone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Use for Lines
                  </label>
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <select
                      value={clip.lineStart}
                      onChange={(e) =>
                        updateClip(clip.id, {
                          lineStart: Number(e.target.value),
                          lineEnd: Math.max(Number(e.target.value), clip.lineEnd),
                        })
                      }
                      className="w-full px-2 py-1.5 bg-slate-950/80 border border-slate-800 rounded text-xs text-slate-200"
                    >
                      {state.lines.map((_, i) => (
                        <option key={i} value={i}>
                          L{i + 1}
                        </option>
                      ))}
                    </select>
                    <span>to</span>
                    <select
                      value={clip.lineEnd}
                      onChange={(e) =>
                        updateClip(clip.id, {
                          lineEnd: Math.max(clip.lineStart, Number(e.target.value)),
                        })
                      }
                      className="w-full px-2 py-1.5 bg-slate-950/80 border border-slate-800 rounded text-xs text-slate-200"
                    >
                      {state.lines.map((_, i) => (
                        <option key={i} value={i}>
                          L{i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Text Placement Zone
                  </label>
                  <select
                    value={clip.textZone}
                    onChange={(e) => updateClip(clip.id, { textZone: e.target.value as TextZone })}
                    className="w-full px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded text-xs text-slate-200"
                  >
                    <option value="below">Below Horizon / Floor</option>
                    <option value="above">Above Subject / Sky</option>
                    <option value="left">Left Column</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
