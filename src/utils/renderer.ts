import { ProjectState, WordTiming, ImageClip, LyricLine } from '../types/lyrics';
import { mulberry32, easeOutBack } from './seedRandom';

// Shared offscreen canvases for compositing
let offscreenCanvasA: HTMLCanvasElement | null = null;
let offscreenCanvasB: HTMLCanvasElement | null = null;

function getOffscreenCanvasA(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!offscreenCanvasA) {
    offscreenCanvasA = document.createElement('canvas');
  }
  if (offscreenCanvasA.width !== width || offscreenCanvasA.height !== height) {
    offscreenCanvasA.width = width;
    offscreenCanvasA.height = height;
  }
  const ctx = offscreenCanvasA.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  return { canvas: offscreenCanvasA, ctx };
}

function getOffscreenCanvasB(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!offscreenCanvasB) {
    offscreenCanvasB = document.createElement('canvas');
  }
  if (offscreenCanvasB.width !== width || offscreenCanvasB.height !== height) {
    offscreenCanvasB.width = width;
    offscreenCanvasB.height = height;
  }
  const ctx = offscreenCanvasB.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  return { canvas: offscreenCanvasB, ctx };
}

/**
 * Ensures Noto Sans Devanagari weights 700 and 800 are fully loaded before rendering
 */
export async function ensureFontsLoaded(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await Promise.all([
        document.fonts.load('700 48px "Noto Sans Devanagari"'),
        document.fonts.load('800 80px "Noto Sans Devanagari"'),
        document.fonts.load('800 96px "Noto Sans Devanagari"'),
        document.fonts.ready,
      ]);
    } catch (e) {
      console.warn('Font loading wait notice:', e);
    }
  }
}

/**
 * Preload all image assets referenced in project state and ensure fonts are ready
 */
export async function preloadProjectImages(state: ProjectState): Promise<Record<string, HTMLImageElement>> {
  await ensureFontsLoaded();

  const urls = new Set<string>();
  if (state.metadata.coverUrl) urls.add(state.metadata.coverUrl);
  state.clips.forEach((c) => {
    if (c.url) urls.add(c.url);
  });

  const cache: Record<string, HTMLImageElement> = {};
  const promises = Array.from(urls).map((url) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cache[url] = img;
        resolve();
      };
      img.onerror = () => {
        // Fallback: create a solid color canvas placeholder
        const fallback = document.createElement('canvas');
        fallback.width = 1920;
        fallback.height = 1080;
        const fctx = fallback.getContext('2d')!;
        const grad = fctx.createLinearGradient(0, 0, 1920, 1080);
        grad.addColorStop(0, '#3f0c10');
        grad.addColorStop(1, '#110306');
        fctx.fillStyle = grad;
        fctx.fillRect(0, 0, 1920, 1080);
        const fallbackImg = new Image();
        fallbackImg.src = fallback.toDataURL();
        cache[url] = fallbackImg;
        resolve();
      };
      img.src = url;
    });
  });

  await Promise.all(promises);
  return cache;
}

/**
 * Draw image with 16:9 cover crop around center/subject
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  scale: number = 1.0
) {
  if (!img || !img.width || !img.height) return;
  const targetRatio = dw / dh;
  const imgRatio = img.width / img.height;

  let sw: number;
  let sh: number;
  let sx: number;
  let sy: number;

  if (imgRatio > targetRatio) {
    sh = img.height;
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / targetRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  if (scale === 1.0) {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  } else {
    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}

/**
 * Draw rounded rectangle path
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Pure frame rendering engine
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: ProjectState,
  assets: Record<string, HTMLImageElement>,
  width = 1920,
  height = 1080
) {
  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  const duration = state.metadata.duration || 38;
  const clampedTime = Math.max(0, Math.min(t, duration));

  // Determine section timeline boundaries
  const part1Timings = state.wordTimings.filter((w) => w.lineIndex <= state.part1EndLine);
  const part1LastTime = part1Timings.length > 0 ? part1Timings[part1Timings.length - 1].time : 8.5;
  const part1EndTime = part1LastTime + 1.2; // Shatter transition window

  const keyLineTimings = state.wordTimings.filter((w) => w.lineIndex === state.keyLineIndex);
  const keyLineStartTime = keyLineTimings.length > 0 ? keyLineTimings[0].time - 0.5 : 18.5;
  const keyLineEndTime = keyLineTimings.length > 0 ? keyLineTimings[keyLineTimings.length - 1].time + 1.6 : 24.5;

  const part3Timings = state.wordTimings.filter((w) => w.lineIndex >= state.part3StartLine);
  const part3StartTime = part3Timings.length > 0 ? part3Timings[0].time - 0.4 : keyLineEndTime + 0.2;

  // Render appropriate scene mode based on t
  if (clampedTime < part1EndTime) {
    renderPart1GlassCard(ctx, clampedTime, state, assets, width, height, part1EndTime);
  } else if (clampedTime < keyLineStartTime) {
    renderPart2Clips(ctx, clampedTime, state, assets, width, height, part1EndTime, keyLineStartTime);
  } else if (clampedTime < keyLineEndTime) {
    renderKeyLineClimax(ctx, clampedTime, state, assets, width, height, keyLineStartTime, keyLineEndTime);
  } else {
    renderPart3PinkNeon(ctx, clampedTime, state, assets, width, height, part3StartTime, duration);
  }

  // Global Film Grain (reproducible via seeded PRNG)
  renderFilmGrain(ctx, clampedTime, width, height);

  // Global Soft Vignette
  renderVignette(ctx, width, height);

  // Global Fade In / Out
  renderGlobalFades(ctx, clampedTime, duration, width, height);
}

/**
 * PART 1: Frosted Glass Card in 3D Perspective + Shatter Shards
 */
