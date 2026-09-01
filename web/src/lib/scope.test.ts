import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '../types';
import { createScopeView, scopeCode, strudelPlaybackRange } from './scope';

const result = {
  schema_version: 1,
  product: 'melograph',
  tracker: 'praat-ac',
  duration_seconds: 4,
  frames: [],
  phrases: [
    { number: 1, start_seconds: .5, end_seconds: 1.5, duration_seconds: 1, events: [] },
    { number: 2, start_seconds: 2, end_seconds: 3.5, duration_seconds: 1.5, events: [] },
  ],
  takes: [
    { number: 1, code: 'take one names', code_midi: 'take one midi', repl_url: '' },
    { number: 2, code: 'take two names', code_midi: 'take two midi', repl_url: '' },
  ],
  strudel: 'full names',
  strudel_midi: 'full midi',
  warnings: [],
} as AnalysisResult;

describe('analysis scope', () => {
  it('uses the whole capture for Full and one silence-separated range for a take', () => {
    expect(createScopeView(result, 'full')).toMatchObject({ startSeconds: 0, endSeconds: 4, phrases: result.phrases });
    expect(createScopeView(result, 2)).toMatchObject({ startSeconds: 2, endSeconds: 3.5, phrases: [result.phrases[1]] });
  });

  it('selects matching full or take code in either pitch representation', () => {
    expect(scopeCode(result, createScopeView(result, 'full'), 'notes')).toBe('full names');
    expect(scopeCode(result, createScopeView(result, 2), 'midi')).toBe('take two midi');
  });

  it('maps a single Strudel phrase to its audible interval instead of capture silence', () => {
    const onePhrase = { ...result, phrases: [result.phrases[0]], takes: [result.takes[0]] };

    expect(strudelPlaybackRange(createScopeView(onePhrase, 'full'))).toEqual({ startSeconds: .5, endSeconds: 1.5 });
    expect(strudelPlaybackRange(createScopeView(result, 2))).toEqual({ startSeconds: 2, endSeconds: 3.5 });
  });
});
