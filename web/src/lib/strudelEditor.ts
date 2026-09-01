interface EditorDocument {
  length: number;
  toString(): string;
}

interface EditorUpdate {
  docChanged: boolean;
  state: { doc: EditorDocument };
}

interface EditorViewLike {
  state: { doc: EditorDocument };
  contentDOM?: HTMLElement;
  dom?: HTMLElement;
  dispatch(transaction: { changes: { from: number; to: number; insert: string } }): void;
  destroy(): void;
}

type EditorFactory = (options: {
  initialCode: string;
  onChange(update: EditorUpdate): void;
  root: HTMLElement;
}) => EditorViewLike;

type EditorLoader = () => Promise<{
  initEditor: EditorFactory;
  updateMiniLocations(view: EditorViewLike, locations: unknown[]): void;
  highlightMiniLocations(view: EditorViewLike, time: number, haps: unknown[]): void;
}>;

export interface StrudelEditorHandle {
  code(): string;
  sync(code: string): void;
  label(label: string): void;
  setPlaybackLocations(locations: unknown[]): void;
  highlightPlayback(time: number, haps: unknown[]): void;
  clearPlayback(): void;
  destroy(): void;
}

export async function mountStrudelEditor(
  root: HTMLElement,
  initialCode: string,
  onCodeChange: (code: string) => void,
  label: string,
  loadEditor: EditorLoader = () => import('@strudel/codemirror') as unknown as ReturnType<EditorLoader>,
): Promise<StrudelEditorHandle> {
  let syncing = false;
  const { initEditor, updateMiniLocations, highlightMiniLocations } = await loadEditor();
  const view = initEditor({
    initialCode,
    root,
    onChange(update) {
      if (update.docChanged && !syncing) onCodeChange(update.state.doc.toString());
    },
  });

  view.contentDOM?.setAttribute('aria-label', label);

  return {
    code: () => view.state.doc.toString(),
    label(nextLabel) {
      view.contentDOM?.setAttribute('aria-label', nextLabel);
    },
    setPlaybackLocations(locations) {
      updateMiniLocations(view, locations);
    },
    highlightPlayback(time, haps) {
      highlightMiniLocations(view, time, haps);
    },
    clearPlayback() {
      updateMiniLocations(view, []);
    },
    sync(nextCode) {
      const current = view.state.doc.toString();
      if (current === nextCode) return;
      syncing = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: nextCode } });
      } finally {
        syncing = false;
      }
    },
    destroy() {
      const editorDom = view.dom ?? view.contentDOM?.closest<HTMLElement>('.cm-editor');
      view.destroy();
      editorDom?.remove();
    },
  };
}
