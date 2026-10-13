import type { OffenseCategory } from '@pfl/engine';
import { EFFECT_TEXT, type Mult, type TypeEffect } from '../match/effect';
import { FIELD_WIDTH } from './layout';

/**
 * Regras de movimento do campo, sem Phaser: cada função devolve um plano em dados e o FieldScene o aplica.
 * Assim dá para testar o que cada carta faz sem montar uma cena.
 */

export interface ClashFx {
  /** intensidade para `cameras.main.shake(120, shake)`; 0 = sem tremor */
  shake: number;
  /** `cameras.main.flash(150, 248, 208, 48)` (amarelo da paleta) */
  flash: boolean;
  /** o que acontece com o atacante: cinza por um instante, ou o golpe "atravessa" */
  weaken: 'none' | 'gray' | 'ghost';
  text: string | null;
  color: string;
  fontSize: number;
}

export function clashFx(mult: Mult | null | undefined, effect: TypeEffect | null | undefined): ClashFx {
  const text = effect ? EFFECT_TEXT[effect] : null;
  if (mult === 4) return { shake: 0.008, flash: true, weaken: 'none', text: text && `${text} (×4)`, color: '#f8d030', fontSize: 14 };
  if (mult === 2) return { shake: 0.004, flash: true, weaken: 'none', text, color: '#f8d030', fontSize: 10 };
  if (mult === 0.5 || mult === 0.25) return { shake: 0, flash: false, weaken: 'gray', text, color: '#c8c8c8', fontSize: 10 };
  if (mult === 0) return { shake: 0, flash: false, weaken: 'ghost', text, color: '#c8c8c8', fontSize: 10 };
  // 1x ou sem multiplicador. O texto segue o `effect` (a narração e o áudio também): com dois alvos a média
  // pode cair em 1x mesmo sendo WEAK ou SUPER.
  return { shake: 0.002, flash: false, weaken: 'none', text, color: effect === 'SUPER' ? '#f8d030' : text ? '#c8c8c8' : '#f8f8f0', fontSize: 10 };
}

export interface ThrowPlan {
  /** altura do arco no ponto médio, em px; 0 = bola reta */
  lift: number;
  /** sombra da bola no chão durante o arco */
  shadow: boolean;
  /** finta de handoff para o RB antes do passe */
  fake: boolean;
  /** quanto o QB recua, em px */
  qbDrop: number;
}

const THROWS: Partial<Record<OffenseCategory, ThrowPlan>> = {
  SHORT_PASS: { lift: 0, shadow: false, fake: false, qbDrop: 0 },
  DEEP_PASS: { lift: 60, shadow: true, fake: false, qbDrop: 0 },
  PLAY_ACTION: { lift: 20, shadow: false, fake: true, qbDrop: 0 },
  SCREEN: { lift: 8, shadow: false, fake: false, qbDrop: 12 },
};

export function throwPlan(category: OffenseCategory | undefined): ThrowPlan {
  return (category && THROWS[category]) || (THROWS.SHORT_PASS as ThrowPlan);
}

export interface RunPlan {
  /** deslocamento lateral até o fim da corrida, em px; 0 = reto */
  drift: number;
  /** tremor das linhas durante a corrida, em px; 0 = nenhum */
  jitter: number;
}

export function runPlan(category: OffenseCategory | undefined): RunPlan {
  if (category === 'RUN_INSIDE') return { drift: 0, jitter: 2 };
  if (category === 'RUN_OUTSIDE') return { drift: 36, jitter: 0 };
  return { drift: 0, jitter: 0 };
}

export interface BlockPlan {
  /** quanto os defensores avançam além da linha, em px */
  rush: number;
  /** atraso entre um defensor e o seguinte, em ms */
  stagger: number;
}

export function blockPlan(blitz: boolean | undefined): BlockPlan {
  return blitz ? { rush: 14, stagger: 40 } : { rush: 0, stagger: 0 };
}

export interface Point {
  x: number;
  y: number;
}

/** Bézier quadrática de `from` a `to`; no meio do caminho a bola está `lift` px acima da reta (y menor = mais alto). */
export function arcPoint(from: Point, to: Point, lift: number, t: number): Point {
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2 - 2 * lift;
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
    y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
  };
}

const X_EDGE = 40;
export function clampX(x: number): number {
  return Math.min(FIELD_WIDTH - X_EDGE, Math.max(X_EDGE, x));
}

/** Tint no corpo do jogador. O `Container` não tem tint, e o círculo de reserva (sem sprite) também não: ignora. */
export function applyTint(body: unknown, color: number | null): void {
  const b = body as { setTint?: (c: number) => unknown; clearTint?: () => unknown };
  if (color === null) b.clearTint?.();
  else b.setTint?.(color);
}
