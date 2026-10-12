import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    // o portão de balanceamento (milhares de partidas) roda à parte: npm run test:gate
    exclude: [...configDefaults.exclude, '**/*.gate.test.ts'],
  },
});
