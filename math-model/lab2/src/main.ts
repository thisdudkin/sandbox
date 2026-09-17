import './styles.css';
import { formatComplex } from './math/complex';
import { AppState } from './state/app-state';
import { CanvasController } from './ui/canvas-controller';
import type { FractalKind } from './worker/messages';

const state = new AppState();

const iterationsInput = requireElement<HTMLInputElement>('iterations');
const radiusSelect = requireElement<HTMLSelectElement>('radius');
const selectedCOutput = requireElement<HTMLElement>('selected-c');
const errorBanner = requireElement<HTMLElement>('error-banner');
const renderStatus = requireElement<HTMLElement>('render-status');
const backgroundVideo = requireElement<HTMLVideoElement>('background-video');
const soundToggle = requireElement<HTMLButtonElement>('sound-toggle');
const soundLabel = requireElement<HTMLElement>('sound-label');
const videoToggle = requireElement<HTMLButtonElement>('video-toggle');
const videoLabel = requireElement<HTMLElement>('video-label');
const spiderSense = requireElement<HTMLElement>('spider-sense');
const busyState: Record<FractalKind, boolean> = { mandelbrot: false, julia: false };
const renderTimes: Partial<Record<FractalKind, number>> = {};
const BACKGROUND_VOLUME = 0.12;
let senseTimer: number | undefined;

backgroundVideo.volume = BACKGROUND_VOLUME;

const showError = (message: string): void => {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
};

const updateMediaControls = (): void => {
  const soundEnabled = !backgroundVideo.muted;
  soundToggle.setAttribute('aria-pressed', String(soundEnabled));
  soundLabel.textContent = soundEnabled ? 'Звук · 12%' : 'Включить звук';
  videoToggle.setAttribute('aria-pressed', String(backgroundVideo.paused));
  videoLabel.textContent = backgroundVideo.paused ? 'Продолжить' : 'Пауза';
  videoToggle.querySelector('.media-icon')!.textContent = backgroundVideo.paused ? '▶' : 'Ⅱ';
};

const triggerSpiderSense = (point: { readonly x: number; readonly y: number }): void => {
  spiderSense.style.setProperty('--sense-x', `${point.x}px`);
  spiderSense.style.setProperty('--sense-y', `${point.y}px`);
  spiderSense.classList.remove('is-active');
  void spiderSense.offsetWidth;
  spiderSense.classList.add('is-active');
  if (senseTimer !== undefined) {
    window.clearTimeout(senseTimer);
  }
  senseTimer = window.setTimeout(() => spiderSense.classList.remove('is-active'), 850);
};

soundToggle.addEventListener('click', () => {
  const enableSound = backgroundVideo.muted;
  // Важно выполнить unmute и play синхронно внутри пользовательского клика:
  // после await некоторые браузеры уже считают активацию завершённой.
  backgroundVideo.volume = BACKGROUND_VOLUME;
  backgroundVideo.muted = !enableSound;
  if (enableSound && backgroundVideo.paused) {
    void backgroundVideo.play().then(() => {
      errorBanner.hidden = true;
      updateMediaControls();
    }).catch(() => {
      backgroundVideo.muted = true;
      showError('Не удалось запустить видео. Проверьте, что файл spider-man.mp4 доступен.');
      updateMediaControls();
    });
  }
  updateMediaControls();
});

videoToggle.addEventListener('click', () => {
  if (backgroundVideo.paused) {
    void backgroundVideo.play().then(() => {
      errorBanner.hidden = true;
      updateMediaControls();
    }).catch(() => showError('Не удалось запустить видеофон. Проверьте доступность файла spider-man.mp4.'));
  } else {
    backgroundVideo.pause();
  }
  updateMediaControls();
});

backgroundVideo.addEventListener('play', updateMediaControls);
backgroundVideo.addEventListener('pause', updateMediaControls);
backgroundVideo.addEventListener('volumechange', updateMediaControls);
backgroundVideo.addEventListener('error', () => {
  showError('Не удалось загрузить фоновое видео spider-man.mp4.');
  soundToggle.disabled = true;
  videoToggle.disabled = true;
});

updateMediaControls();

