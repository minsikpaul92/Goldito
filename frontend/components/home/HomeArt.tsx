import { Icon, IconName } from "../ui/Icon";

/**
 * Art slots on the owner Home (Figma 1303:5903). Until Muk's SVGs arrive these are Lucide icons.
 *
 * When the SVG files arrive, put them in `assets/home/` and render them here instead of `<Icon>`:
 *   tile.care  → assets/home/care-bowl.svg   (Figma node 1303:5939, 46 x 46)
 *   tile.photo → assets/home/camera.svg      (1303:5960, 46 x 46)
 *   tile.walk  → assets/home/tree.svg        (1303:5970, 46 x 46)
 *   pet face   → one SVG per pet in `PetTile`  (1303:5989 and 1303:6010, 52 x 52; Max the dog, Mochi the cat)
 * Keep the root width and height of each SVG as exported, and pass only `size` through.
 */
export function HomeArt({ name, size, color }: { name: IconName; size: number; color: string }) {
  return <Icon name={name} size={size} color={color} strokeWidth={1.75} />;
}
