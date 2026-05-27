// Vitest setup for the frontend/component suite (jsdom).
import '@testing-library/jest-dom/vitest';

// jsdom doesn't ship ResizeObserver; pages that observe their container
// (TreePage) crash without it. A no-op stub is enough for component tests.
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
