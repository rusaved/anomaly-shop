import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Unit tests run in Node with the yandex profile flags of a release build (docs/02-tech.md, section 10).
const root = import.meta.dirname;
const game = JSON.parse(readFileSync(resolve(root, 'game.json'), 'utf8'));

export default defineConfig({
  resolve: {
    alias: {
      '@content': resolve(root, 'content'),
      '@': resolve(root, 'src'),
    },
  },
  define: {
    __DEBUG_TOOLS__: 'false',
    __STUDIO__: 'false',
    __TEST_API__: 'false',
    __BUILD_LABEL__: '""',
    __PLATFORM__: '"null"',
    __GAME__: JSON.stringify({
      id: game.id,
      title: game.title,
      languages: game.languages,
      fallbackLanguage: game.fallbackLanguage,
      ruFallbackLanguages: game.ruFallbackLanguages,
      community: game.community,
      metrikaCounterId: 0,
      profile: { name: 'null', ...game.profiles.null },
    }),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
