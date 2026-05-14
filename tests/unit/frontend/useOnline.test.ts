import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnline } from '../../../frontend/src/lib/useOnline';

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
});

describe('useOnline', () => {
  it('reflects navigator.onLine at mount', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });

  it('updates to false on offline event', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });

  it('updates back to true on online event', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
