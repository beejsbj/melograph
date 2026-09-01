declare module '@strudel/core' {
  interface ReplInstance {
    evaluate(code: string, autostart?: boolean, shouldHush?: boolean): Promise<unknown>;
    stop(): void;
  }

  export function evalScope(...modules: Promise<unknown>[]): Promise<unknown[]>;
  export function repl(options: {
    defaultOutput: unknown;
    getTime: () => number;
    transpiler: unknown;
    onEvalError?: (error: unknown) => void;
  }): ReplInstance;
}

declare module '@strudel/mini';
declare module '@strudel/tonal';

declare module '@strudel/codemirror' {
  export function initEditor(options: {
    initialCode?: string;
    onChange(update: unknown): void;
    root: HTMLElement;
  }): unknown;
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
