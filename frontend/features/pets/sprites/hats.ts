/**
 * Hats the pet can wear (11.12b). A hat is one picture per view (front, side facing right, back) in fixed colors,
 * so it looks the same on every coat. It covers the top of the head down to just above the eyes and moves with the head.
 *
 * Roles: P pumpkin · p pumpkin shade · K carved dark and the bat wings
 */
export type HatId = "pumpkin";

export type Hat = { id: HatId; name: string; views: { front: string[]; side: string[]; back: string[] } };

// A soft pumpkin hat with two black bat wings on top and a carved jack-o'-lantern face (angry eyes, zigzag mouth).
const PUMPKIN_FRONT = [
  ".KK........KK.",
  ".KKK..KK..KKK.",
  "..KKPPPPPPKK..",
  "..pPPPPPPPPp..",
  ".pPPPPPPPPPPp.",
  "pPPKKPPPPKKPPp",
  "pPPPKKPPKKPPPp",
  "pPPKPKPKPKPPPp",
  ".pPPPPPPPPPPp.",
];
const PUMPKIN_SIDE = [
  "KK............",
  "KKK...KK......",
  ".KKPPPPPPP....",
  "..pPPPPPPPPp..",
  ".pPPPPPPPPPPp.",
  "pPPPPPPPPKKPPp",
  "pPPPPPPPPPKKPp",
  "pPPPPPPPPKPKPp",
  ".pPPPPPPPPPPp.",
];
const PUMPKIN_BACK = [
  ".KK........KK.",
  ".KKK..KK..KKK.",
  "..KKPPPPPPKK..",
  "..pPPPPPPPPp..",
  ".pPPPPpPPPPPp.",
  "pPPPPPpPPPPPPp",
  "pPPPPPpPPPPPPp",
  "pPPPPPpPPPPPPp",
  ".pPPPPpPPPPPp.",
];

export const HATS: Record<HatId, Hat> = {
  pumpkin: { id: "pumpkin", name: "Pumpkin hat", views: { front: PUMPKIN_FRONT, side: PUMPKIN_SIDE, back: PUMPKIN_BACK } },
};
