import { ProjectState } from '../types/lyrics';

export const DEFAULT_RAW_LYRICS = '';

export const DEFAULT_PRESET: ProjectState = {
  metadata: {
    title: '',
    artists: '',
    audioUrl: null,
    audioFileName: '',
    duration: 0,
    coverUrl: '/src/assets/images/lyric_cover_mood_1794036963348.jpg',
  },
  lyricsText: '',
  lines: [],
  wordTimings: [],
  clips: [
    {
      id: 'clip-1',
      url: '/src/assets/images/clip_misty_dusk_1794036964295.jpg',
      name: 'Misty Dusk Horizon',
      moodNote: 'Solitary contemplative silhouette on misty hill',
      lineStart: 0,
      lineEnd: 1,
      textZone: 'above',
    },
    {
      id: 'clip-2',
      url: '/src/assets/images/clip_rainy_street_1794036964617.jpg',
      name: 'Rainy Street Reflections',
      moodNote: 'Ambient streetlights and wet pavement bokeh',
      lineStart: 2,
      lineEnd: 2,
      textZone: 'below',
    },
    {
      id: 'clip-3',
      url: '/src/assets/images/clip_rain_window_1794036966553.jpg',
      name: 'Rain Window Reflection',
      moodNote: 'Pensive portrait against rain-slicked window glass',
      lineStart: 3,
      lineEnd: 4,
      textZone: 'left',
    },
    {
      id: 'clip-4',
      url: '/src/assets/images/clip_twilight_beach_1794036965516.jpg',
      name: 'Twilight Serene Ocean',
      moodNote: 'Starry indigo sky over reflective wet sand',
      lineStart: 5,
      lineEnd: 5,
      textZone: 'below',
    },
  ],
  keyLineIndex: 0,
  beatData: {
    times: [],
    bpm: 0,
  },
  part1EndLine: 0,
  part2EndLine: 0,
  part3StartLine: 0,
};
