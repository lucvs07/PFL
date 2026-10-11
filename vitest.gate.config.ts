import { defineConfig } from 'vitest/config';

/** Só o portão de balanceamento (spec 7.3): `npm run test:gate`. */
export default defineConfig({
  test: { include: ['packages/**/test/**/*.gate.test.ts'] },
});
