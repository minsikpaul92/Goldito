import type { Page } from "@playwright/test";

import { MockDb, OWNER, SITTER } from "./supabaseMock";

// Shared by the sitter Home specs (phase 06): a stay in progress, care tasks, photo upload mocks.

export const HOUR = 3_600_000;

export type PetSeed = { id: string; name: string; species: "dog" | "cat" };

/** Robert's pets, all with Chloe right now (drop-off a day ago, pick-up in two days). */
export function caring(db: MockDb, pets: PetSeed[], at: Date = new Date()) {
  const now = at.getTime();
  db.bookings.push({
    id: "b1",
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    service_type: "boarding",
    meet_greet_status: "not_needed",
    created_at: "2026-10-02T18:00:00Z",
  });
  for (const pet of pets) {
    db.pets.push({ id: pet.id, owner_id: OWNER.id, species: pet.species, name: pet.name, breed: null, notes: null });
    db.booking_pets.push({ booking_id: "b1", pet_id: pet.id });
  }
  for (const [kind, at] of [
    ["drop_off", now - 24 * HOUR],
    ["pick_up", now + 48 * HOUR],
  ] as const) {
    db.booking_handoffs.push({
      id: `b1-${kind}`,
      booking_id: "b1",
      kind,
      scheduled_at: new Date(at).toISOString(),
      location_type: "sitter_home",
      location_note: null,
      within_sitter_hours: true,
      status: "agreed",
      proposed_by: OWNER.id,
      completed_at: kind === "drop_off" ? new Date(at).toISOString() : null,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
}

export function task(petId: string, id: string, type: string, title: string, time: string, extra: object = {}) {
  return {
    id,
    pet_id: petId,
    type,
    title,
    dose: null,
    scheduled_time: time,
    repeat_daily: true,
    notes: null,
    active: true,
    created_at: "2026-10-01T10:00:00Z",
    ...extra,
  };
}

/** Mocks sign → Cloudinary → complete for a task_proof photo; returns the sign requests. */
export async function mockUpload(page: Page, db: MockDb, petId: string, options: { failSignOnce?: boolean } = {}) {
  const sign: Record<string, unknown>[] = [];
  let failed = false;
  await page.route("**/api/media/sign", (route) => {
    const body = route.request().postDataJSON();
    sign.push(body);
    if (options.failSignOnce && !failed) {
      failed = true;
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Could not reach Supabase to verify the token." }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cloud_name: "goldito-test",
        api_key: "1",
        timestamp: 1,
        signature: "s",
        folder: `goldito/${body.pet_id}/${body.purpose}`,
        upload_url: "http://127.0.0.1:4173/cloudinary-mock/image/upload",
        transformation: "c_limit,w_2000/q_auto",
      }),
    });
  });
  await page.route("**/cloudinary-mock/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ public_id: `goldito/${petId}/task_proof/abc`, width: 10, height: 10 }),
    }),
  );
  await page.route("**/api/media/complete", (route) => {
    db.media.push({
      id: "media-proof",
      pet_id: petId,
      cloudinary_public_id: `goldito/${petId}/task_proof/abc`,
      resource_type: "image",
      purpose: "task_proof",
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ media_id: "media-proof", public_id: "x", secure_url: "x", thumb_url: "" }),
    });
  });
  return sign;
}

