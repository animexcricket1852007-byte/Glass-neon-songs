import React from 'react';
import { Film, Sliders, ListTree, PlayCircle } from 'lucide-react';

interface HeaderProps {
  currentTab: 'inputs' | 'tapsync' | 'plan' | 'preview';
  onSelectTab: (tab: 'inputs' | 'tapsync' | 'plan' | 'preview') => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onPrimaryAction,
  primaryActionLabel,
}) => {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-4 md:gap-8 px-4 md:px-8 py-3.5 bg-[#0d0306]/90 backdrop-blur-md border-b border-rose-950/40">
      {/* Zone 1: Single Brand Wordmark */}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('preview');
        }}
        className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-rose-300 transition-colors"
      >
        <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 rotate-45 shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
        <span className="font-extrabold tracking-tight">Glass to Neon</span>
        <span className="text-xs font-medium text-rose-400 tracking-wider uppercase hidden sm:inline">Lyrics</span>
      </a>

      {/* Zone 2: Navigation Links (Single-Line, No Pills) */}
      <nav className="flex items-center gap-1 sm:gap-4 md:gap-6 text-xs sm:text-sm font-medium text-slate-300 overflow-x-auto py-1">
        <button
          onClick={() => onSelectTab('inputs')}
          className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors py-1 hover:text-white ${
            currentTab === 'inputs' ? 'text-rose-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>1. Song & Clips</span>
        </button>

        <button
          onClick={() => onSelectTab('tapsync')}
          className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors py-1 hover:text-white ${
            currentTab === 'tapsync' ? 'text-rose-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>2. Tap-Sync</span>
        </button>

        <button
          onClick={() => onSelectTab('plan')}
          className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors py-1 hover:text-white ${
            currentTab === 'plan' ? 'text-rose-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <ListTree className="w-3.5 h-3.5" />
          <span>3. Story Plan & Stills</span>
        </button>

        <button
          onClick={() => onSelectTab('preview')}
          className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors py-1 hover:text-white ${
            currentTab === 'preview' ? 'text-rose-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <PlayCircle className="w-3.5 h-3.5" />
          <span>4. Video & Export</span>
        </button>
      </nav>

      {/* Zone 3: 1 Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onPrimaryAction}
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 rounded-lg shadow-sm shadow-rose-950 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <span>{primaryActionLabel}</span>
        </button>
      </div>
    </header>
  );
};
