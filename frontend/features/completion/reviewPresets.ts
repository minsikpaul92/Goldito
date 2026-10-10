/**
 * One-tap review phrases per star rating, like a ride app's review (FB-27). The writer picks any of the three for
 * their stars; their own words stay optional. Picked phrases and the words go into one comment (≤ 500 chars).
 */
export type ReviewPresets = Record<1 | 2 | 3 | 4 | 5, string[]>;

/** The owner about the sitter, after a stay. */
export const OWNER_REVIEW_PRESETS: ReviewPresets = {
  1: ["Didn't follow the care notes", "Hard to reach", "Pets came home stressed"],
  2: ["Updates were rare", "Some care tasks were missed", "Handoff was disorganized"],
  3: ["Care was okay", "More photos would help", "Communication could be better"],
  4: ["Good care and updates", "Pets seemed happy", "Handoff went smoothly"],
  5: ["Amazing care!", "Loved the photos and updates", "Would book again"],
};

/** The sitter about the owner, after a stay — private to the sitter (011g). */
export const SITTER_REVIEW_PRESETS: ReviewPresets = {
  1: ["Late for the handoff", "Care info was missing", "Hard to reach"],
  2: ["Handoff was rushed", "Some info was missing", "Slow to reply"],
  3: ["Okay to work with", "Instructions could be clearer", "Handoff was fine"],
  4: ["Clear care notes", "On time for handoffs", "Easy to talk to"],
  5: ["Great to work with!", "Pets well prepared", "Happy to host again"],
};

export function presetsFor(presets: ReviewPresets, rating: number): string[] {
  return rating >= 1 && rating <= 5 ? presets[rating as 1 | 2 | 3 | 4 | 5] : [];
}

/** "Amazing care! · Would book again" + a new line + the writer's own words. */
export function composeComment(picked: string[], words: string): string {
  const own = words.trim();
  return [picked.join(" · "), own].filter(Boolean).join("\n");
}
