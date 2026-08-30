import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluate = vi.fn(async () => ({ pattern: true }));
const stop = vi.fn();
const evalScope = vi.fn(async () => []);
const resume = vi.fn(async () => undefined);
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
  getAudioContext: () => ({ currentTime: 0, resume }),
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
});
