import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { StyleSheet, Text, View } from "react-native";

import { VIDEO_MAX_SECONDS } from "../lib/mediaNormalize";
import type { VideoTrimSheetProps } from "../lib/media";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";

const MIN_SECONDS = 1;
const THUMB_COUNT = 8;
const HANDLE_WIDTH = 24;
const STRIP_HEIGHT = 64;

type Range = { start: number; end: number };
type DragKind = "start" | "end" | "move";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function formatTime(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Resolve on an event, or after a timeout so one stuck frame never blocks the sheet. */
function once(target: EventTarget, type: string, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      target.removeEventListener(type, done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    target.addEventListener(type, done);
  });
}

/**
 * Trim a video to ≤ 30 s, QuickTime style (phase-04 4.7). Drag the two edges of the window, or
 * the window itself, along a filmstrip. Nothing is cut here: the sheet only returns
 * `{ start, duration }`, and Cloudinary keeps just that part during the upload.
 * Mouse drag and keyboard arrows (± 1 s) both work (DESIGN.md §7.7).
 */
export function VideoTrimSheet({ visible, file, duration, onConfirm, onCancel }: VideoTrimSheetProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [url, setUrl] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [range, setRange] = useState<Range>({ start: 0, end: Math.min(VIDEO_MAX_SECONDS, duration) });
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ kind: DragKind; x0: number; range: Range } | null>(null);

  // Default window = the first 30 s.
  useEffect(() => {
    if (visible) setRange({ start: 0, end: Math.min(VIDEO_MAX_SECONDS, duration) });
  }, [visible, file, duration]);

  useEffect(() => {
    if (!visible || !file) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setThumbs([]);
    setPlaying(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [visible, file]);

  // Filmstrip: a few frames spread over the whole video.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 72;
    const ctx = canvas.getContext("2d");
    (async () => {
      await once(video, "loadeddata");
      const frames: string[] = [];
      for (let i = 0; i < THUMB_COUNT && !cancelled && ctx; i += 1) {
        video.currentTime = Math.min(Math.max(duration - 0.1, 0), ((i + 0.5) * duration) / THUMB_COUNT);
        await once(video, "seeked");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.6));
        if (!cancelled) setThumbs([...frames]);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [url, duration]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video && Number.isFinite(time)) video.currentTime = time;
  }, []);

  const apply = useCallback(
    (kind: DragKind, base: Range, time: number, deltaSeconds: number) => {
      if (kind === "start") {
        const start = clamp(time, Math.max(0, base.end - VIDEO_MAX_SECONDS), base.end - MIN_SECONDS);
        setRange({ start, end: base.end });
        seek(start);
      } else if (kind === "end") {
        const end = clamp(time, base.start + MIN_SECONDS, Math.min(duration, base.start + VIDEO_MAX_SECONDS));
        setRange({ start: base.start, end });
        seek(Math.max(base.start, end - 0.05));
      } else {
        const length = base.end - base.start;
        const start = clamp(base.start + deltaSeconds, 0, Math.max(duration - length, 0));
        setRange({ start, end: start + length });
        seek(start);
      }
    },
    [duration, seek],
  );

  const secondsPerPixel = () => {
    const width = stripRef.current?.getBoundingClientRect().width ?? 1;
    return duration / Math.max(width, 1);
  };

  const timeAt = (clientX: number) => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1) * duration;
  };

  const onPointerDown = (kind: DragKind) => (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    videoRef.current?.pause();
    drag.current = { kind, x0: event.clientX, range: { ...rangeRef.current } };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    apply(current.kind, current.range, timeAt(event.clientX), (event.clientX - current.x0) * secondsPerPixel());
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onKeyDown = (kind: "start" | "end") => (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const base = rangeRef.current;
    apply(kind, base, (kind === "start" ? base.start : base.end) + step, 0);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const { start, end } = rangeRef.current;
      if (video.currentTime < start || video.currentTime >= end - 0.05) video.currentTime = start;
      void video.play();
    } else {
      video.pause();
    }
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const { start, end } = rangeRef.current;
    if (video.currentTime >= end) {
      video.pause();
      video.currentTime = start;
    }
  };

  const pct = (seconds: number) => `${(seconds / duration) * 100}%`;
  const length = range.end - range.start;

  return (
    <Sheet
      visible={visible}
      title="Trim your video"
      onClose={onCancel}
      testID="trim-sheet"
      footer={
        <Button
          label="Use this part"
          onPress={() => onConfirm({ start: range.start, duration: length })}
          testID="trim-confirm"
        />
      }
    >
      <Text style={styles.hint}>
        Videos can be up to {VIDEO_MAX_SECONDS} seconds. Drag the edges to choose the part to keep.
      </Text>

      <View style={styles.previewBox}>
        {url ? (
          <video
            ref={videoRef}
            src={url}
            playsInline
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={onTimeUpdate}
            style={{ width: "100%", maxHeight: 220, borderRadius: theme.radius.md, backgroundColor: theme.color.text }}
            data-testid="trim-video"
          />
        ) : null}
      </View>

      <Button
        label={playing ? "Pause" : "Play selection"}
        onPress={togglePlay}
        variant="secondary"
        testID="trim-play"
      />

      {/* The strip owns its pointer gestures: a drag here must not scroll the sheet (§7.7). */}
      <div
        ref={stripRef}
        data-gesture-owner="true"
        data-testid="trim-strip"
        style={{
          position: "relative",
          height: STRIP_HEIGHT,
          borderRadius: theme.radius.sm,
          overflow: "hidden",
          backgroundColor: theme.color.border,
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {Array.from({ length: THUMB_COUNT }, (_, i) =>
            thumbs[i] ? (
              <img
                key={i}
                src={thumbs[i]}
                alt=""
                draggable={false}
                style={{ flex: 1, minWidth: 0, height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div key={i} style={{ flex: 1 }} />
            ),
          )}
        </div>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: pct(range.start), background: theme.color.overlay }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: pct(duration - range.end), background: theme.color.overlay }} />

        <div
          data-testid="trim-window"
          onPointerDown={onPointerDown("move")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: pct(range.start),
            width: pct(length),
            boxSizing: "border-box",
            borderTop: `3px solid ${theme.color.primary}`,
            borderBottom: `3px solid ${theme.color.primary}`,
            cursor: "grab",
          }}
        >
          {(["start", "end"] as const).map((kind) => (
            <div
              key={kind}
              role="slider"
              tabIndex={0}
              aria-label={kind === "start" ? "Trim start" : "Trim end"}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(kind === "start" ? range.start : range.end)}
              aria-valuetext={formatTime(kind === "start" ? range.start : range.end)}
              data-testid={`trim-handle-${kind}`}
              onPointerDown={onPointerDown(kind)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown(kind)}
              style={{
                position: "absolute",
                top: -3,
                bottom: -3,
                [kind === "start" ? "left" : "right"]: 0,
                width: HANDLE_WIDTH,
                background: theme.color.primary,
                cursor: "ew-resize",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 3, height: 20, borderRadius: 2, background: theme.color.primaryText }} />
            </div>
          ))}
        </div>
      </div>

      <Text style={styles.summary} testID="trim-summary">
        {formatTime(range.start)} – {formatTime(range.end)} · {Math.round(length)} s of {formatTime(duration)}
      </Text>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    previewBox: {
      alignItems: "center",
    },
    summary: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
      fontWeight: "600",
      textAlign: "center",
    },
  });
