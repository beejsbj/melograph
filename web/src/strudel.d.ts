declare module '@strudel/core' {
  interface ReplInstance {
    scheduler: { now(): number };
    evaluate(code: string, autostart?: boolean, shouldHush?: boolean): Promise<unknown>;
    stop(): void;
  }

  export function evalScope(...modules: Promise<unknown>[]): Promise<unknown[]>;
  export function repl(options: {
    defaultOutput: unknown;
    getTime: () => number;
    transpiler: unknown;
    onEvalError?: (error: unknown) => void;
    onToggle?: (started: boolean) => void;
    afterEval?: (options: { meta?: { miniLocations?: unknown[] } }) => void;
  }): ReplInstance;
}

declare module '@strudel/draw' {
  export class Drawer {
    constructor(onDraw: (haps: unknown[], time: number) => void, drawTime?: [number, number]);
    start(scheduler: unknown): void;
    stop(): void;
    invalidate(scheduler: unknown): void;
  }
}

declare module '@strudel/mini';
declare module '@strudel/tonal';

declare module '@strudel/codemirror' {
  export function initEditor(options: {
    initialCode?: string;
    onChange(update: unknown): void;
    root: HTMLElement;
  }): unknown;
  export function updateMiniLocations(view: unknown, locations: unknown[]): void;
  export function highlightMiniLocations(view: unknown, time: number, haps: unknown[]): void;
}

declare module '@strudel/transpiler' {
  export const transpiler: unknown;
}

declare module '@strudel/webaudio' {
  export const webaudioOutput: unknown;
  export function getAudioContext(): AudioContext;
  export function initAudioOnFirstClick(): void;
  export function registerSynthSounds(): Promise<unknown>;
}
