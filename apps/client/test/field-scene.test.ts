import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stage } from '../src/match/matchState';

// O Phaser precisa de canvas e janela: trocamos por uma Scene vazia. Só `Scene` e os nomes de evento do loader são usados em runtime.
vi.mock('phaser', () => {
  class Scene {
    constructor(public key?: string) {}
  }
  return { default: { Scene, Loader: { Events: { FILE_LOAD_ERROR: 'loaderror', COMPLETE: 'complete' } } } };
});

const { FieldScene } = await import('../src/phaser/FieldScene');
const { FIELD_HEIGHT, FIELD_WIDTH, LOS_Y, SPRITE_SIZE } = await import('../src/phaser/layout');

interface Call {
  method: string;
  args: unknown[];
}
interface Fake {
  kind: string;
  args: unknown[];
  calls: Call[];
  proxy: any;
}

/** Objeto de jogo falso: aceita qualquer método encadeado e guarda as chamadas para os testes olharem. */
function fakeScene() {
  const created: Fake[] = [];
  const object = (kind: string, args: unknown[]): any => {
    const fake: Fake = { kind, args, calls: [], proxy: null };
    fake.proxy = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === 'then') return undefined;
          if (prop === 'x' || prop === 'y') return 0;
          return (...a: unknown[]) => {
            fake.calls.push({ method: prop, args: a });
            return fake.proxy;
          };
        },
      },
    );
    created.push(fake);
    return fake.proxy;
  };
  const factory = (kind: string) => (...args: unknown[]) => object(kind, args);
  const loaded = new Set<string>();
  const loadImages: [string, string][] = [];
  const onceCallbacks: (() => void)[] = [];
  const scene = new FieldScene() as any;
  scene.add = {
    graphics: factory('graphics'), tileSprite: factory('tileSprite'), image: factory('image'), text: factory('text'),
    rectangle: factory('rectangle'), ellipse: factory('ellipse'), circle: factory('circle'), container: factory('container'),
  };
  scene.make = { graphics: factory('makeGraphics') };
  scene.textures = { exists: (key: string) => loaded.has(key) };
  scene.load = {
    image: (key: string, url: string) => loadImages.push([key, url]),
    on: () => {},
    once: (_e: string, cb: () => void) => onceCallbacks.push(cb),
    start: () => {
      for (const [key] of loadImages) loaded.add(key);
      for (const cb of onceCallbacks.splice(0)) cb();
    },
  };
  scene.time = { removeAllEvents: () => {}, delayedCall: () => {} };
  scene.tweens = { killAll: () => {}, add: () => {} };
  const of = (kind: string) => created.filter((c) => c.kind === kind);
  const texts = () => of('text').map((c) => String(c.args[2]));
  return { scene, created, of, texts, loadImages, loaded };
}

const stage = (over: Partial<Stage> = {}): Stage => ({
  turnId: 1,
  offenseTeam: 'A',
  ballOn: 50,
  yardsToGo: 10,
  lineups: { offense: { QB: 63, RB: 25 }, defense: { DL1: 95, S1: 16 } },
  fatigue: { A: {}, B: {} },
  ...over,
});

let t: ReturnType<typeof fakeScene>;
beforeEach(() => {
  t = fakeScene();
});

const lineCalls = (t2: typeof t, method: string): Call[] =>
  t2.of('graphics').flatMap((g) => g.calls.filter((c) => c.method === method));

describe('FieldScene: bola e texturas', () => {
  it('preload pede o sprite da bola em BASE_URL/ball.png', () => {
    t.scene.preload();
    expect(t.loadImages).toEqual([['ball', '/ball.png']]);
  });

  it('create usa o sprite da bola (não mais uma elipse), escondido até haver partida', () => {
    t.scene.create();
    const ball = t.of('image')[0];
    expect(ball.args[2]).toBe('ball');
    expect(ball.calls.map((c) => c.method)).toContain('setVisible');
    expect(ball.calls.at(-1)).toEqual({ method: 'setVisible', args: [false] });
    expect(t.of('ellipse')).toHaveLength(0);
  });

  it('gera as texturas de grama e de zona de gol no código', () => {
    t.scene.create();
    const generated = t.of('makeGraphics').flatMap((g) => g.calls.filter((c) => c.method === 'generateTexture').map((c) => c.args));
    expect(generated).toEqual([['grass-noise', 32, 32], ['endzone-stripes', 16, 16]]);
  });

  it('cobre o campo com a grama pontilhada por cima das faixas', () => {
    t.scene.create();
    const noise = t.of('tileSprite').find((c) => c.args[4] === 'grass-noise');
    expect(noise).toBeDefined();
    expect(noise!.args.slice(2, 4)).toEqual([FIELD_WIDTH, FIELD_HEIGHT]);
  });
});

