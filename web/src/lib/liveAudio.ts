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
  let source: MediaStreamAudioSourceNode | undefined;
  let mute: GainNode | undefined;
  let tap: AudioNode | undefined;

  const cleanup = async () => {
    safeDisconnect(source);
    safeDisconnect(tap);
    safeDisconnect(mute);
    if (context.state !== 'closed') await context.close();
  };

  try {
    source = context.createMediaStreamSource(stream);
    mute = context.createGain();
    mute.gain.value = 0;
    mute.connect(context.destination);

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
    return { stop: cleanup };
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}

function safeDisconnect(node: AudioNode | undefined): void {
  try {
    node?.disconnect();
  } catch {
    // A partially initialized graph may not have a connection to remove.
  }
}
