/* ГТЛ Система — живые иллюстрации.

   Изометрическая линейная графика без внешних зависимостей. Каждая сцена описана в пространстве
   (x, y, z) и заново строится из своего состояния: в покое это обычный рисунок, под курсором —
   небольшая физическая модель с показаниями.

   Общие приёмы:
     • силуэт тела — толстая линия (OUTER), внутренние рёбра — тонкая (INNER);
     • три тона граней: верх светлее всех, правая грань темнее левой;
     • под сценой мягкая размытая тень, один акцентный цвет (ACC).

   Сцена — объект { init, step, draw, read }:
     init()                 начальное состояние;
     step(st, dt, ptr, vb)  шаг модели, возвращает true, пока что-то движется;
     draw(s, st)            рисует кадр в Scene;
     read(st, live)         строки показаний;
     необязательные: cmd(st, имя) — команда сцене, tap(st) — касание на сенсорном экране, cursor(st) — вид курсора.

   Статичные версии для браузеров без JavaScript:  node tools/snapshot.mjs  ->  assets/*.svg
*/
(() => {
'use strict';

/* ───────── константы ───────── */
const C = Math.cos(Math.PI / 6), S = .5, K = Math.SQRT2, KC = K * C, KS = K * S, U = Math.SQRT1_2;
const INK = '#16171a', ACC = '#a0622d', GR = '#b9b6ae';
const T1 = '#ffffff', T2 = '#f6f5f2', T3 = '#e9e7e2', TS = '#fbfaf8', SH = '#d9d6cd';
const A1 = '#cfa57b', A2 = '#b9824f', AK = '#6f4320';            // тона и контур акцентного тела
const OUTER = 1.6, INNER = .9, FINE = .75;
const FONT = "'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace";
const TONES = [T1, T3, T2], CT = [T1, T2], BRZ = [A1, ACC, A2], NO = Object.freeze({});
const NB = ' ', TAU = Math.PI * 2;
const HOVER = typeof matchMedia === 'undefined' || !matchMedia('(hover: none)').matches;   // есть ли у устройства курсор

const f = n => Math.round(n * 10) / 10;
const f2 = n => Math.round(n * 100) / 100;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (cur, tgt, dt, rate) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));
const round = (v, m) => Math.round(v / m) * m;
const num = (v, d = 0) => { const a = Math.abs(v).toFixed(d); return (v < 0 && +a !== 0 ? '−' : '') + a.replace('.', ','); };
const sgn = (v, d = 0) => { const a = Math.abs(v).toFixed(d); return (+a === 0 ? '' : v < 0 ? '−' : '+') + a.replace('.', ','); };
const grp = v => String(Math.round(v)).replace(/\B(?=(\d{3})+$)/g, NB);
const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(lerp(parseInt(a.substr(i, 2), 16), parseInt(b.substr(i, 2), 16), t)).toString(16).padStart(2, '0')).join('');
const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ───────── холст сцены ───────── */
class Scene {
  constructor(id, sd) { this.id = id; this.sd = sd || 8; this.el = []; this.M = null; this.blur = false; this.x0 = this.y0 = 1e9; this.x1 = this.y1 = -1e9; }

  bb(x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; }

  /* проекция точки пространства на лист */
  P(x, y, z) {
    if (this.M) { const q = this.M(x, y, z); x = q[0]; y = q[1]; z = q[2]; }
    const px = (x - y) * C, py = (x + y) * S - z;
    this.bb(px, py);
    return [px, py];
  }

  /* всё, что рисуется внутри body, проходит через преобразование fn(x, y, z) */
  xf(fn, body) {
    const m = this.M;
    this.M = m ? (x, y, z) => { const q = fn(x, y, z); return m(q[0], q[1], q[2]); } : fn;
    body();
    this.M = m;
  }

  at(o, fill) {
    const k = o.stroke === undefined ? INK : o.stroke;
    let a = ` fill="${fill || 'none'}"`;
    if (k) a += ` stroke="${k}" stroke-width="${o.sw || INNER}"`;
    if (o.dash) a += ` stroke-dasharray="${o.dash}"`;
    if (o.off != null) a += ` stroke-dashoffset="${f(o.off)}"`;
    if (o.op != null) a += ` opacity="${f2(o.op)}"`;
    if (o.fo != null) a += ` fill-opacity="${f2(o.fo)}"`;
    if (o.so != null) a += ` stroke-opacity="${f2(o.so)}"`;
    return a;
  }

  d(pts, close) {
    let d = '';
    for (let i = 0; i < pts.length; i++) { const p = this.P(pts[i][0], pts[i][1], pts[i][2]); d += (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1]); }
    return close ? d + 'Z' : d;
  }

  raw(str) { this.el.push(str); }

  poly(pts, o = NO) {
    const close = o.close !== false;
    this.el.push(`<path d="${this.d(pts, close)}"${this.at(o, close ? (o.fill === undefined ? T1 : o.fill) : null)}/>`);
  }

  /* многоугольник с проёмом */
  holed(outer, hole, o = NO) {
    this.el.push(`<path fill-rule="evenodd" d="${this.d(outer, true)}${this.d(hole, true)}"${this.at(o, o.fill === undefined ? T1 : o.fill)}/>`);
  }

  line(a, b, o = NO) { this.el.push(`<path d="${this.d([a, b], false)}"${this.at(o, null)}/>`); }

  rx(x, y1, y2, z1, z2, o) { this.poly([[x, y1, z1], [x, y2, z1], [x, y2, z2], [x, y1, z2]], o); }
  ry(y, x1, x2, z1, z2, o) { this.poly([[x1, y, z1], [x2, y, z1], [x2, y, z2], [x1, y, z2]], o); }
  rz(z, x1, x2, y1, y2, o) { this.poly([[x1, y1, z], [x2, y1, z], [x2, y2, z], [x1, y2, z]], o); }

  /* мягкая тень на плоскости z */
  sh(z, x1, x2, y1, y2, op = .8) {
    let d = '';
    [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].forEach((q, i) => {
      const p = this.P(q[0], q[1], z);
      this.bb(p[0] - 22, p[1] - 14); this.bb(p[0] + 22, p[1] + 14);
      d += (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1]);
    });
    this.el.push(`<path d="${d}Z" fill="${SH}" opacity="${f2(op)}" filter="url(#sb-${this.id})"/>`);
    this.blur = true;
  }

  /* tones = [верх, правая грань, левая грань] */
  box(x, y, z, w, d, h, o = NO) {
    const t = o.tones || TONES, ow = o.sw || OUTER, q = { stroke: o.stroke, sw: Math.max(INNER, ow * .56), op: o.op, fo: o.fo, so: o.so };
    q.fill = t[2]; this.ry(y + d, x, x + w, z, z + h, q);
    q.fill = t[1]; this.rx(x + w, y, y + d, z, z + h, q);
    q.fill = t[0]; this.rz(z + h, x, x + w, y, y + d, q);
    this.poly([[x, y + d, z], [x + w, y + d, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h], [x, y + d, z + h]],
      { fill: null, stroke: o.stroke, sw: ow, op: o.op, so: o.so });
  }

  ell(x, y, z, r, o = NO) {
    const c = this.P(x, y, z), a = r * KC, b = r * KS;
    this.bb(c[0] - a, c[1] - b); this.bb(c[0] + a, c[1] + b);
    this.el.push(`<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(a)}" ry="${f(b)}"${this.at(o, o.fill === undefined ? T1 : o.fill)}/>`);
  }

  /* передняя полуокружность на высоте z */
  arc(x, y, z, r, o = NO) {
    const c = this.P(x, y, z), a = r * KC, b = r * KS;
    this.el.push(`<path d="M${f(c[0] - a)} ${f(c[1])}A${f(a)} ${f(b)} 0 0 0 ${f(c[0] + a)} ${f(c[1])}"${this.at(o, null)}/>`);
  }

  /* дуга окружности в горизонтальной плоскости, от угла a0 до a1 */
  arcH(x, y, z, r, a0, a1, o = NO) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / .14)), pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([x + r * Math.cos(a), y + r * Math.sin(a), z]); }
    this.el.push(`<path d="${this.d(pts, false)}"${this.at(o, null)}/>`);
  }

  /* усечённый конус: r0 внизу, r1 вверху (цилиндр при r0 = r1) */
  cone(x, y, z, r0, r1, h, o = NO) {
    const t = o.tones || CT, ow = o.sw || OUTER;
    const c0 = this.P(x, y, z), c1 = this.P(x, y, z + h), a0 = r0 * KC, b0 = r0 * KS, a1 = r1 * KC, b1 = r1 * KS;
    this.bb(c0[0] - a0, c0[1] + b0); this.bb(c0[0] + a0, c1[1] - b1);
    const side = `M${f(c1[0] - a1)} ${f(c1[1])}L${f(c0[0] - a0)} ${f(c0[1])}A${f(a0)} ${f(b0)} 0 0 0 ${f(c0[0] + a0)} ${f(c0[1])}L${f(c1[0] + a1)} ${f(c1[1])}`;
    this.el.push(`<path d="${side}Z"${this.at({ stroke: null, op: o.op, fo: o.fo }, t[1])}/>`);
    this.ell(x, y, z + h, r1, { fill: t[0], stroke: o.stroke, sw: Math.max(INNER, ow * .56), op: o.op, fo: o.fo, so: o.so });
    this.el.push(`<path d="${side}A${f(a1)} ${f(b1)} 0 0 0 ${f(c1[0] - a1)} ${f(c1[1])}Z"${this.at({ stroke: o.stroke, sw: ow, op: o.op, so: o.so }, null)}/>`);
  }

  cyl(x, y, z, r, h, o) { this.cone(x, y, z, r, r, h, o); }

  /* винтовая линия на цилиндре — видна только обращённая к зрителю часть */
  helix(x, y, z0, z1, r, a0, turn, o = NO) {
    let d = '', pen = false;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, a = a0 + turn * t;
      if (Math.cos(a) + Math.sin(a) > 0) { const p = this.P(x + r * Math.cos(a), y + r * Math.sin(a), lerp(z0, z1, t)); d += (pen ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1]); pen = true; } else pen = false;
    }
    if (d) this.el.push(`<path d="${d}"${this.at(o, null)}/>`);
  }

  /* окружность на грани x = const */
  ringX(x, y, z, r, o) {
    const pts = [];
    for (let i = 0; i < 28; i++) pts.push([x, y + r * Math.cos(TAU * i / 28), z + r * Math.sin(TAU * i / 28)]);
    this.poly(pts, o);
  }

  /* окружность на грани y = const */
  ringY(y, x, z, r, o) {
    const pts = [];
    for (let i = 0; i < 28; i++) pts.push([x + r * Math.cos(TAU * i / 28), y, z + r * Math.sin(TAU * i / 28)]);
    this.poly(pts, o);
  }

  /* плоские накладки (в координатах листа) */
  dot(p, r = 3, o = NO) {
    const c = this.P(p[0], p[1], p[2]);
    this.el.push(`<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${r}"${this.at({ stroke: o.stroke || null, sw: o.sw, op: o.op }, o.fill === undefined ? INK : o.fill)}/>`);
  }

  label(p, text, o = NO) {
    const c = this.P(p[0], p[1], p[2]), x = c[0] + (o.dx || 0), y = c[1] + (o.dy || 0), sz = o.size || 13;
    this.bb(x - sz, y - sz); this.bb(x + sz, y + sz / 2);
    this.el.push(`<text x="${f(x)}" y="${f(y)}" font-family="${FONT}" font-size="${sz}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'middle'}"${o.op != null ? ` opacity="${f2(o.op)}"` : ''}>${text}</text>`);
  }

  bubble(x, y, n, cr, fs, hot, op) {
    this.bb(x - cr - 2, y - cr - 2); this.bb(x + cr + 2, y + cr + 2);
    const a = op != null ? ` opacity="${f2(op)}"` : '';
    this.el.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${cr}" fill="${hot ? ACC : T1}" stroke="${hot ? ACC : INK}" stroke-width="1"${a}/>` +
      `<text x="${f(x)}" y="${f(y + fs * .35)}" font-family="${FONT}" font-size="${fs}" fill="${hot ? T1 : INK}" text-anchor="middle"${a}>${n}</text>`);
  }

  /* горизонтальная выноска от тела вращения */
  callout(x, y, z, r, n, xe, cr = 12, fs = 12, hot = false, op = null) {
    const c = this.P(x, y, z), xs = c[0] + r * KC + 4, k = hot ? ACC : INK, a = op != null ? ` opacity="${f2(op)}"` : '';
    this.el.push(`<path d="M${f(xs)} ${f(c[1])}L${f(xe)} ${f(c[1])}" fill="none" stroke="${hot ? ACC : GR}" stroke-width="1"${a}/><circle cx="${f(xs)}" cy="${f(c[1])}" r="2.4" fill="${k}"${a}/>`);
    this.bubble(xe + cr, c[1], n, cr, fs, hot, op);
  }

  /* выноска с номером позиции от произвольной точки */
  tag(p, n, dx, dy, op, cr = 15, fs = 15) {
    const c = this.P(p[0], p[1], p[2]), xe = c[0] + dx, ye = c[1] + dy, ln = Math.hypot(dx, dy), a = op != null ? ` opacity="${f2(op)}"` : '';
    this.el.push(`<path d="M${f(c[0])} ${f(c[1])}L${f(xe - dx / ln * cr)} ${f(ye - dy / ln * cr)}" fill="none" stroke="${INK}" stroke-width="1"${a}/><circle cx="${f(c[0])}" cy="${f(c[1])}" r="2.6" fill="${INK}"${a}/>`);
    this.bubble(xe, ye, n, cr, fs, false, op);
  }

  html() {
    return (this.blur ? `<defs><filter id="sb-${this.id}" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="${f(this.sd)}"/></filter></defs>` : '') +
      '<g stroke-linejoin="round" stroke-linecap="round">' + this.el.join('') + '</g>';
  }
}

