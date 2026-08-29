import { describe, expect, it } from 'vitest';
import { encodeWav } from './audio';

describe('encodeWav', () => {
  it('writes a mono 16-bit PCM WAV header and payload', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1]), 22_050);
    const view = new DataView(await blob.arrayBuffer());
    const ascii = (start: number, length: number) => String.fromCharCode(
      ...Array.from({ length }, (_, index) => view.getUint8(start + index)),
    );
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(22_050);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.byteLength).toBe(50);
  });
});
