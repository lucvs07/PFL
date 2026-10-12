import { describe, it, expect } from 'vitest';
import { FORMATIONS, PACKAGES } from '@pfl/engine';
import { previewLineup } from '../src/match/lineupPreview';
import {
  depthDraftErrors, draftFromTeamDepth, isDepthDirty, resolvePendingDepth, shouldSendDepth, type DepthDraft,
} from '../src/match/depthDraft';
import { makeView, testTeam } from './fixtures';

const team = testTeam();

describe('previewLineup', () => {
  it('mostra os titulares do depth chart', () => {
    expect(previewLineup(FORMATIONS.PISTOL, team, {})).toEqual({ QB: 63, OL1: 95, OL2: 74, OL3: 66, RB: 25, WR1: 26, WR2: 125 });
    expect(previewLineup(PACKAGES.DIME, team, {})).toMatchObject({ DL1: 95, S2: 16 });
  });

  it('troca quem atingiu o limiar de fadiga, salvo "manter em campo"', () => {
    expect(previewLineup(FORMATIONS.PISTOL, team, { 25: 2 })?.RB).toBe(50);
    expect(previewLineup(FORMATIONS.PISTOL, { ...team, keepOnField: [25] }, { 25: 5 })?.RB).toBe(25);
  });
});

describe('rascunho de depth durante a partida', () => {
  const moved = (): DepthDraft => {
    const d = draftFromTeamDepth(team);
    d.depth.QB = [54, 63];
    return d;
  };

  it('detecta alteração independente da ordem das chaves', () => {
    const same = draftFromTeamDepth(team);
    expect(isDepthDirty(same, team)).toBe(false);
    expect(isDepthDirty({ ...same, depth: Object.fromEntries(Object.entries(same.depth).reverse()) }, team)).toBe(false);
    expect(isDepthDirty(moved(), team)).toBe(true);
    expect(isDepthDirty({ ...same, keepOnField: [25] }, team)).toBe(true);
  });

  it('valida com as regras do engine', () => {
    expect(depthDraftErrors(team, moved())).toEqual([]);
    const broken = draftFromTeamDepth(team);
    broken.depth.TE = [];
    expect(depthDraftErrors(team, broken).map((e) => e.code)).toContain('FORMATION_UNFILLABLE');
  });

  it('envia só na janela permitida, uma vez por turno, e só se válido e alterado', () => {
    const open = makeView({ phase: 'FORMATION', canEditDepth: true, turnId: 7 });
    expect(shouldSendDepth(open, team, moved(), null)).toBe(true);
    expect(shouldSendDepth(open, team, moved(), 7)).toBe(false);
    expect(shouldSendDepth({ ...open, canEditDepth: false }, team, moved(), null)).toBe(false);
    expect(shouldSendDepth({ ...open, phase: 'PACKAGE' }, team, moved(), null)).toBe(false);
    expect(shouldSendDepth(open, team, draftFromTeamDepth(team), null)).toBe(false);
    const broken = moved();
    broken.depth.TE = [];
    expect(shouldSendDepth(open, team, broken, null)).toBe(false);
    expect(shouldSendDepth(null, team, moved(), null)).toBe(false);
  });

  it('confirma o depth enviado quando o servidor avança sem erro', () => {
    const pending = { turnId: 7, draft: moved() };
    const msg = (turnId: number, phase: 'FORMATION' | 'PACKAGE') => ({
      turnId, phase, deadline: 0, view: makeView({ turnId, phase }),
    });
    expect(resolvePendingDepth(pending, msg(7, 'FORMATION'))).toBe('keep');
    expect(resolvePendingDepth(pending, msg(7, 'PACKAGE'))).toBe('commit');
    expect(resolvePendingDepth(pending, msg(8, 'FORMATION'))).toBe('commit');
  });
});
