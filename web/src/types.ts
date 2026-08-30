export interface Frame {
  time_seconds: number;
  f0_hz_raw: number | null;
  midi_raw: number | null;
  midi_processed: number | null;
  confidence: number;
  voiced: boolean;
  rms_db: number;
}

export interface NoteEvent {
  type: 'note' | 'rest';
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  midi?: number;
  note?: string;
  confidence?: number;
  gesture?: { type: string; [key: string]: unknown } | null;
  flags?: string[];
}

export interface Phrase {
  number: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  events: NoteEvent[];
}

export interface Take {
  number: number;
  code: string;
  code_midi: string;
  repl_url: string;
}

export interface AnalysisResult {
  schema_version: number;
  product: string;
  tracker: string;
  duration_seconds: number;
  frames: Frame[];
  phrases: Phrase[];
  strudel: string;
  takes: Take[];
  warnings: string[];
}
