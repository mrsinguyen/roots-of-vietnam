import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounced } from '../../../frontend/src/lib/useDebounced';

describe('useDebounced', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounced('hello', 100));
    expect(result.current).toBe('hello');
  });

  it('updates only after the delay has elapsed', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }: { v: string }) => useDebounced(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
    vi.useRealTimers();
  });

  it('collapses rapid-fire changes into a single update', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }: { v: string }) => useDebounced(v, 100), {
      initialProps: { v: '1' },
    });
    rerender({ v: '2' });
    rerender({ v: '3' });
    rerender({ v: '4' });
    expect(result.current).toBe('1');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('4');
    vi.useRealTimers();
  });
});