function renderPart1GlassCard(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: ProjectState,
  assets: Record<string, HTMLImageElement>,
  width: number,
  height: number,
  part1EndTime: number
) {
  const shatterDuration = 1.1;
  const shatterStartTime = part1EndTime - shatterDuration;
  const isShattering = t >= shatterStartTime;
  const shatterProgress = isShattering ? (t - shatterStartTime) / shatterDuration : 0;

  // 1. Background: Deep near-black red + slow scrolling giant lyric wall
  ctx.fillStyle = '#090204';
  ctx.fillRect(0, 0, width, height);

  // Background scrolling wall of lyric words
  ctx.save();
  ctx.font = '900 68px "Noto Sans Devanagari", "Inter", sans-serif';
  ctx.fillStyle = '#5a0a14';
  ctx.globalAlpha = 0.22;

  const bgWords: string[] = [];
  state.lines.forEach((l) => bgWords.push(...l.words));
  const wallText = bgWords.join('  •  ');
  const scrollOffset = (t * 22) % 1800;

  for (let row = -1; row < 12; row++) {
    const rowY = row * 110 - (t * 14) % 110;
    const rowX = (row % 2 === 0 ? -scrollOffset : scrollOffset - 1800);
    ctx.fillText(wallText + '  •  ' + wallText, rowX, rowY);
  }
  ctx.restore();

  // Floating red ambient light orbs
  const prng = mulberry32(42);
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const ox = width * (0.2 + 0.6 * prng());
    const oy = height * (0.2 + 0.6 * prng()) + Math.sin(t * 1.2 + i) * 35;
    const grad = ctx.createRadialGradient(ox, oy, 10, ox, oy, 400);
    grad.addColorStop(0, 'rgba(180, 20, 50, 0.18)');
    grad.addColorStop(1, 'rgba(180, 20, 50, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, 400, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 2. Centered Frosted Glass Card (1180x760, rounded 44px)
  const cardW = 1180;
  const cardH = 760;
  const cardX = (width - cardW) / 2;
  const cardY = (height - cardH) / 2;

  // Subtle 3D tilt and gentle float
  const floatY = Math.sin(t * 1.4) * 9;
  const floatRotate = Math.sin(t * 0.9) * 0.012;

  ctx.save();
  ctx.translate(width / 2, height / 2 + floatY);

  if (isShattering) {
    // If shattering, glass explodes into fragments flying towards camera
    renderGlassShatter(ctx, shatterProgress, cardW, cardH, t, state, assets);
    ctx.restore();
    return;
  }

  // Simulated 3D tilt: skew and scale transform
  ctx.rotate(floatRotate);
  ctx.transform(1, 0.025, -0.015, 1, 0, 0); // Simulated rotateY / rotateX
  ctx.translate(-cardW / 2, -cardH / 2);

  // Card Outer Shadow / Red Ambient Bloom
  ctx.shadowColor = 'rgba(220, 30, 60, 0.35)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 15;

  // Frosted Glass Fill
  const cardGrad = ctx.createLinearGradient(0, 0, cardW, cardH);
  cardGrad.addColorStop(0, 'rgba(75, 12, 22, 0.82)');
  cardGrad.addColorStop(0.5, 'rgba(42, 8, 14, 0.88)');
  cardGrad.addColorStop(1, 'rgba(25, 4, 8, 0.92)');

  drawRoundedRect(ctx, 0, 0, cardW, cardH, 44);
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Reset shadow for inner contents
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Thin light border
  ctx.strokeStyle = 'rgba(255, 185, 205, 0.32)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Inner diagonal shine sheen on card
  const shineProgress = (t * 0.45) % 3;
  if (shineProgress < 1.4) {
    const shineX = -cardW * 0.4 + shineProgress * (cardW * 1.5);
    const shineGrad = ctx.createLinearGradient(shineX - 160, 0, shineX + 160, cardH);
    shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shineGrad.addColorStop(0.5, 'rgba(255, 220, 235, 0.16)');
    shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.save();
    drawRoundedRect(ctx, 0, 0, cardW, cardH, 44);
    ctx.clip();
    ctx.fillStyle = shineGrad;
    ctx.fillRect(0, 0, cardW, cardH);
    ctx.restore();
  }

  // 3. Top-Left: Cover Art, Song Title, Artists (Apple Music lyrics style)
  const coverSize = 110;
  const coverX = 54;
  const coverY = 50;

  // Cover Art
  const coverImg = assets[state.metadata.coverUrl] || (state.clips[0] ? assets[state.clips[0].url] : null);
  if (coverImg) {
    ctx.save();
    drawRoundedRect(ctx, coverX, coverY, coverSize, coverSize, 20);
    ctx.clip();
    drawImageCover(ctx, coverImg, coverX, coverY, coverSize, coverSize);
    ctx.restore();

    // Cover subtle border
    drawRoundedRect(ctx, coverX, coverY, coverSize, coverSize, 20);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Song Title & Artists
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Title
  ctx.font = '800 36px "Noto Sans Devanagari", "Inter", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(state.metadata.title || 'शीर्षक', coverX + coverSize + 26, coverY + 14);

  // Artists
  ctx.font = '600 22px "Noto Sans Devanagari", "Inter", sans-serif';
  ctx.fillStyle = '#fda4af'; // Soft rose
  ctx.fillText(state.metadata.artists || 'कलाकार', coverX + coverSize + 26, coverY + 62);

  // 4. Center of Card: Current Line Big, Words filling from dim to bright at tapped time
  // Determine current active line
  let activeLineIndex = 0;
  for (let i = 0; i <= state.part1EndLine; i++) {
    const lTimings = state.wordTimings.filter((w) => w.lineIndex === i);
    if (lTimings.length > 0 && t >= lTimings[0].time - 0.4) {
      activeLineIndex = i;
    }
  }

  const currentLine = state.lines[activeLineIndex] || state.lines[0];
  const nextLine = state.lines[activeLineIndex + 1];

  // Dark gradient scrim behind the text inside the card for high contrast legibility
  ctx.save();
  const cardScrim = ctx.createLinearGradient(0, cardH / 2 - 140, 0, cardH / 2 + 160);
  cardScrim.addColorStop(0, 'rgba(8, 1, 3, 0)');
  cardScrim.addColorStop(0.3, 'rgba(10, 1, 4, 0.72)');
  cardScrim.addColorStop(0.7, 'rgba(10, 1, 4, 0.72)');
  cardScrim.addColorStop(1, 'rgba(8, 1, 3, 0)');
  ctx.fillStyle = cardScrim;
  ctx.fillRect(40, cardH / 2 - 140, cardW - 80, 300);
  ctx.restore();

  // Draw Current Line (Sharp, ~80px, Noto Sans Devanagari 800)
  ctx.save();
  ctx.translate(cardW / 2, cardH / 2 - 25);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lineWords = currentLine ? currentLine.words : [];
  const currentLineTimings = state.wordTimings.filter((w) => w.lineIndex === activeLineIndex);

  // Set font: weight 800, ~80px, strictly Noto Sans Devanagari
  ctx.letterSpacing = '0px';
  ctx.font = '800 80px "Noto Sans Devanagari", sans-serif';

  const spaceWidth = ctx.measureText(' ').width;
  const wordMetrics = lineWords.map((word) => ({
    word,
    width: ctx.measureText(word).width,
  }));
  const totalLineWidth = wordMetrics.reduce((acc, m) => acc + m.width, 0) + (lineWords.length - 1) * spaceWidth;

  // Scale down slightly only if line exceeds card margins
  const maxCardTextWidth = cardW - 120;
  const fitScale = totalLineWidth > maxCardTextWidth ? maxCardTextWidth / totalLineWidth : 1.0;
  if (fitScale < 1.0) {
    ctx.scale(fitScale, fitScale);
  }

  let startX = -totalLineWidth / 2;

  lineWords.forEach((word, wIdx) => {
    const timing = currentLineTimings.find((w) => w.wordIndexInLine === wIdx);
    const wordTime = timing ? timing.time : 999;
    const isSang = t >= wordTime;

    ctx.save();
    ctx.letterSpacing = '0px';
    ctx.font = '800 80px "Noto Sans Devanagari", sans-serif';

    if (isSang) {
      // Crisp white with soft shadow (no blur)
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    } else {
      // Dim until sung
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
    }

    ctx.textAlign = 'left';
    // Draw whole word intact so conjuncts and matras stay joined
    ctx.fillText(word, startX, 0);
    ctx.restore();

    startX += wordMetrics[wIdx].width + spaceWidth;
  });
  ctx.restore();

  // Draw Next Line Below (Dim & max 3px slight blur)
  if (nextLine) {
    ctx.save();
    ctx.translate(cardW / 2, cardH / 2 + 120);
    ctx.letterSpacing = '0px';
    ctx.font = '700 46px "Noto Sans Devanagari", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    // Max 3px blur as requested
    ctx.shadowColor = 'rgba(255, 180, 200, 0.35)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillText(nextLine.text, 0, 0);
    ctx.restore();
  }

  // Growing hairline crack lines if near shatter
  if (t >= shatterStartTime - 0.7) {
    const crackProgress = Math.min(1, (t - (shatterStartTime - 0.7)) / 0.7);
    renderGlassCracks(ctx, crackProgress, cardW, cardH);
  }

  ctx.restore();
}

/**
 * Procedural Glass Crack Lines growing on frosted card
 */
function renderGlassCracks(ctx: CanvasRenderingContext2D, progress: number, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + progress * 0.5})`;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;

  const prng = mulberry32(101);
  const cx = w * 0.55;
  const cy = h * 0.45;

  const branches = 7;
  for (let b = 0; b < branches; b++) {
    const angle = (b / branches) * Math.PI * 2 + (prng() - 0.5) * 0.4;
    const maxLen = 350 * progress;
    let currX = cx;
    let currY = cy;

    ctx.beginPath();
    ctx.moveTo(currX, currY);

    const segments = 6;
    for (let s = 1; s <= segments; s++) {
      const segLen = (maxLen / segments) * (0.8 + prng() * 0.4);
      const segAngle = angle + (prng() - 0.5) * 0.6;
      currX += Math.cos(segAngle) * segLen;
      currY += Math.sin(segAngle) * segLen;
      ctx.lineTo(currX, currY);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Glass Shatter Animation: Shards flying toward camera + red bloom
 */
function renderGlassShatter(
  ctx: CanvasRenderingContext2D,
  progress: number,
  cardW: number,
  cardH: number,
  t: number,
  state: ProjectState,
  assets: Record<string, HTMLImageElement>
) {
  const prng = mulberry32(777);
  const numShards = 36;

  // Draw exploding triangular shards
  for (let i = 0; i < numShards; i++) {
    const originX = (prng() - 0.5) * cardW;
    const originY = (prng() - 0.5) * cardH;
    const dirX = originX / (cardW / 2);
    const dirY = originY / (cardH / 2);

    const flySpeed = 400 + prng() * 900;
    const shardX = originX + dirX * flySpeed * progress;
    const shardY = originY + dirY * flySpeed * progress + progress * progress * 300; // gravity
    const shardZ = 1.0 + progress * (1.5 + prng() * 2.0); // Flying towards camera
    const shardRotate = progress * (prng() - 0.5) * 12;

    const sSize = (35 + prng() * 70) * shardZ;

    ctx.save();
    ctx.translate(shardX, shardY);
    ctx.rotate(shardRotate);

    // Shard polygon
    ctx.beginPath();
    ctx.moveTo(0, -sSize * 0.7);
    ctx.lineTo(sSize * 0.8, sSize * 0.5);
    ctx.lineTo(-sSize * 0.6, sSize * 0.6);
    ctx.closePath();

    ctx.fillStyle = `rgba(180, 25, 45, ${Math.max(0, 0.9 - progress * 0.8)})`;
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 230, 240, ${Math.max(0, 1 - progress * 0.9)})`;
    ctx.lineWidth = 2 * shardZ;
    ctx.stroke();

    ctx.restore();
  }

  // Intense Red Bloom transitioning into Part 2
  if (progress > 0.4) {
    const bloomAlpha = Math.sin((progress - 0.4) / 0.6 * Math.PI) * 0.95;
    ctx.save();
    ctx.fillStyle = `rgba(225, 29, 72, ${bloomAlpha})`;
    ctx.fillRect(-cardW, -cardH, cardW * 2, cardH * 2);
    ctx.restore();
  }
}

