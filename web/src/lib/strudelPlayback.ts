export interface StrudelPlayer {
  play(code: string): Promise<void>;
  stop(): void;
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
    },
    stop() {
      engine.stop();
    },
  };
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
