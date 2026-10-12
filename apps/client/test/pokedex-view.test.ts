import { describe, it, expect } from 'vitest';
import { ALL_SPECIES, ROSTER_SIZE } from '@pfl/engine';
import { emptyDraft, type TeamDraft } from '../src/builder/draft';
import { dexNumber, detailSpecies, pickState, rosterSlots, speciesActions } from '../src/builder/pokedexView';

const draftWith = (roster: number[], specialist: number | null = null): TeamDraft => ({ ...emptyDraft(), roster, specialist });

describe('dexNumber', () => {
  it('preenche com zeros até 3 dígitos', () => {
    expect(dexNumber(1)).toBe('#001');
    expect(dexNumber(25)).toBe('#025');
    expect(dexNumber(151)).toBe('#151');
  });
});

describe('rosterSlots', () => {
  it('completa com null até ROSTER_SIZE, mantendo a ordem', () => {
    const slots = rosterSlots([25, 4]);
    expect(slots).toHaveLength(ROSTER_SIZE);
    expect(slots.slice(0, 3)).toEqual([25, 4, null]);
    expect(slots.filter((s) => s === null)).toHaveLength(ROSTER_SIZE - 2);
  });
  it('elenco vazio vira só vagas vazias; elenco cheio não ganha vaga extra', () => {
    expect(rosterSlots([]).every((s) => s === null)).toBe(true);
    const full = Array.from({ length: ROSTER_SIZE }, (_, i) => i + 1);
    expect(rosterSlots(full)).toEqual(full);
  });
});

describe('detailSpecies', () => {
  const list = ALL_SPECIES.filter((s) => s.id >= 25 && s.id <= 27);
  it('mostra a espécie selecionada se ela está na lista filtrada', () => {
    expect(detailSpecies(list, 26)?.id).toBe(26);
  });
  it('cai para a primeira da lista se a selecionada foi filtrada ou não há seleção', () => {
    expect(detailSpecies(list, 150)?.id).toBe(25);
    expect(detailSpecies(list, null)?.id).toBe(25);
  });
  it('lista vazia → null', () => {
    expect(detailSpecies([], 25)).toBeNull();
  });
});

describe('pickState', () => {
  it('diz se a espécie está no elenco, é o kicker ou está livre', () => {
    const d = draftWith([25], 26);
    expect(pickState(d, 25)).toBe('ROSTER');
    expect(pickState(d, 26)).toBe('SPECIALIST');
    expect(pickState(d, 27)).toBeNull();
  });
});

describe('speciesActions', () => {
  it('livre e elenco com vaga → pode as duas', () => {
    expect(speciesActions(draftWith([25]), 27)).toEqual({ canAdd: true, canSpecialist: true });
  });
  it('já no elenco → não adiciona, mas pode virar kicker', () => {
    expect(speciesActions(draftWith([25]), 25)).toEqual({ canAdd: false, canSpecialist: true });
  });
  it('já é o kicker → nenhuma das duas', () => {
    expect(speciesActions(draftWith([], 26), 26)).toEqual({ canAdd: false, canSpecialist: false });
  });
  it('elenco cheio → não adiciona, kicker continua liberado', () => {
    const full = Array.from({ length: ROSTER_SIZE }, (_, i) => i + 1);
    expect(speciesActions(draftWith(full), 151)).toEqual({ canAdd: false, canSpecialist: true });
  });
});
