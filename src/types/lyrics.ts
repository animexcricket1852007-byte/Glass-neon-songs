export interface WordTiming {
  id: string;
  word: string;
  time: number; // in seconds
  lineIndex: number;
  wordIndexInLine: number;
}

export interface LyricLine {
  id: string;
  lineIndex: number;
  text: string;
  words: string[];
  scriptFlourishWord?: string; // Optional roman script word for Part 2 calligraphy
  sectionBreakAfter?: boolean;
}

export type TextZone = 'above' | 'below' | 'left';

export interface ImageClip {
  id: string;
  url: string;
  name: string;
  moodNote: string;
  lineStart: number; // 0-indexed line start
  lineEnd: number;   // 0-indexed line end (inclusive)
  textZone: TextZone;
}

export interface SongMetadata {
  title: string;
  artists: string;
  audioUrl: string | null;
  audioFileName: string;
  duration: number;
  coverUrl: string;
}

export interface BeatData {
  times: number[];
  bpm: number;
}

export type VideoPart = 'part1_glass' | 'part2_clips' | 'key_line' | 'part3_neon';

export interface ProjectState {
  metadata: SongMetadata;
  lyricsText: string;
  lines: LyricLine[];
  wordTimings: WordTiming[];
  clips: ImageClip[];
  keyLineIndex: number;
  beatData: BeatData;
  part1EndLine: number;
  part2EndLine: number;
  part3StartLine: number;
}

export interface ExportProgress {
  isExporting: boolean;
  progress: number; // 0 to 1
  currentSeconds: number;
  totalSeconds: number;
  statusText: string;
  downloadUrl?: string;
  fileName?: string;
  fileSizeEstimate?: string;
  audioTrackIncluded?: boolean;
  error?: string;
}
