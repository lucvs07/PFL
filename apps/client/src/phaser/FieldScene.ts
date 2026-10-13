import Phaser from 'phaser';
import type { Lineup, SlotId, TeamKey } from '@pfl/engine';
import type { Stage } from '../match/matchState';
import type { AnimStep } from '../match/timeline';
import { EFFECT_TEXT } from '../match/effect';
import { spriteSrc } from '../lib/sprites';
import { speciesName } from '../lib/names';
import {
  BAR_HEIGHT, BAR_WIDTH, FIELD_HEIGHT, FIELD_WIDTH, LOS_Y, PLATE_HEIGHT, PX_PER_YARD, SPRITE_SIZE, clampY, fatigueColor, fatigueRatio, plateText, slotPoint,
  visibleYardLines, yardLineY,
} from './layout';

export interface PlaySpec {
  seq: number;
  stage: Stage;
  steps: AnimStep[];
}

type Side = 'offense' | 'defense';

interface PlayerSprite {
  container: Phaser.GameObjects.Container;
  slot: SlotId;
  id: number;
  side: Side;
}

interface Wanted {
  slot: SlotId;
  id: number;
  side: Side;
}

const SIDELINE_W = 11;
const GRASS_NOISE_KEY = 'grass-noise';
const ENDZONE_KEY = 'endzone-stripes';

const COLORS = {
  grassA: 0x48a058,
  grassB: 0x409850,
  line: 0xf8f8f0,
  los: 0x3058c0,
  firstDown: 0xf8d030,
  endZoneOwn: 0x3058c0,
  endZoneOpp: 0xd03028,
  barBg: 0x181010,
};
const BALL_KEY = 'ball';
const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"Press Start 2P", monospace',
  resolution: 2,
  fontSize: '10px',
  color: '#f8f8f0',
  stroke: '#181010',
  strokeThickness: 4,
};

// Spec 6.2: ataque com back_gbc, defesa com front_gbc.
const textureKey = (side: Side, id: number) => `${side === 'offense' ? 'back' : 'front'}-${id}`;
const CHIP_BG = { offense: '#d03028', defense: '#3058c0' } as const;
const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

function lineupEntries(lineup: Lineup, side: Side): Wanted[] {
  return (Object.entries(lineup) as [SlotId, number | undefined][])
    .filter((entry): entry is [SlotId, number] => entry[1] !== undefined)
    .map(([slot, id]) => ({ slot, id, side }));
}

/**
 * Campo vertical. Ela não decide nada: posiciona o estágio recebido e toca os passos da timeline.
 * O React chama `sync` a cada render. Enquanto há `play`, o estágio atual é ignorado; assim, um
 * match:phase que chegue no meio da animação não a interrompe.
 */
export class FieldScene extends Phaser.Scene {
  private ready = false;
  private pending: { stage: Stage | null; play: PlaySpec | null } = { stage: null, play: null };
  private shownStage: Stage | null = null;
  private playedSeq = -1;
  private generation = 0;
  private failedTextures = new Set<string>();
  private fieldGfx!: Phaser.GameObjects.Graphics;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.GameObject[] = [];
  private transient: Phaser.GameObjects.GameObject[] = [];
  private players = new Map<string, PlayerSprite>();
  private reduced = false;
  private ball!: Phaser.GameObjects.Image;
  private banner!: Phaser.GameObjects.Text;

  constructor() {
    super('field');
  }

  preload(): void {
    this.load.image(BALL_KEY, `${import.meta.env.BASE_URL}ball.png`);
  }

