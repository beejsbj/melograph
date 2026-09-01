export interface StrudelPlayer {
  play(code: string): Promise<number>;
  stop(): void;
  clockSeconds(): number;
}

type StrudelModules = Awaited<ReturnType<typeof importStrudelModules>>;

let modulesPromise: Promise<StrudelModules> | null = null;

export function preloadStrudelPlayer() {
  modulesPromise ??= importStrudelModules();
  return modulesPromise;
}

export async function createStrudelPlayer(): Promise<StrudelPlayer> {
  const { core, mini, tonal, transpiler, webaudio } = await preloadStrudelPlayer();
  let evaluationError: unknown = null;
  let readyPromise: Promise<void> | null = null;
  const engine = core.repl({
    defaultOutput: webaudio.webaudioOutput,
    getTime: () => webaudio.getAudioContext().currentTime,
    transpiler: transpiler.transpiler,
    onEvalError: (error) => { evaluationError = error; },
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
    },
    clockSeconds() {
      return webaudio.getAudioContext().currentTime;
    },
  };
}

export function loopRangeTime(clockSeconds: number, startedAt: number, rangeStart: number, rangeEnd: number) {
  const duration = rangeEnd - rangeStart;
  if (duration <= 0) return rangeStart;
  return rangeStart + Math.max(0, clockSeconds - startedAt) % duration;
}

async function importStrudelModules() {
  const [core, mini, tonal, transpiler, webaudio] = await Promise.all([
    import('@strudel/core'),
    import('@strudel/mini'),
    import('@strudel/tonal'),
    import('@strudel/transpiler'),
    import('@strudel/webaudio'),
  ]);
  return { core, mini, tonal, transpiler, webaudio };
}

function toError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}
