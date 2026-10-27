/**
 * The owner's pet room as pixel art (Mook's room play sketch, Oct 27): the furniture, the hearts, the thought bubble and
 * the ball, in room pixels (the room is ROOM_W x ROOM_H of them). Rows of letters, each letter a color of its palette;
 * `.` is see-through. Scene colors, like the sprite's.
 */
export const ROOM_W = 120;
export const ROOM_H = 80;
/** The wall ends and the floor starts on this row. */
export const FLOOR_Y = 54;
/** The row the pet stands on (its feet are one row above). */
export const BASE_Y = 75;

type Art = { rows: string[]; pal: Record<string, string> };

/** Rows of letters to rows of colors for `PixelGrid`. */
export function pixelsOf({ rows, pal }: Art): (string | null)[][] {
  return rows.map((row) => [...row].map((ch) => pal[ch] ?? null));
}

export const ROOM_COLOR = {
  wall: "#FBEFC8",
  stripe: "#F7E7BB",
  baseboard: "#E9D3A2",
  floor: "#FDE2CC",
  plank: "#F6D3B6",
  frame: "#FFFFFF",
  sun: "#F4A261",
  dusk: "#E76F51",
  moon: "#F1E9C9",
  cloud: "#FFFFFF",
};

export const SKY = { day: "#CFE8F3", evening: "#F6C79B", night: "#2E3A59" } as const;

export const RUG: Art = {
  rows: [
    "....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX....",
    "..XXOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOXX..",
    "XXOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOXX",
    "..XXOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOXX..",
    "....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX....",
  ],
  pal: { X: "#F2B9A8", O: "#FAD6CB" },
};

/** The bowl; `FOOD` sits on top of it unless the pet is hungry (the sitter logged a skipped or light meal). */
export const BOWL: Art = {
  rows: ["OOOOOOOOOOOO", ".ORRRRRRRRO.", ".OrRRWRRRrO.", "..OrrrrrrO..", "...OOOOOO..."],
  pal: { O: "#5A3A22", R: "#E76F51", r: "#C9553A", W: "#FFF9F0" },
};
export const FOOD: Art = { rows: ["..k.k.kk.k..", ".kkkkkkkkkk."], pal: { k: "#B5652E" } };

/** A bed wide enough for the pet (42 x 14): headboard on the right, pillow, blanket, wood frame and legs. */
export const BED: Art = {
  rows: buildBed(),
  pal: { K: "#1B4332", P: "#FAD6CB", p: "#F2B9A8", O: "#FFFFFF", M: "#D8F3DC", D: "#B5652E", W: "#D9925A" },
};
function buildBed(): string[] {
  const W = 42;
  const rows: string[] = [];
  for (let y = 0; y < 14; y++) {
    const r = Array<string>(W).fill(".");
    for (let x = 36; x < 42; x++) {
      if (y === 0 && (x === 36 || x === 41)) continue;
      if (y <= 12) r[x] = x === 36 || x === 41 || y === 0 ? "D" : "W";
    }
    if (y >= 5 && y <= 10) for (let x = 1; x < 36; x++) r[x] = x === 1 || y === 5 ? "K" : "M";
    if (y >= 3 && y <= 8) for (let x = y > 3 ? 2 : 4; x < 26; x++) r[x] = y === 3 || x === 25 ? "K" : (x + y) % 5 === 0 ? "p" : "P";
    if (y >= 4 && y <= 7) for (let x = 28; x < 35; x++) r[x] = y === 4 || y === 7 || x === 28 || x === 34 ? "K" : "O";
    if (y === 10 || y === 11) for (let x = 1; x < 42; x++) r[x] = "D";
    if (y === 12 || y === 13) for (const x of [2, 3, 38, 39]) r[x] = "D";
    rows.push(r.join(""));
  }
  return rows;
}

export const SUN: Art = { rows: [".XX.", "XXXX", "XXXX", ".XX."], pal: { X: ROOM_COLOR.sun } };
export const DUSK_SUN: Art = { rows: [".XX.", "XXXX", "XXXX", ".XX."], pal: { X: ROOM_COLOR.dusk } };
export const MOON: Art = { rows: [".XX.", "XX..", "XX..", ".XX."], pal: { X: ROOM_COLOR.moon } };
export const CLOUD: Art = { rows: [".XXX..", "XXXXXX"], pal: { X: ROOM_COLOR.cloud } };

export const HEART: Art = { rows: [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."], pal: { X: "#E76F51" } };
export const SPARK: Art = { rows: ["..X..", ".XXX.", "XXXXX", ".XXX.", "..X.."], pal: { X: "#F4A261" } };
export const MINI_BOWL: Art = { rows: ["XXXXXXX", ".XXXXX.", "..XXX.."], pal: { X: "#E76F51" } };
/** The sleep Z of the pet generator's room art. */
export const ZZZ: Art = { rows: ["....ZZZ", ".....Z.", "....ZZZ", "ZZZZ...", "..Z....", ".Z.....", "ZZZZ..."], pal: { Z: "#7C83B8" } };
/** The thought bubble (13 x 8) and its two tail dots. */
export const BUBBLE: Art = {
  rows: [
    "..XXXXXXXXX..",
    ".XWWWWWWWWWX.",
    "XWWWWWWWWWWWX",
    "XWWWWWWWWWWWX",
    "XWWWWWWWWWWWX",
    "XWWWWWWWWWWWX",
    ".XWWWWWWWWWX.",
    "..XXXXXXXXX..",
    "...XX........",
    "...XX........",
    ".X...........",
  ],
  pal: { X: "#1B4332", W: "#FFFFFF" },
};
export const BALL: Art = {
  rows: ["..XXXX..", ".XXWXXX.", "XXWWXXXX", "XXXXXXXX", "XXXXXXSX", "XXXXXSSX", ".XXSSSX.", "..XXXX.."],
  pal: { X: "#E76F51", W: "#FFF9F0", S: "#C9553A" },
};
/** The wall frame for the latest photo: 20 x 17 room pixels, the photo inside is 16 x 13. */
export const PHOTO_FRAME = { x: 50, y: 9, w: 20, h: 17, inset: 2 };