const updateRenderState = (kind: FractalKind, busy: boolean, elapsedMs?: number): void => {
  busyState[kind] = busy;
  if (elapsedMs !== undefined) {
    renderTimes[kind] = elapsedMs;
  }
  if (busyState.mandelbrot || busyState.julia) {
    renderStatus.textContent = 'Выполняется расчёт';
    return;
  }
  const timings = Object.values(renderTimes);
  const slowest = timings.length > 0 ? Math.max(...timings) : undefined;
  renderStatus.textContent = slowest === undefined ? 'Готово' : `Готово · ${Math.round(slowest)} мс`;
};

let mandelbrotController: CanvasController;
let juliaController: CanvasController;
let previousSnapshot = state.value;

try {
  mandelbrotController = new CanvasController({
    canvas: requireElement<HTMLCanvasElement>('mandelbrot-canvas'),
    loader: requireElement<HTMLElement>('mandelbrot-loader'),
    coordinateOutput: requireElement<HTMLOutputElement>('mandelbrot-coordinates'),
    pointStateOutput: requireElement('mandelbrot-point-state'),
    pointIterationsOutput: requireElement('mandelbrot-point-iterations'),
    zoomOutput: requireElement('mandelbrot-zoom'),
    renderTimeOutput: requireElement('mandelbrot-render-time'),
    escapedOutput: requireElement('mandelbrot-escaped'),
    resolutionOutput: requireElement('mandelbrot-resolution'),
    kind: 'mandelbrot',
    getState: () => state.value,
    onSelect: (value, viewportPoint) => {
      state.setSelectedC(value);
      triggerSpiderSense(viewportPoint);
    },
    onError: showError,
    onRenderState: updateRenderState,
  });

  juliaController = new CanvasController({
    canvas: requireElement<HTMLCanvasElement>('julia-canvas'),
    loader: requireElement<HTMLElement>('julia-loader'),
    coordinateOutput: requireElement<HTMLOutputElement>('julia-coordinates'),
    pointStateOutput: requireElement('julia-point-state'),
    pointIterationsOutput: requireElement('julia-point-iterations'),
    zoomOutput: requireElement('julia-zoom'),
    renderTimeOutput: requireElement('julia-render-time'),
    escapedOutput: requireElement('julia-escaped'),
    resolutionOutput: requireElement('julia-resolution'),
    kind: 'julia',
    getState: () => state.value,
    onError: showError,
    onRenderState: updateRenderState,
  });

  state.subscribe((snapshot) => {
    errorBanner.hidden = true;
    iterationsInput.value = String(snapshot.maxIterations);
    radiusSelect.value = String(snapshot.escapeRadius);
    selectedCOutput.textContent = `c = ${formatComplex(snapshot.selectedC)}`;
    mandelbrotController.redrawOverlay();
    const renderSettingsChanged =
      snapshot.maxIterations !== previousSnapshot.maxIterations ||
      snapshot.escapeRadius !== previousSnapshot.escapeRadius;
    if (renderSettingsChanged) {
      mandelbrotController.requestRender();
    }
    juliaController.requestRender();
    previousSnapshot = snapshot;
  });

  const applyIterations = (): void => {
    try {
      state.setIterations(iterationsInput.valueAsNumber);
    } catch (error: unknown) {
      iterationsInput.value = String(state.value.maxIterations);
      showError(error instanceof Error ? error.message : 'Некорректное число итераций.');
    }
  };
  iterationsInput.addEventListener('change', applyIterations);
  iterationsInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyIterations();
      iterationsInput.blur();
    }
  });
  radiusSelect.addEventListener('change', () => state.setRadius(Number(radiusSelect.value)));
  requireElement<HTMLButtonElement>('reset-view').addEventListener('click', () => {
    mandelbrotController.resetView();
    juliaController.resetView();
  });
  requireElement<HTMLButtonElement>('reset-all').addEventListener('click', () => {
    mandelbrotController.resetView();
    juliaController.resetView();
    state.reset();
  });

  selectedCOutput.textContent = `c = ${formatComplex(state.value.selectedC)}`;
  window.addEventListener('beforeunload', () => {
    if (senseTimer !== undefined) {
      window.clearTimeout(senseTimer);
    }
    mandelbrotController.dispose();
    juliaController.dispose();
  });
} catch (error: unknown) {
  showError(error instanceof Error ? error.message : 'Не удалось запустить приложение.');
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Не найден элемент интерфейса #${id}.`);
  }
  return element as T;
}
