// Construye data/historia.js a partir del historial de git de data/data.js.
// Cada corrida del cron dejo una foto de precios commiteada: eso ES la serie de tiempo.
//
//   node scripts/historia.js
//
// Requiere el historial completo (en GitHub Actions: checkout con fetch-depth: 0).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ARCHIVO = path.join(ROOT, 'data', 'data.js');
const SALIDA = path.join(ROOT, 'data', 'historia.js');
const CADENAS = new Set(['C', 'P', 'R', 'A']);   // el indice sigue lo que tu pagas
const COLS = { 7: 7, 8: 8, 9: 9 };               // regular, premium, diesel

const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();

function filas(texto) {
  return texto.split('\n').filter(l => l.startsWith('["'))
    .map(l => { try { return JSON.parse(l.replace(/,\s*$/, '')); } catch (e) { return null; } })
    .filter(Boolean);
}

// fecha en Lima (UTC-5), sin depender de la zona horaria de la maquina
function diaLima(iso) {
  return new Date(new Date(iso).getTime() - 5 * 3600e3).toISOString().slice(0, 10);
}

// 1) ultima foto de cada dia
const fotos = {};
const commits = git('log', '--format=%H %cI', '--', 'data/data.js').trim().split('\n')
  .filter(Boolean).map(l => l.split(' '));
for (const [sha, fecha] of commits.reverse()) {          // de la mas vieja a la mas nueva
  try { fotos[diaLima(fecha)] = filas(git('show', sha + ':data/data.js')); } catch (e) {}
}
// la de hoy sale del archivo de trabajo (el cron todavia no la commiteo)
if (fs.existsSync(ARCHIVO)) fotos[diaLima(new Date().toISOString())] = filas(fs.readFileSync(ARCHIVO, 'utf8'));

const dias = Object.keys(fotos).sort();
if (dias.length < 2) { console.error('Historial insuficiente: hacen falta al menos 2 dias.'); process.exit(1); }

// 2) indice encadenado por producto.
// Promediar "los grifos de cada dia" mete ruido cuando cambia la composicion (el dia que
// entro AVA el promedio salto solo por eso; el 28/09 una foto rota traia 17 grifos).
// Aca cada dia se mide el cambio promedio de los MISMOS grifos respecto del dia anterior.
const mapa = r => { const m = {}; r.forEach(x => { if (CADENAS.has(x[1])) m[x[0]] = x; }); return m; };
const indice = {};
for (const p of Object.keys(COLS)) {
  const c = COLS[p];
  const d0 = Object.values(mapa(fotos[dias[0]])).map(x => x[c]).filter(v => v != null);
  let nivel = d0.reduce((s, v) => s + v, 0) / d0.length;
  const serie = [+nivel.toFixed(3)];
  let ultimaBuena = mapa(fotos[dias[0]]);
  for (let i = 1; i < dias.length; i++) {
    const hoy = mapa(fotos[dias[i]]);
    const deltas = [];
    for (const cod in hoy) {
      const a = ultimaBuena[cod], b = hoy[cod];
      if (a && a[c] != null && b[c] != null) deltas.push(b[c] - a[c]);
    }
    // foto rota o incompleta: se repite el nivel y se compara la siguiente contra la ultima buena
    if (deltas.length < Object.keys(ultimaBuena).length * 0.5) { serie.push(+nivel.toFixed(3)); continue; }
    nivel += deltas.reduce((s, v) => s + v, 0) / deltas.length;
    serie.push(+nivel.toFixed(3));
    ultimaBuena = hoy;
  }
  indice[p] = serie;
}

// 3) precio de cada grifo hace ~7 dias, para mostrar la flecha en cada tarjeta
const hoyDia = dias[dias.length - 1];
const limite = new Date(new Date(hoyDia).getTime() - 7 * 864e5).toISOString().slice(0, 10);
const diaRef = dias.filter(d => d <= limite).pop() || dias[0];
const hace7 = {};
fotos[diaRef].forEach(r => { hace7[r[0]] = [r[7], r[8], r[9]]; });

const salida = '// Generado por scripts/historia.js a partir del historial de git. No editar a mano.\n' +
  '// indice: promedio encadenado de grifos de cadena, S/ por galon, un valor por dia.\n' +
  '// hace7: [regular, premium, diesel] de cada grifo en la foto de ' + diaRef + '.\n' +
  'window.HISTORIA = ' + JSON.stringify({ generado: hoyDia, dias, indice, diaRef, hace7 }) + ';\n';
fs.writeFileSync(SALIDA, salida, 'utf8');

const p = indice[8];
const cambio = (n) => (p[p.length - 1] - p[Math.max(0, p.length - 1 - n)]).toFixed(2);
console.log(`historia: ${dias.length} dias (${dias[0]} a ${hoyDia}), referencia 7d = ${diaRef}`);
console.log(`premium: ${p[0].toFixed(2)} -> ${p[p.length - 1].toFixed(2)} | 7d ${cambio(7)} | 30d ${cambio(30)}`);
