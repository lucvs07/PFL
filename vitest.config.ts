import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.{ts,tsx}', 'apps/**/test/**/*.test.{ts,tsx}'],
    // o portão de balanceamento (milhares de partidas) roda à parte: npm run test:gate
    exclude: [...configDefaults.exclude, '**/*.gate.test.ts'],
  },
});
