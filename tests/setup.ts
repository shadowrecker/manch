import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// Runs for every test file (node + jsdom). Component cleanup is loaded lazily so
// importing @testing-library/react never touches `document` in node-env tests.
afterEach(async () => {
  vi.clearAllMocks();
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
