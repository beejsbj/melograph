import { Check, Copy, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Take } from '../types';
import { Button } from './Button';

export type PitchOutput = 'notes' | 'midi';

interface Props {
  takes: Take[];
  onActiveCodeChange?: (code: string) => void;
}

export function CodePanel({ takes, onActiveCodeChange }: Props) {
  const [active, setActive] = useState(0);
  const [pitchOutput, setPitchOutput] = useState<PitchOutput>('notes');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const selected = takes[active];
  const editKey = selected ? `${selected.number}:${pitchOutput}` : '';
  const code = selected ? edits[editKey] ?? takeCode(selected, pitchOutput) : '';
  useEffect(() => onActiveCodeChange?.(code), [code, onActiveCodeChange]);
  const replUrl = useMemo(() => encodeStrudelUrl(code), [code]);

  if (!selected) return <p className="empty-copy">No voiced take was found. Try a clearer, steadier recording.</p>;

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="code-panel">
      <div className="code-panel__toolbar">
        <div className="take-tabs" role="tablist" aria-label="Strudel takes">
          {takes.map((take, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={active === index}
              className={active === index ? 'take-tab take-tab--active' : 'take-tab'}
              onClick={() => setActive(index)}
              key={take.number}
            >
              {String(take.number).padStart(2, '0')}
            </button>
          ))}
        </div>
        <div className="pitch-output" role="group" aria-label="Pitch output">
          {(['notes', 'midi'] as PitchOutput[]).map((output) => (
            <button
              type="button"
              className={`pitch-output__option${pitchOutput === output ? ' pitch-output__option--active' : ''}`}
              aria-pressed={pitchOutput === output}
              onClick={() => setPitchOutput(output)}
              key={output}
            >
              {output}
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
        <a className="button button--brass" href={replUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /><span>open in Strudel</span>
        </a>
      </div>
    </div>
  );
}

export function takeCode(take: Take, output: PitchOutput) {
  return output === 'midi' ? take.code_midi : take.code;
}

export function encodeStrudelUrl(code: string) {
  const bytes = new TextEncoder().encode(code);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `https://strudel.cc/#${encodeURIComponent(btoa(binary))}`;
}
