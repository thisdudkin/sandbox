import { describe, expect, it } from 'vitest';
import { escapeTime } from './fractal';

describe('escape-time алгоритм', () => {
  it('считает c = 0 ограниченной точкой множества Мандельброта', () => {
    const result = escapeTime({ re: 0, im: 0 }, { re: 0, im: 0 }, 100, 10);
    expect(result).toMatchObject({ escaped: false, iterations: 100 });
  });

  it('определяет заведомо расходящуюся точку', () => {
    const result = escapeTime({ re: 0, im: 0 }, { re: 2, im: 0 }, 100, 10);
    expect(result.escaped).toBe(true);
    expect(result.iterations).toBe(3);
  });

  it.each([100, 200, 300] as const)('не превышает выбранный максимум %i итераций', (maximum) => {
    const result = escapeTime({ re: 0, im: 0 }, { re: 0, im: 0 }, maximum, 10);
    expect(result.iterations).toBe(maximum);
  });

  it('применяет выбранный порог R к одной и той же орбите', () => {
    const radius10 = escapeTime({ re: 0, im: 0 }, { re: 1, im: 0 }, 100, 10);
    const radius30 = escapeTime({ re: 0, im: 0 }, { re: 1, im: 0 }, 100, 30);
    expect(radius10.iterations).toBe(4);
    expect(radius30.iterations).toBe(5);
  });

  it('учитывает одновременно I и R', () => {
    const stoppedByLimit = escapeTime({ re: 0, im: 0 }, { re: 1, im: 0 }, 4, 30);
    expect(stoppedByLimit).toMatchObject({ escaped: false, iterations: 4 });
  });
});
