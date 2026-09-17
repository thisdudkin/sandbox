/// <reference lib="webworker" />

import type { RenderFailure, RenderRequest, RenderSuccess } from './messages';

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<RenderRequest>): void => {
  const request = event.data;
  if (request.type !== 'render') {
    return;
  }

  try {
    const startedAt = performance.now();
    const result = renderFractal(request);
    const response: RenderSuccess = {
      type: 'rendered',
      jobId: request.jobId,
      width: request.width,
      height: request.height,
      // Uint8ClampedArray создан над обычным ArrayBuffer, SharedArrayBuffer здесь не используется.
      pixels: result.pixels.buffer as ArrayBuffer,
      elapsedMs: performance.now() - startedAt,
      escapedRatio: result.escapedRatio,
      averageIterations: result.averageIterations,
    };
    workerScope.postMessage(response, [response.pixels]);
  } catch (error: unknown) {
    const response: RenderFailure = {
      type: 'error',
      jobId: request.jobId,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка вычисления.',
    };
    workerScope.postMessage(response);
  }
};

interface FrameResult {
  readonly pixels: Uint8ClampedArray;
  readonly escapedRatio: number;
  readonly averageIterations: number;
}

function renderFractal(request: RenderRequest): FrameResult {
  const { width, height, bounds, kind, juliaC, maxIterations, escapeRadius } = request;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Некорректный размер изображения.');
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  const stepRe = (bounds.maxRe - bounds.minRe) / width;
  const stepIm = (bounds.maxIm - bounds.minIm) / height;
  const radiusSquared = escapeRadius * escapeRadius;
  let escapedCount = 0;
  let iterationTotal = 0;

  for (let y = 0; y < height; y += 1) {
    const im = bounds.maxIm - (y + 0.5) * stepIm;
    for (let x = 0; x < width; x += 1) {
      const re = bounds.minRe + (x + 0.5) * stepRe;
      const escape = kind === 'mandelbrot'
        ? mandelbrotEscape(re, im, maxIterations, radiusSquared)
        : juliaEscape(re, im, juliaC.re, juliaC.im, maxIterations, radiusSquared);
      const offset = (y * width + x) * 4;
      if (escape.iterations < 0) {
        pixels[offset] = 2;
        pixels[offset + 1] = 5;
        pixels[offset + 2] = 12;
        iterationTotal += maxIterations;
      } else {
        escapedCount += 1;
        iterationTotal += escape.iterations;
        writeColor(pixels, offset, escape.smooth, maxIterations);
      }
      pixels[offset + 3] = 255;
    }
  }

  const pixelCount = width * height;
  return {
    pixels,
    escapedRatio: escapedCount / pixelCount,
    averageIterations: iterationTotal / pixelCount,
  };
}

interface EscapeValue {
  readonly iterations: number;
  readonly smooth: number;
}

function mandelbrotEscape(
  cRe: number,
  cIm: number,
  maxIterations: number,
  radiusSquared: number,
): EscapeValue {
  // Главная кардиоида и круг периода 2 составляют большую часть чёрной области.
  // Их аналитическая проверка экономит сотни итераций на каждом внутреннем пикселе.
  const shifted = cRe - 0.25;
  const q = shifted * shifted + cIm * cIm;
  if (q * (q + shifted) <= 0.25 * cIm * cIm || (cRe + 1) ** 2 + cIm * cIm <= 0.0625) {
    return { iterations: -1, smooth: maxIterations };
  }
  return iterate(0, 0, cRe, cIm, maxIterations, radiusSquared);
}

function juliaEscape(
  zRe: number,
  zIm: number,
  cRe: number,
  cIm: number,
  maxIterations: number,
  radiusSquared: number,
): EscapeValue {
  return iterate(zRe, zIm, cRe, cIm, maxIterations, radiusSquared);
}

function iterate(
  initialRe: number,
  initialIm: number,
  cRe: number,
  cIm: number,
  maxIterations: number,
  radiusSquared: number,
): EscapeValue {
  let re = initialRe;
  let im = initialIm;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const nextRe = re * re - im * im + cRe;
    im = 2 * re * im + cIm;
    re = nextRe;
    const absoluteSquared = re * re + im * im;
    if (absoluteSquared > radiusSquared) {
      const logMagnitude = Math.log(absoluteSquared) / 2;
      const smooth = logMagnitude > 0
        ? iteration + 1 - Math.log2(logMagnitude)
        : iteration;
      return { iterations: iteration, smooth: Number.isFinite(smooth) ? smooth : iteration };
    }
  }
  return { iterations: -1, smooth: maxIterations };
}

function writeColor(
  pixels: Uint8ClampedArray,
  offset: number,
  smoothIterations: number,
  maxIterations: number,
): void {
  const t = Math.min(1, Math.max(0, smoothIterations / maxIterations));
  const wave = Math.pow(t, 0.32);
  // Холодные тени и алые гребни дают контрастную «паучью» топографию.
  pixels[offset] = Math.round(20 + 235 * Math.sin(Math.PI * wave) ** 2);
  pixels[offset + 1] = Math.round(8 + 55 * Math.sin(Math.PI * (wave + 0.2)) ** 2);
  pixels[offset + 2] = Math.round(35 + 170 * Math.sin(Math.PI * (wave + 0.46)) ** 2);
}

export {};
