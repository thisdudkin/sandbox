import type { Complex } from './complex';

export interface Bounds {
  readonly minRe: number;
  readonly maxRe: number;
  readonly minIm: number;
  readonly maxIm: number;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export const INITIAL_BOUNDS: Bounds = Object.freeze({
  minRe: -5,
  maxRe: 5,
  minIm: -5,
  maxIm: 5,
});

export function canvasToComplex(
  x: number,
  y: number,
  size: CanvasSize,
  bounds: Bounds,
): Complex {
  assertValidSize(size);
  return {
    re: bounds.minRe + (x / size.width) * (bounds.maxRe - bounds.minRe),
    im: bounds.maxIm - (y / size.height) * (bounds.maxIm - bounds.minIm),
  };
}

export function complexToCanvas(
  value: Complex,
  size: CanvasSize,
  bounds: Bounds,
): { readonly x: number; readonly y: number } {
  assertValidSize(size);
  return {
    x: ((value.re - bounds.minRe) / (bounds.maxRe - bounds.minRe)) * size.width,
    y: ((bounds.maxIm - value.im) / (bounds.maxIm - bounds.minIm)) * size.height,
  };
}

export function zoomAt(
  bounds: Bounds,
  anchor: Complex,
  scale: number,
): Bounds {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('Коэффициент масштаба должен быть положительным.');
  }

  return {
    minRe: anchor.re + (bounds.minRe - anchor.re) * scale,
    maxRe: anchor.re + (bounds.maxRe - anchor.re) * scale,
    minIm: anchor.im + (bounds.minIm - anchor.im) * scale,
    maxIm: anchor.im + (bounds.maxIm - anchor.im) * scale,
  };
}

export function panByPixels(
  bounds: Bounds,
  deltaX: number,
  deltaY: number,
  size: CanvasSize,
): Bounds {
  assertValidSize(size);
  const shiftRe = (-deltaX / size.width) * (bounds.maxRe - bounds.minRe);
  const shiftIm = (deltaY / size.height) * (bounds.maxIm - bounds.minIm);
  return {
    minRe: bounds.minRe + shiftRe,
    maxRe: bounds.maxRe + shiftRe,
    minIm: bounds.minIm + shiftIm,
    maxIm: bounds.maxIm + shiftIm,
  };
}

export function cloneBounds(bounds: Bounds): Bounds {
  return { ...bounds };
}

function assertValidSize(size: CanvasSize): void {
  if (size.width <= 0 || size.height <= 0) {
    throw new RangeError('Размер Canvas должен быть положительным.');
  }
}
