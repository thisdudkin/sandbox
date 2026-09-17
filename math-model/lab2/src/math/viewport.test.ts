import { describe, expect, it } from 'vitest';
import { INITIAL_BOUNDS, canvasToComplex, complexToCanvas, zoomAt } from './viewport';

const size = { width: 1000, height: 1000 };

describe('преобразование координат', () => {
  it('переводит углы и центр Canvas в комплексную плоскость', () => {
    expect(canvasToComplex(0, 0, size, INITIAL_BOUNDS)).toEqual({ re: -5, im: 5 });
    expect(canvasToComplex(500, 500, size, INITIAL_BOUNDS)).toEqual({ re: 0, im: 0 });
    expect(canvasToComplex(1000, 1000, size, INITIAL_BOUNDS)).toEqual({ re: 5, im: -5 });
  });

  it('выполняет прямое и обратное преобразование без потери координаты', () => {
    const source = { re: -1.234, im: 2.718 };
    const pixel = complexToCanvas(source, size, INITIAL_BOUNDS);
    const restored = canvasToComplex(pixel.x, pixel.y, size, INITIAL_BOUNDS);
    expect(restored.re).toBeCloseTo(source.re, 12);
    expect(restored.im).toBeCloseTo(source.im, 12);
  });

  it('сохраняет комплексную точку под курсором при масштабировании', () => {
    const anchor = { re: 1.25, im: -0.5 };
    const zoomed = zoomAt(INITIAL_BOUNDS, anchor, 0.5);
    const before = complexToCanvas(anchor, size, INITIAL_BOUNDS);
    const after = complexToCanvas(anchor, size, zoomed);
    expect(after.x).toBeCloseTo(before.x, 12);
    expect(after.y).toBeCloseTo(before.y, 12);
  });
});