/**
 * PART 2: Natural Image Clips with Stars, Meteors, and Multilingual Typography
 */
function renderPart2Clips(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: ProjectState,
  assets: Record<string, HTMLImageElement>,
  width: number,
  height: number,
  part2StartTime: number,
  part2EndTime: number
) {
  // Determine which clip is active based on t and assigned line ranges
  const part2Timings = state.wordTimings.filter(
    (w) => w.lineIndex > state.part1EndLine && w.lineIndex < state.keyLineIndex
  );

  let activeLineIndex = state.part1EndLine + 1;
  for (const wt of part2Timings) {
    if (t >= wt.time - 0.3) {
      activeLineIndex = wt.lineIndex;
    }
  }

  // Find clip mapped to activeLineIndex
  let currentClip: ImageClip | undefined = state.clips.find(
    (c) => activeLineIndex >= c.lineStart && activeLineIndex <= c.lineEnd
  );
  if (!currentClip && state.clips.length > 0) {
    currentClip = state.clips[0];
  }

  const clipImg = currentClip ? assets[currentClip.url] : null;

  // Clip duration and progress for slow push-in (1.00 -> 1.08)
  const clipTimings = state.wordTimings.filter(
    (w) => currentClip && w.lineIndex >= currentClip.lineStart && w.lineIndex <= currentClip.lineEnd
  );
  const clipStart = clipTimings.length > 0 ? clipTimings[0].time - 0.5 : part2StartTime;
  const clipEnd = clipTimings.length > 0 ? clipTimings[clipTimings.length - 1].time + 1.2 : part2EndTime;
  const clipDuration = Math.max(0.1, clipEnd - clipStart);
  const clipProgress = Math.min(1, Math.max(0, (t - clipStart) / clipDuration));
  const pushInScale = 1.0 + clipProgress * 0.08;

  // 1. Draw Image Full Screen
  if (clipImg) {
    drawImageCover(ctx, clipImg, 0, 0, width, height, pushInScale);
  } else {
    ctx.fillStyle = '#100408';
    ctx.fillRect(0, 0, width, height);
  }

  // Dark subtle gradient scrim to enhance lyric contrast
  const scrimGrad = ctx.createLinearGradient(0, 0, 0, height);
  scrimGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  scrimGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)');
  scrimGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Alive Elements: Twinkling Stars in upper sky area
  renderTwinklingStars(ctx, t, width, height * 0.55);

  // 3. Shooting Stars / Meteors triggered on nearest beat
  renderBeatShootingStars(ctx, t, state.beatData.times, width, height);

  // 4. Drifting warm bokeh light motes
  renderDriftingLightMotes(ctx, t, width, height);

  // 5. Lyrics in configured empty space (above / below / left)
  const activeLine = state.lines[activeLineIndex];
  const nextLine = state.lines[activeLineIndex + 1];
  if (activeLine) {
    renderPart2Lyrics(ctx, t, activeLine, nextLine, currentClip?.textZone || 'below', state, width, height);
  }

  // 6. Between-shot Transition: White flash or Red burn on nearest beat
  renderBeatTransitions(ctx, t, state.beatData.times, width, height);
}

