import type { Complex } from '../math/complex';

export const MIN_ITERATIONS = 10;
export const MAX_ITERATIONS = 5000;
export const RADIUS_OPTIONS = [10, 20, 30] as const;

export type EscapeRadius = (typeof RADIUS_OPTIONS)[number];

export interface AppSnapshot {
  readonly maxIterations: number;
  readonly escapeRadius: EscapeRadius;
  readonly selectedC: Complex;
}

export const DEFAULT_STATE: AppSnapshot = Object.freeze({
  maxIterations: 100,
  escapeRadius: 10,
  selectedC: Object.freeze({ re: -0.745, im: 0.113 }),
});

type Listener = (state: AppSnapshot) => void;

export class AppState {
  private snapshot: AppSnapshot = DEFAULT_STATE;
  private readonly listeners = new Set<Listener>();

  get value(): AppSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setIterations(value: number): void {
    if (!Number.isInteger(value) || value < MIN_ITERATIONS || value > MAX_ITERATIONS) {
      throw new RangeError(`Число итераций должно быть целым от ${MIN_ITERATIONS} до ${MAX_ITERATIONS}.`);
    }
    if (value === this.snapshot.maxIterations) {
      return;
    }
    this.update({ ...this.snapshot, maxIterations: value });
  }

  setRadius(value: number): void {
    if (!isIncluded(RADIUS_OPTIONS, value)) {
      throw new RangeError('Допустимые значения R: 10, 20 или 30.');
    }
    this.update({ ...this.snapshot, escapeRadius: value });
  }

  setSelectedC(value: Complex): void {
    if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
      throw new RangeError('Координаты c должны быть конечными числами.');
    }
    this.update({ ...this.snapshot, selectedC: { ...value } });
  }

  reset(): void {
    this.update(DEFAULT_STATE);
  }

  private update(next: AppSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}

function isIncluded<const T extends readonly number[]>(values: T, candidate: number): candidate is T[number] {
  return values.some((value) => value === candidate);
}
