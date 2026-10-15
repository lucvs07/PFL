// uso: node mobile.mjs <outDir> <WxH> [<WxH> ...]   (celular emulado: toque, pointer: coarse, hover: none)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire('/home/asaas/projects/dot-study-motion/package.json');
const { chromium } = require('playwright-core');

const [, , outDir, ...sizes] = process.argv;
mkdirSync(outDir, { recursive: true });
const auditSrc = readFileSync('/home/asaas/projects/pfl/apps/client/scripts/layout-audit.js', 'utf8');
const SLOW = 'http://127.0.0.1:5173';
const FAST = 'http://127.0.0.1:5174';
const report = {};

async function audit(page, name, tag, full = false) {
  await page.evaluate(auditSrc);
  const r = await page.evaluate(() => window.__pflAudit());
  report[`${name}-${tag}`] = r;
  // fullPage redefine a emulação de toque do contexto (hover: none vira false); nas telas que ainda precisam de toque, só a viewport
  await page.screenshot({ path: `${outDir}/${name}-${tag}.png`, fullPage: full });
  console.log(name, tag, 'overflowX:', r.overflowX, 'alvos<44:', r.smallTargets.length, 'contraste:', r.lowContrast.length, 'inputs<16px:', r.smallInputs.length);
}

const ctxOpts = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

async function ready(page, base) {
  await page.goto(base);
  await page.waitForSelector('text=Criar sala');
  await page.evaluate(() => sessionStorage.clear());
}

async function lobby(browser, w, h, base, onLobby) {
  const a = await (await browser.newContext(ctxOpts(w, h))).newPage();
  const b = await (await browser.newContext(ctxOpts(w, h))).newPage();
  await ready(a, base);
  await ready(b, base);
  await a.tap('text=Criar sala');
  await a.waitForSelector('.room-code');
  const code = (await a.locator('.room-code').innerText()).replace(/[^A-Z]/g, '');
  await b.fill('input[aria-label="Código da sala"]', code);
  await b.tap('button:has-text("Entrar")');
  for (const p of [a, b]) {
    await p.waitForSelector('.team-option');
    await p.locator('.team-option').first().tap();
    await p.tap('button:has-text("Enviar time")');
  }
  await a.waitForFunction(() => document.querySelectorAll('.lobby-card.has-lead').length === 2, null, { timeout: 15000 });
  await a.waitForTimeout(400);
  if (onLobby) await onLobby(a);
  for (const p of [a, b]) await p.tap('button:has-text("Estou pronto")');
  return { a, b };
}