const SCENES = {};

/* ══════════════════ Рис. 2. Поставка: груз на стропах — маятник под тележкой крана ══════════════════
   Модель: θ'' = −(g/L)·sin θ − (a/L)·cos θ − 2(L'/L)·θ' − c·θ',  a — ускорение тележки, c растёт с размахом.
   Курсор по горизонтали ведёт тележку, по вертикали — выбирает длину подвеса; за крюком тянется след.
   Зажатая кнопка мыши опускает груз на отмеченное место: видно, насколько он промахнулся.
   1 единица рисунка = 1 см. */
SCENES.delivery = {
  pad: 22,
  init: () => ({ xt: 0, vt: 0, at: 0, th: 0, om: 0, L: 3.2, tr: [], tt: 0, land: false, off: 0 }),
  room(s) { const p = s.P(110, 90, 430); s.bb(p[0] - 330, p[1]); s.bb(p[0] + 330, p[1]); },
  step(st, dt, ptr) {
    const set = ptr.in && ptr.down;                                       // кнопка зажата — посадка груза
    const tx = set ? st.xt : ptr.in ? clamp((ptr.x - 20 * C) / KC, -60, 60) / 100 : 0;
    const tL = set ? 3.3 : ptr.in ? lerp(2.3, 3.2, clamp((ptr.zv - .22) / .56, 0, 1)) : 3.2;
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = clamp(16 * (tx - st.xt) - 8 * st.vt, -.9, .9);          // привод тележки с ограничением ускорения
      st.vt += a * h; st.xt += st.vt * h;
      const vL = clamp(4 * (tL - st.L), -.45, set && st.L > 3.2 ? .16 : .45);   // подъём; последние сантиметры до пола — медленно
      st.L += vL * h;
      const down = st.L >= 3.297;
      if (down && !st.land) st.off = (st.xt + st.L * Math.sin(st.th)) * 100;   // момент касания: промах, см
      st.land = down;
      if (down) st.om = 0;                                              // груз стоит на полу
      else {
        const c = (ptr.in ? .22 : 1.6) + 14 * (st.th * st.th + st.om * st.om * st.L / 9.81);   // сопротивление растёт с размахом; без курсора груз успокаивают
        st.om += (-(9.81 / st.L) * Math.sin(st.th) - (a / st.L) * Math.cos(st.th) - 2 * (vL / st.L) * st.om - c * st.om) * h;
        st.th += st.om * h;
      }
      st.at = a;
    }
    st.tt += dt;
    if (st.tt > .04) {                                                  // след крюка
      st.tt = 0;
      const rz = 318 + (3.2 - st.L) * 100 - 430, sn = Math.sin(-st.th), ox = st.xt * 100 * U;
      st.tr.push([110 + ox + U * rz * sn, 90 - ox - U * rz * sn, 430 + rz * Math.cos(st.th)]);
      if (st.tr.length > 34) st.tr.shift();
    }
    const busy = Math.abs(st.th) > 1.2e-3 || Math.abs(st.om) > 1.2e-3 || Math.abs(st.xt - tx) > 1e-3 || Math.abs(st.vt) > 1e-3 || Math.abs(st.L - tL) > 2e-3;
    if (!ptr.in && !busy) { st.th = st.om = st.xt = st.vt = st.at = 0; st.L = 3.2; st.tr.length = 0; }
    return busy;
  },
  draw(s, st) {
    const Zp = 430, lift = (3.2 - st.L) * 100, ox = st.xt * 100 * U, oy = -ox;
    const sn = Math.sin(-st.th), cs = Math.cos(-st.th);
    /* поворот вокруг оси (1,1,0)/√2 через точку подвеса: груз качается в плоскости листа */
    const M = (x, y, z) => {
      const rx = x - 110, ry = y - 90, rz = z + lift - Zp, ar = (rx + ry) * .5 * (1 - cs);
      return [110 + ox + rx * cs + U * rz * sn + ar, 90 + oy + ry * cs - U * rz * sn + ar, Zp + rz * cs + U * (ry - rx) * sn];
    };
    const d = (st.xt + st.L * Math.sin(st.th)) * 100 * U, good = st.land && Math.abs(st.off) <= 5;
    s.sh(0, d, 240 + d, 22 - d, 200 - d, .8 - lift / 90 * .3);
    for (const [x, y, ax, ay] of [[-12, -12, 1, 1], [232, -12, -1, 1], [-12, 192, 1, -1], [232, 192, -1, -1]])   // место установки
      s.poly([[x + 26 * ax, y, 0], [x, y, 0], [x, y + 26 * ay, 0]], { close: false, stroke: ACC, sw: good ? 2.4 : 1.2 });
    if (st.tr.length > 2) s.poly(st.tr, { close: false, stroke: ACC, sw: 1, op: .42 });

    s.xf(M, () => {
      for (const y of [0, 78, 156]) s.box(0, y, 0, 220, 24, 16);          // лыжи поддона
      s.box(0, 0, 16, 220, 180, 8);                                       // настил
      s.box(10, 10, 24, 200, 160, 150);                                   // ящик
      for (let x = 50; x < 210; x += 40) {                                // доски
        s.line([x, 170, 24], [x, 170, 174], { sw: FINE, stroke: GR });
        s.line([x, 10, 174], [x, 170, 174], { sw: FINE, stroke: GR });
      }
      for (let y = 50; y < 170; y += 40) s.line([210, y, 24], [210, y, 174], { sw: FINE, stroke: GR });
      for (const z of [38, 160]) {                                        // пояса обвязки
        s.line([10, 170, z], [210, 170, z], { sw: FINE });
        s.line([210, 170, z], [210, 10, z], { sw: FINE });
      }
      s.line([10, 170, 38], [210, 170, 160]);                             // раскосы
      s.line([210, 170, 38], [210, 10, 160]);
      s.ry(170, 24, 86, 110, 150, { fill: T1, sw: FINE });                // ярлык
      for (const [z, x2] of [[140, 78], [132, 64], [124, 72]]) s.line([31, 170, z], [x2, 170, z], { sw: FINE, stroke: GR });
      for (const x of [154, 180]) {                                       // маркировка «верх»
        s.line([x, 170, 50], [x, 170, 86], { sw: 1.5 });
        s.poly([[x - 8, 170, 76], [x, 170, 88], [x + 8, 170, 76]], { close: false, sw: 1.5 });
      }
      s.ringX(210, 60, 98, 13, { fill: null, sw: 1.2 });                  // знак центра тяжести
      s.line([210, 42, 98], [210, 78, 98], { sw: 1 });
      s.line([210, 60, 80], [210, 60, 116], { sw: 1 });
      const hook = [110, 90, 318];
      for (const c of [[10, 10, 174], [210, 10, 174], [10, 170, 174], [210, 170, 174]]) { s.line(c, hook, { stroke: ACC, sw: 1.5 }); s.dot(c, 3, { fill: ACC }); }
      s.line(hook, [110, 90, Zp - lift], { sw: 2 });                      // канат
      s.dot(hook, 7, { fill: T1, stroke: INK, sw: 1.5 });
    });

    /* балка и тележка крана — вид вдоль листа */
    const c0 = s.P(110, 90, Zp), cp = s.P(110 + ox, 90 + oy, Zp), X0 = c0[0], Y0 = c0[1], px = cp[0];
    s.bb(X0 - 124, Y0 - 40); s.bb(X0 + 124, Y0 + 4);
    let g = '';
    for (let k = -4; k <= 4; k++) g += `M${f(X0 + k * 24.5)} ${f(Y0 - 38)}v${k ? 4 : 7}`;
    s.raw(`<path d="${g}" fill="none" stroke="${GR}" stroke-width="${FINE}"/>` +
      `<rect x="${f(X0 - 120)}" y="${f(Y0 - 30)}" width="240" height="14" fill="${T2}" stroke="${INK}" stroke-width="${OUTER}"/>` +
      `<path d="M${f(X0 - 120)} ${f(Y0 - 26)}h240M${f(X0 - 120)} ${f(Y0 - 20)}h240" fill="none" stroke="${INK}" stroke-width="${FINE}"/>` +
      `<rect x="${f(px - 22)}" y="${f(Y0 - 16)}" width="44" height="13" fill="${T1}" stroke="${INK}" stroke-width="1.2"/>` +
      `<circle cx="${f(px - 13)}" cy="${f(Y0 - 16)}" r="4.5" fill="${T1}" stroke="${INK}" stroke-width="1"/><circle cx="${f(px + 13)}" cy="${f(Y0 - 16)}" r="4.5" fill="${T1}" stroke="${INK}" stroke-width="1"/>` +
      `<circle cx="${f(px)}" cy="${f(Y0)}" r="3.2" fill="${INK}"/>`);
  },
  read(st, live) {
    const T = TAU * Math.sqrt(st.L / 9.81), miss = Math.abs(st.off);
    const N = Math.cos(st.th) + st.L * st.om * st.om / 9.81 - st.at / 9.81 * Math.sin(st.th);     // натяжение каната в долях веса
    const out = [`L ${num(st.L, 1)} м`, `T = 2π√(L/g) = ${num(T, 1)} с`, `θ ${sgn(st.th * 180 / Math.PI, 1)}°`];
    if (st.land) out.push(`груз на месте, промах ${num(miss)} см${miss <= 5 ? ' ✓' : ''}`);
    else { out.push(`на ветвь стропа ${num(N * .3345, 2)} G`); if (live && HOVER) out.push('зажмите кнопку — посадка'); }
    return out;
  }
};

