import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// e2e against `vite preview` of build:e2e (docs/02-tech.md, section 10). Runs only at the end of a milestone
// (CLAUDE.md, «Экономия контекста и лимитов»). Phone first: portrait is the main mobile project.
const dist = process.env.E2E_DIST || 'dist-e2e';
const STATIC_SPECS = /(smoke-release|pages)\.spec\.ts$/;
const PHONE_SPECS = /(touch|layout|ftue)[^/]*\.spec\.ts$/;
const port = Number(process.env.E2E_PORT || 4173);
const markerFile = resolve(import.meta.dirname, '.cache/chromium-path');
const executablePath =
  process.env.CHROMIUM_EXECUTABLE || (existsSync(markerFile) ? readFileSync(markerFile, 'utf8').trim() : undefined);

// Software WebGL in the cloud (SwiftShader); PixiJS is created with preference 'webgl'.
export const launchArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 2,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    headless: true,
    launchOptions: executablePath ? { executablePath, args: launchArgs } : { args: launchArgs },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: [PHONE_SPECS, STATIC_SPECS] },
    {
      name: 'phone',
      testMatch: PHONE_SPECS,
      use: { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'phone-landscape',
      testMatch: PHONE_SPECS,
      use: { viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: `npx vite preview --outDir ${dist} --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
