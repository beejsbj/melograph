import { Check, Copy, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from './Button';

export type PitchOutput = 'notes' | 'midi';

interface Props {
  scopeKey: string;
  scopeLabel: string;
  noteCode: string;
  midiCode: string;
  onActiveCodeChange?: (code: string) => void;
}

export function CodePanel({ scopeKey, scopeLabel, noteCode, midiCode, onActiveCodeChange }: Props) {
  const [pitchOutput, setPitchOutput] = useState<PitchOutput>('notes');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const editKey = `${scopeKey}:${pitchOutput}`;
  const code = edits[editKey] ?? outputCode(noteCode, midiCode, pitchOutput);
  useEffect(() => onActiveCodeChange?.(code), [code, onActiveCodeChange]);
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
      <textarea
        value={code}
        onChange={(event) => setEdits((current) => ({ ...current, [editKey]: event.target.value }))}
        spellCheck={false}
        aria-label={`Editable Strudel code using ${pitchOutput}`}
      />
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
