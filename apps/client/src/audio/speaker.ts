import type { VolumeLevel } from './mixer';

export const ICON_COLS = 12;
export const ICON_ROWS = 8;

// Alto-falante em pixel art, 5×8. Cada '#' é um pixel.
const BODY = ['....#', '...##', '#####', '#####', '#####', '#####', '...##', '....#'];

/** Células [x, y] do ícone: corpo, mais as ondas (nível 1 a 3) ou um X (mudo). */
export function speakerCells(level: VolumeLevel, muted: boolean): [number, number][] {
  const cells: [number, number][] = [];
  BODY.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push([x, y]);
  });
  if (muted) {
    for (let i = 0; i < 6; i++) {
      cells.push([6 + i, 1 + i]);
      cells.push([11 - i, 1 + i]);
    }
    return cells;
  }
  const waves: [number, number, number][] = [
    [6, 3, 4], // coluna, linha inicial, linha final
    [8, 2, 5],
    [10, 1, 6],
  ];
  waves.slice(0, level).forEach(([x, from, to]) => {
    for (let y = from; y <= to; y++) cells.push([x, y]);
  });
  return cells;
}
