import { useEffect, useState } from "react";

import { Avatar } from "./ui/Avatar";
import { loadCoverPhoto, photoThumb } from "../features/profile/profilePhotosApi";

type Props = { profileId: string; name: string; size?: number; testID?: string };

/**
 * A person's cover photo as a round avatar, or their initial when they have none (or may not be seen: an owner's
 * photos are only visible to a sitter who shares a booking or an inquiry with them, 014g).
 */
export function ProfileAvatar({ profileId, name, size = 44, testID }: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUri(null);
    loadCoverPhoto(profileId)
      .then((cover) => active && cover && setUri(photoThumb(cover, size * 3)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [profileId, size]);

  return uri !== null ? (
    <Avatar kind="photo" uri={uri} size={size} testID={testID ? `${testID}-photo` : undefined} />
  ) : (
    <Avatar kind="initial" name={name} size={size} testID={testID ? `${testID}-initial` : undefined} />
  );
}
