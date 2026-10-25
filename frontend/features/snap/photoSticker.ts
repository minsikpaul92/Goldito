import { deliveryUrl, uploadMedia } from "../../lib/cloudinary";
import { coverage, makeSticker, segmentAt } from "./cutout";
import { saveSticker } from "./stickerApi";
import { detectPets, loadFrames } from "./vision";

/** A mask this small or this big did not catch one pet (same limits as the Snap sticker maker). */
const MIN_COVER = 0.005;
const MAX_COVER = 0.95;
export const NO_PET_FOUND = "We couldn't cut out a pet there.";

/**
 * A Moments photo becomes a sticker without leaving the screen: the biggest pet is found and cut out, the transparent
 * PNG goes up and joins the pet's sticker box (the feed trigger then shows it in the maker's own Moments).
 * Throws NO_PET_FOUND when nothing sensible was cut out. Web only.
 */
export async function stickerFromPhoto({ publicId, petId, me }: { publicId: string; petId: string; me: string }): Promise<void> {
  const blob = await (await fetch(deliveryUrl(publicId, 1200))).blob();
  const file = new File([blob], "photo.jpg", { type: blob.type.startsWith("image/") ? blob.type : "image/jpeg" });
  const [frame] = await loadFrames(file);
  const found = await detectPets(frame);
  const biggest = [...found].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const at = biggest ? { x: biggest.x + biggest.w / 2, y: biggest.y + biggest.h / 2 } : { x: 0.5, y: 0.5 };
  let mask;
  try {
    mask = await segmentAt(frame, at);
  } catch (error) {
    if ((error as Error).message.startsWith(NO_PET_FOUND)) throw new Error(NO_PET_FOUND);
    throw error;
  }
  const share = coverage(mask);
  if (share < MIN_COVER || share > MAX_COVER) throw new Error(NO_PET_FOUND);
  const sticker = await makeSticker(frame, mask);
  const uploaded = await uploadMedia({
    petId,
    purpose: "sticker",
    file: new File([sticker.blob], "sticker.png", { type: "image/png" }),
    resourceType: "image",
  });
  await saveSticker(petId, uploaded.mediaId, me);
}
