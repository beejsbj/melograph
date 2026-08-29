import type { AnalysisResult } from '../types';

export async function analyzeWav(wav: Blob): Promise<AnalysisResult> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: wav,
  });
  const payload = (await response.json()) as AnalysisResult | { error: string };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error : 'Analysis failed');
  }
  return payload;
}
