import { expect, test } from "@playwright/test";

import { derivePetStatus, type StatusCheckin } from "../lib/petStatus";

// Pet room state (11.12, #184): today's check-ins -> mood and HUD. No browser needed.

// 12:00 noon in the app timezone (America/Toronto, EDT) and 19:00 the same day.
const NOON = new Date("2026-10-21T16:00:00Z");
const EVENING = new Date("2026-10-21T23:00:00Z");
const ago = (hours: number, from = NOON) => new Date(from.getTime() - hours * 3_600_000).toISOString();
const c = (kind: string, value: string | null, at: string): StatusCheckin => ({ kind, value, at });

test.describe("pet status", () => {
  test("nothing logged today: calm, everything unknown, the next task is the earliest open one", () => {
    const s = derivePetStatus(
      [],
      [
        { title: "Evening walk", dueAt: "2026-10-21T22:00:00Z" },
        { title: "Lunch", dueAt: "2026-10-21T17:00:00Z" },
      ],
      EVENING,
    );
    expect(s).toMatchObject({ mood: "calm", meal: "unknown", potty: "unknown", walkMinutes: 0 });
    expect(s.nextTask?.title).toBe("Lunch");
  });

  test("a good meal lately is fed; the latest mood check-in sets the face", () => {
    const s = derivePetStatus([c("meal", "all", ago(2)), c("mood", "happy", ago(1))], [], NOON);
    expect(s).toMatchObject({ meal: "fed", mood: "excited" });
    expect(derivePetStatus([c("meal", "most", ago(1)), c("mood", "tired", ago(0.5))], [], NOON).mood).toBe("tired");
    expect(derivePetStatus([c("meal", "all", ago(1)), c("mood", "calm", ago(0.5))], [], NOON).mood).toBe("calm");
  });

  test("a light or skipped meal, or none for six hours, is hungry and beats the mood", () => {
    for (const meal of [c("meal", "little", ago(1)), c("meal", "none", ago(1)), c("meal", "all", ago(7))]) {
      const s = derivePetStatus([meal, c("mood", "happy", ago(0.5))], [], NOON);
      expect(s).toMatchObject({ meal: "hungry", mood: "hungry" });
    }
    // Something was logged today but never a meal.
    expect(derivePetStatus([c("walk", "20", ago(5))], [], NOON).mood).toBe("hungry");
  });

  test("a nap lasts until Awake: the pet stays asleep, wakes with the Awake after it, and a nap nobody ended is over after four hours", () => {
    const fed = c("meal", "all", ago(1));
    const asleep = derivePetStatus([fed, c("nap", null, ago(1))], [], NOON);
    expect(asleep).toMatchObject({ mood: "sleepy", sleeping: true });
    // Still asleep long after, as long as nobody tapped Awake.
    expect(derivePetStatus([c("meal", "all", ago(1)), c("nap", null, ago(3.5))], [], NOON).sleeping).toBe(true);
    // Awake after the nap ends it, and the mood goes back to what the day says.
    const woke = derivePetStatus([fed, c("nap", null, ago(1)), c("wake", null, ago(0.5)), c("mood", "calm", ago(0.4))], [], NOON);
    expect(woke).toMatchObject({ mood: "calm", sleeping: false });
    // An Awake from before the nap does not end it.
    expect(derivePetStatus([fed, c("wake", null, ago(2)), c("nap", null, ago(1))], [], NOON).sleeping).toBe(true);
    // A new nap after an Awake sleeps again.
    expect(derivePetStatus([fed, c("nap", null, ago(3)), c("wake", null, ago(2)), c("nap", null, ago(1))], [], NOON).sleeping).toBe(true);
    // Four hours is the limit.
    expect(derivePetStatus([c("meal", "all", ago(4.5)), c("nap", null, ago(4.5))], [], NOON).sleeping).toBe(false);
  });

  test("a walk in the last hour is excited when no mood was logged; walk minutes add up", () => {
    const s = derivePetStatus([c("meal", "all", ago(1)), c("walk", "20", ago(0.5)), c("walk", "30", ago(4))], [], NOON);
    expect(s).toMatchObject({ mood: "excited", walkMinutes: 50 });
  });

  test("potty is done once logged, due after 18:00 when missing, unknown before", () => {
    const fed = (from: Date) => c("meal", "all", ago(1, from));
    expect(derivePetStatus([fed(NOON), c("potty", "normal", ago(2))], [], NOON).potty).toBe("done");
    expect(derivePetStatus([fed(NOON)], [], NOON).potty).toBe("unknown");
    expect(derivePetStatus([fed(EVENING)], [], EVENING).potty).toBe("due");
  });

  test("the order of the list does not matter", () => {
    const list = [c("mood", "tired", ago(3)), c("mood", "happy", ago(1)), c("meal", "all", ago(2))];
    expect(derivePetStatus(list, [], NOON).mood).toBe("excited");
    expect(derivePetStatus([...list].reverse(), [], NOON).mood).toBe("excited");
  });
});
