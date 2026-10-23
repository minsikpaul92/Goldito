import type { ArtName } from "../../assets/art/artSvgs";
import { Art } from "../art/Art";
import { Icon, IconName } from "../ui/Icon";

/**
 * A drawing slot on the Homes (Figma 1303:5903 owner, 1730:104473 sitter). When the Figma frame has a drawing for the
 * slot it is `art` (an .svg in `assets/art/`, see scripts/art.mjs); a slot Muk has not drawn yet falls back to a Lucide
 * `name` icon, so a new drawing is one prop: drop the .svg in `assets/art/<screen>/`, run `npm run art`, pass `art`.
 *
 * Still Lucide: the Nap tile (cats), the hero art of every task type but medication (feeding, walk, litter, play, sleep),
 * and the paw on a hero without a sitter photo.
 */
export function HomeArt({ name, art, size, color }: { name: IconName; art?: ArtName; size: number; color: string }) {
  if (art) return <Art name={art} size={size} />;
  return <Icon name={name} size={size} color={color} strokeWidth={1.75} />;
}