/* ══════════════════ Рис. 3. Монтаж: выверка станка по уровню ══════════════════
   Курсор «нажимает» на край станка; уклон читается двумя уровнями с ценой деления 0,02 мм/м.
   Пузырёк уходит к приподнятому краю и упирается в конец ампулы за пределами ±5 делений.
   Станок стоит на виброопорах: на быстрое движение и на щелчок он отвечает затухающим покачиванием.
   Наклон на рисунке увеличен, числа — в мм/м и угловых секундах (1 мм/м = 206″). */
SCENES.install = {
  taps: [2.2, 4.4],
  init: () => ({ tx: 0, ty: 0, vx: 0, vy: 0, on: 0 }),
  step(st, dt, ptr) {
    let gx = 0, gy = 0, ux = 1, uy = 0;
    if (ptr.in) {
      const dx = ptr.x - 5 * C, dy = ptr.y - 43.5;                        // от центра стола
      const wx = (dx / C + dy / S) / 2, wy = (dy / S - dx / C) / 2, r = Math.hypot(wx, wy);
      const m = .5 * Math.pow(clamp(r / 200, 0, 1), 1.8);
      if (r > 1e-6) { ux = wx / r; uy = wy / r; gx = -m * ux; gy = -m * uy; }
    }
    if (ptr.hit) { st.vx -= 2.6 * ux; st.vy -= 2.6 * uy; }                // щелчок — толчок со стороны курсора
    const n = Math.max(1, Math.ceil(dt / .01)), h = dt / n;
    for (let i = 0; i < n; i++) {                                         // пружина с демпфером: ω = 14 1/с, ζ = 0,28
      st.vx += (196 * (gx - st.tx) - 7.8 * st.vx) * h; st.tx += st.vx * h;
      st.vy += (196 * (gy - st.ty) - 7.8 * st.vy) * h; st.ty += st.vy * h;
    }
    st.on = ease(st.on, ptr.in ? 1 : 0, dt, 7);
    const busy = Math.abs(st.tx - gx) > 4e-4 || Math.abs(st.ty - gy) > 4e-4 || Math.abs(st.vx) > 4e-3 || Math.abs(st.vy) > 4e-3 || Math.abs(st.on - (ptr.in ? 1 : 0)) > .01;
    if (!busy) { st.tx = gx; st.ty = gy; st.vx = st.vy = 0; st.on = ptr.in ? 1 : 0; }
    return busy;
  },
  draw(s, st) {
    const sx = st.tx * .12, sy = st.ty * .12;                             // наклон на рисунке, рад
    const T = (x, y, z) => [x - sx * (z - 28), y - sy * (z - 28), z + sx * (x - 150) + sy * (y - 110)];
    const div = v => clamp(v / .02, -5.3, 5.3) * 3;                       // смещение пузырька
    const ok = st.on > .5 && Math.abs(st.tx) <= .02 && Math.abs(st.ty) <= .02, vial = { sw: ok ? 1.2 : FINE, stroke: ok ? ACC : INK };

    s.sh(0, -30, 356, -10, 284);
    s.box(-40, -40, 0, 380, 300, 16);                                     // фундаментная плита
    const ax = { stroke: ACC, sw: 1.1, dash: '7 3 1.5 3' };               // оси выверки
    s.line([-84, 110, 16], [384, 110, 16], ax);
    s.line([150, -84, 16], [150, 304, 16], ax);
    for (const p of [[-84, 110, 16], [384, 110, 16], [150, -84, 16], [150, 304, 16]]) s.dot(p, 5.5, { fill: ok ? ACC : T1, stroke: ACC, sw: 1.2 });
    for (const [x, y] of [[-18, -18], [318, -18], [-18, 238], [318, 238]]) s.cyl(x, y, 16, 5, 7, { tones: [INK, INK], sw: 1 });   // анкеры
    for (const [x, y] of [[18, 18], [282, 18], [18, 202], [282, 202]]) s.cyl(x, y, 16, 17, 12);                                   // виброопоры

    s.xf(T, () => {
      s.box(0, 0, 28, 300, 220, 58);                                      // станина
      s.box(100, 0, 86, 100, 70, 200);                                    // колонна
      for (let z = 236; z < 276; z += 10) s.line([200, 14, z], [200, 56, z], { sw: FINE });
      s.box(40, 90, 86, 220, 110, 18);                                    // стол
      for (let y = 112; y < 200; y += 22) s.line([40, y, 104], [260, y, 104], { sw: FINE, stroke: GR });
      s.box(60, 150, 104, 70, 12, 9, { sw: 1.2 });                        // уровень вдоль X
      s.rz(113, 74, 116, 153.5, 158.5, vial);
      for (const x of [88, 102]) s.line([x, 153.5, 113], [x, 158.5, 113], { sw: FINE });
      const xb = 95 + div(st.tx);
      s.rz(113, xb - 5, xb + 5, 154.3, 157.7, { fill: ACC, stroke: null });
      s.box(214, 100, 104, 12, 70, 9, { sw: 1.2 });                       // уровень вдоль Y
      s.rz(113, 217.5, 222.5, 114, 156, vial);
      for (const y of [128, 142]) s.line([217.5, y, 113], [222.5, y, 113], { sw: FINE });
      const yb = 135 + div(st.ty);
      s.rz(113, 218.3, 221.7, yb - 5, yb + 5, { fill: ACC, stroke: null });
      s.line([150, 118, 166], [150, 118, 142], { stroke: ACC, sw: 2.4 });  // инструмент
      s.cyl(150, 118, 166, 13, 30);                                       // шпиндель
      s.box(112, 70, 196, 76, 62, 66);                                    // шпиндельная бабка
      s.line([112, 132, 212], [188, 132, 212], { sw: FINE });
    });

    /* на сколько поднять или опустить каждую опору, мм */
    if (st.on > .02) for (const [x, y, p, dx, dy, an] of [[282, 18, [340, -40, 16], 14, 7, 'start'], [18, 202, [-40, 260, 16], -14, 7, 'end'], [282, 202, [340, 260, 0], 0, 34, 'middle']])
      s.label(p, sgn(-(st.tx * (x - 150) + st.ty * (y - 110)) / 100, 2) + ' мм', { dx, dy, size: 21, anchor: an, op: st.on });
  },
  read(st, live) {
    const sec = v => Math.round(Math.abs(v) * 206.265), ok = Math.abs(st.tx) <= .02 && Math.abs(st.ty) <= .02;
    const out = [`X ${sgn(st.tx, 2)} мм/м (${sec(st.tx)}″)`, `Y ${sgn(st.ty, 2)} мм/м (${sec(st.ty)}″)`, ok ? '✓ в пределах деления 0,02 мм/м' : 'цена деления 0,02 мм/м'];
    if (live && HOVER) out.push('щелчок — толчок');
    return out;
  }
};

/* ══════════════════ Рис. 4. Сервис: шпиндельный узел в разнесённом виде ══════════════════
   Шпиндель — маховик: его поверхность идёт за курсором, проведённым поперёк оси, дальше он вращается по инерции.
   По вертикали курсор выбирает деталь; щелчок собирает узел и разносит его обратно.
   Шарики идут со скоростью сепаратора ≈ 0,42·n; ресурс подшипника L10h = (C/P)³·10⁶/(60·n), C/P = 16.
   В описании детали: [низ, верх, название, сдвиг при сборке]. */
const PARTS = [null, [0, 46, 'инструмент', 50], [72, 141, 'оправка', 20], [178, 192, 'радиально-упорный подшипник', 2], [226, 240, 'радиально-упорный подшипник', -30], [278, 402, 'корпус шпинделя', -100], [432, 524, 'электродвигатель', -130]];
SCENES.service = {
  taps: [2.6, 5.2],
  init: () => ({ n: 0, phi: .6, phc: .2, hot: 0, e: 1, et: 1 }),
  step(st, dt, ptr) {
    if (ptr.hit) st.et = st.et ? 0 : 1;                                   // щелчок — собрать или разнести
    if (!ptr.in) st.et = 1;
    st.e = ease(st.e, st.et, dt, 6); if (Math.abs(st.e - st.et) < .002) st.e = st.et;
    let hot = 0;
    if (ptr.in && Math.abs(ptr.x) < 190) {
      let best = 24;
      for (let i = 1; i <= 6; i++) { const sh = (1 - st.e) * PARTS[i][3], a = PARTS[i][0] + sh, b = PARTS[i][1] + sh, z = -ptr.y, dist = z < a ? a - z : z > b ? z - b : 0; if (dist < best) { best = dist; hot = i; } }
    }
    st.hot = hot;
    if (ptr.in && Math.abs(ptr.x) < 170 && Math.abs(ptr.vx) > 14) st.n = ease(st.n, clamp(-ptr.vx * 11.1, -12000, 12000), dt, 9);   // поверхность идёт за курсором
    else { st.n = ease(st.n, 0, dt, ptr.in ? .4 : 1.3); if (Math.abs(st.n) < 25) st.n = 0; }                                         // выбег
    const w = st.n / 12000 * 22;                                          // вращение показано замедленно
    st.phi = (st.phi + w * dt) % TAU; st.phc = (st.phc + .42 * w * dt) % TAU;
    return st.n !== 0 || st.e !== st.et || st.e !== 1;
  },
  draw(s, st) {
    const hot = st.hot || 3, q = 1 - st.e, k = i => hot === i ? ACC : INK, o = i => ({ stroke: k(i), sw: hot === i ? 1.9 : OUTER }), Z = i => q * PARTS[i][3];
    s.line([0, 0, -24 + q * 50], [0, 0, 552 - q * 130], { stroke: ACC, sw: 1, dash: '8 4 1.5 4' });
    let z = Z(1);
    s.cyl(0, 0, z, 6, 46, o(1));                                          // 1 — инструмент
    for (const a of [st.phi, st.phi + Math.PI]) s.helix(0, 0, z + 3, z + 43, 6, a, 2.3, { stroke: k(1), sw: FINE });
    z = Z(2);
    s.cyl(0, 0, 72 + z, 13, 20, o(2));                                    // 2 — оправка
    s.cyl(0, 0, 92 + z, 27, 11, o(2));
    for (const a of [st.phi, st.phi + Math.PI]) s.line([19 * Math.cos(a), 19 * Math.sin(a), 103 + z], [27 * Math.cos(a), 27 * Math.sin(a), 103 + z], { stroke: k(2), sw: 1.5 });
    s.cone(0, 0, 103 + z, 19, 10, 30, o(2));
    s.cyl(0, 0, 133 + z, 5, 8, o(2));
    for (const [i, zb] of [[3, 178], [4, 226]]) {                          // 3, 4 — подшипники
      z = zb + Z(i);
      s.cyl(0, 0, z, 40, 14, o(i));
      s.ell(0, 0, z + 14, 24, { fill: T2, stroke: k(i), sw: hot === i ? 1.4 : INNER });
      for (let b = 0; b < 9; b++) { const a = st.phc + b * TAU / 9; s.dot([32 * Math.cos(a), 32 * Math.sin(a), z + 14], 5.4, { fill: T1, stroke: k(i), sw: FINE }); }
    }
    z = Z(5);
    s.cyl(0, 0, 278 + z, 66, 14, o(5));                                   // 5 — корпус
    s.cyl(0, 0, 292 + z, 52, 110, o(5));
    for (const a of [318, 332]) s.arc(0, 0, a + z, 52, { sw: FINE, stroke: GR });
    z = Z(6);
    s.cyl(0, 0, 432 + z, 44, 78, o(6));                                   // 6 — двигатель
    for (let a = 444; a < 504; a += 10) s.arc(0, 0, a + z, 44, { sw: FINE, stroke: GR });
    s.cyl(0, 0, 510 + z, 12, 14, o(6));
    s.line([0, 0, 524 + z], [12 * Math.cos(st.phi), 12 * Math.sin(st.phi), 524 + z], { stroke: k(6), sw: 1.5 });
    [[23, 6], [97, 27], [185, 40], [233, 40], [347, 52], [471, 44]].forEach(([zc, r], i) => {
      const op = i === 2 || i === 3 ? clamp(st.e * 2.5 - 1.2, 0, 1) : 1;      // подшипники в собранном узле спрятаны
      if (op > .02) s.callout(0, 0, zc + Z(i + 1), r, i + 1, 122, 17, 17, hot === i + 1, op < 1 ? op : null);
    });
  },
  read(st, live) {
    const n = round(Math.abs(st.n), 100), out = [];
    if (st.hot) out.push(`${st.hot} — ${PARTS[st.hot][2]}`);
    if (live && n < 200) out.push(HOVER ? 'проведите курсором поперёк оси — шпиндель раскрутится' : 'шпиндель раскручивается');
    else out.push(`n ${grp(n)} об/мин`, `сепаратор ${grp(round(.42 * n, 10))} об/мин`, n ? `ресурс L10 ${grp(round(4096e6 / (60 * n), 100))} ч` : 'ресурс L10 —');
    if (live && HOVER) out.push(st.et ? 'щелчок — собрать узел' : 'щелчок — разнести');
    return out;
  }
};

