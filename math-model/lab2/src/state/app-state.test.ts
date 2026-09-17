import { describe, expect, it, vi } from 'vitest';
import { AppState } from './app-state';

describe('параметры приложения', () => {
  it('применяет произвольное допустимое значение I и каждое значение R', () => {
    const state = new AppState();
    const listener = vi.fn();
    state.subscribe(listener);

    for (const iterations of [10, 157, 1000, 5000]) {
      state.setIterations(iterations);
      expect(state.value.maxIterations).toBe(iterations);
    }
    for (const radius of [10, 20, 30] as const) {
      state.setRadius(radius);
      expect(state.value.escapeRadius).toBe(radius);
    }

    expect(listener).toHaveBeenCalledTimes(7);
  });

  it('отклоняет дробные и выходящие за безопасный диапазон значения', () => {
    const state = new AppState();
    expect(() => state.setIterations(9)).toThrow(RangeError);
    expect(() => state.setIterations(5001)).toThrow(RangeError);
    expect(() => state.setIterations(100.5)).toThrow(RangeError);
    expect(() => state.setRadius(2)).toThrow(RangeError);
  });
});
