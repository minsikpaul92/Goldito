/**
 * `pickMedia()` — the ONLY way any screen picks a photo or video (phase-04 4.7, D25).
 *
 * The UI (sample tray, "Upload from computer", video trim sheet) lives in
 * `MediaPickerProvider`, mounted once at the app root. Screens just call:
 *
 *   const picked = await pickMedia({ purpose: "feed" });
 *   if (picked) await uploadMedia({ petId, purpose: "feed", file: picked.file, trim: picked.trim });
 *
 * Returns `null` when the user closes the picker. `trim` is set only for a video the user cut
 * down to ≤ 30 s; pass it on to `uploadMedia()`.
 */
import type { MediaPurpose } from "./cloudinary";
import type { VideoTrim } from "./mediaNormalize";

export type MediaKind = "image" | "video";

export type PickMediaOptions = {
  purpose: MediaPurpose;
  /** What the user may pick. Default: photos only. */
  mediaTypes?: MediaKind[];
};

export type PickedMedia = {
  file: File;
  trim?: VideoTrim;
};

type PickerHandler = (options: Required<PickMediaOptions>) => Promise<PickedMedia | null>;

let handler: PickerHandler | null = null;

/** Called by `MediaPickerProvider` on mount / unmount. */
export function registerMediaPicker(next: PickerHandler | null): void {
  handler = next;
}

export function pickMedia(options: PickMediaOptions): Promise<PickedMedia | null> {
  if (!handler) {
    return Promise.reject(new Error("pickMedia() needs MediaPickerProvider at the app root."));
  }
  return handler({ mediaTypes: ["image"], ...options });
}

/** Props of the trim sheet (`VideoTrimSheet.web.tsx`; native has no sheet yet). */
export type VideoTrimSheetProps = {
  visible: boolean;
  file: File | null;
  /** Length of the whole video, in seconds. */
  duration: number;
  onConfirm: (trim: VideoTrim) => void;
  onCancel: () => void;
};
