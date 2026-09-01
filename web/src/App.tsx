import { Activity, AudioLines, Code2 } from 'lucide-react';
import { useState } from 'react';
import { AnalysisOverlay } from './components/AnalysisOverlay';
import { CaptureNotch } from './components/CaptureNotch';
import { LivePitchPreview } from './components/LivePitchPreview';
import type { CaptureStatus } from './components/Recorder';
import { Workspace } from './components/Workspace';
import { analyzeWav } from './lib/api';
import { audioBlobToWav } from './lib/audio';
import type { AnalysisResult } from './types';
import type { LivePitchFrame } from './lib/livePitch';

export function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [sourceAudio, setSourceAudio] = useState<Blob | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [captureVersion, setCaptureVersion] = useState(0);
  const [recording, setRecording] = useState(false);
  const [liveFrames, setLiveFrames] = useState<LivePitchFrame[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  function handleRecordingChange(next: boolean) {
    setRecording(next);
    if (next) {
      setLiveFrames([]);
      setLiveError(null);
    }
  }

  async function handleAudio(blob: Blob, label: string) {
    setError(null);
    setStatus('preparing');
    try {
      const wav = await audioBlobToWav(blob);
      setStatus('analyzing');
      const next = await analyzeWav(wav);
      setSourceLabel(label);
      setSourceAudio(wav);
      setResult(next);
      setCaptureVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not analyze this recording.');
    } finally {
      setStatus('idle');
    }
  }

  return (
    <div className="app">
      <SiteHeader
        capture={(
          <CaptureNotch
            status={status}
            error={error}
            onAudio={(blob, label) => void handleAudio(blob, label)}
            onError={setError}
            onRecordingChange={handleRecordingChange}
            onLiveFrame={(frame) => setLiveFrames((frames) => [...frames.slice(-239), frame])}
            onLiveError={setLiveError}
          />
        )}
      />
      {recording && <LivePitchPreview frames={liveFrames} error={liveError} />}
      <div className="app-stage">
        {result && sourceAudio ? (
          <Workspace
            key={captureVersion}
            result={result}
            sourceAudio={sourceAudio}
            sourceLabel={sourceLabel}
          />
        ) : (
          <Hero />
        )}
        {error && <p className="app-stage__error error-banner" role="alert">{error}</p>}
        {status !== 'idle' && <AnalysisOverlay status={status} />}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <main className="hero page-shell">
      <section className="hero__story">
        <span className="eyebrow">voice → editable melody</span>
        <h1>sing it before<br />it disappears.</h1>
        <p className="hero__lede">
          Melograph catches a hummed idea as a continuous pitch line, interprets the note events,
          then gives you code you can keep shaping.
        </p>
        <TraceSpecimen />
        <div className="process-list">
          <Process icon={<AudioLines />} number="01" title="voice" body="record or bring an audio sketch" />
          <Process icon={<Activity />} number="02" title="shape" body="inspect contour, notes, and timing" />
          <Process icon={<Code2 />} number="03" title="output" body="start in Strudel; keep the raw data" />
        </div>
        <p className="hero__note"><strong>No generative AI.</strong> Deterministic pitch analysis gives you evidence to hear, inspect, and edit.</p>
      </section>
    </main>
  );
}

function SiteHeader({ capture }: { capture: React.ReactNode }) {
  return (
    <header className="site-header page-shell">
      <a className="wordmark" href="/">melograph<span>///</span></a>
      {capture}
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