/* ══════════════════ Рис. 5. Инжиниринг: поток деталей через участок ══════════════════
   Четыре операции с разным временем цикла; курсор по горизонтали задаёт такт запуска деталей.
   Выпуск = min(1/такт, 1/цикл узкого места): перед самой долгой операцией копится очередь.
   Курсор над станком останавливает его — видно, как простой запирает поток. Щелчок запускает срочную партию.
   1 секунда на экране = 5 минут на участке. */
const STN = [136, 286, 446, 786], CYC = [1.4, 2, 3.2, 1.8], GAP = 20, RLEN = 796;
const MCH = [[90, 75, 40], [240, 75, 40], [400, 78, 34], [225, 280, 20]];           // середины станков четырёх операций
const rpos = q => q <= 498 ? [-46 + q, 178] : q <= 636 ? [452, q - 320] : [1088 - q, 316];
function flow(st, dt, takt, halt) {
  const T = st.tok, free = !T.length || T[T.length - 1].s > GAP;
  st.next -= dt;
  if (st.burst > 0) { st.next = Math.max(st.next, 0); if (free) { T.push({ s: 0, k: 0, w: 0, q: false }); st.burst--; } }
  else if (st.next <= 0) { if (free) { T.push({ s: 0, k: 0, w: 0, q: false }); st.next = Math.max(0, st.next + takt); } else st.next = 0; }
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.w > 0) { if (t.k !== halt) { t.w -= dt; if (t.w <= 0) { t.w = 0; t.k++; } } continue; }
    const stop = t.k < 4 ? STN[t.k] : RLEN + 30, lead = i ? T[i - 1].s - GAP : 1e9, lim = Math.min(stop, lead);
    if (lim > t.s) t.s = Math.min(t.s + 170 * dt, lim);
    t.q = lead < stop && lead - t.s < .5;                                  // стоит в очереди
    if (t.k < 4 && t.s >= STN[t.k] - .01) t.w = CYC[t.k];
  }
  while (T.length && T[0].s >= RLEN + 29) T.shift();
}
SCENES.layout = {
  taps: [1.5],
  init() { const st = { tok: [], next: 0, takt: 2.6, burst: 0, halt: -1, t: 0 }; for (let i = 0; i < 640; i++) flow(st, .05, 2.6, -1); return st; },
  step(st, dt, ptr) {
    if (!ptr.in) { st.halt = -1; return false; }
    let hot = -1, best = 46;
    MCH.forEach((m, k) => { const d = Math.hypot(ptr.x - (m[0] - m[1]) * C, ptr.y - (m[0] + m[1]) * S + m[2]); if (d < best) { best = d; hot = k; } });
    st.halt = hot;
    if (ptr.hit) st.burst = 3;
    st.takt = ease(st.takt, lerp(1.4, 4.6, clamp((ptr.zu - .12) / .76, 0, 1)), dt, 8);
    st.t += dt;
    flow(st, dt, st.takt, hot);
    return true;
  },
  draw(s, st) {
    const W = 520, D = 360, T = st.tok, OFF = { tones: [TS, T2, TS], stroke: GR };
    const busy = k => T.some(t => t.w > 0 && t.k === k), body = k => st.halt === k ? OFF : NO;
    const lamp = (x, y, z, k) => s.cyl(x, y, z, 5, 9, (st.halt === k ? Math.sin(st.t * 10) > 0 : busy(k)) ? { tones: [A1, A2], stroke: AK, sw: 1.1 } : { sw: 1.1 });
    const tok = t => { const p = rpos(t.s); s.box(p[0] - 7, p[1] - 7, 0, 14, 14, 9, { tones: BRZ, stroke: AK, sw: 1.1, op: t.s > RLEN ? clamp(1 - (t.s - RLEN) / 26, 0, 1) : undefined }); };

    s.sh(-20, 14, W + 10, 18, D + 10);
    s.box(-8, -8, 0, W + 8, 8, 34);                                       // стены, в левой — ворота
    s.box(-8, 0, 0, 8, 150, 34);
    s.box(-8, 206, 0, 8, 154, 34);
    s.rz(0, 0, W, 0, D, { fill: '#fcfcfb', sw: OUTER });
    for (let x = 40; x < W; x += 40) s.line([x, 0, 0], [x, D, 0], { stroke: '#e7e5df', sw: FINE });
    for (let y = 40; y < D; y += 40) s.line([0, y, 0], [W, y, 0], { stroke: '#e7e5df', sw: FINE });
    s.poly([[-46, 178, 0], [452, 178, 0], [452, 316, 0], [296, 316, 0]], { close: false, stroke: ACC, sw: 1.7, dash: '7 5' });   // маршрут
    s.poly([[280, 316, 0], [300, 307, 0], [300, 325, 0]], { fill: ACC, stroke: null });
    s.dot([-46, 178, 0], 4, { fill: ACC });
    for (const q of STN) { const p = rpos(q); s.ell(p[0], p[1], 0, 11, { stroke: ACC, sw: 1.1 }); }                             // места операций

    s.box(40, 40, 0, 100, 70, 58, body(0)); s.box(62, 54, 58, 40, 40, 22, body(0)); lamp(126, 98, 58, 0);                       // дальний ряд
    s.box(190, 40, 0, 100, 70, 58, body(1)); s.box(212, 54, 58, 40, 40, 22, body(1)); lamp(276, 98, 58, 1);
    s.box(340, 40, 0, 120, 76, 68, body(2)); lamp(446, 104, 68, 2);
    s.box(474, 20, 0, 30, 120, 104);                                      // стеллаж
    for (const z of [26, 52, 78]) s.line([474, 140, z], [504, 140, z], { sw: FINE });
    for (let i = T.length - 1; i >= 0; i--) if (T[i].s <= 498) tok(T[i]);
    s.box(40, 236, 0, 90, 90, 46); s.cyl(85, 281, 46, 22, 30);            // ближний ряд
    s.box(180, 250, 0, 90, 60, 40, body(3)); lamp(258, 298, 40, 3);
    T.filter(t => t.s > 498).sort((a, b) => { const p = rpos(a.s), q = rpos(b.s); return p[0] + p[1] - q[0] - q[1]; }).forEach(tok);
  },
  read(st, live) {
    const tm = st.takt * 5, h = st.halt, q = st.tok.filter(t => t.k === (h < 0 ? 2 : h) && t.q).length;
    const out = [`такт запуска ${num(tm)} мин`, `выпуск ${num(h < 0 ? 60 / Math.max(tm, 16) : 0, 1)} шт/ч`,
      h >= 0 ? `станок ${h + 1} остановлен — поток заперт` : tm < 15.95 ? 'узкое место — операция 3 (16 мин)' : 'поток без очереди', `очередь ${q} шт`];
    if (live && HOVER && h < 0) out.push('щелчок — срочная партия');
    return out;
  }
};

/* ══════════════════ Рис. 6. ПО: данные со станков и общая эффективность оборудования ══════════════════
   Курсор рядом со станком или его узлом сети останавливает станок.  OEE = A × P × Q: готовность × производительность × качество.
   Курсор над графиком на панели показывает значение в этой точке; щелчок опрашивает все станки разом. */
