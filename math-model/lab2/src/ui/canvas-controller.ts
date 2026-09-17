import type { Complex } from '../math/complex';
import { escapeTime } from '../math/fractal';
import {
  INITIAL_BOUNDS,
  canvasToComplex,
  cloneBounds,
  complexToCanvas,
  panByPixels,
  zoomAt,
  type Bounds,
  type CanvasSize,
} from '../math/viewport';
import { FractalRenderer } from '../render/fractal-renderer';
import type { AppSnapshot } from '../state/app-state';
import type { FractalKind } from '../worker/messages';

interface CanvasControllerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly loader: HTMLElement;
  readonly coordinateOutput: HTMLOutputElement;
  readonly pointStateOutput: HTMLElement;
  readonly pointIterationsOutput: HTMLElement;
  readonly zoomOutput: HTMLElement;
  readonly renderTimeOutput: HTMLElement;
  readonly escapedOutput: HTMLElement;
  readonly resolutionOutput: HTMLElement;
  readonly kind: FractalKind;
  readonly getState: () => AppSnapshot;
  readonly onSelect?: (value: Complex, viewportPoint: { readonly x: number; readonly y: number }) => void;
  readonly onError: (message: string) => void;
  readonly onRenderState: (kind: FractalKind, busy: boolean, elapsedMs?: number) => void;
}

interface PointerDrag {
  readonly pointerId: number;
  startX: number;
  startY: number;
  previousX: number;
  previousY: number;
  moved: boolean;
}

export class CanvasController {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly loader: HTMLElement;
  private readonly coordinateOutput: HTMLOutputElement;
  private readonly pointStateOutput: HTMLElement;
  private readonly pointIterationsOutput: HTMLElement;
  private readonly zoomOutput: HTMLElement;
  private readonly renderTimeOutput: HTMLElement;
  private readonly escapedOutput: HTMLElement;
  private readonly resolutionOutput: HTMLElement;
  private readonly kind: FractalKind;
  private readonly getState: () => AppSnapshot;
  private readonly onSelect: CanvasControllerOptions['onSelect'];
  private readonly onError: (message: string) => void;
  private readonly onRenderState: CanvasControllerOptions['onRenderState'];
  private readonly renderer = new FractalRenderer();
  private readonly resizeObserver: ResizeObserver;
  private bounds: Bounds = cloneBounds(INITIAL_BOUNDS);
  private logicalSize: CanvasSize = { width: 1, height: 1 };
  private drag: PointerDrag | undefined;
  private renderTimer: number | undefined;
  private lastImage: ImageData | undefined;
  private readonly previewCanvas = document.createElement('canvas');
  private lastRenderedBounds: Bounds | undefined;