const browser = await chromium.launch();
for (const size of sizes) {
  const [w, h] = size.split('x').map(Number);
  const tag = `${w}x${h}`;

  // início, montagem
  {
    const p = await (await browser.newContext(ctxOpts(w, h))).newPage();
    await ready(p, SLOW);
    await audit(p, 'home', tag);
    await p.tap('text=Montar time');
    await p.waitForSelector('.builder, .builder-header');
    await p.waitForTimeout(500);
    await audit(p, 'builder', tag);
    for (const t of await p.locator('[role="tab"], .tab').all()) {
      const label = (await t.innerText()).trim().slice(0, 12).replace(/\W+/g, '_');
      if (!label) continue;
      await t.tap().catch(() => {});
      await p.waitForTimeout(300);
      await audit(p, `builder-${label}`, tag);
    }
    await p.context().close();
  }

  // estado "servidor acordando": o WebSocket nunca abre
  {
    const p = await (await browser.newContext(ctxOpts(w, h))).newPage();
    await p.routeWebSocket(/3001/, (ws) => ws.close({ code: 1011 }));
    await p.goto(SLOW);
    await p.waitForSelector('.conn-waking', { timeout: 15000 });
    const text = await p.locator('.conn-banner').innerText();
    report[`conn-waking-${tag}`] = text.replace(/\s+/g, ' ');
    console.log('waking:', report[`conn-waking-${tag}`]);
    await p.screenshot({ path: `${outDir}/conn-waking-${tag}.png` });
    await p.context().close();
  }

  // lobby, partida (formação, mão), teclado, tooltip por toque, pausa e reconexão
  {
    const { a, b } = await lobby(browser, w, h, SLOW, (page) => audit(page, 'lobby', tag, false));
    await a.waitForSelector('.picker', { timeout: 20000 });
    await a.waitForTimeout(600);
    await audit(a, 'match-formation', tag, false);

    // teclado: setas movem o foco entre as opções
    const first = a.locator('.picker-option').first();
    await first.focus();
    await a.keyboard.press('ArrowRight');
    const moved = await a.evaluate(() => document.activeElement?.className ?? '');
    const kbIndex = await a.evaluate(() => Array.from(document.querySelectorAll('.picker-option')).indexOf(document.activeElement));
    report[`keyboard-${tag}`] = { active: moved, index: kbIndex };
    console.log('teclado: índice após ArrowRight =', kbIndex);

    // avança até a mão de cartas
    let handAudited = false;
    for (let i = 0; i < 60 && !handAudited; i++) {
      for (const p of [a, b]) {
        const opt = p.locator('.picker-option');
        if (await opt.count()) await opt.first().tap({ timeout: 1500 }).catch(() => {});
      }
      if (await a.locator('.hand .card-face').count()) {
        await a.waitForTimeout(500);
        await audit(a, 'match-hand', tag, false);
        // tooltip por toque: o 1º toque abre sem jogar
        const card = a.locator('.hand .card-tile:not(.is-disabled)').first();
        await card.locator('.card-face').tap();
        await a.waitForTimeout(200);
        const tip = await a.evaluate(() => {
          const open = document.querySelector('.card-tile.is-tip-open .card-tooltip');
          if (!open) return null;
          const r = open.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight };
        });
        if (tip) tip.fits = tip.left >= 0 && tip.top >= 0 && tip.right <= tip.vw && tip.bottom <= tip.vh;
        report[`tooltip-${tag}`] = tip;
        console.log('tooltip por toque:', JSON.stringify(tip));
        await a.screenshot({ path: `${outDir}/match-tooltip-${tag}.png` });
        // 2º toque: a folha cobre a carta, então "Jogar esta carta" na própria folha precisa jogar de verdade
        const play = a.locator('.card-tile.is-tip-open button:has-text("Jogar esta carta")');
        const playable = await play.count();
        if (playable) {
          await play.tap();
          const sent = await a.waitForFunction(() => document.body.innerText.includes('Carta escolhida'), null, { timeout: 5000 }).then(() => true).catch(() => false);
          report[`play-by-sheet-${tag}`] = { playable: true, sent };
          console.log('jogar pela folha:', sent ? 'jogada enviada' : 'FALHOU');
        } else {
          console.log('AVISO: primeira carta não jogável, folha só com Fechar');
          report[`play-by-sheet-${tag}`] = { playable: false };
        }
        handAudited = true;
      }
      await a.waitForTimeout(500);
    }
    if (!handAudited) console.log('AVISO: a mão de cartas não apareceu em', tag);

    // reconexão: o meu lado perde a rede
    await a.context().setOffline(true);
    await a.waitForSelector('.conn-reconnecting', { timeout: 40000 }).catch(() => {});
    report[`conn-reconnecting-${tag}`] = (await a.locator('.conn-banner').innerText().catch(() => 'AUSENTE')).replace(/\s+/g, ' ');
    console.log('reconnecting:', report[`conn-reconnecting-${tag}`]);
    await a.screenshot({ path: `${outDir}/conn-reconnecting-${tag}.png` });
    await a.context().setOffline(false);

    // pausa: o adversário sai
    await b.context().close();
    await a.waitForSelector('.conn-paused', { timeout: 40000 }).catch(() => {});
    report[`conn-paused-${tag}`] = (await a.locator('.conn-banner').innerText().catch(() => 'AUSENTE')).replace(/\s+/g, ' ');
    console.log('paused:', report[`conn-paused-${tag}`]);
    await a.screenshot({ path: `${outDir}/conn-paused-${tag}.png` });
    await a.context().close();
  }

  // fim de jogo (servidor rápido e com semente)
  {
    const { a, b } = await lobby(browser, w, h, FAST, null);
    await a.waitForSelector('.stats-grid', { timeout: 420000 });
    await a.waitForTimeout(800);
    await audit(a, 'end', tag);
    await a.context().close();
    await b.context().close();
  }
}
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1));
await browser.close();
