import type { Stay } from "../chat/chatApi";

/** The stay a search carries to a sitter's pages: drop-off, pick-up (ISO) and the pets (comma separated ids). */
export type StayParams = { drop?: string; pick?: string; pets?: string };

/** The whole stay, or undefined when the owner did not come from a search. */
export function stayFromParams(p: StayParams): Stay | undefined {
  const petIds = (p.pets ?? "").split(",").filter(Boolean);
  if (!p.drop || !p.pick || petIds.length === 0) return undefined;
  return { dropOffAt: p.drop, pickUpAt: p.pick, petIds };
}

/** `?drop=…&pick=…&pets=…` for the next page, or "" when there is no stay. */
export function stayQuery(p: StayParams): string {
  const stay = stayFromParams(p);
  if (!stay) return "";
  return `?${new URLSearchParams({ drop: stay.dropOffAt, pick: stay.pickUpAt, pets: stay.petIds.join(",") }).toString()}`;
}
