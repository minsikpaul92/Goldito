/** Which stage of the upload failed — the screen shows a Toast + Retry. */
export type UploadStep = "prepare" | "sign" | "upload" | "complete";

export class UploadError extends Error {
  readonly step: UploadStep;

  constructor(step: UploadStep, message: string) {
    super(message);
    this.name = "UploadError";
    this.step = step;
  }
}

/**
 * A video is longer than the 30 s limit. Not a dead end: the trim sheet (task 4.7)
 * catches this, lets the user drag a ≤ 30 s window, then calls `uploadMedia()` again.
 */
export class VideoTooLongError extends UploadError {
  readonly durationS: number;

  constructor(durationS: number) {
    super("prepare", "Videos can be up to 30 seconds. Trim this one to keep going.");
    this.name = "VideoTooLongError";
    this.durationS = durationS;
  }
}
