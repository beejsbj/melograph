import { Mic, RotateCcw } from 'lucide-react';
import { Button } from '../components/Button';
import { CapturePanel } from '../components/CapturePanel';
import { ContourChart } from '../components/ContourChart';
import { Panel } from '../components/Panel';
import { RecordButton } from '../components/RecordButton';
import { StatusChip } from '../components/StatusChip';
import type { AnalysisResult } from '../types';

const specimen: Pick<AnalysisResult, 'frames' | 'phrases' | 'duration_seconds'> = {
  duration_seconds: 3,
  frames: Array.from({ length: 90 }, (_, index) => ({
    time_seconds: index / 30,
    f0_hz_raw: 220,
    midi_raw: 57 + Math.sin(index / 8) * 2 + Math.sin(index / 2) * .15,
    midi_processed: 57 + Math.sin(index / 8) * 2,
    confidence: .91,
    voiced: true,
    rms_db: -12,
  })),
  phrases: [{
    number: 1,
    start_seconds: 0,
    end_seconds: 3,
    duration_seconds: 3,
    events: [
      { type: 'note', note: 'A3', midi: 57, start_seconds: 0, end_seconds: 1, duration_seconds: 1 },
      { type: 'note', note: 'B3', midi: 59, start_seconds: 1, end_seconds: 2, duration_seconds: 1 },
      { type: 'note', note: 'A3', midi: 57, start_seconds: 2, end_seconds: 3, duration_seconds: 1 },
    ],
  }],
};

export function StyleGuide() {
  return (
    <main className="styleguide page-shell">
      <span className="eyebrow">melograph / system surface</span>
      <h1>Recording bench grammar</h1>
      <p>The source components below are the same imports used by the application.</p>
      <Panel eyebrow="tokens" title="Ground, brass, trace, voice">
        <div className="swatches">
          {['ground', 'surface', 'brass', 'trace', 'voice', 'muted'].map((name) => <div className={`swatch swatch--${name}`} key={name}><i /><span>{name}</span></div>)}
        </div>
      </Panel>
      <Panel eyebrow="primitives" title="Controls and state">
        <div className="specimen-row">
          <Button tone="brass" icon={<Mic size={14} />}>record</Button>
          <Button icon={<RotateCcw size={14} />}>new capture</Button>
          <Button disabled>disabled</Button>
          <StatusChip tone="live">listening</StatusChip>
          <StatusChip tone="ready">analysis ready</StatusChip>
          <RecordButton />
          <RecordButton recording />
        </div>
      </Panel>
      <Panel eyebrow="mobile composition" title="Capture comes before context">
        <div className="mobile-capture-specimen">
          <CapturePanel status="idle" onAudio={() => undefined} />
          <p>One recorder owns the microphone, upload, progress, and guidance states. On narrow screens it is the first action after navigation.</p>
        </div>
      </Panel>
      <Panel eyebrow="hero composition" title="Contour with interpreted events">
        <ContourChart result={specimen} />
      </Panel>
    </main>
  );
}