  create(): void {
    this.reduced = reducedMotion();
    this.makeTextures();
    this.fieldGfx = this.add.graphics().setDepth(0);
    // pontinhos de grama por cima das faixas, por baixo das linhas
    this.add.tileSprite(0, 0, FIELD_WIDTH, FIELD_HEIGHT, GRASS_NOISE_KEY).setOrigin(0).setDepth(0.5).setAlpha(0.55);
    this.lineGfx = this.add.graphics().setDepth(0.8);
    this.ball = this.add.image(FIELD_WIDTH / 2, LOS_Y, BALL_KEY).setDepth(20).setVisible(false);
    this.banner = this.add
      .text(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, '', { ...TEXT_STYLE, fontSize: '18px', strokeThickness: 6, align: 'center' })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => this.failedTextures.add(file.key));
    this.ready = true;
    this.sync(this.pending.stage, this.pending.play);
  }

  /** Texturas pixel geradas no código (sem arquivos): pontos de grama e listras de zona de gol. */
  private makeTextures(): void {
    const noise = this.make.graphics({ x: 0, y: 0 }, false);
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 46; i++) {
      noise.fillStyle(i % 3 === 0 ? 0x5cb86a : 0x2f7a40, 1).fillRect(Math.floor(rnd() * 15) * 2, Math.floor(rnd() * 15) * 2, 2, 2);
    }
    noise.generateTexture(GRASS_NOISE_KEY, 32, 32);
    noise.destroy();
    const stripes = this.make.graphics({ x: 0, y: 0 }, false);
    stripes.fillStyle(0xf8f8f0, 1);
    for (let i = -16; i < 32; i += 16) for (let k = 0; k < 16; k++) stripes.fillRect(i + k, 15 - k, 4, 1);
    stripes.generateTexture(ENDZONE_KEY, 16, 16);
    stripes.destroy();
  }

  sync(stage: Stage | null, play: PlaySpec | null): void {
    if (!this.ready) {
      this.pending = { stage, play };
      return;
    }
    if (play) {
      if (play.seq !== this.playedSeq) {
        this.playedSeq = play.seq;
        this.shownStage = play.stage;
        this.layout(play.stage, () => this.schedule(play.steps));
      }
      return;
    }
    if (stage !== this.shownStage) {
      this.shownStage = stage;
      this.layout(stage, null);
    }
  }

  private layout(stage: Stage | null, onReady: (() => void) | null): void {
    const gen = ++this.generation;
    this.time.removeAllEvents();
    this.tweens.killAll();
    for (const obj of this.transient) obj.destroy();
    this.transient = [];
    this.banner.setVisible(false);
    this.drawField(stage);
    this.clearPlayers();
    if (!stage) {
      this.ball.setVisible(false);
      return;
    }
    this.ball.setPosition(FIELD_WIDTH / 2, LOS_Y + 2).setAlpha(1).setVisible(true);
    const wanted = [...lineupEntries(stage.lineups.offense, 'offense'), ...lineupEntries(stage.lineups.defense, 'defense')];
    this.ensureTextures(wanted, () => {
      if (gen !== this.generation) return;
      for (const w of wanted) {
        const team = w.side === 'offense' ? stage.offenseTeam : other(stage.offenseTeam);
        this.addPlayer(w, stage.fatigue[team]?.[w.id] ?? 0);
      }
      onReady?.();
    });
  }

  private ensureTextures(wanted: readonly Wanted[], done: () => void): void {
    const missing = wanted.filter((w) => {
      const key = textureKey(w.side, w.id);
      return !this.textures.exists(key) && !this.failedTextures.has(key);
    });
    if (missing.length === 0) {
      done();
      return;
    }
    for (const w of missing) this.load.image(textureKey(w.side, w.id), spriteSrc(w.side === 'offense' ? 'back' : 'front', w.id));
    this.load.once(Phaser.Loader.Events.COMPLETE, done);
    this.load.start();
  }

  private addPlayer(w: Wanted, level: number): void {
    const { x, y } = slotPoint(w.slot);
    const key = textureKey(w.side, w.id);
    const body: Phaser.GameObjects.GameObject = this.textures.exists(key)
      ? this.add.image(0, 0, key).setDisplaySize(SPRITE_SIZE, SPRITE_SIZE)
      : this.add.circle(0, 0, 14, w.side === 'offense' ? COLORS.los : COLORS.endZoneOpp).setStrokeStyle(2, COLORS.line);
    const ratio = fatigueRatio(w.id, level);
    // mesma caixa de fatigueBarBox (layout.ts): 1 px acima do sprite
    const barY = -SPRITE_SIZE / 2 - 1 - BAR_HEIGHT / 2;
    const barBg = this.add.rectangle(0, barY, BAR_WIDTH, BAR_HEIGHT, COLORS.barBg);
    const bar = this.add
      .rectangle(-(BAR_WIDTH / 2 - 1), barY, Math.max(2, (BAR_WIDTH - 2) * ratio), BAR_HEIGHT - 2, fatigueColor(ratio))
      .setOrigin(0, 0.5);
    barBg.setVisible(level > 0);
    bar.setVisible(level > 0);
    const plateTop = SPRITE_SIZE / 2 + 1;
    const chip = this.add
      .text(0, plateTop, w.slot, {
        ...TEXT_STYLE, fontSize: '8px', stroke: undefined, strokeThickness: 0, backgroundColor: CHIP_BG[w.side], padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 0);
    const name = this.add
      .text(0, plateTop + PLATE_HEIGHT / 2, plateText(speciesName(w.id)), {
        fontFamily: '"Pixelify Sans", monospace', fontSize: '10px', color: '#f8f8f0', stroke: '#181010', strokeThickness: 3, resolution: 2,
      })
      .setOrigin(0.5, 0);
    const shadow = this.add.ellipse(0, SPRITE_SIZE / 2 - 5, 30, 8, 0x0f380f, 0.35);
    const container = this.add.container(x, y, [shadow, body, barBg, bar, chip, name]).setDepth(w.side === 'defense' ? 10 : 11);
    this.players.set(`${w.side}:${w.id}`, { container, slot: w.slot, id: w.id, side: w.side });
  }

  private clearPlayers(): void {
    for (const p of this.players.values()) p.container.destroy();
    this.players.clear();
  }

  private drawField(stage: Stage | null): void {
    const g = this.fieldGfx;
    const lg = this.lineGfx;
    g.clear();
    lg.clear();
    for (const label of this.labels) label.destroy();
    this.labels = [];
    const ballOn = stage?.ballOn ?? 50;
    const right = FIELD_WIDTH - SIDELINE_W;

    g.fillStyle(COLORS.grassA, 1).fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    for (let yard = -10; yard < 110; yard += 10) {
      const top = yardLineY(yard + 10, ballOn);
      const bottom = yardLineY(yard, ballOn);
      if (bottom < 0 || top > FIELD_HEIGHT) continue;
      if (yard < 0 || yard >= 100) {
        const own = yard < 0;
        g.fillStyle(own ? COLORS.endZoneOwn : COLORS.endZoneOpp, 0.6).fillRect(0, top, FIELD_WIDTH, bottom - top);
        this.labels.push(this.add.tileSprite(0, top, FIELD_WIDTH, bottom - top, ENDZONE_KEY).setOrigin(0).setDepth(0.6).setAlpha(0.22));
        this.labels.push(
          this.add
            .text(FIELD_WIDTH / 2, (top + bottom) / 2, own ? 'SAFETY' : 'TOUCHDOWN', { ...TEXT_STYLE, fontSize: '14px', strokeThickness: 4 })
            .setOrigin(0.5)
            .setDepth(1)
            .setAlpha(0.45),
        );
      } else g.fillStyle((yard / 10) % 2 === 0 ? COLORS.grassA : COLORS.grassB, 1).fillRect(0, top, FIELD_WIDTH, bottom - top);
    }

    // fora de campo (mais escuro) e linhas laterais brancas
    lg.fillStyle(0x2f7a40, 1).fillRect(0, 0, SIDELINE_W - 3, FIELD_HEIGHT).fillRect(FIELD_WIDTH - SIDELINE_W + 3, 0, SIDELINE_W - 3, FIELD_HEIGHT);
    lg.fillStyle(COLORS.line, 0.9).fillRect(SIDELINE_W - 3, 0, 3, FIELD_HEIGHT).fillRect(FIELD_WIDTH - SIDELINE_W, 0, 3, FIELD_HEIGHT);

    // marcas de 1 jarda: nas laterais e nas hashes de dentro
    lg.fillStyle(COLORS.line, 0.55);
    for (let yard = 1; yard < 100; yard++) {
      if (yard % 5 === 0) continue;
      const y = Math.round(yardLineY(yard, ballOn));
      if (y < 0 || y > FIELD_HEIGHT) continue;
      lg.fillRect(SIDELINE_W, y, 6, 2).fillRect(right - 6, y, 6, 2);
      lg.fillRect(FIELD_WIDTH / 2 - 78, y, 6, 2).fillRect(FIELD_WIDTH / 2 + 72, y, 6, 2);
    }

    // linhas de 5 em 5 jardas e números de 10 em 10, mais para dentro do campo
    lg.lineStyle(2, COLORS.line, 0.85);
    for (const line of visibleYardLines(ballOn)) {
      lg.lineBetween(SIDELINE_W, line.y, right, line.y);
      if (line.label) {
        const style = { ...TEXT_STYLE, fontSize: '12px', strokeThickness: 4 };
        this.labels.push(this.add.text(SIDELINE_W + 6, line.y + 5, line.label, style).setDepth(1));
        this.labels.push(this.add.text(right - 6, line.y + 5, line.label, style).setOrigin(1, 0).setDepth(1));
      }
    }
    if (!stage) return;

    // linha de scrimmage e linha do 1º down, com os marcadores de corrente nas laterais
    lg.lineStyle(3, COLORS.los, 1).lineBetween(SIDELINE_W, LOS_Y, right, LOS_Y);
    lg.fillStyle(COLORS.los, 1).fillRect(0, LOS_Y - 8, SIDELINE_W - 3, 16).fillRect(FIELD_WIDTH - SIDELINE_W + 3, LOS_Y - 8, SIDELINE_W - 3, 16);
    const target = stage.ballOn + stage.yardsToGo;
    if (target < 100) {
      const y = yardLineY(target, stage.ballOn);
      lg.lineStyle(3, COLORS.firstDown, 1).lineBetween(SIDELINE_W, y, right, y);
      lg.fillStyle(COLORS.firstDown, 1).fillRect(0, y - 8, SIDELINE_W - 3, 16).fillRect(FIELD_WIDTH - SIDELINE_W + 3, y - 8, SIDELINE_W - 3, 16);
    }
  }

  private schedule(steps: readonly AnimStep[]): void {
    for (const step of steps) this.time.delayedCall(step.at, () => this.runStep(step));
  }

  private player(side: Side, id: number | null | undefined): PlayerSprite | undefined {
    return id === null || id === undefined ? undefined : this.players.get(`${side}:${id}`);
  }

  private bySlot(side: Side, prefix: string): PlayerSprite[] {
    return [...this.players.values()].filter((p) => p.side === side && p.slot.startsWith(prefix));
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { ...TEXT_STYLE, color }).setOrigin(0.5).setDepth(30);
    this.transient.push(t);
    if (this.reduced) {
      // Texto informativo: fica parado e some depois, sem tween.
      this.time.delayedCall(900, () => t.destroy());
      return;
    }
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  private runStep(step: AnimStep): void {
    const d = this.reduced ? 0 : step.duration;
    switch (step.kind) {
      case 'SNAP': {
        const qb = this.bySlot('offense', 'QB')[0];
        this.tweens.add({ targets: this.ball, x: qb?.container.x ?? FIELD_WIDTH / 2, y: (qb?.container.y ?? LOS_Y + 60) - 4, duration: d });
        break;
      }
      case 'BLOCK':
        for (const p of [...this.bySlot('offense', 'OL'), ...this.bySlot('defense', 'DL')]) {
          this.tweens.add({ targets: p.container, y: p.container.y + (p.side === 'offense' ? -4 : 4), duration: d / 4, yoyo: true, repeat: 1 });
        }
        break;
      case 'CLASH': {
        const off = this.player('offense', step.off);
        const def = this.player('defense', step.def);
        if (!off || !def) break;
        const mx = (off.container.x + def.container.x) / 2;
        const my = (off.container.y + def.container.y) / 2;
        for (const p of [off, def]) {
          this.tweens.add({
            targets: p.container,
            x: p.container.x + (mx - p.container.x) * 0.5,
            y: p.container.y + (my - p.container.y) * 0.5,
            duration: d * 0.5,
            yoyo: true,
          });
        }
        const text = step.effect ? EFFECT_TEXT[step.effect] : null;
        if (text) this.floatText(mx, my - 24, text, step.effect === 'SUPER' ? '#f8d030' : '#c8c8c8');
        if (!this.reduced) this.cameras.main.shake(120, 0.004);
        break;
      }
      case 'THROW': {
        const from = this.player('offense', step.from) ?? this.bySlot('offense', 'QB')[0];
        const to = this.player('offense', step.to);
        if (!to) break;
        if (from) this.ball.setPosition(from.container.x, from.container.y - 4);
        this.tweens.add({ targets: this.ball, x: to.container.x, y: to.container.y - 4, duration: d, ease: 'Sine.easeOut' });
        break;
      }
      case 'RUN': {
        const carrier = this.player('offense', step.carrier);
        if (!carrier) break;
        const y = clampY(carrier.container.y - step.yards * PX_PER_YARD);
        this.tweens.add({ targets: carrier.container, y, duration: d, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: this.ball, x: carrier.container.x, y: y - 4, duration: d, ease: 'Quad.easeOut' });
        break;
      }
      case 'TACKLE': {
        const by = this.player('defense', step.by);
        const carrier = this.player('offense', step.carrier);
        if (!by || !carrier) break;
        this.tweens.add({ targets: by.container, x: carrier.container.x + 10, y: carrier.container.y - 10, duration: d });
        break;
      }
      case 'INCOMPLETE':
        this.tweens.add({ targets: this.ball, y: this.ball.y + 16, alpha: 0.3, duration: d });
        this.floatText(this.ball.x, this.ball.y - 16, 'INCOMPLETO', '#f8f8f0');
        break;
      case 'SACK': {
        const qb = this.player('offense', step.qb);
        if (!qb) break;
        const y = clampY(qb.container.y - step.yards * PX_PER_YARD);
        this.tweens.add({ targets: qb.container, y, duration: d });
        this.tweens.add({ targets: this.ball, x: qb.container.x, y: y - 4, duration: d });
        const by = this.player('defense', step.by);
        if (by) this.tweens.add({ targets: by.container, x: qb.container.x + 10, y: y - 10, duration: d });
        this.floatText(qb.container.x, y - 30, 'SACK!', '#f86858');
        break;
      }
      case 'TURNOVER': {
        const by = this.player('defense', step.by);
        if (by) this.tweens.add({ targets: this.ball, x: by.container.x, y: by.container.y - 4, duration: d });
        if (!this.reduced) this.cameras.main.flash(150, 208, 48, 40);
        break;
      }
      case 'KICK': {
        const y = clampY(this.ball.y - step.distance * PX_PER_YARD);
        const drift = step.good === false ? 60 : 0;
        this.tweens.add({ targets: this.ball, x: this.ball.x + drift, y, duration: d, ease: 'Sine.easeOut' });
        break;
      }
      case 'BANNER': {
        const color = step.tone === 'good' ? '#f8d030' : step.tone === 'bad' ? '#f86858' : '#f8f8f0';
        this.banner.setText(step.text).setColor(color).setScale(0.6).setAlpha(1).setVisible(true);
        this.tweens.add({ targets: this.banner, scale: 1, duration: this.reduced ? 0 : Math.min(250, d / 2), ease: 'Back.easeOut' });
        this.time.delayedCall(step.duration, () => this.banner.setVisible(false));
        break;
      }
    }
  }
}
