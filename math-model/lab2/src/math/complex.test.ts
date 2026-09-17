import { describe, expect, it } from 'vitest';
import { add, magnitudeSquared, square } from './complex';

describe('операции с комплексными числами', () => {
  it('складывает действительные и мнимые части', () => {
    expect(add({ re: 2.5, im: -4 }, { re: -1.5, im: 7 })).toEqual({ re: 1, im: 3 });
  });

  it('возводит комплексное число в квадрат', () => {
    expect(square({ re: 3, im: 4 })).toEqual({ re: -7, im: 24 });
    expect(magnitudeSquared({ re: 3, im: 4 })).toBe(25);
  });
});