const NODES = [[70, 55], [210, 55], [70, 155], [210, 155]], HUB = [140, 105];
SCENES.software = {
  taps: [2.4, 5],
  init() {
    const st = { stop: [0, 0, 0, 0], pk: [], em: [0, .22, .44, .66], t: 0, smp: 0, hist: [], load: [.82, .93, .74, .88], A: 1, P: .92, Q: .98, scrub: -1, rip: 0 };
    for (let i = 0; i < 16; i++) st.hist.push(.9 + .012 * Math.sin(i * 1.7));
    return st;
  },
  step(st, dt, ptr) {
    let hot = -1, scrub = -1;
    if (ptr.in) {
      const a = ptr.x / C, b = (ptr.y + 240) / S, wx = (a + b) / 2, wy = (b - a) / 2;      // курсор на плоскости панели
      if (wx >= 0 && wx <= 300 && wy >= 0 && wy <= 220) { if (wx >= 14 && wx <= 184 && wy >= 14 && wy <= 108) scrub = clamp(Math.round((wx - 24) / 10), 0, 15); }
      else {
        let best = 56;
        NODES.forEach((n, k) => { for (const z of [16, 120]) { const d = Math.hypot(ptr.x - (n[0] - n[1]) * C, ptr.y - (n[0] + n[1]) * S + z); if (d < best) { best = d; hot = k; } } });
      }
    }
    st.scrub = scrub; st.t += dt;
    if (ptr.hit) { st.rip = 1; for (let k = 0; k < 4; k++) if (st.stop[k] < .5) st.pk.push({ k, t: 0 }); }     // опрос станков
    if (st.rip > 0) st.rip = Math.max(0, st.rip - dt * 1.3);
    let run = 0;
    for (let k = 0; k < 4; k++) { st.stop[k] = ease(st.stop[k], k === hot ? 1 : 0, dt, 7); if (k !== hot && st.stop[k] < .004) st.stop[k] = 0; run += 1 - st.stop[k]; }
    st.A = run / 4; st.P = .92 + .015 * Math.sin(st.t * 1.3);
    if (ptr.in) for (let k = 0; k < 4; k++) { st.em[k] -= dt; if (st.em[k] <= 0) { st.em[k] += .85; if (st.stop[k] < .5) st.pk.push({ k, t: 0 }); } }
    for (const p of st.pk) p.t += dt * 1.7;
    st.pk = st.pk.filter(p => p.t < 3);
    st.smp += dt;
    if (st.smp > .2) { st.smp = 0; st.hist.push(st.A * st.P * st.Q); st.hist.shift(); }
    return st.pk.length > 0 || st.rip > 0 || st.stop.some(v => v > 0);
  },
  draw(s, st) {
    const W = 300, D = 220, off = k => st.stop[k] > .5, oee = st.A * st.P * st.Q;
    const cy = v => 96 - 66 * clamp((v - .45) / .5, 0, 1);
    s.sh(-36, 16, W + 6, 18, D + 8);
    s.rz(0, 0, W, 0, D, { sw: OUTER });                                   // уровень станков
    NODES.forEach(([x, y], k) => {
      s.box(x - 40, y - 25, 0, 80, 50, 32, off(k) ? { tones: [TS, T2, TS], stroke: GR } : NO);
      s.dot([x + 26, y + 12, 32], 4.6, off(k) ? { fill: T1, stroke: GR, sw: 1 } : { fill: ACC });
    });
    NODES.forEach(([x, y]) => s.line([x, y, 32], [x, y, 120], { stroke: GR, sw: FINE, dash: '3 4' }));
    s.rz(120, 0, W, 0, D, { sw: OUTER, op: .93 });                        // уровень сети
    NODES.forEach(([x, y], k) => s.line([x, y, 120], [HUB[0], HUB[1], 120], off(k) ? { stroke: GR, dash: '4 4' } : NO));
    NODES.forEach(([x, y], k) => s.ell(x, y, 120, 9, { sw: 1.1, stroke: off(k) ? GR : INK }));
    if (st.rip > 0) s.ell(HUB[0], HUB[1], 120, 15 + 96 * (1 - st.rip), { fill: null, stroke: ACC, sw: 1.4, op: st.rip });
    s.ell(HUB[0], HUB[1], 120, 15, { fill: ACC, stroke: ACC });
    s.line([HUB[0], HUB[1], 120], [HUB[0], HUB[1], 240], { stroke: ACC, sw: 1.2, dash: '3 4' });
    s.rz(240, 0, W, 0, D, { sw: OUTER, op: .95 });                        // панель мониторинга
    s.line([20, 199, 240], [156, 199, 240], { sw: FINE, stroke: GR });
    for (let k = 0; k < 4; k++) { const h = 10 + 56 * st.load[k] * (1 - st.stop[k]); s.rz(240, 26 + k * 32, 48 + k * 32, 196 - h, 196, { fill: T3, sw: FINE }); }
    s.line([24, cy(.85), 240], [174, cy(.85), 240], { sw: FINE, stroke: GR, dash: '3 4' });                // ориентир 85 %
    if (st.scrub >= 0) s.line([24 + st.scrub * 10, 104, 240], [24 + st.scrub * 10, 22, 240], { sw: FINE });
    s.poly(st.hist.map((v, i) => [24 + i * 10, cy(v), 240]), { close: false, stroke: ACC, sw: 1.7 });
    if (st.scrub >= 0) s.dot([24 + st.scrub * 10, cy(st.hist[st.scrub]), 240], 4.4, { fill: T1, stroke: ACC, sw: 1.5 });
    s.ell(236, 62, 240, 32, { sw: 1.1 });                                 // шкала OEE
    s.ell(236, 62, 240, 21, { fill: null, stroke: GR, sw: 1.1 });
    s.arcH(236, 62, 240, 21, -2.356, -2.356 + TAU * oee, { stroke: ACC, sw: 2.2 });
    for (const [y, x2] of [[130, 280], [150, 262], [170, 272]]) s.line([200, y, 240], [x2, y, 240], { stroke: GR, sw: 1.1 });
    for (const p of st.pk) {                                              // пакеты данных
      const [x, y] = NODES[p.k];
      s.dot(p.t < 1 ? [x, y, 32 + 88 * p.t] : p.t < 2 ? [lerp(x, HUB[0], p.t - 1), lerp(y, HUB[1], p.t - 1), 120] : [HUB[0], HUB[1], 120 + 120 * (p.t - 2)], 4.4, { fill: ACC });
    }
  },
  read(st, live) {
    const out = [`OEE = A × P × Q = ${num(st.A, 2)} × ${num(st.P, 2)} × ${num(st.Q, 2)} = ${num(st.A * st.P * st.Q * 100)} %`, `в работе ${4 - st.stop.filter(v => v > .5).length} из 4`];
    if (st.scrub >= 0) out.push(`на графике ${num(st.hist[st.scrub] * 100)} %`);
    else if (live && HOVER) out.push('щелчок — опрос станков');
    return out;
  }
};

/* ══════════════════ Рис. 7. Консалтинг: какой вариант выгоднее при данной программе выпуска ══════════════════
   Себестоимость операции c = F/N + v: постоянные затраты делятся на объём N, переменные — на штуку.
   Высота столбца — насколько вариант близок к лучшему; курсор по горизонтали меняет N (шкала логарифмическая).
   Под курсором столбцы делятся линией: ниже — переменные затраты, выше (штриховка) — постоянные.
   Условные данные пяти вариантов — от универсального станка до автоматической линии. */
const OPT = [[60, 9], [300, 5], [1100, 2.8], [3600, 1.6], [12000, .9]], NMIN = 10, NR = 6000, U0 = Math.log(100) / Math.log(NR);
const BE = OPT.slice(1).map((o, i) => (o[0] - OPT[i][0]) / (OPT[i][1] - o[1]));     // объёмы, где лидер меняется
const cost = N => OPT.map(o => o[0] / N + o[1]);
const barH = N => { const c = cost(N), m = Math.min(...c); return c.map(x => 34 + 118 * Math.pow(m / x, .9)); };
SCENES.consulting = {
  init: () => ({ u: U0, h: barH(1000), on: 0 }),
  step(st, dt, ptr) {
    const ut = ptr.in ? clamp((ptr.zu - .1) / .8, 0, 1) : U0, ot = ptr.in ? 1 : 0;
    st.u = ease(st.u, ut, dt, 9); if (Math.abs(st.u - ut) < 2e-4) st.u = ut;
    st.on = ease(st.on, ot, dt, 7); if (Math.abs(st.on - ot) < .01) st.on = ot;
    const tg = barH(NMIN * Math.pow(NR, st.u));
    let mv = st.u !== ut || st.on !== ot;
    for (let i = 0; i < 5; i++) { st.h[i] = ease(st.h[i], tg[i], dt, 14); if (Math.abs(st.h[i] - tg[i]) < .15) st.h[i] = tg[i]; else mv = true; }
    return mv;
  },
  draw(s, st) {
    const c = cost(NMIN * Math.pow(NR, st.u)), best = c.indexOf(Math.min(...c));
    s.sh(-10, -6, 404, 14, 128);
    s.box(-24, -8, -10, 420, 124, 10);
    for (let x = -4; x < 392; x += 20) s.line([x, 116, 0], [x, 112, 0], { sw: FINE, stroke: GR });          // шкала объёма
    for (const b of BE) {                                                                                   // точки смены лидера
      const ub = Math.log(b / NMIN) / Math.log(NR), at = st.on > .5 && Math.abs(st.u - ub) < .022;
      s.line([388 * ub, 116, 0], [388 * ub, at ? 96 : 104, 0], at ? { sw: 1.8, stroke: ACC } : { sw: 1.1 });
    }
    const xn = 388 * st.u;
    s.poly([[xn - 7, 116, 0], [xn + 7, 116, 0], [xn, 101, 0]], { fill: ACC, stroke: null });
    for (let i = 0; i < 5; i++) {
      const x = 8 + i * 76, h = st.h[i], k = i === best ? AK : INK;
      s.box(x, 30, 0, 50, 50, h, i === best ? { tones: BRZ, stroke: AK } : NO);
      if (st.on > .02) {                                                  // ниже линии — переменные затраты, выше — постоянные
        const zv = h * OPT[i][1] / c[i];
        s.poly([[x, 80, zv], [x + 50, 80, zv], [x + 50, 30, zv]], { close: false, stroke: k, sw: 1, op: st.on });
        for (let z = zv + 7; z < h - 2; z += 7) s.poly([[x, 80, z], [x + 50, 80, z], [x + 50, 30, z]], { close: false, stroke: k, sw: FINE, op: .3 * st.on });
      }
    }
    const pts = st.h.map((h, i) => [33 + i * 76, 55, h + 22]);
    s.poly(pts, { close: false, sw: 1, dash: '4 4' });
    pts.forEach((p, i) => s.dot(p, 3.6, { fill: i === best ? ACC : T1, stroke: i === best ? ACC : INK, sw: 1.2 }));
  },
  read(st) {
    const N = NMIN * Math.pow(NR, st.u), c = cost(N), b = c.indexOf(Math.min(...c));
    const out = [`N = ${grp(N < 100 ? N : N < 1000 ? round(N, 10) : N < 1e4 ? round(N, 100) : round(N, 1000))} шт/год`, `выгоднее вариант ${b + 1} — ${num(c[b], 2)} у.е./шт`, `из них постоянные затраты ${num(100 * OPT[b][0] / N / c[b])} %`];
    if (b < 4) out.push(`вариант ${b + 2} — от ${grp(BE[b])} шт`);
    return out;
  }
};

/* ══════════════════ Рис. 1. Обрабатывающий центр ══════════════════
   Два режима.
   Ручной: под курсором корпус становится прозрачным, стол с заготовкой идёт за курсором (оси X и Y),
   шпиндель опускается на глубину резания (ось Z), и фреза снимает металл там, где встречает заготовку.
   Автомат: бронзовая кнопка «Пуск» на стойке ЧПУ запускает очередную программу — карман, контур, сетку отверстий,
   надпись; тёмная «Стоп» прерывает её. Станок сам ставит новую заготовку и нужный инструмент и ведёт стол
   по траектории с постоянной подачей. Кнопки нажимаются прямо на рисунке.
   Показания:  Vc = π·D·n/1000;  Q — объём металла, снятого за минуту (при полном пазе ap·ae·F/1000);  P = Q·kc/60 000.
   Обороты подбираются под диаметр фрезы так, чтобы скорость резания оставалась прежней: n = 1000·Vc/(π·D).
   Масштаб: 1 единица = 5 мм. Глубина 25 мм, алюминиевый сплав, kc = 700 Н/мм².
   После секунды резания включается СОЖ; тележка понемногу наполняется стружкой, полную меняют на пустую. */
const NX = 88, NY = 52;
const HEAP = (r => Array.from({ length: 26 }, () => [384 + 52 * r(), 104 + 62 * r()]))(rng(5));   // где ложится стружка в тележке
const TOOLS = [{ d: 50, r: 5, n: 2400 }, { d: 25, r: 2.5, n: 4800 }, { d: 16, r: 1.6, n: 7500 }];

/* Программы — в координатах заготовки (88 × 52). Команды: T — инструмент, R — быстрый переход над деталью,
   D — врезание, F — рабочий ход, U — подъём, E — конец. */
