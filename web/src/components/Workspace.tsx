import { useCallback, useRef, useState } from 'react';
import { createScopeView, scopeCode, type AnalysisScope } from '../lib/scope';
import type { PlaybackMode } from '../lib/playback';
import type { AnalysisResult } from '../types';
import { CodePanel } from './CodePanel';
import { ContourChart } from './ContourChart';
import { NoteLedger } from './NoteLedger';
import { Panel } from './Panel';
import { PlaybackTransport } from './PlaybackTransport';
import { ScopeSelector } from './ScopeSelector';
import type { StrudelEditorHandle } from '../lib/strudelEditor';

export function Workspace({ result, sourceAudio, sourceLabel }: { result: AnalysisResult; sourceAudio: Blob; sourceLabel: string }) {
  const [scope, setScope] = useState<AnalysisScope>('full');
  const [mode, setMode] = useState<PlaybackMode>('voice');
  const [strudelActivated, setStrudelActivated] = useState(false);
  const [playhead, setPlayhead] = useState<number | number[]>(0);
  const view = createScopeView(result, scope);
  const [strudelCode, setStrudelCode] = useState(result.strudel);
  const [strudelEdited, setStrudelEdited] = useState(false);
  const [evaluatedStrudelCode, setEvaluatedStrudelCode] = useState<string | null>(null);
  const strudelEditorRef = useRef<StrudelEditorHandle | null>(null);
  const strudelLocationsRef = useRef<unknown[] | null>(null);

  const handleActiveCodeChange = useCallback((code: string, edited: boolean) => {
    setStrudelCode(code);
    setStrudelEdited(edited);
  }, []);

  function selectScope(nextScope: AnalysisScope) {
    const nextView = createScopeView(result, nextScope);
    setScope(nextScope);
    setEvaluatedStrudelCode(null);
    setPlayhead(nextView.startSeconds);
  }

  function selectMode(nextMode: PlaybackMode) {
    if (nextMode === 'strudel') setStrudelActivated(true);
    setMode(nextMode);
  }

  return (
    <main className="workspace page-shell">
      <div className="workspace__scopebar">
        <div className="workspace__scope-copy">
          <span className="eyebrow">capture complete / {view.label}</span>
          <h1>{sourceLabel} · {result.duration_seconds.toFixed(2)}s · Praat autocorrelation</h1>
        </div>
        <ScopeSelector phrases={result.phrases} value={scope} onChange={selectScope} />
      </div>

      <Panel eyebrow="pitch map / event interpretation" title="The voice before—and after—interpretation" className="panel--chart panel--brass-frame">
        <PlaybackTransport
          key={view.key}
          result={{ ...result, phrases: view.phrases }}
          sourceAudio={sourceAudio}
          strudelCode={strudelCode}
          mode={mode}
          rangeStart={view.startSeconds}
          rangeEnd={view.endSeconds}
          onModeChange={selectMode}
          onTimeChange={setPlayhead}
          strudelEditorRef={strudelEditorRef}
          strudelLocationsRef={strudelLocationsRef}
          projectStrudelPlayheads={canProjectStrudelPlayheads(strudelCode, evaluatedStrudelCode, strudelEdited)}
          onStrudelEvaluated={setEvaluatedStrudelCode}
        />
        <div className={`analysis-grid${mode === 'strudel' ? ' analysis-grid--strudel' : ''}`}>
          <aside className="event-rail" aria-label="Event ledger">
            <header><span className="eyebrow">events</span><strong>Named notes</strong></header>
            <NoteLedger phrases={view.phrases} />
          </aside>
          <ContourChart
            result={{ ...result, phrases: view.phrases }}
            playheadSeconds={playhead}
            rangeStart={view.startSeconds}
            rangeEnd={view.endSeconds}
          />
          <aside className="strudel-dock" hidden={mode !== 'strudel'} aria-label="Editable Strudel">
            <header><span className="eyebrow">first-party output</span><strong>Editable Strudel</strong></header>
            {strudelActivated && (
              <CodePanel
                scopeKey={view.key}
                scopeLabel={view.label}
                noteCode={scopeCode(result, view, 'notes')}
                midiCode={scopeCode(result, view, 'midi')}
                onActiveCodeChange={handleActiveCodeChange}
                editorHandleRef={strudelEditorRef}
                playbackLocationsRef={strudelLocationsRef}
              />
            )}
          </aside>
        </div>
      </Panel>
      <p className="workspace__footnote">The contour is authoritative. Named notes and code are editable interpretations; slides and vibrato remain visible in the line.</p>
    </main>
  );
}

export function canProjectStrudelPlayheads(activeCode: string, evaluatedCode: string | null, edited: boolean) {
  return !edited && activeCode === evaluatedCode;
}
