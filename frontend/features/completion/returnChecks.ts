import { ensureTodayTaskLogs } from "../care/careApi";
import { getTodayReport } from "../diary/reportApi";

export type ReturnChecks = {
  /** Today's care tasks the sitter has not done yet, across the pets going home. */
  tasksLeft: number;
  /** Pets that have no sent note for today. */
  petsWithoutNote: string[];
};

/**
 * What the sitter may still want to do before tapping Returned (FB-9): open tasks and the day's note. A check that
 * can't be read (offline, a pet no longer in care) is skipped — the confirm sheet works without it.
 */
export async function loadReturnChecks(
  pets: { id?: string; name: string }[],
  sitterId: string,
): Promise<ReturnChecks> {
  const checks = await Promise.all(
    pets.flatMap((pet) =>
      pet.id
        ? [
            (async () => {
              const [logs, report] = await Promise.all([
                ensureTodayTaskLogs(pet.id!).catch(() => []),
                getTodayReport(pet.id!, sitterId).catch(() => undefined),
              ]);
              return {
                left: logs.filter((l) => l.status === "pending").length,
                // `undefined` = couldn't read it: don't claim the note is missing.
                missingNote: report !== undefined && report?.status !== "sent" ? pet.name : null,
              };
            })(),
          ]
        : [],
    ),
  );
  return {
    tasksLeft: checks.reduce((sum, c) => sum + c.left, 0),
    petsWithoutNote: checks.flatMap((c) => (c.missingNote ? [c.missingNote] : [])),
  };
}
