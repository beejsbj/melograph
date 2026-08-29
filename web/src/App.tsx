import { Activity, AudioLines, Code2 } from 'lucide-react';
import { useState } from 'react';
import { Panel } from './components/Panel';
import { Recorder } from './components/Recorder';
import { StatusChip } from './components/StatusChip';
import { Workspace } from './components/Workspace';
import { analyzeWav } from './lib/api';
import { audioBlobToWav } from './lib/audio';
import type { AnalysisResult } from './types';

export function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [status, setStatus] = useState<'idle' | 'preparing' | 'analyzing'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleAudio(blob: Blob, label: string) {
    setError(null);
    setStatus('preparing');
    try {
      const wav = await audioBlobToWav(blob);
      setStatus('analyzing');
      const next = await analyzeWav(wav);
      setSourceLabel(label);
      setResult(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not analyze this recording.');
    } finally {
      setStatus('idle');
    }
  }

  return (
    <div className="app">
      <SiteHeader />
      {result ? (
        <Workspace result={result} sourceLabel={sourceLabel} onReset={() => setResult(null)} />
      ) : (
        <main className="landing page-shell">
          <section className="landing__story">
            <span className="eyebrow">voice → editable melody</span>
            <h1>sing it before<br />it disappears.</h1>
            <p className="landing__lede">
              Melograph catches a hummed idea as a continuous pitch line, interprets the note events,
              then gives you code you can keep shaping.
            </p>
            <TraceSpecimen />
            <div className="process-list">
              <Process icon={<AudioLines />} number="01" title="voice" body="record or bring an audio sketch" />
              <Process icon={<Activity />} number="02" title="shape" body="inspect contour, notes, and timing" />
              <Process icon={<Code2 />} number="03" title="output" body="start in Strudel; keep the raw data" />
            </div>
          </section>

          <aside className="landing__capture">
            <Panel eyebrow="new capture" title="Give the idea some room">
              <p className="capture-copy">Hum or sing one monophonic line. Leave a short silence between separate takes.</p>
              <Recorder
                disabled={status !== 'idle'}
                onAudio={(blob, label) => void handleAudio(blob, label)}
                onError={setError}
              />
              {status !== 'idle' && (
                <div className="analysis-status" role="status">
                  <span />
                  <strong>{status === 'preparing' ? 'preparing clean audio' : 'drawing the melody'}</strong>
                  <small>{status === 'analyzing' ? 'Praat is resolving contour and attacks' : 'resampling locally in your browser'}</small>
                </div>
              )}
              {error && <p className="error-banner" role="alert">{error}</p>}
              <div className="capture-note">
                <span>note</span>
                <p><strong>No generative AI.</strong> The default path is deterministic Praat pitch analysis. Listen and edit before treating the notes as truth.</p>
              </div>
            </Panel>
          </aside>
        </main>
      )}
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="site-header page-shell">
      <a className="wordmark" href="/">melograph<span>///</span></a>
      <div className="site-header__meta">
        <StatusChip tone="live">praat / cpu-first</StatusChip>
        <a href="https://strudel.cc" target="_blank" rel="noreferrer">strudel.cc ↗</a>
      </div>
    </header>
  );
}

function Process({ icon, number, title, body }: { icon: React.ReactNode; number: string; title: string; body: string }) {
  return (
    <div className="process-item">
      <span className="process-item__number">{number}</span>
      <span className="process-item__icon">{icon}</span>
      <div><strong>{title}</strong><small>{body}</small></div>
    </div>
  );
}

function TraceSpecimen() {
  // Unique specimen: the one-off landing trace, not a reusable chart variant.
  return (
    <div className="trace-specimen" aria-hidden="true">
      <div className="trace-specimen__grid" />
      <svg viewBox="0 0 720 180" preserveAspectRatio="none">
        <path className="trace-specimen__ghost" d="M0 132 C44 134 57 61 105 65 S173 141 217 116 S283 41 328 62 S397 129 443 92 S502 45 546 77 S604 124 653 68 S700 49 720 53" />
        <path className="trace-specimen__line" d="M0 132 C44 134 57 61 105 65 S173 141 217 116 S283 41 328 62 S397 129 443 92 S502 45 546 77 S604 124 653 68 S700 49 720 53" />
      </svg>
      <span className="trace-specimen__label trace-specimen__label--a">A3</span>
      <span className="trace-specimen__label trace-specimen__label--b">D4</span>
      <span className="trace-specimen__cursor" />
    </div>
  );
}
