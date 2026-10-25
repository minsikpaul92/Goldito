import { Asset } from "expo-asset";

import type { DemoSample } from "./demoSamples";

/** A bundled sample as a File, so it goes through the same upload path as a real pick. */
export async function sampleToFile(sample: DemoSample): Promise<File> {
  const blob = await (await fetch(Asset.fromModule(sample.source).uri)).blob();
  const kind = sample.kind ?? "image";
  const ext = kind === "video" ? "mp4" : "jpg";
  // A host that serves the file as application/octet-stream must not turn a sample into "not a photo or video".
  const type = blob.type.startsWith(`${kind}/`) ? blob.type : kind === "video" ? "video/mp4" : "image/jpeg";
  return new File([blob], `${sample.id}.${ext}`, { type });
}