/**
 * Stars in upper night sky
 */
function renderTwinklingStars(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  const prng = mulberry32(999);
  const numStars = 48;

  ctx.save();
  for (let i = 0; i < numStars; i++) {
    const sx = prng() * w;
    const sy = prng() * h;
    const baseRadius = 0.8 + prng() * 1.6;
    const speed = 2 + prng() * 4;
    const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * speed + i * 2.3));

    ctx.fillStyle = `rgba(255, 245, 250, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, baseRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Shooting stars timed with musical beats
 */
function renderBeatShootingStars(ctx: CanvasRenderingContext2D, t: number, beatTimes: number[], w: number, h: number) {
  if (!beatTimes || beatTimes.length === 0) return;

  // Check if a beat occurred in the last 0.6 seconds
  for (const bTime of beatTimes) {
    const delta = t - bTime;
    if (delta >= 0 && delta <= 0.65) {
      const beatSeed = Math.floor(bTime * 100);
      const prng = mulberry32(beatSeed);
      if (prng() > 0.45) continue; // Trigger on ~55% of beats

      const progress = delta / 0.65;
      const startX = prng() * (w * 0.7);
      const startY = prng() * (h * 0.4);
      const angle = Math.PI / 4 + (prng() - 0.5) * 0.2; // ~45 deg
      const travelDist = 380;

      const headX = startX + Math.cos(angle) * travelDist * progress;
      const headY = startY + Math.sin(angle) * travelDist * progress;
      const tailX = startX + Math.cos(angle) * travelDist * Math.max(0, progress - 0.3);
      const tailY = startY + Math.sin(angle) * travelDist * Math.max(0, progress - 0.3);

      const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(1, `rgba(255, 220, 235, ${1 - progress})`);

      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();

      // Sparkle head
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress})`;
      ctx.beginPath();
      ctx.arc(headX, headY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/**
 * Warm drifting light motes
 */
function renderDriftingLightMotes(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  const prng = mulberry32(333);
  const numMotes = 22;

  ctx.save();
  for (let i = 0; i < numMotes; i++) {
    const baseX = prng() * w;
    const baseY = prng() * h;
    const r = 2 + prng() * 5;
    const x = (baseX + Math.sin(t * 0.8 + i) * 45) % w;
    const y = (baseY - t * (15 + prng() * 20)) % h;
    const adjustedY = y < 0 ? y + h : y;

    const alpha = 0.15 + 0.2 * Math.sin(t * 1.5 + i);
    const grad = ctx.createRadialGradient(x, adjustedY, 0, x, adjustedY, r * 2.5);
    grad.addColorStop(0, `rgba(255, 215, 180, ${alpha})`);
    grad.addColorStop(1, 'rgba(255, 215, 180, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, adjustedY, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Soft dark gradient band (about 40% to 55% black, feathered edges)
 * ensures text stays completely legible on any photo, bright skies, or busy textures
 */
function renderDarkGradientBand(
  ctx: CanvasRenderingContext2D,
  centerY: number,
  bandHeight: number,
  w: number
) {
  ctx.save();
  const topY = centerY - bandHeight / 2;
  const botY = centerY + bandHeight / 2;
  const bandGrad = ctx.createLinearGradient(0, topY, 0, botY);
  // Feathered edges (0% -> ~48% black -> ~48% black -> 0%)
  bandGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  bandGrad.addColorStop(0.2, 'rgba(0, 0, 0, 0.48)');
  bandGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.48)');
  bandGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, topY, w, bandHeight);
  ctx.restore();
}

/**
 * Lyrics placement in Part 2: Exact same lyric text style as the glass card
 * 1. Current line: Noto Sans Devanagari 800, white, large (~80px), sharp no blur, soft dark shadow. Whole words only, no letter-spacing.
 * 2. Words start dim and turn bright exactly at their timing.
 * 3. Next line below: smaller (700 44px), dim, max 3 px blur.
 * 4. Soft dark gradient band (40-55% black, feathered edges) behind text on photo.
 * 5. Positioned in the empty area of each photo (above/below/left), never over a face, inside safe margins.
 * 6. Red Great Vibes script Roman word as an accent only.
 */
function renderPart2Lyrics(
  ctx: CanvasRenderingContext2D,
  t: number,
  line: LyricLine,
  nextLine: LyricLine | undefined,
  textZone: 'above' | 'below' | 'left',
  state: ProjectState,
  w: number,
  h: number
) {
  ctx.save();

  let targetX = w / 2;
  let targetY = h * 0.76; // Default 'below': lower third below subject/face
  let textAlign: CanvasTextAlign = 'center';

  if (textZone === 'above') {
    targetY = h * 0.22; // In upper sky/headroom, above face
  } else if (textZone === 'left') {
    targetX = 140; // Inside left safe margin
    targetY = h * 0.52;
    textAlign = 'left';
  }

  // 4. Soft dark gradient band (about 48% black, feathered edges) behind text on photo
  renderDarkGradientBand(ctx, targetY + 45, 290, w);

  // 1. Current line: Noto Sans Devanagari 800, white, large (~80px), sharp with no blur, soft dark shadow
  ctx.save();
  ctx.letterSpacing = '0px';
  ctx.font = '800 80px "Noto Sans Devanagari", sans-serif';

  const lineTimings = state.wordTimings.filter((w) => w.lineIndex === line.lineIndex);
  const spaceW = ctx.measureText(' ').width;
  const metrics = line.words.map((wd) => ({
    word: wd,
    width: ctx.measureText(wd).width,
  }));
  const totalW = metrics.reduce((acc, m) => acc + m.width, 0) + (line.words.length - 1) * spaceW;

  // Keep inside safe margins
  const maxTextWidth = textAlign === 'left' ? w - targetX - 100 : w * 0.86;
  const fitScale = totalW > maxTextWidth ? maxTextWidth / totalW : 1.0;
  if (fitScale < 1.0) {
    ctx.translate(targetX, targetY);
    ctx.scale(fitScale, fitScale);
    ctx.translate(-targetX, -targetY);
  }

  let currX = textAlign === 'center' ? targetX - totalW / 2 : targetX;

  line.words.forEach((wd, idx) => {
    const timing = lineTimings.find((item) => item.wordIndexInLine === idx);
    const isSang = timing && t >= timing.time;

    ctx.save();
    ctx.letterSpacing = '0px';
    ctx.font = '800 80px "Noto Sans Devanagari", sans-serif';

    if (isSang) {
      // Sharp white with soft dark shadow (no blur)
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    } else {
      // Dim until sung
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
    }

    ctx.textAlign = 'left';
    // Whole words only, never split letters
    ctx.fillText(wd, currX, targetY);
    ctx.restore();

    currX += metrics[idx].width + spaceW;
  });

  ctx.restore();

  // 3. Next line below: smaller (700 44px), dim, max 3 px blur
  if (nextLine) {
    ctx.save();
    ctx.letterSpacing = '0px';
    ctx.font = '700 44px "Noto Sans Devanagari", sans-serif';
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 3; // max 3px blur
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;

    const nextLineW = ctx.measureText(nextLine.text).width;
    const nextFitScale = nextLineW > maxTextWidth ? maxTextWidth / nextLineW : 1.0;
    if (nextFitScale < 1.0) {
      ctx.translate(targetX, targetY + 115);
      ctx.scale(nextFitScale, nextFitScale);
      ctx.translate(-targetX, -(targetY + 115));
    }

    ctx.fillText(nextLine.text, targetX, targetY + 115);
    ctx.restore();
  }

  // 6. Red Great Vibes script word in Roman letters as an accent only
  const flourishWord = line.scriptFlourishWord || 'shayar';
  const firstWordTime = lineTimings.length > 0 ? lineTimings[0].time : t;
  const lastWordTime = lineTimings.length > 0 ? lineTimings[lineTimings.length - 1].time : t + 2;
  const flourishProgress = Math.min(1, Math.max(0, (t - firstWordTime) / Math.max(0.1, lastWordTime - firstWordTime)));

  ctx.save();
  ctx.font = '46px "Great Vibes", cursive';
  ctx.fillStyle = '#ff2b54'; // Vibrant crimson accent
  ctx.shadowColor = 'rgba(255, 43, 84, 0.65)';
  ctx.shadowBlur = 10;

  const accentX = textAlign === 'center' ? targetX + Math.min(420, (totalW * fitScale) / 2 + 24) : targetX + (totalW * fitScale) + 24;
  const accentY = targetY - 42;

  const charsCount = Math.floor(flourishWord.length * flourishProgress);
  const revealedStr = flourishWord.substring(0, charsCount);

  ctx.textAlign = 'left';
  ctx.fillText(revealedStr, accentX, accentY);
  ctx.restore();

  ctx.restore();
}

/**
 * Soft beat transitions (white flash or red burn)
 */
function renderBeatTransitions(ctx: CanvasRenderingContext2D, t: number, beatTimes: number[], w: number, h: number) {
  if (!beatTimes) return;
  for (const bt of beatTimes) {
    const diff = t - bt;
    if (diff >= 0 && diff < 0.18) {
      const flashAlpha = (1 - diff / 0.18) * 0.32;
      ctx.save();
      // Alternate red burn vs white flash based on beat parity
      if (Math.floor(bt * 2) % 2 === 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      } else {
        ctx.fillStyle = `rgba(220, 20, 60, ${flashAlpha * 1.2})`;
      }
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }
  }
}

/**
 * KEY LINE CLIMAX: Giant letters acting as clipping mask for brightest image + Embers + Burst expansion
 */
function renderKeyLineClimax(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: ProjectState,
  assets: Record<string, HTMLImageElement>,
  width: number,
  height: number,
  startTime: number,
  endTime: number
) {
  // Pure Black Canvas
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const keyLine = state.lines[state.keyLineIndex] || state.lines[0];
  const keyTimings = state.wordTimings.filter((w) => w.lineIndex === state.keyLineIndex);
  const lastKeyTime = keyTimings.length > 0 ? keyTimings[keyTimings.length - 1].time : endTime - 1.2;

  // Check if we reached the burst phase after the last word
  const isBursting = t > lastKeyTime + 0.4;
  const burstProgress = isBursting ? Math.min(1, (t - (lastKeyTime + 0.4)) / 1.2) : 0;
  const textScale = 1.0 + burstProgress * burstProgress * 3.8; // Exponential zoom until image fills screen

  // Brightest clip image selection
  const brightImg = state.clips[1] ? assets[state.clips[1].url] : (state.clips[0] ? assets[state.clips[0].url] : null);

  // Render floating fiery embers
  renderFloatingEmbers(ctx, t, width, height, isBursting ? 1.5 : 1.0);

  // Offscreen canvas for destination-in / source-in masking
  const { canvas: maskCanvas, ctx: maskCtx } = getOffscreenCanvasA(width, height);

  // 1. Draw Giant Heavy Text on mask canvas
  maskCtx.save();
  maskCtx.translate(width / 2, height / 2);
  maskCtx.scale(textScale, textScale);

  maskCtx.letterSpacing = '0px';
  maskCtx.font = '800 96px "Noto Sans Devanagari", sans-serif';
  maskCtx.textAlign = 'center';
  maskCtx.textBaseline = 'middle';
  maskCtx.fillStyle = '#ffffff';

  // Words reveal in sync with tapped timings
  if (keyLine) {
    const spaceW = maskCtx.measureText(' ').width;
    const metrics = keyLine.words.map((w) => ({
      word: w,
      width: maskCtx.measureText(w).width,
    }));
    const totalW = metrics.reduce((a, b) => a + b.width, 0) + (keyLine.words.length - 1) * spaceW;

    // Check if line exceeds screen width, scale smoothly
    const maxAllowedW = width * 0.88;
    const scaleFactor = totalW > maxAllowedW ? maxAllowedW / totalW : 1.0;
    if (scaleFactor < 1.0) {
      maskCtx.scale(scaleFactor, scaleFactor);
    }

    let currX = -totalW / 2;
    keyLine.words.forEach((wd, idx) => {
      const wt = keyTimings.find((item) => item.wordIndexInLine === idx);
      const isSang = wt && t >= wt.time;

      maskCtx.save();
      maskCtx.letterSpacing = '0px';
      maskCtx.font = '800 96px "Noto Sans Devanagari", sans-serif';
      maskCtx.textAlign = 'left';
      maskCtx.fillStyle = isSang ? '#ffffff' : 'rgba(255, 255, 255, 0.28)';
      maskCtx.fillText(wd, currX, 0);
      maskCtx.restore();

      currX += metrics[idx].width + spaceW;
    });
  }
  maskCtx.restore();

  // 2. Composite brightest image inside text letters
  maskCtx.save();
  maskCtx.globalCompositeOperation = 'source-in';
  if (brightImg) {
    drawImageCover(maskCtx, brightImg, 0, 0, width, height, 1.05 + burstProgress * 0.2);
  } else {
    maskCtx.fillStyle = '#f43f5e';
    maskCtx.fillRect(0, 0, width, height);
  }
  maskCtx.restore();

  // Draw masked text onto main canvas with soft dark gradient band and outer glow
  renderDarkGradientBand(ctx, height / 2, 320, width);

  ctx.save();
  ctx.shadowColor = 'rgba(244, 63, 94, 0.75)';
  ctx.shadowBlur = 35 + burstProgress * 50;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();

  // 3. Next line below (dim, max 3px blur, fading out as climax bursts)
  const nextKeyLine = state.lines[state.keyLineIndex + 1];
  if (nextKeyLine && burstProgress < 0.6) {
    ctx.save();
    ctx.letterSpacing = '0px';
    ctx.font = '700 44px "Noto Sans Devanagari", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 255, 255, ${0.28 * (1 - burstProgress * 1.6)})`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillText(nextKeyLine.text, width / 2, height / 2 + 115);
    ctx.restore();
  }

  // If burst is finishing, draw full image overtop with fade-in to complete the fill
  if (burstProgress > 0.6 && brightImg) {
    const fillAlpha = (burstProgress - 0.6) / 0.4;
    ctx.save();
    ctx.globalAlpha = fillAlpha;
    drawImageCover(ctx, brightImg, 0, 0, width, height, 1.25);
    ctx.restore();
  }
}

/**
 * Floating fiery embers rising around Key Line
 */
function renderFloatingEmbers(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, speedMult: number) {
  const prng = mulberry32(555);
  const numEmbers = 45;

  ctx.save();
  for (let i = 0; i < numEmbers; i++) {
    const baseX = prng() * w;
    const baseY = prng() * h;
    const size = 1.5 + prng() * 3.5;
    const speed = (40 + prng() * 90) * speedMult;

    const x = baseX + Math.sin(t * 2 + i) * 25;
    const y = (baseY - t * speed) % h;
    const adjY = y < 0 ? y + h : y;

    const alpha = 0.4 + 0.6 * Math.sin(t * 3.5 + i);

    ctx.fillStyle = i % 2 === 0 ? `rgba(255, 100, 50, ${alpha})` : `rgba(244, 63, 94, ${alpha})`;
    ctx.shadowColor = '#ff4d4d';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, adjY, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * PART 3: Pink Neon Ending with Bouncing Word Landing, Wet Floor Reflections & Rain Streaks
 */
function renderPart3PinkNeon(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: ProjectState,
  assets: Record<string, HTMLImageElement>,
  width: number,
  height: number,
  part3StartTime: number,
  duration: number
) {
  // 1. Background image in stylized Pink Duotone (magenta to hot pink to pale pink, darker at bottom)
  const neonImg = state.clips[2] ? assets[state.clips[2].url] : (state.clips[0] ? assets[state.clips[0].url] : null);

  if (neonImg) {
    // Render image in pink duotone
    const { canvas: dCanvas, ctx: dCtx } = getOffscreenCanvasA(width, height);
    drawImageCover(dCtx, neonImg, 0, 0, width, height, 1.03);

    // Apply Pink Duotone color tint
    dCtx.save();
    dCtx.globalCompositeOperation = 'multiply';
    const pinkGrad = dCtx.createLinearGradient(0, 0, 0, height);
    pinkGrad.addColorStop(0, '#c026d3'); // Magenta
    pinkGrad.addColorStop(0.5, '#f43f5e'); // Hot Pink
    pinkGrad.addColorStop(1, '#2e021a'); // Dark wine bottom
    dCtx.fillStyle = pinkGrad;
    dCtx.fillRect(0, 0, width, height);

    dCtx.globalCompositeOperation = 'screen';
    dCtx.fillStyle = 'rgba(253, 242, 248, 0.15)'; // Pale pink sheen
    dCtx.fillRect(0, 0, width, height);
    dCtx.restore();

    ctx.drawImage(dCanvas, 0, 0);
  } else {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#1c0312');
    bgGrad.addColorStop(0.6, '#380625');
    bgGrad.addColorStop(1, '#0e0108');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  }

  // Wet reflective floor line at y = 720
  const floorY = 720;

  // Dark wet floor gradient
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, height);
  floorGrad.addColorStop(0, 'rgba(12, 1, 8, 0.72)');
  floorGrad.addColorStop(0.3, 'rgba(18, 2, 12, 0.88)');
  floorGrad.addColorStop(1, 'rgba(6, 0, 4, 0.96)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, floorY, width, height - floorY);

  // Floor hairline horizon edge
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 105, 180, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(width, floorY);
  ctx.stroke();
  ctx.restore();

  // Determine active Part 3 line
  const part3Lines = state.lines.filter((l) => l.lineIndex >= state.part3StartLine);
  let activeLine: LyricLine = part3Lines[0];

  for (const l of part3Lines) {
    const timings = state.wordTimings.filter((w) => w.lineIndex === l.lineIndex);
    if (timings.length > 0 && t >= timings[0].time - 0.3) {
      activeLine = l;
    }
  }

  if (activeLine) {
    const lineTimings = state.wordTimings.filter((w) => w.lineIndex === activeLine.lineIndex);

    // 2. Draw Bouncing Words & Multi-pass Neon Glow
    ctx.save();
    ctx.letterSpacing = '0px';
    ctx.font = '800 80px "Noto Sans Devanagari", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const spaceW = ctx.measureText(' ').width;
    const metrics = activeLine.words.map((wd) => ({
      word: wd,
      width: ctx.measureText(wd).width,
    }));
    const totalW = metrics.reduce((a, b) => a + b.width, 0) + (activeLine.words.length - 1) * spaceW;

    const baselineY = floorY - 35; // words rest just above wet floor

    // Dark scrim gradient behind neon lyrics for maximum contrast and legibility
    const maxTextWidth = width * 0.88;
    const fitScale = totalW > maxTextWidth ? maxTextWidth / totalW : 1.0;
    if (fitScale < 1.0) {
      ctx.translate(width / 2, baselineY);
      ctx.scale(fitScale, fitScale);
      ctx.translate(-width / 2, -baselineY);
    }

    // 4. Soft dark gradient band (about 48% black, feathered edges) behind text on photo
    renderDarkGradientBand(ctx, baselineY + 30, 320, width);

    let startX = width / 2 - totalW / 2;

    activeLine.words.forEach((wd, idx) => {
      const timing = lineTimings.find((item) => item.wordIndexInLine === idx);
      const wordTime = timing ? timing.time : 999;
      const wordAge = t - wordTime;

      if (wordAge >= 0) {
        // Drop with physical bounce
        const dropDuration = 0.38;
        let yOffset = 0;

        if (wordAge < dropDuration) {
          const bounceProgress = easeOutBack(wordAge / dropDuration);
          yOffset = -220 * (1 - bounceProgress);
        }

        const currentWordY = baselineY + yOffset;

        // Subtle high-frequency neon flicker on entrance
        const neonFlicker = wordAge < 0.25 ? (Math.sin(t * 90 + idx * 15) > 0.1 ? 1.0 : 0.4) : 0.95 + 0.05 * Math.sin(t * 30 + idx);

        // Render Multi-pass Neon Glow
        ctx.save();
        ctx.globalAlpha = neonFlicker;
        ctx.letterSpacing = '0px';
        ctx.font = '800 80px "Noto Sans Devanagari", sans-serif';

        // Pass 3: Outer soft halo
        ctx.shadowColor = '#ff1493'; // Deep Pink
        ctx.shadowBlur = 38;
        ctx.fillStyle = '#ff69b4';
        ctx.fillText(wd, startX, currentWordY);

        // Pass 2: Intense inner neon
        ctx.shadowColor = '#ff2a85';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ffb6c1';
        ctx.fillText(wd, startX, currentWordY);

        // Pass 1: Crisp pale-pink/white core (SHARP, no blur, completely readable)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(wd, startX, currentWordY);

        ctx.restore();

        // 3. Wet Floor Landing Splash & Droplets
        if (wordAge >= dropDuration && wordAge < dropDuration + 0.8) {
          const splashAge = wordAge - dropDuration;
          renderFloorSplash(ctx, startX + metrics[idx].width / 2, floorY, splashAge);
        }

        // 4. Wet Floor Reflection with Ripple Distortion
        renderFloorReflection(ctx, wd, startX, floorY, baselineY - floorY, wordAge, t);
      } else {
        // Dim until sung - sharp with soft dark shadow
        ctx.save();
        ctx.letterSpacing = '0px';
        ctx.font = '800 80px "Noto Sans Devanagari", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.fillText(wd, startX, baselineY);
        ctx.restore();
      }

      startX += metrics[idx].width + spaceW;
    });

    // 3. Next line below: smaller (700 44px), dim, max 3 px blur
    const nextLine = state.lines[activeLine.lineIndex + 1];
    if (nextLine) {
      ctx.save();
      ctx.letterSpacing = '0px';
      ctx.font = '700 44px "Noto Sans Devanagari", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255, 190, 220, 0.32)';
      ctx.shadowColor = 'rgba(255, 105, 180, 0.35)';
      ctx.shadowBlur = 3; // max 3px blur
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;

      const nextLineW = ctx.measureText(nextLine.text).width;
      const nextFitScale = nextLineW > maxTextWidth ? maxTextWidth / nextLineW : 1.0;
      if (nextFitScale < 1.0) {
        ctx.translate(width / 2, baselineY + 95);
        ctx.scale(nextFitScale, nextFitScale);
        ctx.translate(-width / 2, -(baselineY + 95));
      }

      ctx.fillText(nextLine.text, width / 2, baselineY + 95);
      ctx.restore();
    }

    ctx.restore();
  }

  // 5. Light Rain Streaks and Glass Water Condensation
  renderRainStreaks(ctx, t, width, height);
}

/**
 * Floor splash ripple and bouncing droplets when a word lands
 */
function renderFloorSplash(ctx: CanvasRenderingContext2D, x: number, y: number, age: number) {
  const maxAge = 0.75;
  const progress = age / maxAge;
  const alpha = (1 - progress) * 0.75;

  ctx.save();
  // Expanding elliptical ripple
  ctx.strokeStyle = `rgba(255, 105, 180, ${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y + 8, progress * 48, progress * 12, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Secondary inner ripple
  if (progress > 0.15) {
    const innerProgress = (progress - 0.15) / 0.85;
    ctx.strokeStyle = `rgba(255, 180, 220, ${alpha * 0.8})`;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(x, y + 8, innerProgress * 28, innerProgress * 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Upward splash droplets
  const prng = mulberry32(Math.floor(x * 10));
  const numDrops = 6;
  for (let d = 0; d < numDrops; d++) {
    const dropAngle = -Math.PI / 2 + (prng() - 0.5) * 1.2;
    const dropSpeed = 40 + prng() * 50;
    const dx = Math.cos(dropAngle) * dropSpeed * progress;
    const dy = Math.sin(dropAngle) * dropSpeed * progress + 90 * progress * progress; // gravity

    ctx.fillStyle = `rgba(255, 200, 230, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Wet floor mirrored reflection with ripple distortion
 */
function renderFloorReflection(
  ctx: CanvasRenderingContext2D,
  word: string,
  x: number,
  floorY: number,
  distFromFloor: number,
  wordAge: number,
  t: number
) {
  ctx.save();
  // Invert across floor line
  ctx.translate(0, floorY);
  ctx.scale(1, -0.65); // Compressed mirror reflection
  ctx.translate(0, -floorY);

  // Ripple sine wave distortion
  const rippleOffset = Math.sin(t * 8 + x * 0.05) * 4;
  const reflY = floorY - distFromFloor + rippleOffset;

  ctx.globalAlpha = 0.28;
  ctx.shadowColor = '#ff1493';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#ff69b4';
  ctx.fillText(word, x, reflY);

  ctx.restore();
}

/**
 * Diagonal rain streaks and glass condensation drops
 */
function renderRainStreaks(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  const prng = mulberry32(888);
  const numStreaks = 65;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 220, 240, 0.22)';
  ctx.lineWidth = 1.2;

  const rainAngle = Math.PI / 2 + 0.18; // slightly diagonal
  const rainCos = Math.cos(rainAngle);
  const rainSin = Math.sin(rainAngle);

  for (let i = 0; i < numStreaks; i++) {
    const baseX = prng() * (w + 400) - 200;
    const baseY = prng() * h;
    const speed = 1200 + prng() * 600;
    const len = 35 + prng() * 50;

    const currentY = (baseY + t * speed) % h;
    const currentX = baseX + (currentY - baseY) * (rainCos / rainSin);

    ctx.beginPath();
    ctx.moveTo(currentX, currentY);
    ctx.lineTo(currentX + rainCos * len, currentY + rainSin * len);
    ctx.stroke();
  }

  // Slow water droplets sliding on lens glass
  const numGlassDrops = 7;
  for (let d = 0; d < numGlassDrops; d++) {
    const gx = prng() * w;
    const gy = (prng() * h + t * (25 + prng() * 30)) % h;
    const gr = 3.5 + prng() * 3;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.arc(gx - 1, gy - 1, gr * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Procedural Film Grain for authentic 35mm cinema texture
 */
function renderFilmGrain(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  // Use offscreen canvas to generate 256x256 seeded noise tile
  const tileSize = 128;
  const { canvas: grainCanvas, ctx: grainCtx } = getOffscreenCanvasB(tileSize, tileSize);
  const imgData = grainCtx.createImageData(tileSize, tileSize);
  const data = imgData.data;

  // Frame seed based on integer frame index (at 30fps)
  const frameIdx = Math.floor(t * 30);
  const prng = mulberry32(frameIdx * 9999 + 17);

  for (let i = 0; i < data.length; i += 4) {
    const val = Math.floor(prng() * 255);
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 22; // very subtle grain opacity
  }
  grainCtx.putImageData(imgData, 0, 0);

  // Pattern tile over full 1920x1080 canvas
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.65;
  const pattern = ctx.createPattern(grainCanvas, 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/**
 * Soft cinematic vignette darkening outer boundaries
 */
function renderVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  const radius = Math.sqrt(w * w + h * h) / 2;
  const grad = ctx.createRadialGradient(w / 2, h / 2, radius * 0.45, w / 2, h / 2, radius);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.72)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Smooth fade in from black at start and fade out at end
 */
function renderGlobalFades(ctx: CanvasRenderingContext2D, t: number, duration: number, w: number, h: number) {
  const fadeInDuration = 0.8; // Exactly 0.8s fade in
  const fadeOutDuration = 2.0; // Exactly 2.0s fade out
  const fadeOutStart = duration - fadeOutDuration;

  let fadeAlpha = 0;

  if (t < fadeInDuration) {
    fadeAlpha = 1 - t / fadeInDuration;
  } else if (t > fadeOutStart) {
    fadeAlpha = Math.min(1, (t - fadeOutStart) / fadeOutDuration);
  }

  if (fadeAlpha > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
