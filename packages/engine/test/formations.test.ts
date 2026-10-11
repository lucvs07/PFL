import { describe, it, expect } from 'vitest';
import { FORMATIONS, PACKAGES, slotPosition, slotsOf, fillSlots } from '../src/formations';

describe('formações e pacotes', () => {
  it('todas têm 7 vagas', () => {
    for (const slots of Object.values(FORMATIONS)) expect(slots).toHaveLength(7);
    for (const slots of Object.values(PACKAGES)) expect(slots).toHaveLength(7);
  });

  it('ataque sempre tem QB e 3 OL', () => {
    for (const slots of Object.values(FORMATIONS)) {
      expect(slots.filter((s) => slotPosition(s) === 'OL')).toHaveLength(3);
      expect(slots).toContain('QB');
    }
  });

  it('deriva a posição da vaga', () => {
    expect(slotPosition('OL2')).toBe('OL');
    expect(slotPosition('S1')).toBe('S');
    expect(slotPosition('QB')).toBe('QB');
  });

  it('lista as vagas de uma posição na escalação', () => {
    expect(slotsOf({ QB: 1, WR1: 2, WR2: 3 }, 'WR')).toEqual(['WR1', 'WR2']);
  });
});

describe('fillSlots', () => {
  const depth = { QB: [1, 2], RB: [1, 3], WR1: [4] };

  it('não repete Pokémon e segue a ordem do depth chart', () => {
    expect(fillSlots(['QB', 'RB', 'WR1'], depth)).toEqual({ QB: 1, RB: 3, WR1: 4 });
  });

  it('prefere candidatos disponíveis e recorre aos demais se preciso', () => {
    expect(fillSlots(['QB', 'RB', 'WR1'], depth, (id) => id !== 1)).toEqual({ QB: 2, RB: 3, WR1: 4 });
    expect(fillSlots(['WR1'], depth, () => false)).toEqual({ WR1: 4 });
  });

  it('acha a escalação mesmo quando a escolha gulosa consome o único candidato de outra vaga', () => {
    const shared = { WR1: [25, 26], WR2: [25] };
    expect(fillSlots(['WR1', 'WR2'], shared)).toEqual({ WR1: 26, WR2: 25 });
    expect(fillSlots(['WR1', 'WR2'], shared, (id) => id === 25)).toEqual({ WR1: 26, WR2: 25 });
  });

  it('usa o fallback quando nenhum candidato livre é preferido', () => {
    expect(fillSlots(['QB'], { QB: [1, 2, 3] }, () => false, (c) => c[c.length - 1])).toEqual({ QB: 3 });
  });

  it('devolve null quando uma vaga fica sem candidato', () => {
    expect(fillSlots(['QB', 'RB', 'WR1', 'TE'], depth)).toBeNull();
  });
});
