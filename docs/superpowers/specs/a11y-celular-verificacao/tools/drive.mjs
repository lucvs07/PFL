// uso: node drive.mjs <outDir> <WxH> [<WxH> ...]   (gera <tela>-<W>.json para o diff do desktop)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire('/home/asaas/projects/dot-study-motion/package.json');
const { chromium } = require('playwright-core');

const [, , outDir, ...sizes] = process.argv;
mkdirSync(outDir, { recursive: true });
const snapSrc = readFileSync('/home/asaas/projects/pfl/apps/client/scripts/layout-snapshot.js', 'utf8');
const SLOW = 'http://127.0.0.1:5173';
const FAST = 'http://127.0.0.1:5174';

async function snap(page, name) {
  await page.evaluate(snapSrc);
  const data = await page.evaluate(() => window.__pflSnapshot());
  writeFileSync(`${outDir}/${name}.json`, JSON.stringify(data, null, 1));
  console.log('salvo', name, Object.keys(data).length);
}

async function ready(page, base) {
  await page.goto(base);
  await page.waitForSelector('text=Criar sala');
  await page.evaluate(() => sessionStorage.clear());
}

async function lobby(browser, viewport, base, takeLobby) {
  const a = await (await browser.newContext({ viewport })).newPage();
  const b = await (await browser.newContext({ viewport })).newPage();
  await ready(a, base);
  await ready(b, base);
  await a.click('text=Criar sala');
  await a.waitForSelector('.room-code');
  const code = (await a.locator('.room-code').innerText()).replace(/[^A-Z]/g, '');
  await b.fill('input[aria-label="Código da sala"]', code);
  await b.click('button:has-text("Entrar")');
  for (const p of [a, b]) {
    await p.waitForSelector('.team-option');
    await p.locator('.team-option').first().click();
    await p.click('button:has-text("Enviar time")');
  }
  await a.waitForFunction(() => document.querySelectorAll('.lobby-card.has-lead').length === 2, null, { timeout: 15000 });
  await a.waitForTimeout(400);
  if (takeLobby) await takeLobby(a);
  for (const p of [a, b]) await p.click('button:has-text("Estou pronto")');
  return { a, b };
}

const browser = await chromium.launch();
for (const size of sizes) {
  const [w, h] = size.split('x').map(Number);
  const viewport = { width: w, height: h };
  const tag = String(w);

  // telas que não dependem de partida longa: servidor com timers normais
  {
    const p = await (await browser.newContext({ viewport })).newPage();
    await ready(p, SLOW);
    await snap(p, `home-${tag}`);
    await p.click('text=Montar time');
    await p.waitForSelector('.builder, .builder-header');
    await p.waitForTimeout(500);
    await snap(p, `builder-${tag}`);
    await p.context().close();
  }
  {
    const { a, b } = await lobby(browser, viewport, SLOW, (page) => snap(page, `lobby-${tag}`));
    await a.waitForSelector('.picker', { timeout: 20000 }).catch(() => {});
    await a.waitForTimeout(600);
    await snap(a, `match-${tag}`);
    await a.context().close();
    await b.context().close();
  }
  // fim de jogo: servidor rápido e com semente, o resultado é sempre o mesmo
  {
    const { a, b } = await lobby(browser, viewport, FAST, null);
    await a.waitForSelector('.stats-grid', { timeout: 420000 });
    await a.waitForTimeout(800);
    await snap(a, `end-${tag}`);
    await a.context().close();
    await b.context().close();
  }
}
await browser.close();
