/**
 * Playful words (design site: words-trial.html; decided by Minsik, Oct 25: "a little playful"). One line per key with
 * three versions: `plain`, and the playful one for a dog or a cat. `useWords()` picks: plain when Playful words is off
 * in Settings or no single pet is in view, else the version for that pet's species.
 *
 * Only these surfaces get a playful version. Safety, money, agreements, errors and button labels are written in the
 * screen as plain words and never come from here (DESIGN.md §7.6).
 *
 * Placeholders: {pet} is the pet's name, {name} the other person's.
 */
export type WordSurface = "toast" | "empty" | "loading" | "title" | "label" | "celebration" | "notice";

export type Word = { on: WordSurface; plain: string; dog: string; cat: string };

export const WORDS = {
  stickerSaved: { on: "toast", plain: "Saved to {pet}'s stickers", dog: "Paw-fect! Saved to {pet}'s stickers", cat: "Purr-fect! Saved to {pet}'s stickers" },
  stickerSavedAny: { on: "toast", plain: "Sticker saved", dog: "Paw-fect! Sticker saved", cat: "Purr-fect! Sticker saved" },
  photoShared: { on: "toast", plain: "Shared with {name}", dog: "Pawsted! {name} can see it", cat: "Pawsted! {name} can see it" },
  photoAsked: { on: "toast", plain: "Asked {name} for a photo", dog: "Fetch! Asked {name} for a photo", cat: "Here, kitty! Asked {name} for a photo" },
  savedPrivate: { on: "toast", plain: "Saved. Only you can see it", dog: "Tucked in your den. Only you can see it", cat: "Curled up in your corner. Only you can see it" },
  reviewSent: { on: "toast", plain: "Review sent to {name}", dog: "Pawsome! Review sent to {name}", cat: "Purr-fectly put! Review sent to {name}" },
  moodTitle: { on: "title", plain: "How {pet} seems", dog: "{pet}'s mood, sniffed out", cat: "{pet}'s mood, pounced on" },
  addPhoto: { on: "title", plain: "Add a photo", dog: "Add a pawtrait", cat: "Add a pawtrait" },
  photoOfDay: { on: "label", plain: "Photo of the day", dog: "Tail-wag of the day", cat: "Purr of the day" },
  album: { on: "title", plain: "{pet}'s album", dog: "{pet}'s pawtfolio", cat: "{pet}'s pawtfolio" },
  emptyFilter: { on: "empty", plain: "No walk photos yet", dog: "Nothing to sniff here yet: no walk photos", cat: "Nothing to pounce on yet: no walk photos" },
  emptyDiary: { on: "empty", plain: "No page yet. Today's page comes tonight", dog: "The diary's still napping. Today's page comes tonight", cat: "The diary's still curled up. Today's page comes tonight" },
  loadingPhotos: { on: "loading", plain: "Loading photos", dog: "Fetching photos", cat: "Herding the photos" },
  writingPage: { on: "loading", plain: "Writing {pet}'s page", dog: "Chewing on today's notes", cat: "Kneading today's notes into a page" },
  dayDone: { on: "celebration", plain: "Day {day} done", dog: "Good pup! Day {day} done", cat: "Good kitty! Day {day} done" },
  homeSafe: { on: "celebration", plain: "{pet} is home safe", dog: "Tails up! {pet} is home safe", cat: "Whiskers up! {pet} is home safe" },
  // Written by the server today; kept here so the app and the notices use the same lines once they move.
  newPhotos: { on: "notice", plain: "{count} new photos of {pet}", dog: "Pup-date: {count} new photos of {pet}", cat: "Meow-date: {count} new photos of {pet}" },
  replied: { on: "notice", plain: "{name} replied", dog: "Ears up! {name} replied", cat: "Whiskers up! {name} replied" },
} satisfies Record<string, Word>;

export type WordKey = keyof typeof WORDS;

export type WordVars = {
  /** The pet the line is about. Without one (all pets, or none), the plain line shows. */
  pet?: { name?: string | null; species?: string | null } | null;
  name?: string;
  day?: number;
  count?: number;
};

/** The line for `key`: playful when `playful` is on and the pet is a dog or a cat, else plain. */
export function wordFor(key: WordKey, playful: boolean, vars: WordVars = {}): string {
  const word: Word = WORDS[key];
  const species = vars.pet?.species;
  const text = playful && (species === "dog" || species === "cat") ? word[species] : word.plain;
  return text
    .replaceAll("{pet}", vars.pet?.name ?? "your pet")
    .replaceAll("{name}", vars.name ?? "")
    .replaceAll("{day}", String(vars.day ?? ""))
    .replaceAll("{count}", String(vars.count ?? ""));
}
