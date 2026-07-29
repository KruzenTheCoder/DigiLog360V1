import { defineConfig } from 'vitest/config';

// Unit tests cover the pure-TypeScript logic only — barcode payload parsing,
// SA licence decoding, ID validation. Anything needing a native module or a
// rendered React Native tree is out of scope here and must be checked on a
// device.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
