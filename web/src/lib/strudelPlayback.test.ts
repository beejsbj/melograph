import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluate = vi.fn(async () => ({ pattern: true }));
const stop = vi.fn();
const evalScope = vi.fn(async () => []);
const audioContext = { currentTime: 0, resume: vi.fn(async () => undefined) };
const resume = audioContext.resume;
const registerSynthSounds = vi.fn(async () => undefined);
const initAudioOnFirstClick = vi.fn();

vi.mock('@strudel/core', () => ({
  evalScope,
  repl: vi.fn(() => ({ evaluate, stop })),
}));
vi.mock('@strudel/mini', () => ({ mini: vi.fn() }));
vi.mock('@strudel/tonal', () => ({ note: vi.fn() }));
vi.mock('@strudel/transpiler', () => ({ transpiler: vi.fn() }));
vi.mock('@strudel/webaudio', () => ({
  getAudioContext: () => audioContext,
  initAudioOnFirstClick,
  registerSynthSounds,
  webaudioOutput: vi.fn(),
}));

describe('Strudel playback boundary', () => {
  beforeEach(() => {
    evaluate.mockClear();
    stop.mockClear();
    evalScope.mockClear();
    resume.mockClear();
    registerSynthSounds.mockClear();
    initAudioOnFirstClick.mockClear();
  });

  it('evaluates the exact current editor code and initializes audio once', async () => {
    const { createStrudelPlayer } = await import('./strudelPlayback');
    const player = await createStrudelPlayer();
    const edited = 'setcpm(72)\nnote("60 64 67").sound("triangle")';

    await player.play(edited);
    await player.play(`${edited}.gain(.5)`);

    expect(evaluate).toHaveBeenNthCalledWith(1, edited, true, true);
    expect(evaluate).toHaveBeenNthCalledWith(2, `${edited}.gain(.5)`, true, true);
    expect(evalScope).toHaveBeenCalledTimes(1);
    expect(registerSynthSounds).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('stops the scheduler and rejects empty code', async () => {
    const { createStrudelPlayer } = await import('./strudelPlayback');
    const player = await createStrudelPlayer();

    await expect(player.play('   ')).rejects.toThrow('no Strudel code');
    player.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('exposes the scheduler clock and maps it across the selected loop', async () => {
    const { createStrudelPlayer, loopRangeTime } = await import('./strudelPlayback');
    const player = await createStrudelPlayer();
    audioContext.currentTime = 14.75;

    expect(player.clockSeconds()).toBe(14.75);
    await expect(player.play('note("C4")')).resolves.toBe(14.75);
    expect(loopRangeTime(player.clockSeconds(), 10, 2, 5)).toBe(3.75);
    expect(loopRangeTime(20, 10, 7, 7)).toBe(7);
  });
});
