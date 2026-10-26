/** Types for petgen.js (the pixel pet generator, kept as plain JS so it stays identical to the design source). */
export type PetgenHead = { view: "front" | "side" | "back"; x: number; y: number; eyeRow: number; center: number };
export type PetgenGrid = string[][] & { head?: PetgenHead };
export type PetgenPalette = { pal: Record<string, number[]>; roles: Record<string, number[]> };

declare const PetGen: {
  init(data: unknown): void;
  frame(recipe: object, view: string, action: string, frame: number): PetgenGrid;
  palette(recipe: object): PetgenPalette;
  pixels(grid: PetgenGrid, palette: PetgenPalette): Uint8ClampedArray;
  resolve(recipe: object): { head: string; cat: boolean };
  hex2rgb(hex: string): number[];
  rgb2hex(rgb: number[]): string;
  mix(a: number[], b: number[], t: number): number[];
  MOTIONS: [string, string, string, number, number][];
  EYES: Record<string, string>;
  W: number;
  H: number;
};
export default PetGen;
