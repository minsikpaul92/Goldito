/** Saving a sticker to the viewer's computer or phone (Phase 12.4). Web only — the Snap tools are. */

/** A file made in the browser (the sticker preview before it is saved). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  clickLink(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A saved sticker: Cloudinary's attachment URL makes the browser save it, even from another origin. */
export function downloadFromUrl(url: string, filename: string): void {
  clickLink(url, filename);
}

function clickLink(href: string, filename: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** "goldito-max-sticker.png" */
export function stickerFilename(petName: string): string {
  const slug = petName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pet";
  return `goldito-${slug}-sticker.png`;
}
