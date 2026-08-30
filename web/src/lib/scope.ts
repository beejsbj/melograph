import type { AnalysisResult, Phrase, Take } from '../types';

export type AnalysisScope = 'full' | number;

export interface ScopeView {
  key: string;
  label: string;
  phrases: Phrase[];
  take?: Take;
  startSeconds: number;
  endSeconds: number;
}

export function createScopeView(result: AnalysisResult, scope: AnalysisScope): ScopeView {
  if (scope === 'full') {
    return {
      key: 'full',
      label: 'Full capture',
      phrases: result.phrases,
      startSeconds: 0,
      endSeconds: result.duration_seconds,
    };
  }

  const phrase = result.phrases.find((candidate) => candidate.number === scope);
  const take = result.takes.find((candidate) => candidate.number === scope);
  if (!phrase || !take) return createScopeView(result, 'full');
  return {
    key: `take-${scope}`,
    label: `Take ${scope}`,
    phrases: [phrase],
    take,
    startSeconds: phrase.start_seconds,
    endSeconds: phrase.end_seconds,
  };
}

export function scopeCode(result: AnalysisResult, view: ScopeView, pitch: 'notes' | 'midi') {
  if (view.take) return pitch === 'midi' ? view.take.code_midi : view.take.code;
  return pitch === 'midi' ? result.strudel_midi : result.strudel;
}