const arcTo = (cx, cy, r, a0, a1, n) => Array.from({ length: n }, (_, i) => { const a = a0 + (a1 - a0) * (i + 1) / n; return ['F', cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const HOLES = [];
for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) HOLES.push(['R', 14 + 15 * (j % 2 ? 4 - i : i), 12 + 14 * j], ['D'], ['U']);
const PROGS = [
  { name: 'Карман', cmds: [['T', 0], ['R', 17, 15], ['D'], ['F', 71, 15], ['F', 71, 23], ['F', 17, 23], ['F', 17, 31], ['F', 71, 31], ['F', 71, 37], ['F', 17, 37], ['F', 17, 15], ['U'], ['E']] },
  { name: 'Контур', cmds: [['T', 1], ['R', 16, 8], ['D'], ['F', 72, 8], ...arcTo(72, 16, 8, -Math.PI / 2, 0, 5), ['F', 80, 36], ...arcTo(72, 36, 8, 0, Math.PI / 2, 5), ['F', 16, 44],
    ...arcTo(16, 36, 8, Math.PI / 2, Math.PI, 5), ['F', 8, 16], ...arcTo(16, 16, 8, Math.PI, 1.5 * Math.PI, 5), ['U'], ['R', 54, 26], ['D'], ...arcTo(44, 26, 10, 0, TAU, 20), ['U'], ['E']] },
  { name: 'Отверстия', cmds: [['T', 1], ...HOLES, ['E']] },
  { name: 'Надпись', cmds: [['T', 2], ['R', 9, 41], ['D'], ['F', 9, 11], ['F', 25, 11], ['U'], ['R', 35, 11], ['D'], ['F', 53, 11], ['U'], ['R', 44, 11], ['D'], ['F', 44, 41], ['U'],
    ['R', 61, 41], ['D'], ['F', 66, 11], ['F', 79, 11], ['F', 79, 41], ['U'], ['E']] }
];

/* кнопки «Пуск» и «Стоп» на стойке: центры в пространстве и на листе */
const BTN = [[195, 212, 56], [233, 212, 56]];
const BTN_S = BTN.map(b => [(b[0] - b[1]) * C, (b[0] + b[1]) * S - b[2]]);

/* фреза радиуса R с осью в точке (lx, ly) заготовки снимает металл; возвращает число снятых ячеек */
function carve(st, lx, ly, R) {
  let n = 0;
  const i0 = Math.max(0, Math.floor(lx - R)), i1 = Math.min(NX - 1, Math.floor(lx + R)), j0 = Math.max(0, Math.floor(ly - R)), j1 = Math.min(NY - 1, Math.floor(ly + R));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = i + .5 - lx, cy = j + .5 - ly;
    if (cx * cx + cy * cy < R * R - .05 && !st.cut[j * NX + i]) { st.cut[j * NX + i] = 1; n++; }
  }
  return n;
}

/* заготовка с выбранным карманом: поле ячеек 1×1 (5×5 мм), st.cut — где металл снят */
function stock(s, st, x0, y0, mid) {
  const c = st.cut, top = 104, fl = 104 - st.dep, zb = 78;
  const at = (i, j) => c[j * NX + i];
  const p = (i, j, z) => { const q = s.P(x0 + i, y0 + j, z); return f(q[0]) + ' ' + f(q[1]); };
  const quad = (a, b, d, e) => 'M' + a + 'L' + b + 'L' + d + 'L' + e + 'Z';
  const put = (d, fill, o) => { if (d) s.el.push(`<path d="${d}"${s.at(o, fill)}/>`); };
  let dF = '', dT = '', dWx = '', dWy = '', dE = '', dB = '';
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX;) {                  // дно кармана и нетронутый верх — полосами
    const v = at(i, j); let e = i + 1;
    while (e < NX && at(e, j) === v) e++;
    if (v) dF += quad(p(i, j, fl), p(e, j, fl), p(e, j + 1, fl), p(i, j + 1, fl));
    else dT += quad(p(i, j, top), p(e, j, top), p(e, j + 1, top), p(i, j + 1, top));
    i = e;
  }
  for (let i = 1; i < NX; i++) for (let j = 0; j < NY;) {                  // стенки и кромки вдоль Y
    const a = at(i - 1, j), b = at(i, j);
    if (a === b) { j++; continue; }
    let e = j + 1;
    while (e < NY && at(i - 1, e) === a && at(i, e) === b) e++;
    if (b) { dWx += quad(p(i, j, fl), p(i, e, fl), p(i, e, top), p(i, j, top)); dB += 'M' + p(i, j, fl) + 'L' + p(i, e, fl); }
    dE += 'M' + p(i, j, top) + 'L' + p(i, e, top);
    j = e;
  }
  for (let j = 1; j < NY; j++) for (let i = 0; i < NX;) {                  // стенки и кромки вдоль X
    const a = at(i, j - 1), b = at(i, j);
    if (a === b) { i++; continue; }
    let e = i + 1;
    while (e < NX && at(e, j - 1) === a && at(e, j) === b) e++;
    if (b) { dWy += quad(p(i, j, fl), p(e, j, fl), p(e, j, top), p(i, j, top)); dB += 'M' + p(i, j, fl) + 'L' + p(e, j, fl); }
    dE += 'M' + p(i, j, top) + 'L' + p(e, j, top);
    i = e;
  }
  /* боковые грани и контур повторяют вырезы на краях */
  const hf = i => at(i, NY - 1) ? fl : top, hr = j => at(NX - 1, j) ? fl : top, hb = i => at(i, 0) ? fl : top, hl = j => at(0, j) ? fl : top;
  let dFr = 'M' + p(0, NY, zb) + 'L' + p(NX, NY, zb), dRt = 'M' + p(NX, NY, zb) + 'L' + p(NX, 0, zb);
  let dO = 'M' + p(0, NY, hf(0)) + 'L' + p(0, NY, zb) + 'L' + p(NX, NY, zb) + 'L' + p(NX, 0, zb);
  for (let i = NX - 1; i >= 0; i--) dFr += 'L' + p(i + 1, NY, hf(i)) + 'L' + p(i, NY, hf(i));
  for (let j = 0; j < NY; j++) dRt += 'L' + p(NX, j, hr(j)) + 'L' + p(NX, j + 1, hr(j));
  for (let i = NX - 1; i >= 0; i--) dO += 'L' + p(i + 1, 0, hb(i)) + 'L' + p(i, 0, hb(i));
  for (let j = 0; j < NY; j++) dO += 'L' + p(0, j, hl(j)) + 'L' + p(0, j + 1, hl(j));

  put(dF, mix('#ffffff', '#dfdcd4', st.dep / 5), { stroke: null });
  put(dWx, T3, { stroke: null }); put(dWy, T2, { stroke: null });
  put(dB, null, { stroke: GR, sw: FINE });
  if (mid) mid();                                                          // часть фрезы, опущенная в карман
  put(dT, T1, { stroke: null });
  put(dFr + 'Z', T2, { sw: INNER }); put(dRt + 'Z', T3, { sw: INNER });
  put(dE, null, { sw: FINE });
  put(dO + 'Z', null, { sw: 1.2 });
}

