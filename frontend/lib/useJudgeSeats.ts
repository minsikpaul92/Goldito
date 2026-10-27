import { useEffect, useState } from "react";

import { JUDGE_SETS } from "./demo";
import { SeatStatus, fetchSeats } from "./judgeSeat";

const SEATS_POLL_MS = 15_000;

/** The Judge seats and who holds them, read again every 15 seconds while `on`. Null until the first read. */
export function useJudgeSeats(on: boolean): SeatStatus[] | null {
  const [seats, setSeats] = useState<SeatStatus[] | null>(null);
  useEffect(() => {
    if (!on) return;
    let active = true;
    const read = () =>
      fetchSeats().then(
        (next) => active && setSeats(next),
        // Seats unknown (no 015t yet, offline): show every seat as free; taking one still asks the server.
        () => active && setSeats(JUDGE_SETS.map((set) => ({ set: set.key, inUse: false, mine: false }))),
      );
    void read();
    const timer = setInterval(read, SEATS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [on]);
  return seats;
}
