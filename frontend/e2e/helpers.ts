import type { FrameLocator, Locator, Page } from "@playwright/test";

export const APP_FRAME = 'iframe[title="PawNote app"]';

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

/** The app running inside the desktop phone frame. */
export function app(page: Page): FrameLocator {
  return page.frameLocator(APP_FRAME);
}

export async function box(locator: Locator): Promise<Box> {
  const result = await locator.boundingBox();
  if (!result) throw new Error("Element is not visible");
  return result;
}

export function center(b: Box): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function isInside(inner: Box, outer: Box): boolean {
  const slack = 1;
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.width <= outer.x + outer.width + slack &&
    inner.y + inner.height <= outer.y + outer.height + slack
  );
}

export async function scrollOffset(locator: Locator, axis: "x" | "y" = "y"): Promise<number> {
  return locator.evaluate((el, a) => (a === "y" ? el.scrollTop : el.scrollLeft), axis);
}

/** Press, move like a finger, release — with real mouse events. */
export async function drag(page: Page, from: Point, to: Point, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}