SCENES.machine = {
  pad: 24, lines: true,
  init: () => ({ X: 0, Y: 0, vx: 0, vy: 0, zt: 122, n: 0, phi: .4, g: 0, cut: new Uint8Array(NX * NY), cutN: 0, any: false, dep: 5, heal: false, fresh: false, idle: 0,
    Q: 0, F: 0, eng: 0, acc: 0, chips: [], rnd: rng(11), load: 0, belt: 0, t: 0, tool: 0, want: 0, tc: 0, hint: true, cutT: 0, cool: 0, coolOn: true, bin: 0, dump: false,
    prog: 0, run: null, pc: 0, fin: 0, done: '', xray: false, ovr: 100, man: false, hov: 0, push: 0, pt: 0 }),
  demo: t => [12 + 60 * Math.sin(t * 1.25), 19 + 28 * Math.sin(t * 2.05 + .6)],
  active: st => !!st.run || st.fin > 0,

  cursor: st => st.hov ? 'pointer' : '',

  /* кнопки на стойке: «Пуск» ставит новую заготовку и запускает очередную программу; «Стоп» прерывает её,
     а когда станок стоит — убирает обработанную заготовку */
  cmd(st, c, a) {
    if (c === 'prog') st.prog = clamp(+a | 0, 0, PROGS.length - 1);
    else if (c === 'start') { if (!st.run) { if (st.any) st.fresh = true; st.run = PROGS[st.prog].cmds; st.pc = 0; st.fin = 0; } }
    else if (c === 'stop') { if (st.run) { st.run = null; st.fin = 0; } else if (st.any) st.fresh = true; }
  },
  tap(st) { this.cmd(st, st.run ? 'stop' : 'start'); },

  step(st, dt, ptr) {
    /* курсор над кнопкой, щелчок по ней; рядом со стойкой стол за курсором не идёт */
    let hov = 0;
    if (ptr.in) { let best = 22; for (let i = 0; i < 2; i++) { const d = Math.hypot(ptr.x - BTN_S[i][0], ptr.y - BTN_S[i][1]); if (d < best) { best = d; hov = i + 1; } } }
    st.hov = hov;
    if (ptr.hit && hov) { st.push = hov; st.pt = .22; this.cmd(st, hov === 1 ? 'start' : 'stop'); }
    if (st.pt > 0) st.pt -= dt;
    const desk = ptr.in && ptr.x > -42 && ptr.x < 46 && ptr.y > 68 && ptr.y < 212;
    const auto = !!st.run, manual = !auto && ptr.in && !desk && !st.heal, on = auto || manual, x0 = st.X, y0 = st.Y;
    st.man = manual; st.t += dt;
    if (st.fin > 0) st.fin = Math.max(0, st.fin - dt);

    /* новая заготовка: по кнопке или когда почти весь металл снят и станок стоит */
    if (st.fresh) { st.fresh = false; if (st.any) st.heal = true; }
    if (st.heal && st.zt > 110) { st.dep -= dt * 8; if (st.dep <= 0) { st.cut.fill(0); st.cutN = 0; st.any = false; st.dep = 5; st.heal = false; } }

    /* смена инструмента: шпиндель останавливается и уходит вверх */
    if (manual && ptr.hit && st.tc <= 0) { st.want = (st.tool + 1) % TOOLS.length; st.tc = 1.1; st.hint = false; }
    if (st.tc > 0) { const was = st.tc; st.tc -= dt; if (was > .55 && st.tc <= .55) st.tool = st.want; }
    const R = TOOLS[st.tool].r, nNom = TOOLS[st.tool].n, work = on && st.tc <= 0 && !st.heal;
    let zT = work ? 99 : 122;

    if (auto) {
      /* автомат: стол идёт по траектории с постоянной подачей, между проходами — быстрый переход над деталью */
      let left = dt, guard = 0;
      zT = 112;
      while (left > 1e-6 && st.run && guard++ < 80) {
        const c = st.run[st.pc];
        if (c[0] === 'T') { zT = 122; if (!st.heal && st.tc <= 0) { if (st.tool === c[1]) { st.pc++; continue; } st.want = c[1]; st.tc = 1.1; } break; }
        if (c[0] === 'E') { st.done = PROGS[st.prog].name; st.prog = (st.prog + 1) % PROGS.length; st.run = null; st.fin = 2.4; zT = 122; break; }
        if (!work) { zT = 122; break; }
        if (c[0] === 'D') { zT = 99; if (st.zt <= 99.02) { st.pc++; continue; } break; }
        if (c[0] === 'U') { zT = 112; if (st.zt >= 111.6) { st.pc++; continue; } break; }
        const feed = c[0] === 'F';
        zT = feed ? 99 : 112;
        if (!feed && st.zt < 111.6) break;                                // сначала подъём, потом переход
        const tx = 44 - c[1], ty = 26 - c[2], dx = tx - st.X, dy = ty - st.Y, dist = Math.hypot(dx, dy), v = feed ? 34 * st.ovr / 100 : 130, go = Math.min(dist, v * left);
        if (dist > 1e-9) { st.X += dx / dist * go; st.Y += dy / dist * go; }
        left -= go / v;
        if (dist - go < 1e-4) { st.X = tx; st.Y = ty; st.pc++; } else break;
      }
      st.vx = (st.X - x0) / dt; st.vy = (st.Y - y0) / dt;
    } else {
      /* ручной режим: стол идёт за курсором; скорость ограничена рабочей подачей, когда фреза в металле */
      let tx = 0, ty = 0;
      if (manual) { const a = ptr.x / C, b = (ptr.y + 104) / S; tx = clamp((a + b) / 2 - 130, -49, 49); ty = clamp((b - a) / 2 - 116, -31, 31); }
      const vmax = lerp(120, 34 * st.ovr / 100, st.eng), am = 700 * dt;
      let wx = (tx - st.X) * 7, wy = (ty - st.Y) * 7;
      const w = Math.hypot(wx, wy);
      if (w > vmax) { wx *= vmax / w; wy *= vmax / w; }
      let ax = wx - st.vx, ay = wy - st.vy;
      const al = Math.hypot(ax, ay);
      if (al > am) { ax *= am / al; ay *= am / al; }
      st.vx += ax; st.vy += ay;
      st.X += st.vx * dt; st.Y += st.vy * dt;
    }
    const mx = st.X - x0, my = st.Y - y0, gT = on || st.xray || st.fin > 0 ? 1 : 0;
    st.g = ease(st.g, gT, dt, gT ? 8 : 4.5);
    st.n = ease(st.n, work ? nNom : 0, dt, work ? 4.5 : on ? 7 : 1.8);
    st.zt += clamp(zT - st.zt, -(auto ? 44 * st.ovr / 100 : 60) * dt, 90 * dt);
    st.phi = (st.phi + st.n / 2400 * 9 * dt) % TAU;

    /* съём металла вдоль пути, пройденного за кадр */
    let rem = 0;
    if (work && st.zt < 101 && st.n > .4 * nNom) {
      const k = Math.max(1, Math.ceil(Math.hypot(mx, my) / .7));
      for (let q = 1; q <= k; q++) rem += carve(st, 44 - lerp(x0, st.X, q / k), 26 - lerp(y0, st.Y, q / k), R);
      if (rem) { st.any = true; st.cutN += rem; }
    }
    st.Q = ease(st.Q, rem * 1.875 / dt, dt, 8); if (st.Q < .5) st.Q = 0;    // см³/мин
    st.eng = clamp(st.Q / 250, 0, 1);
    st.F = Math.hypot(st.vx, st.vy) * 15;                                   // мм/мин

    /* стружка: бросок под действием тяжести, показан замедленно */
    st.acc += st.Q / 640 * 34 * dt;
    while (st.acc >= 1) {
      st.acc--;
      if (st.chips.length < 60) { const a = st.rnd() * TAU, sp = 70 + 170 * st.rnd(); st.chips.push({ x: 130 + R * Math.cos(a), y: 116 + R * Math.sin(a), z: 102, vx: sp * Math.cos(a), vy: sp * Math.sin(a), vz: 120 + 190 * st.rnd(), life: 1, rest: 0 }); }
    }
    const ts = dt * .3, sx = 86 + st.X, sy = 90 + st.Y;
    for (const c of st.chips) {
      if (c.rest) { c.life -= dt * (c.rest === 2 ? 1.1 : 1.6); if (c.rest === 2) { c.x += mx; c.y += my; } continue; }
      c.vz -= 1962 * ts; c.x += c.vx * ts; c.y += c.vy * ts; c.z += c.vz * ts;
      if (c.x < 17) { c.x = 17; c.vx = 0; } else if (c.x > 243) { c.x = 243; c.vx = 0; }
      if (c.y < 17) { c.y = 17; c.vy = 0; } else if (c.y > 183) { c.y = 183; c.vy = 0; }
      if (c.vz < 0) {
        const i = Math.floor(c.x - sx), j = Math.floor(c.y - sy), onS = i >= 0 && i < NX && j >= 0 && j < NY;
        const onT = c.x > 68 + st.X && c.x < 192 + st.X && c.y > 84 + st.Y && c.y < 148 + st.Y;
        const lvl = onS ? (st.cut[j * NX + i] ? 99 : 104) : onT ? 78 : 60;
        if (c.z <= lvl + .6 && (lvl === 60 || c.z > lvl - 14)) { c.z = lvl + .6; c.rest = lvl === 60 ? 1 : 2; }
      }
    }
    st.chips = st.chips.filter(c => c.life > 0);
    st.load = ease(st.load, st.Q > 15 ? 1 : 0, dt, st.Q > 15 ? 4 : .9); if (st.load < .01) st.load = 0;
    if (st.load) st.belt = (st.belt + dt * .5) % 1;
    st.cutT = st.Q > 20 ? st.cutT + dt : 0;                                 // после секунды резания включается подача СОЖ
    st.cool = ease(st.cool, st.coolOn && st.cutT > .8 ? 1 : 0, dt, 5); if (st.cool < .01) st.cool = 0;
    if (st.dump) { st.bin -= dt * 1.5; if (st.bin <= 0) { st.bin = 0; st.dump = false; } }   // полную тележку меняют на пустую
    else { st.bin += st.load * dt / 11; if (st.bin >= 1) { st.bin = 1; st.dump = true; } }

    const spent = st.cutN > .6 * NX * NY, parked = !on && st.n < 40 && st.zt > 121.5 && Math.abs(st.X) < .3 && Math.abs(st.Y) < .3;
    if (parked && spent && !st.heal) { st.idle += dt; if (st.idle > 1.5) st.heal = true; } else st.idle = 0;
    const busy = on || st.fin > 0 || Math.abs(st.g - gT) > .004 || st.n > 2 || st.zt < 121.9 || Math.abs(st.X) > .05 || Math.abs(st.Y) > .05 ||
      st.chips.length > 0 || st.load > 0 || st.tc > 0 || st.dump || st.cool > 0 || st.heal || spent || st.pt > 0;
    if (!busy) { st.g = gT; st.n = st.X = st.Y = st.vx = st.vy = st.Q = st.F = st.eng = st.cutT = 0; st.zt = 122; }
    return busy;
  },

  draw(s, st) {
    const g = st.g, X = st.X, Y = st.Y, zh = st.zt + 46, zs = zh - 28, R = TOOLS[st.tool].r;
    const vis = st.tc > 0 ? clamp(Math.abs(st.tc - .55) / .22 - .15, 0, 1) : 1, zt = zs - 18 * vis;      // при смене фреза уходит в шпиндель
    const fo = 1 - .93 * g, so = 1 - .66 * g, og = 1 - .86 * g, po = 1 - .78 * g, thin = { sw: FINE, so };
    const chip = c => s.dot([c.x, c.y, c.z], 1.9, { fill: ACC, op: clamp(c.life, 0, 1) });
    s.sh(0, 0, 456, 30, 230);

    /* ── станина и рабочая зона */
    s.box(0, 0, 0, 260, 200, 60);
    s.ry(14, 14, 246, 60, 212, { fill: '#f4f3ef', sw: FINE });
    s.rx(14, 14, 186, 60, 212, { fill: '#e8e6e0', sw: FINE });
    for (const c of st.chips) if (c.rest === 1) chip(c);
    s.box(96, 14, 60, 68, 38, 150, { sw: 1.2 });                            // колонна
    for (const x of [112, 148]) s.line([x, 52, 66], [x, 52, 204], { sw: FINE, stroke: GR });
    s.box(54, 84 + Y, 60, 152, 64, 8, { sw: 1.2 });                         // салазки — ось Y
    s.box(68 + X, 84 + Y, 68, 124, 64, 10, { sw: 1.2 });                    // стол — ось X
    for (const y of [100, 116, 132]) s.line([68 + X, y + Y, 78], [192 + X, y + Y, 78], { sw: FINE, stroke: GR });

    const lx = 44 - X, ly = 26 - Y, near = ly >= 52 || lx >= 88, far = !near && (ly <= 0 || lx <= 0);
    const tool = (z0, z1) => { if (z1 - z0 > .3) s.cyl(130, 116, z0, R, z1 - z0, { tones: [A1, A2], stroke: AK, sw: 1.1 }); };
    if (far && zt < 104) tool(zt, 104);
    stock(s, st, 86 + X, 90 + Y, () => { if (!far && !near && zt < 104) tool(zt, 104); });

    /* траектория программы: оставшаяся часть при работе, вся целиком — пока станок стоит с прозрачным корпусом */
    const cmds = st.run || (g > .5 && !st.man && st.fin <= 0 ? PROGS[st.prog].cmds : null);
    if (cmds) {
      const at = p => [86 + X + p[0], 90 + Y + p[1], 104.4], pen = { close: false, stroke: ACC, sw: 1, dash: '3 3' }, hr = TOOLS[cmds[0][1]].r;
      let run = st.run && (cmds[st.pc][0] === 'F' || cmds[st.pc][0] === 'D') ? [[lx, ly]] : null;
      const flush = () => { if (run && run.length > 1) s.poly(run.map(at), pen); else if (run) s.ell(86 + X + run[0][0], 90 + Y + run[0][1], 104.4, hr, { fill: null, stroke: ACC, sw: 1 }); run = null; };
      for (let i = st.run ? st.pc : 0; i < cmds.length; i++) {
        const c = cmds[i];
        if (c[0] === 'R') { flush(); run = [[c[1], c[2]]]; } else if (c[0] === 'F') { if (run) run.push([c[1], c[2]]); } else if (c[0] === 'U' || c[0] === 'E') flush();
      }
    }

    if (near && zt < 104) tool(zt, 104);
    tool(Math.max(zt, 104), zs);                                            // фреза
    for (const a of [st.phi, st.phi + Math.PI]) s.helix(130, 116, Math.max(zt, 104) + 1, zs - 1, R, a, 2.2, { stroke: AK, sw: FINE });
    s.cyl(130, 116, zs, 7.5, 10, { sw: 1.2 });                              // оправка
    s.cyl(130, 116, zs + 10, 11, 18, { sw: 1.2 });                          // шпиндель
    s.box(106, 52, zh, 48, 76, 40, { sw: 1.2 });                            // шпиндельная бабка — ось Z
    s.line([106, 128, zh + 12], [154, 128, zh + 12], { sw: FINE });
    if (st.cool > 0) for (const dx of [-9, 9]) s.line([130 + dx, 126, zs + 16], [130 + dx * .25, 118, zt + 3], { sw: FINE, dash: '2 3', off: -st.t * 34, op: .55 * st.cool });   // струи СОЖ
    for (const c of st.chips) if (c.rest !== 1) chip(c);

    /* ── корпус */
    s.holed([[0, 200, 0], [260, 200, 0], [260, 200, 180], [0, 200, 180]], [[34, 200, 76], [156, 200, 76], [156, 200, 172], [34, 200, 172]], { fill: T2, fo, so });
    const pane = [[34, 196.2, 184.8], [156, 196.2, 184.8], [156, 171.8, 215.2], [34, 171.8, 215.2]];
    s.holed([[0, 200, 180], [260, 200, 180], [260, 168, 220], [0, 168, 220]], pane, { fill: TS, fo, so });
    s.rz(220, 0, 260, 0, 168, { fo, so });
    s.poly([[260, 0, 0], [260, 200, 0], [260, 200, 180], [260, 168, 220], [260, 0, 220]], { fill: T3, fo, so });
    s.ry(200, 34, 156, 76, 172, { fill: T3, fo: .34 * (1 - g), sw: 1.2, so });         // остекление двери
    s.poly(pane, { fill: T3, fo: .22 * (1 - g), sw: 1.2, so });
    s.line([45, 200, 143], [65, 200, 163], { stroke: GR, sw: FINE, op: 1 - g });        // блики
    s.line([45, 200, 129], [55, 200, 139], { stroke: GR, sw: FINE, op: 1 - g });
    s.ry(200, 20, 170, 24, 176, { fill: null, so });                                   // дверь
    s.ry(200, 160, 164, 96, 150, { fill: INK, stroke: null, op: po });                 // ручка
    s.line([0, 200, 12], [260, 200, 12], thin); s.line([260, 200, 12], [260, 0, 12], thin);   // цоколь
    s.rx(260, 22, 92, 112, 198, { fill: null, so });                                   // электрошкаф
    for (let z = 124; z < 194; z += 10) s.line([260, 30, z], [260, 84, z], thin);
    s.rx(260, 112, 172, 150, 198, { fill: null, so });                                 // сервисный люк
    s.rx(260, 122, 146, 164, 174, { fill: INK, stroke: null, op: po });
    s.poly([[0, 200, 0], [260, 200, 0], [260, 0, 0], [260, 0, 220], [0, 0, 220], [0, 168, 220], [0, 200, 180]], { fill: null, sw: OUTER, so: 1 - .45 * g });

    /* ── крыша: туманоуловитель, привод шпинделя, сигнальная колонна */
    s.cyl(36, 118, 220, 17, 24, { op: og }); s.cyl(36, 118, 244, 9, 9, { op: og });
    s.box(78, 40, 220, 96, 88, 54, { op: og });
    for (let z = 234; z < 266; z += 8) s.line([174, 54, z], [174, 116, z], { sw: FINE, op: og });
    s.cyl(238, 150, 220, 6, 30);
    s.cyl(238, 150, 250, 6, 12, { tones: [ACC, ACC], stroke: ACC });
    if (st.n > 60) s.dot([238, 150, 256], 13 + 2 * Math.sin(st.t * 5), { fill: ACC, op: .2 * clamp(st.n / 1200, 0, 1) });

    /* ── стойка ЧПУ: экран и кнопки «Пуск» и «Стоп». Она низкая, рабочую зону не заслоняет и потому всегда непрозрачна */
    s.box(174, 200, 30, 80, 12, 86);
    s.ry(212, 182, 246, 84, 110, { sw: FINE });
    s.poly([[188, 212, 90], [200, 212, 98], [212, 212, 94], [224, 212, 103], [240, 212, 106]], { close: false, stroke: ACC, sw: 1.5 });
    BTN.forEach((b, i) => {
      const ready = i ? !!st.run || st.any : !st.run, hot = st.hov === i + 1, cap = i ? INK : ACC;
      s.ringY(b[1], b[0], b[2], 14.5, { stroke: hot ? ACC : INK, sw: hot ? 2.2 : 1.2 });
      s.ringY(b[1], b[0], b[2], st.push === i + 1 && st.pt > 0 ? 9 : 10.8, { fill: ready ? cap : mix(cap, '#ffffff', .64), stroke: null });
      if (i) s.ry(b[1], b[0] - 4, b[0] + 4, b[2] - 4, b[2] + 4, { stroke: null });
      else s.poly([[b[0] - 3.4, b[1], b[2] + 5.2], [b[0] - 3.4, b[1], b[2] - 5.2], [b[0] + 5.6, b[1], b[2]]], { stroke: null });
    });

    /* ── удаление стружки: транспортёр с крутым подъёмом и тележка */
    s.box(260, 112, 0, 44, 46, 26);
    s.poly([[294, 118, 4], [364, 118, 114], [364, 152, 114], [294, 152, 4]], { fill: T3 });      // днище подъёма
    s.poly([[294, 152, 4], [364, 152, 114], [364, 152, 140], [294, 152, 30]], { fill: T2 });     // боковина
    for (let k = 1; k < 5; k++) { const t = k / 5; s.line([294 + 70 * t, 152, 6 + 110 * t], [294 + 70 * t, 152, 28 + 110 * t], { sw: FINE, stroke: GR }); }
    s.poly([[294, 152, 30], [294, 152, 4], [294, 118, 4], [364, 118, 114], [364, 152, 114], [364, 152, 140]], { close: false, sw: OUTER });
    s.box(352, 112, 134, 46, 46, 22);                                       // головка сброса
    if (st.load > 0) for (let k = 0; k < 4; k++) { const t = (k / 4 + st.belt * 3) % 1; s.dot([386 + 10 * t + k % 2 * 5, 128 + k * 6, 132 - 80 * t * t], 2.1, { fill: ACC, op: st.load * (1 - .4 * t) }); }
    s.box(372, 92, 0, 76, 86, 50);                                          // тележка для стружки
    s.rz(50, 379, 441, 99, 171, { fill: mix(T3, A1, .7 * st.bin), sw: FINE });
    for (let i = Math.round(st.bin * HEAP.length); i-- > 0;) s.dot([HEAP[i][0], HEAP[i][1], 50.5], 2, { fill: ACC });

    /* ── оси координат и позиции */
    for (const [e, nm, dx, dy] of [[[34, 262, 0], 'X', 10, 6], [[-36, 322, 0], 'Y', -10, 8], [[-36, 262, 62], 'Z', 0, -8]]) {
      s.line([-36, 262, 0], e, { stroke: ACC, sw: 1.3 }); s.dot(e, 2.4, { fill: ACC }); s.label(e, nm, { dx, dy, size: 12, fill: ACC });
    }
    if (g < .98) { s.tag([126, 84, 274], 1, -112, -48, 1 - g); s.tag([46, 200, 150], 2, -100, -34, 1 - g); s.tag([179, 212, 35], 3, -60, 58, 1 - g); s.tag([410, 135, 50], 4, 86, -84, 1 - g); }
  },

  read(st, live) {
    const name = PROGS[st.prog].name;
    if (!st.run && st.fin <= 0 && !st.man) {
      if (st.hov === 1) return [`«Пуск» — программа «${name}»`, 'щёлкните по кнопке'];
      if (st.hov === 2) return [st.any ? '«Стоп» — убрать заготовку' : '«Стоп» — прервать программу', st.any ? 'щёлкните по кнопке' : 'сейчас станок стоит'];
      return HOVER ? ['наведите курсор — стол пойдёт за ним', 'бронзовая кнопка на стойке — пуск программы'] : ['коснитесь рисунка', 'станок выполнит программу'];
    }
    const T = TOOLS[st.tool], c = v => sgn(v, 1).padStart(6, NB), n = round(st.n, 10);
    const mode = st.run ? `программа «${name}» · ${Math.round(100 * st.pc / (st.run.length - 1))} %` : st.fin > 0 ? `программа «${st.done}» выполнена` : 'ручной режим' + (st.hint && HOVER ? ' · щелчок — смена фрезы' : '');
    return [mode,
      `X ${c(-st.X * 5)}${NB}${NB}Y ${c(-st.Y * 5)}${NB}${NB}Z ${c((st.zt - 104) * 5)}`,
      `T${st.tool + 1} · фреза Ø${T.d} мм`,
      `S ${grp(n)} об/мин · Vc ${num(Math.PI * T.d * n / 1000)} м/мин`,
      `F ${num(st.F)} мм/мин · Q ${num(st.Q)} см³/мин`,
      `P = Q·kc/60 000 = ${num(st.Q * 700 / 60000, 1)} кВт`];
  }
};

