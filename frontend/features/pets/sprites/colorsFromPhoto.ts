import { segmentAt } from "../../snap/cutout";
import { detectPets, loadFrames } from "../../snap/vision";
import { photoColors, type PixelColors } from "./photoColors";

/** A photo file to the pet's colors: the biggest pet is cut out under its centre (the middle if none is found). Web only. */
export async function colorsFromPhoto(file: File): Promise<{ photo: string; colors: PixelColors }> {
  const [frame] = await loadFrames(file);
  const photo = frame.toDataURL("image/jpeg", 0.85);
  const biggest = [...(await detectPets(frame))].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const at = biggest ? { x: biggest.x + biggest.w / 2, y: biggest.y + biggest.h / 2 } : { x: 0.5, y: 0.5 };
  return { photo, colors: photoColors(frame, await segmentAt(frame, at)) };
}
