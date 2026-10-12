import type { Lineup, SlotId } from '@pfl/engine';
import { threshold } from '@pfl/engine';

export const FIELD_WIDTH = 480;
export const FIELD_HEIGHT = 560;
/** Linha de scrimmage fixa na tela; as linhas de jarda rolam conforme a bola. O ataque sobe. */
export const LOS_Y = 286;
export const PX_PER_YARD = 8;
export const SPRITE_SIZE = 48;
export const COL_PX = 60;
export const ROW_PX = 72;
const EDGE = 12;

/** col: colunas a partir do centro; row: fileiras a partir da linha (positivo = campo do ataque). */
const SLOT_OFFSETS: Record<SlotId, { col: number; row: number }> = {
  QB: { col: 0, row: 2 },
  OL1: { col: -1, row: 0.9 },
  OL2: { col: 0, row: 0.9 },
  OL3: { col: 1, row: 0.9 },
  RB: { col: 0, row: 3.1 },
  FB: { col: -0.9, row: 2.6 },
  TE: { col: 2, row: 1 },
  WR1: { col: -3.4, row: 0.9 },
  WR2: { col: 3.4, row: 0.9 },
  WR3: { col: -2.4, row: 1.8 },
  DL1: { col: -1, row: -0.9 },
  DL2: { col: 0, row: -0.9 },
  DL3: { col: 1, row: -0.9 },
  LB1: { col: -1, row: -2 },
  LB2: { col: 1, row: -2 },
  CB1: { col: -3.4, row: -1.2 },
  CB2: { col: 3.4, row: -1.2 },
  CB3: { col: 2.4, row: -2.2 },
  S1: { col: -1, row: -3.1 },
  S2: { col: 1.4, row: -3.1 },
};

export const PLATE_WIDTH = 52;
export const PLATE_HEIGHT = 22;
const PLATE_GAP = 1;

export function slotPoint(slot: SlotId): { x: number; y: number } {
  const o = SLOT_OFFSETS[slot];
  return { x: FIELD_WIDTH / 2 + o.col * COL_PX, y: LOS_Y + o.row * ROW_PX };
}

/** Bloco de rótulo sob o sprite: chip da vaga em cima, nome embaixo. */
export function plateBox(slot: SlotId): { x: number; y: number; w: number; h: number } {
  const { x, y } = slotPoint(slot);
  return { x: x - PLATE_WIDTH / 2, y: y + SPRITE_SIZE / 2 + PLATE_GAP, w: PLATE_WIDTH, h: PLATE_HEIGHT };
}

export const BAR_WIDTH = 32;
export const BAR_HEIGHT = 6;
const BAR_GAP = 1;

/** Barra de fadiga (fundo) logo acima do sprite. */
export function fatigueBarBox(slot: SlotId): { x: number; y: number; w: number; h: number } {
  const { x, y } = slotPoint(slot);
  return { x: x - BAR_WIDTH / 2, y: y - SPRITE_SIZE / 2 - BAR_GAP - BAR_HEIGHT, w: BAR_WIDTH, h: BAR_HEIGHT };
}

/** Nome limitado a `max` caracteres; a reticência conta dentro do limite. */
export function plateText(name: string, max = 8): string {
  const chars = [...name];
  return chars.length <= max ? name : `${chars.slice(0, Math.max(0, max - 1)).join('')}\u2026`;
}

/** y da jarda `yard` (0..100, do ponto de vista do ataque) com a bola em `ballOn`. */
export function yardLineY(yard: number, ballOn: number): number {
  return LOS_Y - (yard - ballOn) * PX_PER_YARD;
}

export function clampY(y: number): number {
  return Math.min(FIELD_HEIGHT - EDGE, Math.max(EDGE, y));
}

/** Linhas de 5 em 5 jardas visíveis; números de 10 em 10 como no campo real (10..50..10) e "G" nas linhas de gol. */
export function visibleYardLines(ballOn: number): { yard: number; y: number; label: string | null }[] {
  const lines: { yard: number; y: number; label: string | null }[] = [];
  for (let yard = 0; yard <= 100; yard += 5) {
    const y = yardLineY(yard, ballOn);
    if (y < 0 || y > FIELD_HEIGHT) continue;
    let label: string | null = null;
    if (yard === 0 || yard === 100) label = 'G';
    else if (yard % 10 === 0) label = String(yard <= 50 ? yard : 100 - yard);
    lines.push({ yard, y, label });
  }
  return lines;
}

/** 0..1 em relação ao limiar de fadiga do Pokémon (spec 3.6). */
export function fatigueRatio(id: number, level: number): number {
  return Math.max(0, Math.min(1, level / threshold(id)));
}

export function fatigueColor(ratio: number): number {
  if (ratio >= 1) return 0xd03028;
  if (ratio >= 0.5) return 0xf8d030;
  return 0x58a038;
}

export function slotOfId(lineup: Lineup, id: number): SlotId | null {
  for (const [slot, value] of Object.entries(lineup) as [SlotId, number | undefined][]) {
    if (value === id) return slot;
  }
  return null;
}
