import { segmentAt } from "../../snap/cutout";
import { detectPets, loadFrames } from "../../snap/vision";
import { pixelize, type PixelHead } from "./pixelize";

/** A photo file to a pixel head: the biggest pet is cut out under its centre (the middle if none is found). Web only. */
export async function headFromPhoto(file: File): Promise<{ photo: string; head: PixelHead }> {
  const [frame] = await loadFrames(file);
  const photo = frame.toDataURL("image/jpeg", 0.85);
  const biggest = [...(await detectPets(frame))].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const at = biggest ? { x: biggest.x + biggest.w / 2, y: biggest.y + biggest.h / 2 } : { x: 0.5, y: 0.5 };
  return { photo, head: pixelize(frame, await segmentAt(frame, at)) };
}