/* ───────── запуск на странице ───────── */
const NS = 'http://www.w3.org/2000/svg', DEMO = 7;

function first(id) {
  const def = SCENES[id], st = def.init(), s = new Scene(id);
  def.draw(s, st);
  if (def.room) def.room(s);
  const pad = def.pad || 20, vb = { x: s.x0 - pad, y: s.y0 - pad, w: s.x1 - s.x0 + 2 * pad, h: s.y1 - s.y0 + 2 * pad };
  s.sd = vb.w * .013;
  return { def, st, s, vb };
}

/* кадр покоя отдельным файлом */
function still(id) {
  const { s, vb } = first(id);
  return `<svg xmlns="${NS}" viewBox="${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}" width="${Math.round(vb.w)}" height="${Math.round(vb.h)}" class="ga">` +
    '<style>.ga *{vector-effect:non-scaling-stroke}</style>' + s.html() + '</svg>\n';
}

function mount(host) {
  const id = host.dataset.art;
  if (!SCENES[id] || host.querySelector('svg')) return;
  const { def, st, s, vb } = first(id), sd = s.sd;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}`);
  svg.setAttribute('class', 'ga'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.innerHTML = s.html();
  host.append(svg);

  const zone = host.closest('figure') || host;
  const ro = document.createElement('div');
  ro.className = 'ro' + (def.lines ? ' ro-lines' : ''); ro.setAttribute('aria-hidden', 'true');
  zone.append(ro);

  /* курсор в координатах рисунка: положение, скорость, нажатие; zu, zv — доли ширины и высоты области */
  const ptr = { x: 0, y: 0, lx: 0, ly: 0, vx: 0, vy: 0, zu: .5, zv: .5, in: false, was: false, down: false, hit: false };
  let raf = 0, last = 0, demo = 0, tSay = 0, shown = null, cur = '';
  const lit = () => zone.classList.toggle('live', ptr.in || !!(def.active && def.active(st)));
  const say = () => {
    const a = def.read(st, ptr.in), t = a.join('\n');
    if (t === shown) return;
    shown = t;
    ro.innerHTML = a.map(x => '<span>' + x.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>').join('');
  };
  const paint = () => { const q = new Scene(id, sd); def.draw(q, st); svg.innerHTML = q.html(); };
  const advance = dt => {
    if (demo > 0) {                                                       // показ без курсора: точка сама ходит по рисунку
      const t0 = DEMO - demo;
      demo -= dt;
      const t1 = DEMO - demo, q = def.demo ? def.demo(t1) : [vb.x + vb.w * (.5 + .3 * Math.sin(t1 * 1.1)), vb.y + vb.h * (.5 + .26 * Math.sin(t1 * 1.7 + 1))];
      ptr.x = q[0]; ptr.y = q[1]; ptr.zu = (q[0] - vb.x) / vb.w; ptr.zv = (q[1] - vb.y) / vb.h; ptr.in = demo > 0;
      if (def.taps) for (const tt of def.taps) if (t0 < tt && t1 >= tt) ptr.hit = true;
    }
    if (ptr.in && ptr.was) { ptr.vx = ease(ptr.vx, (ptr.x - ptr.lx) / dt, dt, 30); ptr.vy = ease(ptr.vy, (ptr.y - ptr.ly) / dt, dt, 30); } else ptr.vx = ptr.vy = 0;
    ptr.lx = ptr.x; ptr.ly = ptr.y; ptr.was = ptr.in;
    const busy = def.step(st, dt, ptr, vb);
    ptr.hit = false;
    return busy;
  };
  const frame = t => {
    const dt = clamp((t - last) / 1000, .001, .08); last = t;
    const busy = advance(dt);
    paint();
    tSay += dt; if (tSay > .09 || !busy) { tSay = 0; say(); }
    lit();
    if (def.cursor) { const c = def.cursor(st); if (c !== cur) zone.style.cursor = cur = c; }
    raf = busy || ptr.in ? requestAnimationFrame(frame) : 0;
  };
  const wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const move = e => {
    const m = svg.getScreenCTM(), r = zone.getBoundingClientRect();
    if (!m || !r.width) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    ptr.x = p.x; ptr.y = p.y; ptr.zu = (e.clientX - r.left) / r.width; ptr.zv = (e.clientY - r.top) / r.height;
  };
  say();

  /* для отладки и проверки: host.gtl.run(секунды) прокручивает модель без ожидания кадров */
  host.gtl = { st, ptr, vb, cmd(c, a) { def.cmd(st, c, a); }, run(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) advance(dt); paint(); say(); lit(); } };

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const mouse = fn => e => { if (e.pointerType !== 'touch') fn(e); };
  zone.addEventListener('pointerenter', mouse(e => { demo = 0; ptr.in = true; move(e); wake(); }));
  zone.addEventListener('pointermove', mouse(e => { demo = 0; ptr.in = true; move(e); wake(); }));
  zone.addEventListener('pointerleave', mouse(() => { ptr.in = ptr.down = false; wake(); }));
  zone.addEventListener('pointerdown', mouse(e => { if (e.button === 0) { demo = 0; ptr.in = ptr.down = ptr.hit = true; move(e); wake(); } }));
  addEventListener('pointerup', () => { ptr.down = false; });
  zone.addEventListener('click', () => { if (!HOVER) { if (def.tap) def.tap(st); else demo = DEMO; wake(); } });   // на сенсорных экранах — показ или запуск по касанию
}

const api = { scenes: SCENES, Scene, still, mount };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof document !== 'undefined') {
  window.GTLArt = api;
  const go = () => document.querySelectorAll('[data-art]').forEach(mount);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
}
})();
