import { FeedSwitch } from "../../../../components/FeedSwitch";
import { SitterDiary } from "../../../../features/diary/SitterDiary";
import { SitterFeed } from "../../../../features/feed/SitterFeed";

/**
 * Sitter Feed tab (D47b / phase-05, #345): opens on the pet in care (the pet dropdown picks another, or a pet of a stay
 * that is over), with the Photos / Diary switch on top.
 */
export default function SitterFeedTab() {
  return <FeedSwitch photos={<SitterFeed />} diary={<SitterDiary />} />;
}
