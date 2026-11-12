#!/usr/bin/env node
/* Проверка живых иллюстраций без браузера. Запускается перед выкладкой сайта.

   1. Каждая сцена 8 секунд «работает под курсором» — с движением, щелчками и зажатой кнопкой, — потом курсор уходит.
      В разметке кадров не должно быть NaN, а сцена должна успокоиться.
   2. Станок выполняет все четыре программы при 60 и при 13 кадрах в секунду: каждая должна дойти до конца
      и снять металл, а результат не должен зависеть от частоты кадров.
   3. Статичные кадры в assets/*.svg должны совпадать с тем, что рисует assets/art.js.

   Запуск:  node tools/check.mjs
*/
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const art = createRequire(import.meta.url)(join(assets, 'art.js'));
const OFF = { in: false, x: 0, y: 0, vx: 0, vy: 0, zu: .5, zv: .5, down: false, hit: false };
const broken = html => /NaN|undefined|Infinity/.test(html);
const frame = (id, def, st) => { const s = new art.Scene(id, 8); def.draw(s, st); return s; };

let failed = 0;
const ok = m => console.log('  ✓ ' + m);
const fail = m => { failed++; console.log('  ✗ ' + m); };

console.log('Сцены под курсором');
for (const [id, def] of Object.entries(art.scenes)) {
  const st = def.init(), s0 = frame(id, def, st), vb = { x: s0.x0, y: s0.y0, w: s0.x1 - s0.x0, h: s0.y1 - s0.y0 };
  let bad = 0, lx = 0;
  for (let i = 0; i < 480; i++) {
    const t = i / 60, x = vb.x + vb.w * (.5 + .4 * Math.sin(t * 2)), y = vb.y + vb.h * (.5 + .4 * Math.cos(t * 1.3));
    def.step(st, 1 / 60, { in: true, x, y, vx: i ? (x - lx) * 60 : 0, vy: 0, zu: .5 + .45 * Math.sin(t * 2), zv: .5 + .45 * Math.cos(t * 1.3), down: t > 2 && t < 4.5, hit: i === 150 || i === 330 }, vb);
    lx = x;
    if (broken(frame(id, def, st).html())) bad++;
  }
  let n = 0, busy = true;
  while (busy && n < 3600) { busy = def.step(st, 1 / 60, OFF, vb); n++; }
  if (bad || busy || broken(frame(id, def, st).html())) fail(`${id}: испорченных кадров ${bad}${busy ? ', сцена не успокоилась за минуту' : ''}`);
  else ok(`${id}: покой через ${(n / 60).toFixed(1)} с`);
}

console.log('Программы станка');
const machine = art.scenes.machine, cutByProgram = [];
for (const dt of [1 / 60, 1 / 13]) {
  for (let p = 0; p < 4; p++) {
    const st = machine.init();
    machine.cmd(st, 'prog', p); machine.cmd(st, 'start');
    let t = 0, bad = 0;
    while (st.run && t < 60) { machine.step(st, dt, OFF, {}); t += dt; if (broken(frame('machine', machine, st).html())) bad++; }
    const ran = t;
    let busy = true;
    while (busy && t < 120) { busy = machine.step(st, dt, OFF, {}); t += dt; }
    const label = `программа ${p + 1} при ${Math.round(1 / dt)} кадрах/с`;
    if (st.run || busy || bad || !st.cutN) { fail(`${label}: ${st.run ? 'не дошла до конца' : busy ? 'станок не остановился' : bad ? 'испорченные кадры' : 'металл не снят'}`); continue; }
    if (dt < .02) cutByProgram[p] = st.cutN;
    else if (Math.abs(st.cutN - cutByProgram[p]) > .08 * cutByProgram[p]) { fail(`${label}: снято ${st.cutN} ячеек против ${cutByProgram[p]} при 60 кадрах/с`); continue; }
    ok(`${label}: ${ran.toFixed(1)} с, снято ${st.cutN} ячеек`);
  }
}

console.log('Статичные кадры');
for (const id of Object.keys(art.scenes)) {
  let have = '';
  try { have = readFileSync(join(assets, id + '.svg'), 'utf8'); } catch { /* файла нет */ }
  if (have === art.still(id)) ok(`${id}.svg актуален`);
  else fail(`${id}.svg не совпадает со сценой — запустите node tools/snapshot.mjs`);
}

console.log(failed ? `\nОшибок: ${failed}` : '\nВсё в порядке');
process.exit(failed ? 1 : 0);
