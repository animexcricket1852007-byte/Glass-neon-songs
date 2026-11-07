import { BeatData } from '../types/lyrics';

/**
 * Web Audio energy peak beat detection
 */
export async function detectBeatsFromBuffer(audioBuffer: AudioBuffer): Promise<BeatData> {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const bufferLength = channelData.length;

  // Window size of ~1024 samples (approx 23ms at 44.1kHz)
  const windowSize = 2048;
  const hopSize = 1024;
  const energies: number[] = [];
  const times: number[] = [];

  for (let i = 0; i < bufferLength - windowSize; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const val = channelData[i + j];
      sum += val * val;
    }
    const rms = Math.sqrt(sum / windowSize);
    energies.push(rms);
    times.push(i / sampleRate);
  }

  // Moving average energy filter with adaptive threshold
  const windowRadius = 15;
  const rawBeats: number[] = [];
  const minInterval = 0.35; // Don't register beats closer than 350ms (~170 BPM ceiling)

  for (let i = windowRadius; i < energies.length - windowRadius; i++) {
    let localSum = 0;
    for (let k = -windowRadius; k <= windowRadius; k++) {
      localSum += energies[i + k];
    }
    const localAvg = localSum / (windowRadius * 2 + 1);
    const threshold = localAvg * 1.35;

    if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
      const beatTime = times[i];
      if (rawBeats.length === 0 || beatTime - rawBeats[rawBeats.length - 1] >= minInterval) {
        rawBeats.push(Number(beatTime.toFixed(3)));
      }
    }
  }

  // Calculate approximate BPM
  let bpm = 70;
  if (rawBeats.length > 2) {
    const intervals: number[] = [];
    for (let i = 1; i < rawBeats.length; i++) {
      intervals.push(rawBeats[i] - rawBeats[i - 1]);
    }
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    if (medianInterval > 0) {
      bpm = Math.round(60 / medianInterval);
      if (bpm < 50) bpm *= 2;
      if (bpm > 140) bpm = Math.round(bpm / 2);
    }
  }

  return { times: rawBeats, bpm };
}

/**
 * Generate a soulful, high quality ambient instrumental demo audio in browser
 * using Web Audio API buffer rendering (minor key acoustic piano & pad, 68 BPM).
 */
