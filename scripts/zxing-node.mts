// zxing-wasm fetches its .wasm from a CDN by default, which fails offline and
// on flaky networks. Feed it the copy already in node_modules instead.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setZXingModuleOverrides } from 'zxing-wasm/reader';

const wasmPath = fileURLToPath(
  new URL('../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', import.meta.url),
);

setZXingModuleOverrides({ wasmBinary: readFileSync(wasmPath) });
