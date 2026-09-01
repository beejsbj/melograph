import { describe, expect, it } from 'vitest';
import { canProjectStrudelPlayheads } from './Workspace';

describe('Strudel graph projection readiness', () => {
  it('requires generated code to be the last successfully evaluated code', () => {
    expect(canProjectStrudelPlayheads('generated', null, false)).toBe(false);
    expect(canProjectStrudelPlayheads('generated', 'edited.slow(2)', false)).toBe(false);
    expect(canProjectStrudelPlayheads('generated', 'generated', false)).toBe(true);
    expect(canProjectStrudelPlayheads('generated.slow(2)', 'generated.slow(2)', true)).toBe(false);
  });
});
