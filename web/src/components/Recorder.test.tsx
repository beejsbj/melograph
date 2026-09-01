// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Recorder } from './Recorder';

const startLivePitchMonitor = vi.hoisted(() => vi.fn());

vi.mock('../lib/liveAudio', () => ({ startLivePitchMonitor }));

class FakeMediaRecorder {
  static constructionError: Error | null = null;
  static startError: Error | null = null;
  static instances: FakeMediaRecorder[] = [];

  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stopCalls = 0;

  constructor(_stream: MediaStream) {
    if (FakeMediaRecorder.constructionError) throw FakeMediaRecorder.constructionError;
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    if (FakeMediaRecorder.startError) throw FakeMediaRecorder.startError;
    this.state = 'recording';
  }

  stop() {
    this.stopCalls += 1;
    if (this.state === 'inactive') throw new DOMException('inactive', 'InvalidStateError');
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recording']) });
    this.onstop?.();
  }
}

const mounted: Array<ReturnType<typeof createRoot>> = [];

function mediaStream(track: { stop: ReturnType<typeof vi.fn> }) {
  return { getTracks: () => [track] } as unknown as MediaStream;
}

async function click(host: HTMLElement, label: string) {
  await act(async () => {
    host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  FakeMediaRecorder.constructionError = null;
  FakeMediaRecorder.startError = null;
  FakeMediaRecorder.instances = [];
  startLivePitchMonitor.mockReset();
  startLivePitchMonitor.mockResolvedValue({ stop: vi.fn(async () => undefined) });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
});

afterEach(async () => {
  await act(async () => mounted.splice(0).forEach((root) => root.unmount()));
  vi.unstubAllGlobals();
});

describe('Recorder capture lifecycle', () => {
  it('releases acquired tracks when MediaRecorder construction fails', async () => {
    const track = { stop: vi.fn() };
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mediaStream(track));
    FakeMediaRecorder.constructionError = new Error('unsupported codec');
    const onError = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push(root);

    await act(async () => root.render(<Recorder onAudio={vi.fn()} onError={onError} />));
    await click(host, 'Start recording');

    expect(track.stop).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('unsupported codec');
  });

  it('releases acquired tracks when MediaRecorder start fails', async () => {
    const track = { stop: vi.fn() };
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mediaStream(track));
    FakeMediaRecorder.startError = new Error('start rejected');
    const onError = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push(root);

    await act(async () => root.render(<Recorder onAudio={vi.fn()} onError={onError} />));
    await click(host, 'Start recording');

    expect(track.stop).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('start rejected');
  });

  it('ignores repeated stop requests after the first recorder stop', async () => {
    const track = { stop: vi.fn() };
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mediaStream(track));
    const onAudio = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push(root);

    await act(async () => root.render(<Recorder onAudio={onAudio} />));
    await click(host, 'Start recording');
    await click(host, 'Stop recording');
    await click(host, 'Stop recording');

    expect(FakeMediaRecorder.instances[0].stopCalls).toBe(1);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(onAudio).toHaveBeenCalledOnce();
  });
});
