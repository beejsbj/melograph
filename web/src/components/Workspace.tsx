import { RotateCcw } from 'lucide-react';
import type { AnalysisResult } from '../types';
import { Button } from './Button';
import { CodePanel } from './CodePanel';
import { ContourChart } from './ContourChart';
import { NoteLedger } from './NoteLedger';
import { Panel } from './Panel';
import { StatusChip } from './StatusChip';

export function Workspace({ result, sourceLabel, onReset }: { result: AnalysisResult; sourceLabel: string; onReset: () => void }) {
  const notes = result.phrases.flatMap((phrase) => phrase.events).filter((event) => event.type === 'note').length;
  return (
    <main className="workspace page-shell">
      <div className="workspace__summary">
        <div>
          <span className="eyebrow">capture complete</span>
          <h1>{result.phrases.length} {result.phrases.length === 1 ? 'take' : 'takes'}, {notes} note events.</h1>
          <p>{sourceLabel} · {result.duration_seconds.toFixed(2)}s · Praat autocorrelation</p>
        </div>
        <div className="workspace__summary-actions">
          <StatusChip tone="ready">analysis ready</StatusChip>
          <Button icon={<RotateCcw size={14} />} onClick={onReset}>new capture</Button>
        </div>
      </div>

      <Panel eyebrow="01 / pitch map" title="The voice before—and after—interpretation" className="panel--chart">
        <ContourChart result={result} />
      </Panel>

      <div className="workspace__lower">
        <Panel eyebrow="02 / event ledger" title="Raw note names and timing">
          <NoteLedger phrases={result.phrases} />
        </Panel>
        <Panel eyebrow="03 / first-party output" title="Editable Strudel">
          <CodePanel takes={result.takes} />
        </Panel>
      </div>
      <p className="workspace__footnote">The contour is authoritative. Named notes and code are editable interpretations; slides and vibrato remain visible in the line.</p>
    </main>
  );
}
