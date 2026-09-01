import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluate = vi.fn(async () => ({ pattern: true }));
const stop = vi.fn();
const evalScope = vi.fn(async () => []);
const audioContext = { currentTime: 0, resume: vi.fn(async () => undefined) };
const resume = audioContext.resume;
const registerSynthSounds = vi.fn(async () => undefined);
const initAudioOnFirstClick = vi.fn();
const replHarness = vi.hoisted(() => ({
  options: null as null | {
    afterEval?: (value: { meta?: { miniLocations?: unknown[] } }) => void;
    onToggle?: (started: boolean) => void;
  },
  scheduler: { now: vi.fn(() => 0) },
}));
const drawerHarness = vi.hoisted(() => ({
  callback: null as null | ((haps: unknown[], time: number) => void),
  start: vi.fn(),
  stop: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@strudel/core', () => ({
  evalScope,
  repl: vi.fn((options) => {
    replHarness.options = options;
    return { evaluate, stop, scheduler: replHarness.scheduler };
  }),
}));
vi.mock('@strudel/draw', () => ({
  Drawer: class {
    constructor(callback: (haps: unknown[], time: number) => void) { drawerHarness.callback = callback; }
    start(scheduler: unknown) { drawerHarness.start(scheduler); }
    stop() { drawerHarness.stop(); }
    invalidate(scheduler: unknown) { drawerHarness.invalidate(scheduler); }
  },
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
    replHarness.scheduler.now.mockReset();
    replHarness.scheduler.now.mockReturnValue(0);
    drawerHarness.start.mockClear();
    drawerHarness.stop.mockClear();
    drawerHarness.invalidate.mockClear();
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

  it('exposes the scheduler clock', async () => {
    const { createStrudelPlayer } = await import('./strudelPlayback');
    const player = await createStrudelPlayer();
    audioContext.currentTime = 14.75;

    expect(player.clockSeconds()).toBe(14.75);
    await expect(player.play('note("C4")')).resolves.toBe(14.75);
  });

  it('connects evaluated source locations and scheduler frames to one visual target', async () => {
    const { createStrudelPlayer } = await import('./strudelPlayback');
    const visuals = { onLocations: vi.fn(), onFrame: vi.fn(), onClear: vi.fn() };
    const player = await createStrudelPlayer(visuals);
    const locations = [[4, 6]];
    const haps = [{ value: 'C4' }];

    replHarness.options?.afterEval?.({ meta: { miniLocations: locations } });
    replHarness.options?.onToggle?.(true);
    drawerHarness.callback?.(haps, .25);
    player.stop();

    expect(visuals.onLocations).toHaveBeenCalledWith(locations);
    expect(drawerHarness.start).toHaveBeenCalledWith(replHarness.scheduler);
    expect(visuals.onFrame).toHaveBeenCalledWith(.25, haps);
    expect(visuals.onClear).toHaveBeenCalled();
  });

  it('projects scheduler cycles into each independently looping take', async () => {
    const { projectedStrudelPlayheadTimes, strudelPlayheadTimes, strudelTick } = await import('./strudelPlayback');
    const phrases = [
      { start_seconds: .5, end_seconds: 1.5, events: [{ type: 'note', midi: 60 }] },
      { start_seconds: 2, end_seconds: 4, events: [{ type: 'note', midi: 64 }] },
      { start_seconds: 5, end_seconds: 6, events: [{ type: 'rest' }] },
    ];

    expect(strudelPlayheadTimes(.75, phrases)).toEqual([1, 3.5]);
    expect(projectedStrudelPlayheadTimes(.75, phrases, false)).toEqual([]);
    expect(strudelTick(.504)).toBe(50);
    expect(strudelTick(1.005)).toBe(101);
    expect(strudelTick(1.506)).toBe(151);
    expect(strudelPlayheadTimes(.505, [
      { start_seconds: .504, end_seconds: 1.506, events: [{ type: 'note', midi: 60 }] },
    ])).toEqual([.504]);
  });
});
