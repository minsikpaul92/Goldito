import { expect, test } from "@playwright/test";

import { box } from "./helpers";

test("touch phones get the app full screen without a frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});

for (const width of [360, 402, 440]) {
  test(`layout holds at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });

    await page.goto("/");
    const button = await box(page.getByRole("button", { name: "Sign in" }));
    expect(button.x).toBeGreaterThanOrEqual(0);
    expect(button.x + button.width).toBeLessThanOrEqual(width);

    await page.goto("/dev/gestures");
    for (const id of ["lab-input", "pager", "row-1"]) {
      const element = await box(page.getByTestId(id));
      expect(element.x, id).toBeGreaterThanOrEqual(0);
      expect(element.x + element.width, id).toBeLessThanOrEqual(width);
    }
  });
}
