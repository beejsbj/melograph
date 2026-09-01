// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodePanel } from './CodePanel';
import type { StrudelEditorHandle } from '../lib/strudelEditor';

const mountEditor = vi.hoisted(() => vi.fn());

vi.mock('../lib/strudelEditor', () => ({
  mountStrudelEditor: mountEditor,
}));

const mounted: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => {
  mountEditor.mockReset();
  mountEditor.mockRejectedValue(new Error('chunk unavailable'));
});

afterEach(async () => {
  await act(async () => mounted.splice(0).forEach((root) => root.unmount()));
});

describe('CodePanel editor fallback', () => {
  it('keeps the generated code editable and offers retry when CodeMirror fails', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push(root);
    const onActiveCodeChange = vi.fn();

    await act(async () => {
      root.render(
        <CodePanel
          scopeKey="full"
          scopeLabel="Full capture"
          noteCode={'note("C4")'}
          midiCode={'note("60")'}
          onActiveCodeChange={onActiveCodeChange}
        />,
      );
      await Promise.resolve();
    });

    const textarea = host.querySelector('textarea');
    expect(textarea?.value).toBe('note("C4")');
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes('retry editor'))).toBe(true);

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setValue?.call(textarea, 'note("C4").slow(2)');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onActiveCodeChange).toHaveBeenLastCalledWith('note("C4").slow(2)', true);
  });

  it('replays scheduler locations when the editor mounts after playback', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push(root);
    const handle = {
      code: vi.fn(() => 'note("C4")'),
      sync: vi.fn(),
      label: vi.fn(),
      setPlaybackLocations: vi.fn(),
      highlightPlayback: vi.fn(),
      clearPlayback: vi.fn(),
      destroy: vi.fn(),
    };
    mountEditor.mockResolvedValue(handle);
    const editorHandleRef: { current: StrudelEditorHandle | null } = { current: null };
    const playbackLocationsRef = { current: [[4, 6]] };

    await act(async () => {
      root.render(
        <CodePanel
          scopeKey="full"
          scopeLabel="Full capture"
          noteCode={'note("C4")'}
          midiCode={'note("60")'}
          editorHandleRef={editorHandleRef}
          playbackLocationsRef={playbackLocationsRef}
        />,
      );
      await Promise.resolve();
    });

    expect(handle.setPlaybackLocations).toHaveBeenCalledWith([[4, 6]]);
    expect(editorHandleRef.current).toBe(handle);
  });
});
