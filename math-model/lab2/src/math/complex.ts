export interface Complex {
  readonly re: number;
  readonly im: number;
}

export function add(left: Complex, right: Complex): Complex {
  return { re: left.re + right.re, im: left.im + right.im };
}

export function square(value: Complex): Complex {
  return {
    re: value.re * value.re - value.im * value.im,
    im: 2 * value.re * value.im,
  };
}

export function magnitudeSquared(value: Complex): number {
  return value.re * value.re + value.im * value.im;
}

export function formatComplex(value: Complex, precision = 4): string {
  const real = normalizeNegativeZero(value.re).toFixed(precision);
  const imaginaryValue = normalizeNegativeZero(value.im);
  const sign = imaginaryValue < 0 ? '−' : '+';
  return `${real} ${sign} ${Math.abs(imaginaryValue).toFixed(precision)}i`;
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
