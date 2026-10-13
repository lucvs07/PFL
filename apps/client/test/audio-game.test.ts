import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@pfl/engine';
import { shouldClickSound } from '../src/audio/browser';
import {
  READ_DELAY_MS, STALE_GRACE_MS, animationCues, jingleFor, musicForScreen, replayCues, shouldSoundReplay, turnStartCue,
} from '../src/audio/gameAudio';
import type { AnimStep } from '../src/match/timeline';

describe('musicForScreen', () => {
  it('partida usa a faixa da partida; as demais telas usam a do menu', () => {
    expect(musicForScreen('MATCH')).toBe('match');
    for (const s of ['HOME', 'BUILDER', 'LOBBY', 'END'] as const) expect(musicForScreen(s)).toBe('menu');
  });
});

describe('jingleFor', () => {
  it('vitória, derrota e empate (sem jingle)', () => {
    expect(jingleFor({ A: 21, B: 14 }, 'A')).toBe('win');
    expect(jingleFor({ A: 21, B: 14 }, 'B')).toBe('lose');
    expect(jingleFor({ A: 7, B: 7 }, 'A')).toBeNull();
  });
});

describe('animationCues', () => {
  const steps: AnimStep[] = [
    { kind: 'SNAP', at: 0, duration: 350 },
    { kind: 'TACKLE', by: 2, carrier: 1, at: 700, duration: 300 },
  ];
  const cards = (read: 'RIGHT' | 'NEUTRAL' | 'WRONG', offense = 'basic_run'): GameEvent => ({
    t: 'CARDS', offense, defense: 'basic_defense', read,
  });
  const anim = (events: GameEvent[], endsAt = 10_000) => ({ events, steps, endsAt });
  const names = (cues: { cue: string }[]) => cues.map((c) => c.cue);

  it('revelação em t=0, leitura em +250 ms e depois os passos da timeline', () => {
    const cues = animationCues(anim([cards('RIGHT')]), true, 0);
    expect(cues[0]).toEqual({ at: 0, cue: 'reveal' });
    expect(cues[1]).toEqual({ at: READ_DELAY_MS, cue: 'read-bad' }); // defesa acertou, e eu ataco
    expect(names(cues.slice(2))).toEqual(['snap', 'tackle']);
  });

  it('a leitura depende do lado de quem joga', () => {
    expect(animationCues(anim([cards('RIGHT')]), false, 0)[1].cue).toBe('read-good');
    expect(animationCues(anim([cards('WRONG')]), true, 0)[1].cue).toBe('read-good');
    expect(animationCues(anim([cards('NEUTRAL')]), true, 0)[1].cue).toBe('read-neutral');
  });

  it('sem lado (replay) toca a revelação e não a leitura', () => {
    const cues = animationCues(anim([cards('RIGHT')]), null, 0);
    expect(names(cues)).toEqual(['reveal', 'snap', 'tackle']);
  });

  it('punt não tem leitura a destacar', () => {
    const cues = animationCues(anim([cards('NEUTRAL', 'punt')]), true, 0);
    expect(names(cues)).toEqual(['reveal', 'snap', 'tackle']);
  });

  it('sem evento de cartas só há os passos', () => {
    expect(names(animationCues(anim([{ t: 'FIRST_DOWN' }]), true, 0))).toEqual(['snap', 'tackle']);
  });

  it('resultado velho demais não toca', () => {
    expect(animationCues(anim([cards('RIGHT')], 5000), true, 5000 + STALE_GRACE_MS + 1)).toEqual([]);
    expect(animationCues(anim([cards('RIGHT')], 5000), true, 5000 + STALE_GRACE_MS)).not.toEqual([]);
  });

  it('replayCues usa os eventos do quadro, sem lado e sem prazo', () => {
    expect(names(replayCues([cards('RIGHT')], steps))).toEqual(['reveal', 'snap', 'tackle']);
  });
});

describe('shouldSoundReplay', () => {
  it('o primeiro quadro, mostrado ao montar a tela de fim, não soa por cima do jingle', () => {
    expect(shouldSoundReplay(1)).toBe(false);
    expect(shouldSoundReplay(2)).toBe(true);
  });
});

describe('turnStartCue', () => {
  it('toca ao entrar numa etapa em que o jogador escolhe; não repete na mesma etapa', () => {
    expect(turnStartCue(null, 'PICK_FORMATION')).toBe('turn-start');
    expect(turnStartCue('ANIMATING', 'PICK_CARD')).toBe('turn-start');
    expect(turnStartCue('PICK_FORMATION', 'PICK_FORMATION')).toBeNull();
    expect(turnStartCue('PICK_CARD', 'WAIT_OPPONENT')).toBeNull();
    expect(turnStartCue(null, 'ANIMATING')).toBeNull();
  });
});

describe('shouldClickSound', () => {
  function el(over: { found?: boolean; disabled?: boolean; ariaDisabled?: string; inAudio?: boolean } = {}) {
    const button = {
      disabled: over.disabled ?? false,
      getAttribute: (n: string) => (n === 'aria-disabled' ? (over.ariaDisabled ?? null) : null),
      closest: (sel: string) => (sel === '.audio-control' && over.inAudio ? {} : null),
    };
    return { closest: (sel: string) => (sel.includes('button') && over.found !== false ? button : null) } as unknown as Element;
  }

  it('toca em botões ativos e ignora desabilitados, aria-disabled, o próprio controle e alvos que não são botão', () => {
    expect(shouldClickSound(el())).toBe(true);
    expect(shouldClickSound(el({ disabled: true }))).toBe(false);
    expect(shouldClickSound(el({ ariaDisabled: 'true' }))).toBe(false);
    expect(shouldClickSound(el({ inAudio: true }))).toBe(false);
    expect(shouldClickSound(el({ found: false }))).toBe(false);
    expect(shouldClickSound(null)).toBe(false);
  });
});
