import { describe, expect, it } from 'vitest';
import type { Take } from '../types';
import { encodeStrudelUrl, takeCode } from './CodePanel';

describe('encodeStrudelUrl', () => {
  it('round-trips unicode-safe Strudel code in the URL fragment', () => {
    const code = 'setcpm(60)\nnote("60 62") // café\n';
    const url = encodeStrudelUrl(code);
    const encoded = decodeURIComponent(url.split('#')[1]);
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe(code);
  });
});

describe('takeCode', () => {
  const take: Take = {
    number: 1,
    code: 'note("C4")',
    code_midi: 'note("60")',
    repl_url: 'https://strudel.cc',
  };

  it('defaults to readable note names while exposing the precise MIDI form', () => {
    expect(takeCode(take, 'notes')).toBe('note("C4")');
    expect(takeCode(take, 'midi')).toBe('note("60")');
  });
});
