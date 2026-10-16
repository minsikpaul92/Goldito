import { OwnerDiaryBook } from "../../../features/diary/OwnerDiaryBook";

/**
 * Owner Diary tab (D47 · Diary book): the pages the sitters sent, as a book — all pets or one, oldest → newest,
 * opening on the newest. Live updates are on Home, and everything they did is in History.
 */
export default function OwnerDiary() {
  return <OwnerDiaryBook />;
}
