import { createPflServer } from '/home/asaas/projects/pfl/apps/server/src/server';

// uso: tsx seeded-server.ts <porta> <slow|fast>
const [, , portArg, mode] = process.argv;
const port = Number(portArg);

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fast = mode === 'fast';
const server = await createPflServer({
  port,
  random: mulberry32(1234),
  timings: fast
    ? { phaseMs: { FORMATION: 120, PACKAGE: 120, PLAYCALL: 120, CONVERSION: 120 }, resultAnimationMs: 150 }
    : undefined,
});
console.log(`seeded ${mode} em ${server.port}`);
