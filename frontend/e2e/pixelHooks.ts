import type { Page } from "@playwright/test";

/** Photo to pixel head without MediaPipe: every picked photo is a golden dog face on blue, the mask is the face and ears. */
export async function fakePetPhoto(page: Page) {
  await page.addInitScript(() => {
    const inside = (x: number, y: number) =>
      ((x - 200) / 110) ** 2 + ((y - 180) / 120) ** 2 <= 1 ||
      ((x - 105) / 40) ** 2 + ((y - 160) / 85) ** 2 <= 1 ||
      ((x - 295) / 40) ** 2 + ((y - 160) / 85) ** 2 <= 1;
    (window as unknown as { __goldiVision: unknown }).__goldiVision = {
      detectPets: () => [{ x: 0.2, y: 0.1, w: 0.6, h: 0.7, label: "dog", score: 0.9 }],
      loadFrames: () => {
        const c = document.createElement("canvas");
        c.width = 400;
        c.height = 400;
        const g = c.getContext("2d")!;
        g.fillStyle = "#88AACC";
        g.fillRect(0, 0, 400, 400);
        for (const [x, y, rx, ry, color] of [
          [200, 180, 110, 120, "#D9A441"],
          [105, 160, 40, 85, "#7A4A20"],
          [295, 160, 40, 85, "#7A4A20"],
          [200, 240, 55, 45, "#F6E0B0"],
        ] as const) {
          g.fillStyle = color;
          g.beginPath();
          g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
          g.fill();
        }
        return [c];
      },
      segmentAt: () => {
        const width = 200;
        const height = 200;
        const data = new Float32Array(width * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = inside(x * 2, y * 2) ? 1 : 0;
        return { width, height, data };
      },
    };
  });
}
