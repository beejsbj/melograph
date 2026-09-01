export interface StrudelPlayer {
  play(code: string): Promise<number>;
  stop(): void;
  clockSeconds(): number;
  cycle(): number;
}

export interface StrudelVisualCallbacks {
  onLocations?(locations: unknown[]): void;
  onFrame?(time: number, haps: unknown[]): void;
  onClear?(): void;
}

type StrudelModules = Awaited<ReturnType<typeof importStrudelModules>>;

let modulesPromise: Promise<StrudelModules> | null = null;

export function preloadStrudelPlayer() {
  modulesPromise ??= importStrudelModules();
  return modulesPromise;
}

export async function createStrudelPlayer(visuals: StrudelVisualCallbacks = {}): Promise<StrudelPlayer> {
  const { core, draw, mini, tonal, transpiler, webaudio } = await preloadStrudelPlayer();
  let evaluationError: unknown = null;
  let readyPromise: Promise<void> | null = null;
  let engine: ReturnType<typeof core.repl>;
  const drawer = new draw.Drawer((haps: unknown[], time: number) => {
    visuals.onFrame?.(time, haps);
  }, [0, 0]);
  engine = core.repl({
    defaultOutput: webaudio.webaudioOutput,
    getTime: () => webaudio.getAudioContext().currentTime,
    transpiler: transpiler.transpiler,
    onEvalError: (error) => { evaluationError = error; },
    onToggle: (started) => {
      if (started) drawer.start(engine.scheduler);
      else {
        drawer.stop();
        visuals.onClear?.();
      }
    },
    afterEval: ({ meta }) => {
      visuals.onLocations?.(meta?.miniLocations ?? []);
      drawer.invalidate(engine.scheduler);
    },
  });

  async function ensureReady() {
    if (!readyPromise) {
      readyPromise = (async () => {
        webaudio.initAudioOnFirstClick();
        await Promise.all([
          core.evalScope(Promise.resolve(core), Promise.resolve(mini), Promise.resolve(tonal), Promise.resolve(webaudio)),
          webaudio.registerSynthSounds(),
        ]);
      })().catch((error) => {
        readyPromise = null;
        throw error;
      });
    }
    await readyPromise;
    await webaudio.getAudioContext().resume();
  }

  return {
    async play(code) {
      if (!code.trim()) throw new Error('There is no Strudel code to play.');
      await ensureReady();
      evaluationError = null;
      const pattern = await engine.evaluate(code, true, true);
      if (evaluationError) throw toError(evaluationError);
      if (!pattern) throw new Error('Strudel did not produce a playable pattern.');
      // evaluate() resolves immediately after the scheduler accepts the pattern.
      // This clock sample is the closest public boundary to audible loop start.
      return webaudio.getAudioContext().currentTime;
    },
    stop() {
      engine.stop();
      drawer.stop();
      visuals.onClear?.();
    },
    clockSeconds() {
      return webaudio.getAudioContext().currentTime;
    },
    cycle() {
      return engine.scheduler.now();
    },
  };
}

export function loopRangeTime(clockSeconds: number, startedAt: number, rangeStart: number, rangeEnd: number) {
  const duration = rangeEnd - rangeStart;
  if (duration <= 0) return rangeStart;
  return rangeStart + Math.max(0, clockSeconds - startedAt) % duration;
}

const DEFAULT_CPS = .5;

export function strudelPlayheadTimes(cycle: number, phrases: Array<{
  start_seconds: number;
  end_seconds: number;
  events: Array<{ type: string; midi?: number }>;
}>) {
  return phrases
    .filter((phrase) => phrase.events.some((event) => event.type === 'note' && event.midi !== undefined))
    .map((phrase) => {
      const duration = Math.max(0, phrase.end_seconds - phrase.start_seconds);
      const period = duration * DEFAULT_CPS;
      if (period <= 0) return phrase.start_seconds;
      const phase = ((cycle % period) + period) % period;
      return phrase.start_seconds + phase / DEFAULT_CPS;
    });
}

async function importStrudelModules() {
  const [core, draw, mini, tonal, transpiler, webaudio] = await Promise.all([
    import('@strudel/core'),
    import('@strudel/draw'),
    import('@strudel/mini'),
    import('@strudel/tonal'),
    import('@strudel/transpiler'),
    import('@strudel/webaudio'),
  ]);
  return { core, draw, mini, tonal, transpiler, webaudio };
}

function toError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}
