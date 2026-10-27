import data from "./moodFaces.json";

/** The tamagotchi faces (brand logo files, 24 × 24) the app shows a mood on. */
export type FaceMood = "idle" | "perk" | "wink" | "excited" | "calm" | "content" | "sleep" | "teary" | "shy" | "surprised";

const FACES = data as unknown as Record<string, { pal: Record<string, string>; faces: Record<FaceMood, string> }>;
const SIZE = 24;

/**
 * The sitter's check-in moods (checkinOptions MOOD_OPTIONS) on the faces. Sad and Anxious borrow the nearest faces
 * (shy, surprised) until they get their own drawings.
 */
export const CHECKIN_FACE: Record<string, FaceMood> = {
  happy: "perk",
  playful: "wink",
  excited: "excited",
  calm: "calm",
  tired: "sleep",
  missing: "teary",
  sad: "shy",
  anxious: "surprised",
};

/**
 * Snap → Mood's eight emotions on the faces. Curious, Anxious, Sad and Angry borrow the nearest faces (idle, surprised,
 * shy, calm) until they get their own drawings; Anxious and Sad match the check-in's.
 */
export const EMOTION_FACE: Record<string, FaceMood> = {
  happy: "perk",
  relaxed: "content",
  excited: "excited",
  curious: "idle",
  sleepy: "sleep",
  anxious: "surprised",
  sad: "shy",
  angry: "calm",
};

/** One face as rows of CSS colors (`null` = transparent), for a head shape (`PET_BASES` key); unknown shapes fall back. */
export function faceRows(base: string, mood: FaceMood, cat: boolean): (string | null)[][] {
  const set = FACES[base] ?? FACES[cat ? "tabby" : "dog"];
  const grid = set.faces[mood] ?? set.faces.idle;
  const rows: (string | null)[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < SIZE; x++) {
      const c = grid[y * SIZE + x];
      row.push(c === "." ? null : (set.pal[c] ?? null));
    }
    rows.push(row);
  }
  return rows;
}

export const FACE_SIZE = SIZE;
