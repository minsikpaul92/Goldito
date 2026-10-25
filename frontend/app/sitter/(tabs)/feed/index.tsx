import { FeedSwitch } from "../../../../components/FeedSwitch";
import { SitterDiary } from "../../../../features/diary/SitterDiary";
import { SitterFeed } from "../../../../features/feed/SitterFeed";

/**
 * Sitter Moments tab (D47b / phase-05, #345): opens on the pets in care together (the pet chip picks one, or a pet of a
 * stay that is over), with the Photos / Diary tabs on top.
 */
export default function SitterFeedTab() {
  return <FeedSwitch photos={<SitterFeed />} diary={<SitterDiary />} />;
}
