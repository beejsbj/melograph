import { LiveMpmTracker, type LivePitchFrame } from './livePitch';

export interface LivePitchMonitor {
  stop: () => Promise<void>;
}

export async function startLivePitchMonitor(
  stream: MediaStream,
  onFrame: (frame: LivePitchFrame) => void,
): Promise<LivePitchMonitor> {
  const context = new AudioContext();
  const tracker = new LiveMpmTracker();
  const source = context.createMediaStreamSource(stream);
  const mute = context.createGain();
  mute.gain.value = 0;
  mute.connect(context.destination);

  let tap: AudioNode;
  if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    await context.audioWorklet.addModule('/live-pitch-worklet.js');
    const worklet = new AudioWorkletNode(context, 'melograph-pitch-tap');
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      for (const frame of tracker.push(event.data, context.sampleRate)) onFrame(frame);
    };
    tap = worklet;
  } else {
    const processor = context.createScriptProcessor(2_048, 1, 1);
    processor.onaudioprocess = (event) => {
      for (const frame of tracker.push(event.inputBuffer.getChannelData(0), context.sampleRate)) onFrame(frame);
    };
    tap = processor;
  }

  source.connect(tap);
  tap.connect(mute);
  await context.resume();
  return {
    stop: async () => {
      source.disconnect();
      tap.disconnect();
      mute.disconnect();
      await context.close();
    },
  };
}
