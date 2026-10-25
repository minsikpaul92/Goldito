import { useEffect, useState } from "react";

import { loadPetPhotos } from "../ownerOnboarding/petPhotosApi";

/**
 * The first photo of each pet (public id), for the faces on the Feed. A pet whose photos cannot be read (a sitter after a
 * stay) or has none simply has no entry: the dog or cat drawing is used instead.
 */
export function usePetFaces(petIds: string[]): Record<string, string | null> {
  const key = petIds.join(",");
  const [faces, setFaces] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let live = true;
    for (const id of key ? key.split(",") : []) {
      loadPetPhotos(id)
        .then((photos) => live && setFaces((prev) => ({ ...prev, [id]: photos[0]?.publicId ?? null })))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [key]);
  return faces;
}
