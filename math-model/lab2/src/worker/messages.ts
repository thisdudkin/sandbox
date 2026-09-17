import type { Complex } from '../math/complex';
import type { Bounds } from '../math/viewport';

export type FractalKind = 'mandelbrot' | 'julia';

export interface RenderRequest {
  readonly type: 'render';
  readonly jobId: number;
  readonly kind: FractalKind;
  readonly width: number;
  readonly height: number;
  readonly bounds: Bounds;
  readonly maxIterations: number;
  readonly escapeRadius: number;
  readonly juliaC: Complex;
}

export interface RenderSuccess {
  readonly type: 'rendered';
  readonly jobId: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayBuffer;
  readonly elapsedMs: number;
  readonly escapedRatio: number;
  readonly averageIterations: number;
}

export interface RenderFailure {
  readonly type: 'error';
  readonly jobId: number;
  readonly message: string;
}

export type WorkerResponse = RenderSuccess | RenderFailure;
