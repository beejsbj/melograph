// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { mountStrudelEditor } from './strudelEditor';

function fakeEditor() {
  let code = '';
  let onChange: ((update: { docChanged: boolean; state: { doc: { length: number; toString(): string } } }) => void) | undefined;
  const contentDOM = document.createElement('div');
  const destroy = vi.fn();
  const doc = { get length() { return code.length; }, toString: () => code };
  const view = {
    state: { doc },
    contentDOM,
    dispatch({ changes }: { changes: { insert: string } }) {
      code = changes.insert;
      onChange?.({ docChanged: true, state: { doc } });
    },
    destroy,
  };
  const factory = vi.fn((options: { initialCode: string; onChange: typeof onChange }) => {
    code = options.initialCode;
    onChange = options.onChange;
    return view;
  });
  const updateMiniLocations = vi.fn();
  const highlightMiniLocations = vi.fn();
  return {
    contentDOM,
    destroy,
    factory,
    updateMiniLocations,
    highlightMiniLocations,
    loader: async () => ({ initEditor: factory, updateMiniLocations, highlightMiniLocations }),
    input(next: string) { code = next; onChange?.({ docChanged: true, state: { doc } }); },
  };
}

describe('Strudel editor synchronization', () => {
  it('reports editor input but does not echo external scope or pitch changes', async () => {
    const root = document.createElement('div');
    const editor = fakeEditor();
    const onCodeChange = vi.fn();
    const handle = await mountStrudelEditor(
      root,
      'note("C4")',
      onCodeChange,
      'Editable Strudel code using notes',
      editor.loader,
    );

    editor.input('note("D4")');
    handle.sync('note("60")');
    handle.sync('note("60")');

    expect(onCodeChange).toHaveBeenCalledOnce();
    expect(onCodeChange).toHaveBeenCalledWith('note("D4")');
    expect(handle.code()).toBe('note("60")');
    handle.label('Editable Strudel code using midi');
    expect(editor.contentDOM.getAttribute('aria-label')).toBe('Editable Strudel code using midi');
  });

  it('applies scheduler locations and active haps to the mounted editor', async () => {
    const root = document.createElement('div');
    const editor = fakeEditor();
    const handle = await mountStrudelEditor(root, 'note("C4")', vi.fn(), 'Editable Strudel code', editor.loader);
    const locations = [[6, 8]];
    const haps = [{ value: 'C4' }];

    handle.setPlaybackLocations(locations);
    handle.highlightPlayback(1.25, haps);
    handle.clearPlayback();

    expect(editor.updateMiniLocations).toHaveBeenNthCalledWith(1, expect.anything(), locations);
    expect(editor.highlightMiniLocations).toHaveBeenCalledWith(expect.anything(), 1.25, haps);
    expect(editor.updateMiniLocations).toHaveBeenLastCalledWith(expect.anything(), []);
  });

  it('destroys the CodeMirror view on unmount', async () => {
    const root = document.createElement('div');
    root.append(document.createElement('span'));
    const editor = fakeEditor();
    const handle = await mountStrudelEditor(
      root,
      '',
      vi.fn(),
      'Editable Strudel code using notes',
      editor.loader,
    );

    handle.destroy();

    expect(editor.destroy).toHaveBeenCalledOnce();
    expect(root.childElementCount).toBe(0);
  });
});
