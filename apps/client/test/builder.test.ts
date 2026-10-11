import { describe, it, expect } from 'vitest';
import { FORMATIONS, PACKAGES, ROSTER_SIZE, fillSlots, validateTeam } from '@pfl/engine';
import { builderReducer, type BuilderAction } from '../src/builder/builderState';
import { draftFromTeam, draftToTeam, emptyDraft, type TeamDraft } from '../src/builder/draft';
import { ALL_SLOTS, AUTO_DEPTH_SIZE, applyDepthAction, autoDepth, type DepthState } from '../src/builder/depth';
import { testTeam } from './fixtures';

const run = (actions: BuilderAction[], start = emptyDraft()) => actions.reduce(builderReducer, start);

describe('rascunho ⇄ time', () => {
  it('sem especialista não vira Team', () => {
    expect(draftToTeam(emptyDraft())).toBeNull();
  });

  it('ida e volta preserva o time sem compartilhar referências', () => {
    const team = testTeam();
    const draft = draftFromTeam(team);
    expect(draftToTeam(draft)).toEqual(team);
    draft.roster.push(1);
    draft.depth.QB?.push(25);
    expect(team.roster).not.toContain(1);
    expect(team.depth.QB).toEqual([63, 54]);
  });
});

describe('elenco', () => {
  it('adiciona sem repetir, ignora espécie inexistente e respeita o limite de 16', () => {
    expect(run([{ type: 'ADD_SPECIES', id: 25 }, { type: 'ADD_SPECIES', id: 25 }, { type: 'ADD_SPECIES', id: 999 }]).roster).toEqual([25]);
    const full = run(Array.from({ length: 20 }, (_, i): BuilderAction => ({ type: 'ADD_SPECIES', id: i + 1 })));
    expect(full.roster).toHaveLength(ROSTER_SIZE);
  });

  it('o especialista sai do elenco e não pode voltar a ele', () => {
    const d = run([
      { type: 'ADD_SPECIES', id: 129 },
      { type: 'SET_SPECIALIST', id: 129 },
      { type: 'ADD_SPECIES', id: 129 },
    ]);
    expect(d.specialist).toBe(129);
    expect(d.roster).toEqual([]);
  });

  it('remover o especialista só libera a vaga de kicker', () => {
    const d = builderReducer(draftFromTeam(testTeam()), { type: 'REMOVE_SPECIES', id: 129 });
    expect(d.specialist).toBeNull();
    expect(d.roster).toHaveLength(16);
  });

  it('remover um Pokémon limpa o depth chart, o "manter em campo" e as cartas que só ele liberava', () => {
    const start = { ...draftFromTeam(testTeam()), keepOnField: [63] };
    const d = builderReducer(start, { type: 'REMOVE_SPECIES', id: 63 }); // Abra, único psíquico
    expect(d.roster).not.toContain(63);
    expect(d.depth.QB).toEqual([54]);
    expect(d.depth.S1).toEqual([16, 54]);
    expect(d.keepOnField).toEqual([]);
    expect(d.defenseDeck).not.toContain('psychic_foresight');
    expect(d.defenseDeck).toHaveLength(10);
    expect(d.offenseDeck).toHaveLength(12);
  });

  it('renomeia com limite de tamanho', () => {
    expect(run([{ type: 'RENAME', name: 'x'.repeat(40) }]).name).toHaveLength(24);
  });
});

describe('deck', () => {
  const noDecks = (): TeamDraft => ({ ...draftFromTeam(testTeam()), offenseDeck: [], defenseDeck: [] });

  it('aceita carta liberada até 2 cópias', () => {
    let d = noDecks();
    for (let i = 0; i < 3; i++) d = builderReducer(d, { type: 'DECK_ADD', side: 'OFFENSE', cardId: 'electric_thunder_screen' });
    expect(d.offenseDeck).toEqual(['electric_thunder_screen', 'electric_thunder_screen']);
  });

  it('recusa básica, especial, lado errado, carta inexistente e carta não liberada pelo elenco', () => {
    let d = noDecks();
    for (const cardId of ['basic_run', 'punt', 'normal_wall', 'nao_existe', 'fire_deep']) {
      d = builderReducer(d, { type: 'DECK_ADD', side: 'OFFENSE', cardId });
    }
    expect(d.offenseDeck).toEqual([]);
  });

  it('limita o deck a 12 cartas', () => {
    const full = draftFromTeam(testTeam());
    expect(builderReducer(full, { type: 'DECK_ADD', side: 'OFFENSE', cardId: 'psychic_confusion' }).offenseDeck).toHaveLength(12);
  });

  it('remove uma cópia por vez', () => {
    const d = builderReducer(draftFromTeam(testTeam()), { type: 'DECK_REMOVE', side: 'DEFENSE', cardId: 'ground_dig' });
    expect(d.defenseDeck.filter((id) => id === 'ground_dig')).toHaveLength(1);
    expect(d.defenseDeck).toHaveLength(11);
  });
});

describe('depth chart', () => {
  const roster = testTeam().roster;
  const state: DepthState = { depth: { QB: [63, 54] }, keepOnField: [] };

  it('adiciona só quem está no elenco e não repete', () => {
    expect(applyDepthAction(state, roster, { type: 'DEPTH_ADD', slot: 'QB', id: 25 }).depth.QB).toEqual([63, 54, 25]);
    expect(applyDepthAction(state, roster, { type: 'DEPTH_ADD', slot: 'QB', id: 63 })).toBe(state);
    expect(applyDepthAction(state, roster, { type: 'DEPTH_ADD', slot: 'QB', id: 150 })).toBe(state);
  });

  it('move e remove', () => {
    expect(applyDepthAction(state, roster, { type: 'DEPTH_MOVE', slot: 'QB', id: 54, dir: -1 }).depth.QB).toEqual([54, 63]);
    expect(applyDepthAction(state, roster, { type: 'DEPTH_MOVE', slot: 'QB', id: 63, dir: -1 })).toBe(state);
    expect(applyDepthAction(state, roster, { type: 'DEPTH_REMOVE', slot: 'QB', id: 63 }).depth.QB).toEqual([54]);
  });

  it('alterna "manter em campo" só para quem está no elenco', () => {
    const on = applyDepthAction(state, roster, { type: 'TOGGLE_KEEP', id: 25 });
    expect(on.keepOnField).toEqual([25]);
    expect(applyDepthAction(on, roster, { type: 'TOGGLE_KEEP', id: 25 }).keepOnField).toEqual([]);
    expect(applyDepthAction(state, roster, { type: 'TOGGLE_KEEP', id: 150 })).toBe(state);
  });

  it('o depth automático preenche todas as formações e pacotes', () => {
    const depth = autoDepth(roster);
    for (const slot of ALL_SLOTS) expect(depth[slot]).toHaveLength(AUTO_DEPTH_SIZE);
    for (const slots of [...Object.values(FORMATIONS), ...Object.values(PACKAGES)]) {
      expect(fillSlots(slots, depth)).not.toBeNull();
    }
    expect(validateTeam({ ...testTeam(), depth })).toEqual([]);
  });

  it('o reducer do time repassa as ações de depth', () => {
    const d = run([{ type: 'ADD_SPECIES', id: 25 }, { type: 'DEPTH_ADD', slot: 'RB', id: 25 }]);
    expect(d.depth.RB).toEqual([25]);
  });
});
