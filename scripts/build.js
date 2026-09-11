// Genera data/premium-lima-callao.csv y el resumen comparativo Primax vs Repsol
// a partir de data.js (coordenadas y precios oficiales de Osinergmin).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.window = {};
require(path.join(ROOT, 'data', 'data.js'));
const { DATA, DESCUENTOS } = global.window;

const MARCA = { C: 'COESTI (Primax)', P: 'Primax afiliada', R: 'Repsol' };
const ZONA = { L: 'LIMA', K: 'CALLAO' };
const PREMIUM = 8, REGULAR = 7, DIESEL = 9;

const rows = DATA
  .map(r => ({
    cod: r[0], m: r[1], z: r[2], distrito: r[3], dir: r[4], lat: r[5], lon: r[6],
    regular: r[REGULAR], premium: r[PREMIUM], diesel: r[DIESEL],
    final: r[PREMIUM] == null ? null : +(r[PREMIUM] - DESCUENTOS[r[1]]).toFixed(2)
  }))
  .filter(r => r.final != null)
  .sort((a, b) => a.final - b.final);

const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
const csv = ['codigo_osinergmin,marca,zona,distrito,direccion,lat,lon,premium_lista,descuento,premium_final,regular_lista,diesel_lista']
  .concat(rows.map(r => [
    r.cod, MARCA[r.m], ZONA[r.z], r.distrito, r.dir, r.lat, r.lon,
    r.premium, DESCUENTOS[r.m], r.final, r.regular, r.diesel
  ].map(q).join(',')))
  .join('\n');
fs.writeFileSync(path.join(ROOT, 'data', 'premium-lima-callao.csv'), '﻿' + csv, 'utf8');

// ---- resumen ----
const stat = arr => {
  const p = arr.map(r => r.final).sort((a, b) => a - b);
  return {
    n: p.length, min: p[0], p25: p[Math.floor(p.length * 0.25)],
    mediana: p[Math.floor(p.length / 2)],
    prom: +(p.reduce((s, x) => s + x, 0) / p.length).toFixed(2), max: p[p.length - 1]
  };
};
const prim = rows.filter(r => r.m !== 'R');
const reps = rows.filter(r => r.m === 'R');
const promLista = arr => +(arr.reduce((s, r) => s + r.premium, 0) / arr.length).toFixed(2);

console.log('grifos:', rows.length, '| todos con coordenadas oficiales de Osinergmin');
console.log('\nPREMIUM — PRECIO DE LISTA');
console.log('  Primax  prom', promLista(prim), ' min', Math.min(...prim.map(r => r.premium)));
console.log('  Repsol  prom', promLista(reps), ' min', Math.min(...reps.map(r => r.premium)));
console.log('\nPREMIUM — CON TU DESCUENTO (Primax -' + DESCUENTOS.C + ' / Repsol -' + DESCUENTOS.R + ')');
console.log('  Primax ', JSON.stringify(stat(prim)));
console.log('  Repsol ', JSON.stringify(stat(reps)));

console.log('\nTOP 10 MAS BARATOS CON DESCUENTO');
rows.slice(0, 10).forEach((r, k) => console.log(
  String(k + 1).padStart(2), 'S/', r.final.toFixed(2), '(lista', r.premium.toFixed(2) + ')',
  MARCA[r.m].padEnd(16), r.distrito + ' — ' + r.dir.slice(0, 52)));

console.log('\nMEJOR OPCION POR DISTRITO');
const mejor = {};
rows.forEach(r => { const k = ZONA[r.z] + ' / ' + r.distrito; if (!mejor[k]) mejor[k] = r; });
Object.keys(mejor).sort().forEach(k =>
  console.log(' ', k.padEnd(34), 'S/', mejor[k].final.toFixed(2), MARCA[mejor[k].m]));
