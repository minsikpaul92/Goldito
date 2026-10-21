/**
 * Records the microphone in the browser (11.15 S3). P0 is a web app, so this is `MediaRecorder`; the native app
 * (later) swaps this file. Nothing here sends or stores anything: the caller gets the recording as a Blob.
 */

export const MAX_RECORDING_MS = 60_000;

export type VoiceErrorReason = "denied" | "unsupported" | "failed";

export class VoiceError extends Error {
  readonly reason: VoiceErrorReason;

  constructor(reason: VoiceErrorReason) {
    super(reason);
    this.name = "VoiceError";
    this.reason = reason;
  }
}

/** The first format this browser can record: webm in Chrome and Firefox, mp4 in Safari. */
function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
}

export function isVoiceSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export type Recording = {
  /** Ends the recording and resolves with it (a second call changes nothing). */
  stop: () => Promise<Blob>;
};

/** Asks for the microphone and starts recording. Stops by itself after MAX_RECORDING_MS. */
export async function startRecording(onAutoStop?: () => void): Promise<Recording> {
  if (!isVoiceSupported()) throw new VoiceError("unsupported");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = (e as { name?: string }).name;
    throw new VoiceError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed");
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      // The microphone light goes off as soon as the recording ends.
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
    };
  });
  recorder.start();
  const timer = setTimeout(() => {
    if (recorder.state === "recording") {
      recorder.stop();
      onAutoStop?.();
    }
  }, MAX_RECORDING_MS);

  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state === "recording") recorder.stop();
      return finished;
    },
  };
}
