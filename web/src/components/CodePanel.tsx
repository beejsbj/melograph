import { Check, Copy, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { mountStrudelEditor, type StrudelEditorHandle } from '../lib/strudelEditor';
import { Button } from './Button';

export type PitchOutput = 'notes' | 'midi';

interface Props {
  scopeKey: string;
  scopeLabel: string;
  noteCode: string;
  midiCode: string;
  onActiveCodeChange?: (code: string, edited: boolean) => void;
  editorHandleRef?: MutableRefObject<StrudelEditorHandle | null>;
  playbackLocationsRef?: MutableRefObject<unknown[] | null>;
}

export function CodePanel({ scopeKey, scopeLabel, noteCode, midiCode, onActiveCodeChange, editorHandleRef, playbackLocationsRef }: Props) {
  const [pitchOutput, setPitchOutput] = useState<PitchOutput>('notes');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [editorAttempt, setEditorAttempt] = useState(0);
  const [editorFailed, setEditorFailed] = useState(false);
  const editKey = `${scopeKey}:${pitchOutput}`;
  const generatedCode = outputCode(noteCode, midiCode, pitchOutput);
  const code = edits[editKey] ?? generatedCode;
  const edited = code !== generatedCode;
  const editorRootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<StrudelEditorHandle | null>(null);
  const editKeyRef = useRef(editKey);
  const codeRef = useRef(code);
  const pitchOutputRef = useRef(pitchOutput);
  const previousCodeRef = useRef(code);
  editKeyRef.current = editKey;
  codeRef.current = code;
  pitchOutputRef.current = pitchOutput;

  useEffect(() => onActiveCodeChange?.(code, edited), [code, edited, onActiveCodeChange]);
  useEffect(() => {
    const root = editorRootRef.current;
    if (!root) return;
    let cancelled = false;
    setEditorFailed(false);
    void mountStrudelEditor(root, codeRef.current, (nextCode) => {
      setEdits((current) => ({ ...current, [editKeyRef.current]: nextCode }));
    }, `Editable Strudel code using ${pitchOutput}`).then((editor) => {
      if (cancelled) {
        editor.destroy();
        return;
      }
      editorRef.current = editor;
      if (editorHandleRef) editorHandleRef.current = editor;
      if (playbackLocationsRef?.current) editor.setPlaybackLocations(playbackLocationsRef.current);
      editor.sync(codeRef.current);
      editor.label(`Editable Strudel code using ${pitchOutputRef.current}`);
    }).catch(() => {
      if (!cancelled) setEditorFailed(true);
    });
    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      if (editorHandleRef) editorHandleRef.current = null;
      editorRef.current = null;
    };
  }, [editorAttempt]);
  useEffect(() => {
    if (previousCodeRef.current !== code) {
      previousCodeRef.current = code;
      if (playbackLocationsRef) playbackLocationsRef.current = [];
      editorRef.current?.clearPlayback();
    }
    editorRef.current?.sync(code);
  }, [code, playbackLocationsRef]);
  useEffect(() => editorRef.current?.label(`Editable Strudel code using ${pitchOutput}`), [pitchOutput]);
  const replUrl = useMemo(() => encodeStrudelUrl(code), [code]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="code-panel">
      <div className="code-panel__toolbar">
        <span className="code-panel__scope">{scopeLabel}</span>
        <div className="pitch-output" role="group" aria-label="Pitch output">
          {(['notes', 'midi'] as PitchOutput[]).map((output) => (
            <button
              type="button"
              className={`pitch-output__option${pitchOutput === output ? ' pitch-output__option--active' : ''}`}
              aria-pressed={pitchOutput === output}
              onClick={() => setPitchOutput(output)}
              key={output}
            >
              <span>{output}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="code-panel__editor" data-pitch-output={pitchOutput}>
        <div className="code-panel__mount" ref={editorRootRef} />
        {editorFailed && (
          <div className="code-panel__fallback" role="status">
            <textarea
              aria-label={`Editable Strudel code using ${pitchOutput}`}
              value={code}
              onChange={(event) => setEdits((current) => ({ ...current, [editKey]: event.target.value }))}
              spellCheck={false}
            />
            <div>
              <span>syntax editor could not load</span>
              <Button onClick={() => setEditorAttempt((attempt) => attempt + 1)}>retry editor</Button>
            </div>
          </div>
        )}
      </div>
      <div className="code-panel__actions">
        <Button icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copy()}>{copied ? 'copied' : 'copy'}</Button>
        <a className="button button--brass brass" href={replUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /><span>open in Strudel</span>
        </a>
      </div>
    </div>
  );
}

export function outputCode(noteCode: string, midiCode: string, output: PitchOutput) {
  return output === 'midi' ? midiCode : noteCode;
}

export function encodeStrudelUrl(code: string) {
  const bytes = new TextEncoder().encode(code);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `https://strudel.cc/#${encodeURIComponent(btoa(binary))}`;
}
