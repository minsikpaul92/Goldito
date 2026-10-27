import { useEffect, useState } from "react";

import { listFeedPosts } from "../../lib/feed";
import { useNotifications } from "../../providers/NotificationsProvider";

/** The newest photo the sitter posted of a pet: what hangs on the wall of its room. */
export type WallPhoto = { id: string; publicId: string; takenAt: string };

/**
 * The newest photo a sitter posted for one pet (Moments), for the frame on the wall of the owner's pet room. It loads
 * again when a notice arrives (a new photo reaches the owner as one). Photos the owner posted or hid don't hang there;
 * with none, the frame is not drawn. A failed load keeps what is shown: the frame is a bonus.
 */
export function useLatestSitterPhoto(petId: string | null): WallPhoto | null {
  const { inboxRevision, feedRevision } = useNotifications();
  const [photo, setPhoto] = useState<WallPhoto | null>(null);

  useEffect(() => setPhoto(null), [petId]);

  useEffect(() => {
    if (!petId) return;
    let live = true;
    listFeedPosts(petId, { limit: 10 })
      .then((posts) => {
        const post = posts.find((p) => !p.hidden && p.sitterId != null && p.postedBy === p.sitterId && p.media.resourceType === "image");
        if (live) setPhoto(post ? { id: post.id, publicId: post.media.publicId, takenAt: post.takenAt } : null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [petId, inboxRevision, feedRevision]);

  return photo;
}
