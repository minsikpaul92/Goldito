import { apiPost } from "../../lib/api";

/** Snap → Mood (Phase 12.2, D61): `POST /api/ai/pet-mood`. Nothing is saved; the percentages come from server rules. */
export const EMOTIONS = ["happy", "relaxed", "excited", "curious", "sleepy", "anxious", "angry", "sad"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type Box = { x: number; y: number; w: number; h: number };

export type PetMood = {
  frame: number;
  box: Box;
  emotions: Record<Emotion, number>;
  top: Emotion;
  summary: string;
  frames_used: number;
};

export type MoodResult = { pets: PetMood[]; disclaimer: string };

/** The n-th crop of every frame is the same pet (the app sorts them left to right). */
export type MoodFrame = { index: number; crops: { box: Box; image: string }[] };

export function readMood(petId: string | null, frames: MoodFrame[]): Promise<MoodResult> {
  return apiPost<MoodResult>("/api/ai/pet-mood", { ...(petId ? { pet_id: petId } : {}), frames });
}
