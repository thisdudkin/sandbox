import type { RenderRequest, WorkerResponse } from '../worker/messages';

export interface RenderResult {
  readonly imageData: ImageData;
  readonly elapsedMs: number;
  readonly escapedRatio: number;
  readonly averageIterations: number;
}

export class FractalRenderer {
  private worker: Worker | undefined;
  private latestJobId = 0;

  render(
    request: Omit<RenderRequest, 'type' | 'jobId'>,
    onSuccess: (result: RenderResult) => void,
    onError: (message: string) => void,
  ): void {
    this.cancel();
    const jobId = ++this.latestJobId;
    const worker = new Worker(new URL('../worker/fractal.worker.ts', import.meta.url), {
      type: 'module',
      name: `fractal-${request.kind}-${jobId}`,
    });
    this.worker = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>): void => {
      if (jobId !== this.latestJobId || worker !== this.worker) {
        return;
      }
      const response = event.data;
      if (response.jobId !== jobId) {
        return;
      }
      if (response.type === 'error') {
        onError(response.message);
        this.cancelWorker(worker);
        return;
      }

      const pixels = new Uint8ClampedArray(response.pixels);
      onSuccess({
        imageData: new ImageData(pixels, response.width, response.height),
        elapsedMs: response.elapsedMs,
        escapedRatio: response.escapedRatio,
        averageIterations: response.averageIterations,
      });
      this.cancelWorker(worker);
    };

    worker.onerror = (event: ErrorEvent): void => {
      if (jobId === this.latestJobId && worker === this.worker) {
        onError(event.message || 'Web Worker завершился с ошибкой.');
        this.cancelWorker(worker);
      }
    };

    const message: RenderRequest = { type: 'render', jobId, ...request };
    worker.postMessage(message);
  }

  cancel(): void {
    this.latestJobId += 1;
    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
    }
  }

  dispose(): void {
    this.cancel();
  }

  private cancelWorker(worker: Worker): void {
    worker.terminate();
    if (this.worker === worker) {
      this.worker = undefined;
    }
  }
}
