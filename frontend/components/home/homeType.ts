/**
 * Type sizes of the owner Home as drawn in Figma (1303:5903). They sit between the app's four sizes (D6), so they are
 * named here once instead of being scattered; if Muk moves them onto the scale, change this file only.
 */
export const HOME_TEXT = {
  kicker: 11, // tokens-ok: Figma Home label
  small: 12, // tokens-ok: Figma Home chip and tile label
  body: 12.5, // tokens-ok: Figma Home body line
  name: 17, // tokens-ok: Figma Home pet name
  hero: 25, // tokens-ok: Figma Home hero title
  chip: 13, // tokens-ok: Figma Snap chip and card line
  row: 15, // tokens-ok: Figma Snap recent check name
  date: 34, // tokens-ok: Figma Bookings big date
  stat: 30, // tokens-ok: Figma Home tile number
} as const;

/** The "live" dot on the hero (Figma 1303:5920), a lighter step of the brand green. */
export const LIVE_DOT = "#95D5B2"; // tokens-ok: Figma Home live dot
