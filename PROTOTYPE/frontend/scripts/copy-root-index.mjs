import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distIndex = join(here, '..', 'dist', 'index.html');
const rootIndex = join(here, '..', '..', 'index.html');

if (!existsSync(distIndex)) {
  console.error('Build output missing:', distIndex);
  process.exit(1);
}

copyFileSync(distIndex, rootIndex);
console.log('Copied frontend/dist/index.html -> ../index.html (served by backend on :8000)');
