import type { Complex } from './complex';

export interface EscapeResult {
  readonly escaped: boolean;
  readonly iterations: number;
  readonly smoothIterations: number;
}

export function escapeTime(
  initial: Complex,
  constant: Complex,
  maxIterations: number,
  escapeRadius: number,
): EscapeResult {
  assertAlgorithmParameters(maxIterations, escapeRadius);

  let re = initial.re;
  let im = initial.im;
  const radiusSquared = escapeRadius * escapeRadius;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const nextRe = re * re - im * im + constant.re;
    const nextIm = 2 * re * im + constant.im;
    re = nextRe;
    im = nextIm;

    const absoluteSquared = re * re + im * im;
    if (absoluteSquared > radiusSquared) {
      // log(|z|) = log(|z|²) / 2: для проверки выхода sqrt не вычисляется.
      const logarithmicMagnitude = Math.log(absoluteSquared) / 2;
      const smooth =
        logarithmicMagnitude > 0
          ? iteration + 1 - Math.log2(logarithmicMagnitude)
          : iteration;
      return {
        escaped: true,
        iterations: iteration,
        smoothIterations: Number.isFinite(smooth) ? smooth : iteration,
      };
    }
  }

  return {
    escaped: false,
    iterations: maxIterations,
    smoothIterations: maxIterations,
  };
}

export function colorForEscape(
  result: EscapeResult,
  maxIterations: number,
): readonly [red: number, green: number, blue: number] {
  if (!result.escaped) {
    return [0, 0, 0];
  }

  const t = Math.min(1, Math.max(0, result.smoothIterations / maxIterations));
  const phase = Math.pow(t, 0.38);
  const red = Math.round(255 * (0.16 + 0.84 * Math.sin(Math.PI * phase) ** 2));
  const green = Math.round(255 * (0.05 + 0.82 * Math.sin(Math.PI * (phase + 0.23)) ** 2));
  const blue = Math.round(255 * (0.18 + 0.82 * Math.sin(Math.PI * (phase + 0.47)) ** 2));
  return [red, green, blue];
}

export function assertAlgorithmParameters(maxIterations: number, escapeRadius: number): void {
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
    throw new RangeError('Число итераций должно быть положительным целым числом.');
  }
  if (!Number.isFinite(escapeRadius) || escapeRadius <= 0) {
    throw new RangeError('Порог выхода должен быть положительным числом.');
  }
}