  constructor(options: CanvasControllerOptions) {
    this.canvas = options.canvas;
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Браузер не поддерживает Canvas 2D.');
    }
    this.context = context;
    this.loader = options.loader;
    this.coordinateOutput = options.coordinateOutput;
    this.pointStateOutput = options.pointStateOutput;
    this.pointIterationsOutput = options.pointIterationsOutput;
    this.zoomOutput = options.zoomOutput;
    this.renderTimeOutput = options.renderTimeOutput;
    this.escapedOutput = options.escapedOutput;
    this.resolutionOutput = options.resolutionOutput;
    this.kind = options.kind;
    this.getState = options.getState;
    this.onSelect = options.onSelect;
    this.onError = options.onError;
    this.onRenderState = options.onRenderState;

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.updateViewMetrics();
    this.resize();
  }

  requestRender(delayMs = 0): void {
    if (this.renderTimer !== undefined) {
      window.clearTimeout(this.renderTimer);
    }
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      this.render();
    }, delayMs);
  }

  resetView(): void {
    this.bounds = cloneBounds(INITIAL_BOUNDS);
    this.drawPreview();
    this.updateViewMetrics();
    this.requestRender();
  }

  redrawOverlay(): void {
    if (this.lastImage) {
      this.drawPreview();
    }
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    if (this.renderTimer !== undefined) {
      window.clearTimeout(this.renderTimer);
    }
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return;
    }
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // Сверхплотный Canvas быстро становится дороже визуальной выгоды.
    const renderDpr = Math.min(dpr, 1.5);
    const physicalWidth = Math.max(1, Math.round(rect.width * renderDpr));
    const physicalHeight = Math.max(1, Math.round(rect.height * renderDpr));
    this.logicalSize = { width: rect.width, height: rect.height };
    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
      this.previewCanvas.width = physicalWidth;
      this.previewCanvas.height = physicalHeight;
      this.lastImage = undefined;
      this.lastRenderedBounds = undefined;
      this.resolutionOutput.textContent = `${physicalWidth} × ${physicalHeight}`;
      this.requestRender(80);
    }
  }

  private render(): void {
    const state = this.getState();
    const requestedBounds = cloneBounds(this.bounds);
    this.setBusy(true);
    this.renderer.render(
      {
        kind: this.kind,
        width: this.canvas.width,
        height: this.canvas.height,
        bounds: this.bounds,
        maxIterations: state.maxIterations,
        escapeRadius: state.escapeRadius,
        juliaC: state.selectedC,
      },
      ({ imageData, elapsedMs, escapedRatio, averageIterations }) => {
        this.lastImage = imageData;
        this.lastRenderedBounds = requestedBounds;
        this.context.putImageData(imageData, 0, 0);
        const previewContext = this.previewCanvas.getContext('2d', { alpha: false });
        previewContext?.putImageData(imageData, 0, 0);
        this.drawSelectionMarker();
        this.renderTimeOutput.textContent = `${Math.round(elapsedMs)} мс`;
        this.escapedOutput.textContent = `${Math.round(escapedRatio * 100)}%`;
        this.pointIterationsOutput.dataset.frameAverage = averageIterations.toFixed(1);
        this.setBusy(false, elapsedMs);
      },
      (message) => {
        this.setBusy(false);
        this.onError(`${this.kind === 'mandelbrot' ? 'Мандельброт' : 'Жюлиа'}: ${message}`);
      },
    );
  }

  private setBusy(busy: boolean, elapsedMs?: number): void {
    this.loader.hidden = !busy;
    this.canvas.setAttribute('aria-busy', String(busy));
    this.onRenderState(this.kind, busy, elapsedMs);
  }

  private drawSelectionMarker(): void {
    if (this.kind !== 'mandelbrot') {
      return;
    }
    const dpr = this.canvas.width / this.logicalSize.width;
    const point = complexToCanvas(this.getState().selectedC, this.logicalSize, this.bounds);
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > this.logicalSize.width ||
      point.y > this.logicalSize.height
    ) {
      return;
    }
    this.context.save();
    this.context.scale(dpr, dpr);
    this.context.beginPath();
    this.context.arc(point.x, point.y, 7, 0, Math.PI * 2);
    this.context.strokeStyle = '#ffffff';
    this.context.lineWidth = 2;
    this.context.shadowColor = '#000000';
    this.context.shadowBlur = 4;
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(point.x - 11, point.y);
    this.context.lineTo(point.x + 11, point.y);
    this.context.moveTo(point.x, point.y - 11);
    this.context.lineTo(point.x, point.y + 11);
    this.context.lineWidth = 1;
    this.context.stroke();
    this.context.restore();
  }

  private drawPreview(): void {
    if (!this.lastRenderedBounds || this.previewCanvas.width === 0) {
      return;
    }
    const source = this.lastRenderedBounds;
    const target = this.bounds;
    const targetSpanRe = target.maxRe - target.minRe;
    const targetSpanIm = target.maxIm - target.minIm;
    const x = ((source.minRe - target.minRe) / targetSpanRe) * this.canvas.width;
    const y = ((target.maxIm - source.maxIm) / targetSpanIm) * this.canvas.height;
    const width = ((source.maxRe - source.minRe) / targetSpanRe) * this.canvas.width;
    const height = ((source.maxIm - source.minIm) / targetSpanIm) * this.canvas.height;
    this.context.save();
    this.context.fillStyle = '#02050c';
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.imageSmoothingEnabled = true;
    this.context.drawImage(this.previewCanvas, x, y, width, height);
    this.context.restore();
    this.drawSelectionMarker();
  }

  private updateViewMetrics(): void {
    const span = this.bounds.maxRe - this.bounds.minRe;
    const initialSpan = INITIAL_BOUNDS.maxRe - INITIAL_BOUNDS.minRe;
    const zoom = initialSpan / span;
    this.zoomOutput.textContent = zoom < 100
      ? `${zoom.toFixed(zoom < 10 ? 2 : 1)}×`
      : `${zoom.toExponential(1)}×`;
  }

  private updatePointMetrics(point: Complex): void {
    const state = this.getState();
    const result = this.kind === 'mandelbrot'
      ? escapeTime({ re: 0, im: 0 }, point, state.maxIterations, state.escapeRadius)
      : escapeTime(point, state.selectedC, state.maxIterations, state.escapeRadius);
    this.pointStateOutput.textContent = result.escaped ? 'Орбита уходит' : 'Внутри лимита';
    this.pointStateOutput.dataset.state = result.escaped ? 'escaped' : 'bounded';
    this.pointIterationsOutput.textContent = result.escaped
      ? `${result.iterations} / ${state.maxIterations}`
      : `≥ ${state.maxIterations}`;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const point = this.eventPoint(event);
    this.drag = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      previousX: point.x,
      previousY: point.y,
      moved: false,
    };
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('dragging');
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const point = this.eventPoint(event);
    const coordinate = canvasToComplex(point.x, point.y, this.logicalSize, this.bounds);
    this.coordinateOutput.value = `Re ${coordinate.re.toFixed(5)} · Im ${coordinate.im.toFixed(5)}`;
    this.updatePointMetrics(coordinate);

    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = point.x - this.drag.previousX;
    const deltaY = point.y - this.drag.previousY;
    const totalDistance = Math.hypot(point.x - this.drag.startX, point.y - this.drag.startY);
    if (totalDistance > 3) {
      this.drag.moved = true;
    }
    if (this.drag.moved) {
      this.bounds = panByPixels(this.bounds, deltaX, deltaY, this.logicalSize);
      this.drag.previousX = point.x;
      this.drag.previousY = point.y;
      this.drawPreview();
      this.updateViewMetrics();
      this.requestRender(140);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      return;
    }
    const wasMoved = this.drag.moved;
    this.canvas.releasePointerCapture(event.pointerId);
    this.drag = undefined;
    this.canvas.classList.remove('dragging');
    if (wasMoved) {
      this.requestRender();
      return;
    }
    if (this.kind === 'mandelbrot' && this.onSelect) {
      const point = this.eventPoint(event);
      this.onSelect(
        canvasToComplex(point.x, point.y, this.logicalSize, this.bounds),
        { x: event.clientX, y: event.clientY },
      );
    }
  };

  private readonly handlePointerCancel = (): void => {
    this.drag = undefined;
    this.canvas.classList.remove('dragging');
  };

  private readonly handlePointerLeave = (): void => {
    if (!this.drag) {
      this.coordinateOutput.value = 'Re — · Im —';
      this.pointStateOutput.textContent = 'Наведите курсор';
      this.pointStateOutput.dataset.state = 'idle';
      this.pointIterationsOutput.textContent = '—';
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const point = this.eventPoint(event);
    const anchor = canvasToComplex(point.x, point.y, this.logicalSize, this.bounds);
    const currentSpan = this.bounds.maxRe - this.bounds.minRe;
    const requestedScale = Math.exp(event.deltaY * 0.0012);
    const targetSpan = Math.min(100, Math.max(1e-10, currentSpan * requestedScale));
    this.bounds = zoomAt(this.bounds, anchor, targetSpan / currentSpan);
    this.drawPreview();
    this.updateViewMetrics();
    this.updatePointMetrics(anchor);
    this.requestRender(160);
  };

  private eventPoint(event: MouseEvent): { readonly x: number; readonly y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}
