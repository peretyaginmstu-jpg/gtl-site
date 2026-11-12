#!/usr/bin/env node
/* Статичные версии иллюстраций — кадр покоя каждой сцены из assets/art.js.
   Нужны браузерам без JavaScript и для печати.

   Запуск:  node tools/snapshot.mjs   ->  assets/*.svg
*/
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const art = createRequire(import.meta.url)(join(assets, 'art.js'));

for (const id of Object.keys(art.scenes)) {
  const svg = art.still(id);
  writeFileSync(join(assets, id + '.svg'), svg);
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
  console.log(`${id}.svg  ${w}x${h}  ${(svg.length / 1024).toFixed(1)} КБ`);
}