describe('FieldScene: partida', () => {
  it('sync com estágio mostra a bola na linha de scrimmage e pede os sprites da escalação', () => {
    t.scene.create();
    t.scene.sync(stage(), null);
    const ball = t.of('image')[0];
    expect(ball.calls).toContainEqual({ method: 'setPosition', args: [FIELD_WIDTH / 2, LOS_Y + 2] });
    expect(ball.calls.at(-1)).toEqual({ method: 'setVisible', args: [true] });
    // ataque de costas (back), defesa de frente (front)
    expect(t.loadImages.map(([key]) => key).sort()).toEqual(['back-25', 'back-63', 'front-16', 'front-95']);
    expect(t.loadImages.find(([key]) => key === 'back-25')![1]).toBe('/sprites/bw/back/25.png');
    expect(t.loadImages.find(([key]) => key === 'front-95')![1]).toBe('/sprites/bw/front/95.png');
  });

  it('cada Pokémon em campo ganha sombra e sprite', () => {
    t.scene.create();
    t.scene.sync(stage(), null);
    const shadows = t.of('ellipse');
    expect(shadows).toHaveLength(4);
    for (const s of shadows) expect(s.args.slice(0, 4)).toEqual([0, SPRITE_SIZE / 2 - 5, 30, 8]);
    expect(t.of('image').filter((c) => c.args[2] !== 'ball')).toHaveLength(4);
  });

  it('sem sprite carregado cai num círculo, mas ainda desenha a sombra', () => {
    t.scene.create();
    t.scene.sync(stage(), null);
    t.loaded.clear();
    t.created.length = 0;
    t.scene.sync(stage({ turnId: 2, lineups: { offense: { QB: 63 }, defense: {} } }), null);
    expect(t.of('ellipse')).toHaveLength(1);
  });

  it('sem estágio esconde a bola e não desenha linhas de partida', () => {
    t.scene.create();
    t.scene.sync(null, null);
    expect(t.of('image')[0].calls.at(-1)).toEqual({ method: 'setVisible', args: [false] });
    expect(lineCalls(t, 'lineStyle').filter((c) => c.args[0] === 3)).toHaveLength(0);
  });
});

describe('FieldScene: campo', () => {
  it('no meio do campo não há zona de gol; os números de jarda aparecem dos dois lados', () => {
    t.scene.create();
    t.scene.sync(stage({ ballOn: 50 }), null);
    expect(t.texts()).not.toContain('TOUCHDOWN');
    expect(t.texts()).not.toContain('SAFETY');
    expect(t.texts().filter((s) => s === '50')).toHaveLength(2);
  });

  it('perto do gol adversário mostra TOUCHDOWN; perto do próprio gol mostra SAFETY', () => {
    t.scene.create();
    t.scene.sync(stage({ ballOn: 96, yardsToGo: 4 }), null);
    expect(t.texts()).toContain('TOUCHDOWN');
    expect(t.texts()).not.toContain('SAFETY');
    t.scene.sync(stage({ turnId: 2, ballOn: 3 }), null);
    expect(t.texts()).toContain('SAFETY');
  });

  it('as zonas de gol ganham listras e o desenho anterior é destruído ao redesenhar', () => {
    t.scene.create();
    t.scene.sync(stage({ ballOn: 96, yardsToGo: 4 }), null);
    const stripes = t.of('tileSprite').filter((c) => c.args[4] === 'endzone-stripes');
    expect(stripes).toHaveLength(1);
    const before = t.created.filter((c) => c.kind === 'text' && ['TOUCHDOWN'].includes(String(c.args[2])));
    t.scene.sync(stage({ turnId: 2, ballOn: 50 }), null);
    for (const old of [...stripes, ...before]) expect(old.calls.map((c) => c.method)).toContain('destroy');
  });

  it('desenha a linha amarela do 1º down e os marcadores de corrente nas laterais', () => {
    t.scene.create();
    t.scene.sync(stage({ ballOn: 30, yardsToGo: 10 }), null);
    const yellowLine = lineCalls(t, 'lineStyle').find((c) => c.args[1] === 0xf8d030);
    expect(yellowLine).toBeDefined();
    const yellowMarkers = lineCalls(t, 'fillStyle').filter((c) => c.args[0] === 0xf8d030);
    expect(yellowMarkers.length).toBeGreaterThan(0);
    const blueLine = lineCalls(t, 'lineStyle').find((c) => c.args[1] === 0x3058c0);
    expect(blueLine).toBeDefined();
  });

  it('com o 1º down além da linha de gol não há linha amarela', () => {
    t.scene.create();
    t.scene.sync(stage({ ballOn: 96, yardsToGo: 4 }), null);
    expect(lineCalls(t, 'lineStyle').find((c) => c.args[1] === 0xf8d030)).toBeUndefined();
  });

  it('desenha hashes de 1 jarda só fora das linhas de 5 jardas', () => {
    t.scene.create();
    t.scene.sync(stage({ ballOn: 50 }), null);
    // cada jarda visível sem linha própria gera 4 marcas (2 laterais + 2 hashes), de 6x2 px
    const ticks = lineCalls(t, 'fillRect').filter((c) => c.args[2] === 6 && c.args[3] === 2);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length % 4).toBe(0);
  });
});