export async function generateDemoAudioBuffer(durationSeconds: number = 36): Promise<{ buffer: AudioBuffer; blobUrl: string }> {
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, sampleRate * durationSeconds, sampleRate);

  const tempo = 68;
  const beatSec = 60 / tempo;

  // Chord progression: Dm, Bb, F, C (poetic, cinematic emotion)
  // Notes in Hz
  const chords = [
    [146.83, 220.00, 261.63, 349.23], // Dm7: D3, A3, C4, F4
    [116.54, 174.61, 233.08, 293.66], // Bbmaj7: Bb2, F3, Bb3, D4
    [174.61, 220.00, 261.63, 349.23], // Fmaj: F3, A3, C4, F4
    [130.81, 196.00, 261.63, 329.63], // Cmaj: C3, G3, C4, E4
  ];

  // Master Gain with gentle fade in / out
  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(0, 0);
  masterGain.gain.linearRampToValueAtTime(0.85, 1.5);
  masterGain.gain.setValueAtTime(0.85, durationSeconds - 2.5);
  masterGain.gain.linearRampToValueAtTime(0, durationSeconds);
  masterGain.connect(offlineCtx.destination);

  // Warm Reverb / Delay simulation
  const delay = offlineCtx.createDelay();
  delay.delayTime.setValueAtTime(beatSec * 0.75, 0);
  const delayFeedback = offlineCtx.createGain();
  delayFeedback.gain.setValueAtTime(0.35, 0);
  const delayFilter = offlineCtx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.setValueAtTime(1200, 0);

  delay.connect(delayFilter);
  delayFilter.connect(delayFeedback);
  delayFeedback.connect(delay);
  delayFilter.connect(masterGain);

  const totalMeasures = Math.ceil(durationSeconds / (beatSec * 4));

  for (let m = 0; m < totalMeasures; m++) {
    const chordIdx = m % chords.length;
    const chordNotes = chords[chordIdx];
    const measureStart = m * (beatSec * 4);

    if (measureStart >= durationSeconds - 0.5) break;

    // 1. Lush warm pad
    chordNotes.forEach((freq, idx) => {
      const padOsc = offlineCtx.createOscillator();
      padOsc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      padOsc.frequency.setValueAtTime(freq, measureStart);

      const padGain = offlineCtx.createGain();
      padGain.gain.setValueAtTime(0, measureStart);
      padGain.gain.linearRampToValueAtTime(0.04, measureStart + 0.8);
      padGain.gain.setValueAtTime(0.04, measureStart + beatSec * 4 - 0.4);
      padGain.gain.linearRampToValueAtTime(0, measureStart + beatSec * 4);

      padOsc.connect(padGain);
      padGain.connect(masterGain);
      padGain.connect(delay);

      padOsc.start(measureStart);
      padOsc.stop(Math.min(durationSeconds, measureStart + beatSec * 4));
    });

    // 2. Delicate Acoustic / Rhodes arpeggio notes
    for (let step = 0; step < 8; step++) {
      const noteTime = measureStart + step * (beatSec / 2);
      if (noteTime >= durationSeconds - 1) break;

      const noteFreq = chordNotes[step % chordNotes.length] * (step > 4 ? 2 : 1);
      const arpOsc = offlineCtx.createOscillator();
      arpOsc.type = 'sine';
      arpOsc.frequency.setValueAtTime(noteFreq, noteTime);

      const arpGain = offlineCtx.createGain();
      arpGain.gain.setValueAtTime(0, noteTime);
      arpGain.gain.linearRampToValueAtTime(0.06, noteTime + 0.02);
      arpGain.gain.exponentialRampToValueAtTime(0.001, noteTime + beatSec * 1.2);

      arpOsc.connect(arpGain);
      arpGain.connect(masterGain);
      arpGain.connect(delay);

      arpOsc.start(noteTime);
      arpOsc.stop(noteTime + beatSec * 1.3);
    }

    // 3. Soft sub kick pulse on beats 1 and 3
    [0, 2].forEach((beatOffset) => {
      const kickTime = measureStart + beatOffset * beatSec;
      if (kickTime >= durationSeconds - 1) return;

      const kickOsc = offlineCtx.createOscillator();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(110, kickTime);
      kickOsc.frequency.exponentialRampToValueAtTime(42, kickTime + 0.15);

      const kickGain = offlineCtx.createGain();
      kickGain.gain.setValueAtTime(0.28, kickTime);
      kickGain.gain.exponentialRampToValueAtTime(0.001, kickTime + 0.28);

      kickOsc.connect(kickGain);
      kickGain.connect(masterGain);

      kickOsc.start(kickTime);
      kickOsc.stop(kickTime + 0.3);
    });

    // 4. Subtle melodic voice/flute lead (emulates Hindi vocal phrase cadence)
    const melodyScale = [220, 261.63, 293.66, 329.63, 349.23, 440];
    const phraseTones = [
      melodyScale[m % melodyScale.length],
      melodyScale[(m + 2) % melodyScale.length],
      melodyScale[(m + 1) % melodyScale.length],
      melodyScale[(m + 3) % melodyScale.length],
    ];

    phraseTones.forEach((mFreq, pIdx) => {
      const leadTime = measureStart + (pIdx * beatSec + 0.2);
      if (leadTime >= durationSeconds - 1) return;

      const leadOsc = offlineCtx.createOscillator();
      leadOsc.type = 'sine';
      leadOsc.frequency.setValueAtTime(mFreq, leadTime);
      // Subtle vibrato
      leadOsc.frequency.linearRampToValueAtTime(mFreq + 2.5, leadTime + 0.5);

      const leadGain = offlineCtx.createGain();
      leadGain.gain.setValueAtTime(0, leadTime);
      leadGain.gain.linearRampToValueAtTime(0.08, leadTime + 0.08);
      leadGain.gain.exponentialRampToValueAtTime(0.001, leadTime + beatSec * 1.5);

      leadOsc.connect(leadGain);
      leadGain.connect(masterGain);
      leadGain.connect(delay);

      leadOsc.start(leadTime);
      leadOsc.stop(leadTime + beatSec * 1.6);
    });
  }

  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(renderedBuffer);
  const blobUrl = URL.createObjectURL(wavBlob);

  return { buffer: renderedBuffer, blobUrl };
}

/**
 * Converts an AudioBuffer into a WAV Blob
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const length = buffer.length * blockAlign;
  const headerByteLength = 44;
  const totalLength = headerByteLength + length;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /* RIFF identifier */
  writeString(0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + length, true);
  /* RIFF type */
  writeString(8, 'WAVE');
  /* format chunk identifier */
  writeString(12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(36, 'data');
  /* data chunk length */
  view.setUint32(40, length, true);

  // Interleave channels
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
