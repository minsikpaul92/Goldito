import { Asset } from "expo-asset";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { MediaConfirm } from "../components/MediaConfirm";
import { MediaPicker } from "../components/MediaPicker";
import { VideoTrimSheet } from "../components/VideoTrimSheet";
import { useShell } from "../components/shell/useShell";
import { DEMO_ACCOUNTS } from "../lib/demo";
import { DemoSample, samplesFor } from "../lib/demoSamples";
import { MediaKind, PickMediaOptions, PickedMedia, registerMediaPicker } from "../lib/media";
import { VIDEO_MAX_SECONDS, VideoTrim, readVideoDuration } from "../lib/mediaNormalize";
import { useSession } from "./SessionProvider";
import { useToast } from "./ToastProvider";

type Options = Required<PickMediaOptions>;
type Current = { resolve: (picked: PickedMedia | null) => void; options: Options };

/** Duration rounding slack, same as `prepareVideo`: a "30 s" clip often reads 30.0x. */
const DURATION_SLACK_S = 0.5;

function acceptFor(mediaTypes: MediaKind[]): string {
  return mediaTypes.map((kind) => `${kind}/*`).join(",");
}

function kindOf(file: File): MediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

/**
 * Opens the system file dialog. `click()` must run inside the user's click, so callers invoke
 * this synchronously from the handler — never after an `await`.
 */
function openFileDialog(accept: string, capture: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) input.setAttribute("capture", "environment");
    input.style.display = "none";
    const cleanup = () => input.remove();
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      cleanup();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      cleanup();
    });
    document.body.appendChild(input);
    input.click();
  });
}

const hasTouchCamera = () =>
  Platform.OS === "web" && typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

/**
 * Mounted once at the app root. Gives `pickMedia()` its UI (phase-04 4.7):
 * - desktop frame or demo account → sample tray + Choose from library (+ Take photo on phones)
 * - a real phone → a sheet with **Take photo** and **Choose from library** (no samples)
 * - `confirm: true` adds a preview step ("Use this photo" / "Retake") before `pickMedia()` resolves
 * Videos over 30 s open the trim sheet before that.
 * Web only for now; native needs `expo-image-picker` and a native trim sheet.
 */
export function MediaPickerProvider({ children }: { children: ReactNode }) {
  const { embedded } = useShell();
  const { session } = useSession();
  const toast = useToast();
  const email = session?.user.email ?? "";
  const useTray = embedded || Object.values(DEMO_ACCOUNTS).some((account) => account.email === email);
  const useTrayRef = useRef(useTray);
  useTrayRef.current = useTray;

  const current = useRef<Current | null>(null);
  const [tray, setTray] = useState<Options | null>(null);
  const [trimming, setTrimming] = useState<{ file: File; duration: number } | null>(null);
  const [confirming, setConfirming] = useState<PickedMedia | null>(null);

  const finish = useCallback((picked: PickedMedia | null) => {
    current.current?.resolve(picked);
    current.current = null;
    setTray(null);
    setTrimming(null);
    setConfirming(null);
  }, []);

  /** Picked and trimmed: done, or one more look first when the caller asked to confirm. */
  const accept = useCallback(
    (picked: PickedMedia) => {
      if (current.current?.options.confirm) {
        setTray(null);
        setTrimming(null);
        setConfirming(picked);
      } else {
        finish(picked);
      }
    },
    [finish],
  );

  /** A file was chosen (sample, computer, camera). Returns whether the pick is over. */
  const settle = useCallback(
    async (file: File) => {
      const options = current.current?.options;
      if (!options) return;
      const kind = kindOf(file);
      if (!kind || !options.mediaTypes.includes(kind)) {
        toast.show(options.mediaTypes.length === 1 ? `Please pick a ${options.mediaTypes[0] === "image" ? "photo" : "video"}.` : "Please pick a photo or video.");
        if (!useTrayRef.current) finish(null);
        return;
      }
      if (kind === "video") {
        const duration = await readVideoDuration(file);
        if (duration !== null && duration > VIDEO_MAX_SECONDS + DURATION_SLACK_S) {
          setTray(null);
          setTrimming({ file, duration });
          return;
        }
      }
      accept({ file });
    },
    [accept, finish, toast],
  );

  useEffect(() => {
    registerMediaPicker((options) => {
      return new Promise<PickedMedia | null>((resolve) => {
        if (Platform.OS !== "web") {
          console.warn("pickMedia() is web-only for now.");
          resolve(null);
          return;
        }
        current.current?.resolve(null); // a newer pick replaces an unfinished one
        current.current = { resolve, options };
        setTrimming(null);
        setConfirming(null);
        // The sheet is always shown: on a real phone it has no samples, only Take photo /
        // Choose from library (each opens the system dialog inside its own tap).
        setTray(options);
      });
    });
    return () => registerMediaPicker(null);
  }, [settle]);

  const onPickSample = async (sample: DemoSample) => {
    try {
      const uri = Asset.fromModule(sample.source).uri;
      const blob = await (await fetch(uri)).blob();
      const kind = sample.kind ?? "image";
      const ext = kind === "video" ? "mp4" : "jpg";
      const type = kind === "video" ? blob.type || "video/mp4" : blob.type || "image/jpeg";
      await settle(new File([blob], `${sample.id}.${ext}`, { type }));
    } catch {
      toast.show("Could not load that sample. Try again.");
    }
  };

  const onUpload = () => {
    if (!tray) return;
    void openFileDialog(acceptFor(tray.mediaTypes), false).then((file) => file && settle(file));
  };

  const onTakePhoto = () => {
    void openFileDialog("image/*", true).then((file) => file && settle(file));
  };

  const onTrimConfirm = (trim: VideoTrim) => {
    if (trimming) accept({ file: trimming.file, trim });
  };

  const onRetake = () => {
    const options = current.current?.options;
    setConfirming(null);
    if (options) setTray(options);
  };

  return (
    <>
      {children}
      {/* Each sheet is mounted only while shown: a Modal mounted later stacks on top of sheets that
          are already open (e.g. the Done popup), so the picker is never hidden behind one. */}
      {tray ? (
        <MediaPicker
          visible
          mediaTypes={tray.mediaTypes}
          samples={useTray ? samplesFor(tray.purpose, tray.mediaTypes) : []}
          canTakePhoto={hasTouchCamera()}
          onPickSample={onPickSample}
          onUpload={onUpload}
          onTakePhoto={onTakePhoto}
          onClose={() => finish(null)}
        />
      ) : null}
      {confirming ? (
        <MediaConfirm
          visible
          file={confirming.file}
          confirmLabel={current.current?.options.confirmLabel ?? "Use this photo"}
          onConfirm={() => finish(confirming)}
          onRetake={onRetake}
          onClose={() => finish(null)}
        />
      ) : null}
      {trimming ? (
        <VideoTrimSheet
          visible
          file={trimming.file}
          duration={trimming.duration}
          onConfirm={onTrimConfirm}
          onCancel={() => finish(null)}
        />
      ) : null}
    </>
  );
}
