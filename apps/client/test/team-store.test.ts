import { describe, it, expect } from 'vitest';
import type { Team } from '@pfl/engine';
import { encodeTeam } from '@pfl/protocol';
import { exportTeamCode, importTeamCode, loadTeams, sanitizeTeam, saveTeams, TEAMS_KEY } from '../src/builder/teamStore';
import { draftErrors } from '../src/builder/derived';
import { draftFromTeam, emptyDraft } from '../src/builder/draft';
import { memoryStorage, type StorageLike } from '../src/lib/storage';
import { testTeam } from './fixtures';

/** Codifica qualquer objeto no formato de código de time (o encodeTeam não valida o conteúdo). */
const codeOf = (value: unknown) => encodeTeam(value as Team);

describe('exportar e importar', () => {
  it('faz ida e volta sem perdas', () => {
    const draft = draftFromTeam(testTeam());
    const code = exportTeamCode(draft);
    expect(code).not.toBeNull();
    const result = importTeamCode(`  ${code}\n`);
    expect(result).toEqual({ ok: true, draft, dropped: 0 });
  });

  it('não exporta sem especialista', () => {
    expect(exportTeamCode(emptyDraft())).toBeNull();
  });

  it('recusa código vazio, lixo, base64 que não é JSON e JSON que não é time', () => {
    expect(importTeamCode('   ')).toMatchObject({ ok: false });
    expect(importTeamCode('isto não é um código!!!')).toMatchObject({ ok: false });
    expect(importTeamCode(Buffer.from('olá, mundo').toString('base64url'))).toMatchObject({ ok: false });
    expect(importTeamCode(codeOf([1, 2, 3]))).toMatchObject({ ok: false, message: 'O código não contém um time.' });
    expect(importTeamCode(codeOf({ name: 'x' }))).toMatchObject({ ok: false });
    expect(importTeamCode('A'.repeat(30000))).toMatchObject({ ok: false });
  });

  it('código editado à mão: descarta o inválido sem lançar e o resto continua utilizável', () => {
    const t = testTeam();
    const edited = {
      ...t,
      name: 42,
      roster: [...t.roster.slice(0, 14), 999, '25', 25, -1, 3.5],
      specialist: 151000,
      depth: { ...t.depth, QB: [63, 999, 'x'], XX: [1, 2], WR1: 'nope' },
      keepOnField: [63, 777],
      offenseDeck: [...t.offenseDeck.slice(0, 10), 'xyz', 'basic_run', 'normal_wall', 'fire_deep'],
      defenseDeck: Array(20).fill('ground_dig'),
    };
    const result = importTeamCode(codeOf(edited));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const d = result.draft;
    expect(d.name).toBe('Time importado');
    expect(d.roster).toEqual(t.roster.slice(0, 14)); // 999, '25', 25 repetido, -1 e 3.5 descartados
    expect(d.specialist).toBeNull();
    expect(d.depth.QB).toEqual([63]);
    expect(d.depth).not.toHaveProperty('XX');
    expect(d.depth.WR1).toBeUndefined();
    expect(d.keepOnField).toEqual([63]);
    expect(d.offenseDeck).toHaveLength(10);
    expect(d.defenseDeck).toEqual(['ground_dig', 'ground_dig']);
    expect(result.dropped).toBeGreaterThan(10);
    expect(() => draftErrors(d)).not.toThrow();
  });

  it('sanitizeTeam recusa o que não é objeto com elenco', () => {
    expect(sanitizeTeam(null)).toBeNull();
    expect(sanitizeTeam('time')).toBeNull();
    expect(sanitizeTeam({ roster: 'x' })).toBeNull();
  });
});

describe('localStorage', () => {
  const broken = (): StorageLike => ({
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  });

  it('salva e carrega', () => {
    const mem = memoryStorage();
    const teams = [draftFromTeam(testTeam('A')), emptyDraft('Rascunho')];
    expect(saveTeams(mem, teams)).toBe(true);
    expect(loadTeams(mem)).toEqual(teams);
  });

  it('storage indisponível ou cheio: carrega lista vazia e informa que não salvou', () => {
    expect(loadTeams(null)).toEqual([]);
    expect(loadTeams(broken())).toEqual([]);
    expect(saveTeams(null, [emptyDraft()])).toBe(false);
    expect(saveTeams(broken(), [emptyDraft()])).toBe(false);
  });

  it('conteúdo corrompido: ignora entradas inválidas e mantém as boas', () => {
    const mem = memoryStorage();
    mem.setItem(TEAMS_KEY, '{quebrado');
    expect(loadTeams(mem)).toEqual([]);
    mem.setItem(TEAMS_KEY, JSON.stringify([null, 7, { roster: 'x' }, draftFromTeam(testTeam())]));
    expect(loadTeams(mem)).toEqual([draftFromTeam(testTeam())]);
    mem.setItem(TEAMS_KEY, JSON.stringify({ not: 'array' }));
    expect(loadTeams(mem)).toEqual([]);
  });
});
