import { describe, expect, it, vi } from 'vitest';
import { applyTint, arcPoint, blockPlan, clampX, clashFx, runPlan, throwPlan } from '../src/phaser/choreography';
import { FIELD_WIDTH } from '../src/phaser/layout';

describe('clashFx', () => {
  it('4x: o mais forte, com o multiplicador no texto', () => {
    expect(clashFx(4, 'SUPER')).toMatchObject({ shake: 0.008, flash: true, weaken: 'none', text: 'É super efetivo! (×4)', fontSize: 14 });
  });

  it('2x: forte, sem o multiplicador no texto', () => {
    expect(clashFx(2, 'SUPER')).toMatchObject({ shake: 0.004, flash: true, weaken: 'none', text: 'É super efetivo!', fontSize: 10 });
  });

  it('neutro e sem elemento: tremor pequeno, sem texto, sem flash', () => {
    for (const fx of [clashFx(1, 'NEUTRAL'), clashFx(null, null), clashFx(undefined, undefined)]) {
      expect(fx).toMatchObject({ shake: 0.002, flash: false, weaken: 'none', text: null });
    }
  });

  it('média que cai em 1x mas com efeito WEAK/SUPER ainda mostra o texto (mesma informação da narração)', () => {
    expect(clashFx(1, 'WEAK')).toMatchObject({ text: 'Não é muito efetivo...', shake: 0.002, flash: false });
    expect(clashFx(1, 'SUPER')).toMatchObject({ text: 'É super efetivo!', color: '#f8d030' });
  });

  it('½x e ¼x: atacante cinza, sem tremor', () => {
    for (const mult of [0.5, 0.25] as const) {
      expect(clashFx(mult, 'WEAK')).toMatchObject({ shake: 0, flash: false, weaken: 'gray', text: 'Não é muito efetivo...' });
    }
  });

  it('0x: o golpe atravessa, sem tremor', () => {
    expect(clashFx(0, 'IMMUNE')).toMatchObject({ shake: 0, flash: false, weaken: 'ghost', text: 'Não teve efeito...' });
  });
});

describe('throwPlan', () => {
  it('cada categoria de passe tem o seu desenho', () => {
    expect(throwPlan('SHORT_PASS')).toEqual({ lift: 0, shadow: false, fake: false, qbDrop: 0 });
    expect(throwPlan('DEEP_PASS')).toEqual({ lift: 60, shadow: true, fake: false, qbDrop: 0 });
    expect(throwPlan('PLAY_ACTION')).toEqual({ lift: 20, shadow: false, fake: true, qbDrop: 0 });
    expect(throwPlan('SCREEN')).toEqual({ lift: 8, shadow: false, fake: false, qbDrop: 12 });
  });

  it('sem categoria cai no passe reto', () => {
    expect(throwPlan(undefined)).toEqual(throwPlan('SHORT_PASS'));
  });
});

describe('runPlan', () => {
  it('por dentro treme as linhas; por fora deriva para a lateral', () => {
    expect(runPlan('RUN_INSIDE')).toEqual({ drift: 0, jitter: 2 });
    expect(runPlan('RUN_OUTSIDE')).toEqual({ drift: 36, jitter: 0 });
  });

  it('screen e sem categoria correm retos', () => {
    expect(runPlan('SCREEN')).toEqual({ drift: 0, jitter: 0 });
    expect(runPlan(undefined)).toEqual({ drift: 0, jitter: 0 });
  });
});

describe('blockPlan', () => {
  it('blitz manda a defesa cruzar a linha, escalonada', () => {
    expect(blockPlan(true)).toEqual({ rush: 14, stagger: 40 });
    expect(blockPlan(false)).toEqual({ rush: 0, stagger: 0 });
    expect(blockPlan(undefined)).toEqual({ rush: 0, stagger: 0 });
  });
});

describe('arcPoint', () => {
  const a = { x: 100, y: 300 };
  const b = { x: 200, y: 100 };

  it('começa em a e termina em b', () => {
    expect(arcPoint(a, b, 60, 0)).toEqual(a);
    expect(arcPoint(a, b, 60, 1)).toEqual(b);
  });

  it('no meio do caminho a bola está `lift` px acima da reta', () => {
    const mid = arcPoint(a, b, 60, 0.5);
    expect(mid.x).toBeCloseTo(150);
    expect(mid.y).toBeCloseTo(200 - 60);
  });

  it('lift 0 é a reta', () => {
    expect(arcPoint(a, b, 0, 0.5)).toEqual({ x: 150, y: 200 });
  });
});

describe('clampX', () => {
  it('mantém o jogador dentro das linhas laterais', () => {
    expect(clampX(-50)).toBe(40);
    expect(clampX(FIELD_WIDTH + 50)).toBe(FIELD_WIDTH - 40);
    expect(clampX(200)).toBe(200);
  });
});

describe('applyTint', () => {
  it('aplica e limpa a cor quando o corpo suporta', () => {
    const body = { setTint: vi.fn(), clearTint: vi.fn() };
    applyTint(body, 0x888888);
    applyTint(body, null);
    expect(body.setTint).toHaveBeenCalledWith(0x888888);
    expect(body.clearTint).toHaveBeenCalledTimes(1);
  });

  it('ignora corpos sem tint (o círculo de reserva) sem lançar', () => {
    expect(() => applyTint({}, 0x888888)).not.toThrow();
    expect(() => applyTint({}, null)).not.toThrow();
  });
});
