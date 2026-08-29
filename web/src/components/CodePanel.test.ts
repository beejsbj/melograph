import { describe, expect, it } from 'vitest';
import { encodeStrudelUrl } from './CodePanel';

describe('encodeStrudelUrl', () => {
  it('round-trips unicode-safe Strudel code in the URL fragment', () => {
    const code = 'setcpm(60)\nnote("60 62") // café\n';
    const url = encodeStrudelUrl(code);
    const encoded = decodeURIComponent(url.split('#')[1]);
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe(code);
  });
});
