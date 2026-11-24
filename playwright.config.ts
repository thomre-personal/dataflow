import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 40_000,
  use: {
    baseURL: 'http://127.0.0.1:5183',
    channel: process.env.DATAFLOW_BROWSER || 'chromium',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run preview -- --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    timeout: 20_000,
    reuseExistingServer: false,
  },
});
