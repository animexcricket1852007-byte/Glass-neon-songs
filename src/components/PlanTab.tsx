import React, { useState, useEffect, useRef } from 'react';
import { ProjectState, TextZone } from '../types/lyrics';
import { renderFrame } from '../utils/renderer';
import { Sparkles, Eye, ArrowRight, RefreshCw } from 'lucide-react';

interface PlanTabProps {
  state: ProjectState;
  onChange: (updater: (prev: ProjectState) => ProjectState) => void;
  assets: Record<string, HTMLImageElement>;
  onSelectTimestamp: (time: number) => void;
  onProceedToPreview: () => void;
}

interface StillItem {
  id: number;
  time: number;
  label: string;
  section: string;
  dataUrl?: string;
}

export const PlanTab: React.FC<PlanTabProps> = ({
  state,
  onChange,
  assets,
  onSelectTimestamp,
  onProceedToPreview,
}) => {
  const [stills, setStills] = useState<StillItem[]>([]);
  const [isGeneratingStills, setIsGeneratingStills] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const duration = state.metadata.duration || 38;

  // Generate 16 stills contact sheet across duration
  const generateContactSheet = async () => {
    setIsGeneratingStills(true);

    const numStills = 16;
    const items: StillItem[] = [];
    const step = duration / numStills;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 640;
    offCanvas.height = 360;
    const offCtx = offCanvas.getContext('2d')!;

    // Wait for fonts to be ready
    await document.fonts.ready;

    for (let i = 0; i < numStills; i++) {
      const t = Number(((i + 0.5) * step).toFixed(2));

      // Determine section name
      let section = 'Part 2: Clips';
      if (t < (state.wordTimings.find((w) => w.lineIndex === state.part1EndLine)?.time || 8) + 1.2) {
        section = 'Part 1: Glass Card';
      } else if (
        t >= (state.wordTimings.find((w) => w.lineIndex === state.keyLineIndex)?.time || 19) - 0.5 &&
        t <= (state.wordTimings.find((w) => w.lineIndex === state.keyLineIndex)?.time || 22) + 2.0
      ) {
        section = 'Key Line Climax';
      } else if (t >= (state.wordTimings.find((w) => w.lineIndex === state.part3StartLine)?.time || 25)) {
        section = 'Part 3: Pink Neon';
      }

      renderFrame(offCtx, t, state, assets, 640, 360);
      const dataUrl = offCanvas.toDataURL('image/jpeg', 0.85);

      items.push({
        id: i,
        time: t,
        label: `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`,
        section,
        dataUrl,
      });
    }

    setStills(items);
    setIsGeneratingStills(false);
  };

  useEffect(() => {
    // Generate initial contact sheet on mount
    generateContactSheet();
  }, [state, assets]);

  // Update section line bounds
  const updateBoundaries = (field: 'part1EndLine' | 'part2EndLine' | 'part3StartLine', val: number) => {
    onChange((prev) => ({
      ...prev,
      [field]: val,
    }));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-rose-950/40">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Story Structure & Visual Contact Sheet
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Review the 4-part visual narrative, edit clip placements, and inspect 16 pre-rendered stills.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={generateContactSheet}
            disabled={isGeneratingStills}
            className="px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingStills ? 'animate-spin' : ''}`} />
            <span>Re-render Stills</span>
          </button>

          <button
            onClick={onProceedToPreview}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Launch Video Player</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4-Part Narrative Visual Timeline Blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Part 1 */}
        <div className="p-4 bg-[#140409] border border-rose-950/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Part 1: Glass Card
            </span>
            <span className="text-[11px] font-mono text-slate-400">Lines 1 to {state.part1EndLine + 1}</span>
          </div>
          <p className="text-xs text-slate-300">
            Frosted red glass card floating in 3D tilt with Apple Music-style cover lockup, word fill, and shatter shard explosion into Part 2.
          </p>
          <div className="pt-1 flex items-center gap-2 text-xs text-slate-400">
            <span>End Line:</span>
            <select
              value={state.part1EndLine}
              onChange={(e) => updateBoundaries('part1EndLine', Number(e.target.value))}
              className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-rose-200"
            >
              {state.lines.map((_, i) => (
                <option key={i} value={i}>
                  Line {i + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Part 2 */}
        <div className="p-4 bg-[#140409] border border-rose-950/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Part 2: Clips
            </span>
            <span className="text-[11px] font-mono text-slate-400">Middle lines</span>
          </div>
          <p className="text-xs text-slate-300">
            Natural 16:9 full-screen push-in with twinkling stars, shooting stars on beats, and empty-space typography with red Great Vibes script.
          </p>
          <div className="pt-1 text-[11px] text-slate-400">
            Mapped across {state.clips.length} clip shots with beat transitions.
          </div>
        </div>

        {/* Key Line */}
        <div className="p-4 bg-[#140409] border border-rose-950/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Key Line Climax
            </span>
            <span className="text-[11px] font-mono text-rose-300 font-semibold">
              Line {state.keyLineIndex + 1}
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Black void with giant heavy cutout letters masking the brightest image, rising fiery embers, and exponential zoom burst.
          </p>
          <div className="pt-1 text-[11px] text-rose-300 truncate">
            &ldquo;{state.lines[state.keyLineIndex]?.text || ''}&rdquo;
          </div>
        </div>

        {/* Part 3 */}
        <div className="p-4 bg-[#140409] border border-rose-950/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Part 3: Pink Neon
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Lines {state.part3StartLine + 1} to End
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Magenta/hot-pink duotone with bouncing neon letters landing on wet reflective floor, splash ripples, droplets, and rain streaks.
          </p>
          <div className="pt-1 flex items-center gap-2 text-xs text-slate-400">
            <span>Start Line:</span>
            <select
              value={state.part3StartLine}
              onChange={(e) => updateBoundaries('part3StartLine', Number(e.target.value))}
              className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-rose-200"
            >
              {state.lines.map((_, i) => (
                <option key={i} value={i}>
                  Line {i + 1}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Planning Table */}
      <div className="p-5 bg-[#120408] border border-rose-950/60 rounded-xl space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-rose-400">
          Clips & Scene Layout Mapping
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-rose-950/60 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-2.5 px-3">Clip Preview</th>
                <th className="py-2.5 px-3">Assigned Lines</th>
                <th className="py-2.5 px-3">Text Zone</th>
                <th className="py-2.5 px-3">Mood Atmosphere</th>
                <th className="py-2.5 px-3">Calligraphy Script</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-950/30 text-slate-200">
              {state.clips.map((clip, idx) => (
                <tr key={clip.id} className="hover:bg-rose-950/20 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-14 h-9 rounded overflow-hidden bg-slate-950 border border-rose-950 shrink-0">
                        {clip.url && (
                          <img
                            src={clip.url}
                            alt={clip.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                      <span className="font-semibold text-rose-300 whitespace-nowrap">
                        {clip.name}
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap">
                    Lines {clip.lineStart + 1} – {clip.lineEnd + 1}
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <select
                      value={clip.textZone}
                      onChange={(e) => {
                        const newZone = e.target.value as TextZone;
                        onChange((prev) => ({
                          ...prev,
                          clips: prev.clips.map((c) =>
                            c.id === clip.id ? { ...c, textZone: newZone } : c
                          ),
                        }));
                      }}
                      className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200"
                    >
                      <option value="below">Below Horizon / Floor</option>
                      <option value="above">Above Subject / Sky</option>
                      <option value="left">Left Column</option>
                    </select>
                  </td>

                  <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">
                    {clip.moodNote}
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap font-serif italic text-rose-400">
                    {state.lines[clip.lineStart]?.scriptFlourishWord || 'shayar'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 16-Still Contact Sheet */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Eye className="w-4 h-4 text-rose-400" />
              <span>Contact Sheet (16 Canvas Stills)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any still to instantly jump to that frame in the video preview player.
            </p>
          </div>
        </div>

        {isGeneratingStills ? (
          <div className="py-16 text-center text-slate-400 bg-[#120408] border border-rose-950/40 rounded-xl space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-rose-400" />
            <p className="text-sm font-medium">Rendering 16 canvas stills with seeded PRNG...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stills.map((still) => (
              <div
                key={still.id}
                onClick={() => {
                  onSelectTimestamp(still.time);
                  onProceedToPreview();
                }}
                className="group relative rounded-lg overflow-hidden border border-rose-950/70 hover:border-rose-500/80 bg-slate-950 aspect-video cursor-pointer transition-all shadow-sm hover:scale-[1.02]"
              >
                {still.dataUrl && (
                  <img
                    src={still.dataUrl}
                    alt={still.section}
                    className="w-full h-full object-cover"
                  />
                )}
                {/* Overlay Metadata */}
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between text-[11px] text-white">
                  <span className="font-mono font-bold text-rose-300">{still.label}</span>
                  <span className="text-[10px] text-slate-300 truncate max-w-[120px]">
                    {still.section}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
