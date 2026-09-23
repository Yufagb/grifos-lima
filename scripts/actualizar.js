// Vuelve a bajar precios y coordenadas desde Facilito y reescribe data/data.js.
// No necesita navegador: MapaAction.do responde sin sesion y sin reCAPTCHA.
//
//   node scripts/actualizar.js
//
// El distrito no viene en este endpoint, asi que se conserva el que ya estaba
// guardado para cada codigo Osinergmin (un grifo no cambia de distrito).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ARCHIVO = path.join(ROOT, 'data', 'data.js');

const PROVINCIAS = [
  { dep: '150000', prov: '150100', zona: 'L' },   // Lima Metropolitana
  { dep: '70000',  prov: '70100',  zona: 'K' }    // Prov. Const. del Callao
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
// AVA es la marca de GLOBAL FUEL S.A.; en Facilito casi todas sus estaciones
// figuran con esa razon social y solo una como "AVA ARAMBURU".
const NUESTROS = /COESTI|PRIMAX|REPSOL COMERCIAL|GLOBAL FUEL|\bAVA\b/i;

function marca(unidad) {
  if (/COESTI/i.test(unidad)) return 'C';
  if (/REPSOL COMERCIAL/i.test(unidad)) return 'R';
  if (/GLOBAL FUEL|\bAVA\b/i.test(unidad)) return 'A';
  return 'P';
}

async function bajarProvincia({ dep, prov, zona }) {
  const url = 'https://www.facilito.gob.pe/facilito/actions/MapaAction.do' +
    `?departamento=${dep}&provincia=${prov}&distrito=9999999&producto=127` +
    '&method=mostrarMapa&subtitulocabecera=1&tipo=LIQ&codigoOSI=0';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${prov}: HTTP ${res.status}`);
  const html = new TextDecoder('windows-1252').decode(await res.arrayBuffer());

  // Los datos viajan como  var listaPuntos = eval ('(' + '[...]' + ')')
  const i = html.indexOf('listaPuntos');
  if (i < 0) throw new Error(`${prov}: no encontre listaPuntos (¿cambió la página?)`);
  const a = html.indexOf('[{', i);
  // cortar en el cierre del eval, NO en el primer "}]" (ese cierra el array interno "productos")
  const e = html.indexOf("+ ')'", a);
  if (a < 0 || e < 0) throw new Error(`${prov}: no pude delimitar el JSON`);
  const puntos = JSON.parse(html.slice(a, e).trim().replace(/'\s*$/, '').trim());
  return puntos.filter(p => NUESTROS.test(p.unidad)).map(p => ({ ...p, zona }));
}

// La fuente escapa las comillas para el literal JS ("MZ. \'D\'"); las devolvemos a normal.
function limpiar(dir) {
  return dir.replace(/\\(['"])/g, '$1').replace(/\s+/g, ' ').trim();
}

function precio(p, re) {
  const x = p.productos.find(y => re.test(y.producto));
  return x && x.precioVenta != null ? x.precioVenta : null;
}

function distritosGuardados() {
  const previo = {};
  // respaldo para grifos que aun no estan en data.js (ver data/distritos-extra.json)
  const extra = path.join(ROOT, 'data', 'distritos-extra.json');
  if (fs.existsSync(extra)) {
    const j = JSON.parse(fs.readFileSync(extra, 'utf8'));
    Object.keys(j).forEach(k => { if (!k.startsWith('_')) previo[k] = j[k]; });
  }
  if (!fs.existsSync(ARCHIVO)) return previo;
  global.window = {};
  delete require.cache[require.resolve(ARCHIVO)];
  require(ARCHIVO);
  // lo ya guardado manda sobre el respaldo
  (global.window.DATA || []).forEach(r => { if (r[3] && r[3] !== '(nuevo)') previo[r[0]] = r[3]; });
  return previo;
}

(async () => {
  const previo = distritosGuardados();
  let puntos = [];
  for (const p of PROVINCIAS) {
    const lote = await bajarProvincia(p);
    console.log(`  ${p.prov}: ${lote.length} grifos`);
    puntos = puntos.concat(lote);
  }

  const sinDistrito = [];
  const filas = puntos.map(p => {
    const d = previo[p.codigoOsinergmin];
    if (!d) sinDistrito.push(p.codigoOsinergmin + ' — ' + p.direccion.slice(0, 50));
    return [
      p.codigoOsinergmin, marca(p.unidad), p.zona, d || '(nuevo)',
      limpiar(p.direccion),
      +p.latitud, +p.longitud,
      precio(p, /GASOHOL REGULAR/i), precio(p, /GASOHOL PREMIUM/i), precio(p, /Diesel/i)
    ];
  }).sort((x, y) => (x[8] ?? 99) - (y[8] ?? 99));

  const hoy = new Date().toISOString().slice(0, 10);
  const cabecera = fs.readFileSync(ARCHIVO, 'utf8').split('window.DATA = [')[0]
    .replace(/Consultado \d{4}-\d{2}-\d{2}/, 'Consultado ' + hoy)
    .replace(/window\.FECHA = "[^"]*"/, `window.FECHA = "${hoy}"`);

  fs.writeFileSync(ARCHIVO,
    cabecera + 'window.DATA = [\n' +
    filas.map(f => JSON.stringify(f)).join(',\n') + '\n];\n', 'utf8');

  console.log(`\nListo: ${filas.length} grifos, precios del ${hoy}`);
  if (sinDistrito.length) {
    console.log(`\nAVISO — ${sinDistrito.length} grifo(s) nuevo(s) sin distrito conocido:`);
    sinDistrito.forEach(s => console.log('  ' + s));
    console.log('Quedan marcados como "(nuevo)". Para completarlos hay que consultar');
    console.log('la tabla de precios, que sí exige reCAPTCHA (ver README).');
  }
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
