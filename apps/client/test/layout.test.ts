import { describe, it, expect } from 'vitest';
import { DEFENSE_SLOTS, FORMATIONS, OFFENSE_SLOTS, PACKAGES, type SlotId } from '@pfl/engine';
import {
  FIELD_HEIGHT, FIELD_WIDTH, LOS_Y, fatigueBarBox, PLATE_HEIGHT, PLATE_WIDTH, PX_PER_YARD, SPRITE_SIZE, clampY, fatigueColor, fatigueRatio, plateBox, plateText, slotOfId, slotPoint,
  visibleYardLines, yardLineY,
} from '../src/phaser/layout';

const distance = (a: SlotId, b: SlotId) => {
  const p = slotPoint(a);
  const q = slotPoint(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

describe('posição das vagas no campo vertical', () => {
  it('todas cabem no canvas', () => {
    for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) {
      const { x, y } = slotPoint(slot);
      expect(x).toBeGreaterThanOrEqual(20);
      expect(x).toBeLessThanOrEqual(FIELD_WIDTH - 20);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(FIELD_HEIGHT - 20);
    }
  });

  it('ataque abaixo da linha de scrimmage, defesa acima (o ataque sobe)', () => {
    for (const slot of OFFENSE_SLOTS) expect(slotPoint(slot).y).toBeGreaterThan(LOS_Y);
    for (const slot of DEFENSE_SLOTS) expect(slotPoint(slot).y).toBeLessThan(LOS_Y);
  });

  it('nenhuma formação ou pacote sobrepõe sprites', () => {
    for (const slots of [...Object.values(FORMATIONS), ...Object.values(PACKAGES)]) {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) expect(distance(slots[i], slots[j])).toBeGreaterThanOrEqual(SPRITE_SIZE);
      }
    }
  });
});

describe('jardas e fadiga', () => {
  it('converte jardas em y relativo à bola', () => {
    expect(yardLineY(25, 25)).toBe(LOS_Y);
    expect(yardLineY(30, 25)).toBe(LOS_Y - 5 * PX_PER_YARD);
    expect(clampY(-50)).toBe(12);
    expect(clampY(FIELD_HEIGHT + 50)).toBe(FIELD_HEIGHT - 12);
  });

  it('lista as linhas visíveis com os números do campo', () => {
    const lines = visibleYardLines(25);
    expect(lines.find((l) => l.yard === 25)?.y).toBe(LOS_Y);
    expect(lines.find((l) => l.yard === 30)?.label).toBe('30');
    expect(lines.find((l) => l.yard === 60)?.label).toBe('40');
    expect(lines.find((l) => l.yard === 0)?.label).toBe('G');
    expect(lines.every((l) => l.y >= 0 && l.y <= FIELD_HEIGHT)).toBe(true);
  });

  it('fadiga relativa ao limiar do Pokémon', () => {
    expect(fatigueRatio(25, 1)).toBe(0.5); // Pikachu: limiar 2
    expect(fatigueRatio(25, 4)).toBe(1);
    expect(fatigueRatio(143, 1)).toBeCloseTo(1 / 3); // Snorlax: limiar 3
    expect(fatigueColor(0)).not.toBe(fatigueColor(1));
    expect(fatigueColor(0.6)).not.toBe(fatigueColor(0.2));
  });

  it('encontra a vaga de um Pokémon', () => {
    expect(slotOfId({ QB: 63, RB: 25 }, 25)).toBe('RB');
    expect(slotOfId({ QB: 63 }, 1)).toBeNull();
  });
});

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const spriteBox = (slot: SlotId): Box => {
  const { x, y } = slotPoint(slot);
  return { x: x - SPRITE_SIZE / 2, y: y - SPRITE_SIZE / 2, w: SPRITE_SIZE, h: SPRITE_SIZE };
};
const allSets = () => [...Object.values(FORMATIONS), ...Object.values(PACKAGES)];

describe('plaquinhas (chip de vaga + nome)', () => {
  it('têm o tamanho declarado e ficam abaixo do sprite', () => {
    const box = plateBox('QB');
    expect(box.w).toBe(PLATE_WIDTH);
    expect(box.h).toBe(PLATE_HEIGHT);
    expect(box.y).toBeGreaterThanOrEqual(spriteBox('QB').y + SPRITE_SIZE);
  });

  it('nunca se sobrepõem entre si', () => {
    for (const slots of allSets()) {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          expect(overlaps(plateBox(slots[i]), plateBox(slots[j])), `${slots[i]} x ${slots[j]}`).toBe(false);
        }
      }
    }
  });

  it('nunca cobrem o sprite de outra vaga', () => {
    for (const slots of allSets()) {
      for (const a of slots) {
        for (const b of slots) {
          if (a !== b) expect(overlaps(plateBox(a), spriteBox(b)), `plaquinha ${a} x sprite ${b}`).toBe(false);
        }
      }
    }
  });

  it('nunca ficam sob a barra de fadiga de outra vaga', () => {
    for (const slots of allSets()) {
      for (const a of slots) {
        for (const b of slots) {
          if (a !== b) expect(overlaps(plateBox(a), fatigueBarBox(b)), `plaquinha ${a} x barra ${b}`).toBe(false);
        }
      }
    }
  });

  it('barra de fadiga acima do sprite e dentro do canvas', () => {
    for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) {
      const bar = fatigueBarBox(slot);
      expect(bar.y + bar.h).toBeLessThanOrEqual(spriteBox(slot).y);
      expect(bar.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('ficam dentro do canvas', () => {
    for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) {
      const b = plateBox(slot);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(FIELD_WIDTH);
      expect(b.y + b.h).toBeLessThanOrEqual(FIELD_HEIGHT);
    }
  });
});

describe('plateText', () => {
  it('mantém nomes curtos', () => {
    expect(plateText('Pikachu')).toBe('Pikachu');
    expect(plateText('Abcdefgh')).toBe('Abcdefgh');
  });
  it('trunca com reticências contadas dentro do máximo', () => {
    expect(plateText('Charmander')).toBe('Charman\u2026');
    expect(plateText('Charmander').length).toBe(8);
    expect(plateText('Abcdefghi', 5)).toBe('Abcd\u2026');
  });
});
