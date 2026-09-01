import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLivePitchMonitor } from './liveAudio';

describe('startLivePitchMonitor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('closes a partially initialized audio graph when worklet loading fails', async () => {
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const mute = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1 },
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const addModule = vi.fn().mockRejectedValue(new Error('worklet unavailable'));
    const context = {
      audioWorklet: { addModule },
      close,
      createGain: () => mute,
      createMediaStreamSource: () => source,
      destination: {},
      sampleRate: 48_000,
      state: 'running',
    };
    class MockAudioContext {
      constructor() {
        return context;
      }
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('AudioWorkletNode', vi.fn());

    await expect(
      startLivePitchMonitor({} as MediaStream, vi.fn()),
    ).rejects.toThrow('worklet unavailable');

    expect(addModule).toHaveBeenCalledWith('/live-pitch-worklet.js');
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(mute.disconnect).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
