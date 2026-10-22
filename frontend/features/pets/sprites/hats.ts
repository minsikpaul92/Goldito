/**
 * Hats the pet can wear (11.12b). A hat is one picture per view (front, side facing right, back) in fixed colors,
 * so it looks the same on every coat. It sits on the head's crown and moves with the head.
 *
 * Roles: P pumpkin · p pumpkin shade · G stem · K carved dark · Y glow
 */
export type HatId = "pumpkin";

export type Hat = { id: HatId; name: string; views: { front: string[]; side: string[]; back: string[] } };

const PUMPKIN_FRONT = [
  ".....GG.....",
  ".....GG.....",
  "..pPPPPPPp..",
  ".pPPPPPPPPp.",
  "pPPKPPPPKPPp",
  "pPKKKPPKKKPp",
  ".pPKPKKPKPp.",
];
const PUMPKIN_SIDE = [
  ".....GG.....",
  ".....GG.....",
  "..pPPPPPPp..",
  ".pPPPPPPPPPp",
  "pPPPPPPPPKPp",
  "pPPPPPPPKKPp",
  ".pPPPPPPPPp.",
];
const PUMPKIN_BACK = [
  ".....GG.....",
  ".....GG.....",
  "..pPPPPPPp..",
  ".pPPPPpPPPp.",
  "pPPPPpPPPPPp",
  "pPPPPpPPPPPp",
  ".pPPPpPPPPp.",
];

export const HATS: Record<HatId, Hat> = {
  pumpkin: { id: "pumpkin", name: "Pumpkin hat", views: { front: PUMPKIN_FRONT, side: PUMPKIN_SIDE, back: PUMPKIN_BACK } },
};
