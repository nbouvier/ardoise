import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { useTimeout } from './use-timeout';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useTimeout', () => {
  it('runs the callback once the delay has passed', async () => {
    const { result } = await renderHook(() => useTimeout());
    const callback = jest.fn();

    result.current.schedule(callback, 1000);
    jest.advanceTimersByTime(999);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('replaces a pending callback when scheduled again', async () => {
    const { result } = await renderHook(() => useTimeout());
    const first = jest.fn();
    const second = jest.fn();

    result.current.schedule(first, 1000);
    result.current.schedule(second, 1000);
    jest.advanceTimersByTime(1000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('drops the pending callback when cleared', async () => {
    const { result } = await renderHook(() => useTimeout());
    const callback = jest.fn();

    result.current.schedule(callback, 1000);
    result.current.clear();
    jest.advanceTimersByTime(1000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('never fires after the component is gone', async () => {
    const { result, unmount } = await renderHook(() => useTimeout());
    const callback = jest.fn();

    result.current.schedule(callback, 1000);
    await unmount();
    jest.advanceTimersByTime(1000);

    expect(callback).not.toHaveBeenCalled();
  });
});
