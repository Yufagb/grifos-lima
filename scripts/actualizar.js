// Vuelve a bajar precios, coordenadas y distritos desde Facilito y reescribe data/data.js.
// No necesita navegador: MapaAction.do responde sin sesion y sin reCAPTCHA.
//
//   node scripts/actualizar.js
//
// Dos pasadas:
//  1. Una consulta por provincia (distrito=9999999) trae todos los grifos con
//     coordenadas y precios, pero SIN distrito.
//  2. Una consulta por cada distrito (codigos INEI) dice quien vive donde.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ARCHIVO = path.join(ROOT, 'data', 'data.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

// ubigeo INEI: 1501xx Lima, 0701xx Callao
const DISTRITOS = {
  '150000': { prov: '150100', zona: 'L', nombres: [
    'LIMA','ANCON','ATE','BARRANCO','BREÑA','CARABAYLLO','CHACLACAYO','CHORRILLOS','CIENEGUILLA',
    'COMAS','EL AGUSTINO','INDEPENDENCIA','JESUS MARIA','LA MOLINA','LA VICTORIA','LINCE','LOS OLIVOS',
    'LURIGANCHO','LURIN','MAGDALENA DEL MAR','PUEBLO LIBRE','MIRAFLORES','PACHACAMAC','PUCUSANA',
    'PUENTE PIEDRA','PUNTA HERMOSA','PUNTA NEGRA','RIMAC','SAN BARTOLO','SAN BORJA','SAN ISIDRO',
    'SAN JUAN DE LURIGANCHO','SAN JUAN DE MIRAFLORES','SAN LUIS','SAN MARTIN DE PORRES','SAN MIGUEL',
    'SANTA ANITA','SANTA MARIA DEL MAR','SANTA ROSA','SANTIAGO DE SURCO','SURQUILLO','VILLA EL SALVADOR',
    'VILLA MARIA DEL TRIUNFO'] },
  '70000': { prov: '70100', zona: 'K', nombres: [
    'CALLAO','BELLAVISTA','CARMEN DE LA LEGUA REYNOSO','LA PERLA','LA PUNTA','VENTANILLA','MI PERU'] }
};

// Cadenas que operan con control de marca. El resto queda como independiente:
// Facilito publica la razon social del operador, no el letrero, asi que un
// independiente aqui puede ser un afiliado con bandera de alguna marca.
function marca(unidad) {
  if (/COESTI/i.test(unidad)) return 'C';
  if (/REPSOL COMERCIAL/i.test(unidad)) return 'R';
  if (/GLOBAL FUEL|\bAVA\b/i.test(unidad)) return 'A';
  if (/PRIMAX/i.test(unidad)) return 'P';
  return 'I';
}

function url(dep, prov, dis) {
  return 'https://www.facilito.gob.pe/facilito/actions/MapaAction.do' +
    `?departamento=${dep}&provincia=${prov}&distrito=${dis}&producto=127` +
    '&method=mostrarMapa&subtitulocabecera=1&tipo=LIQ&codigoOSI=0';
}

// Facilito corta la conexion cada tanto: el cron fallo asi el 26/09/2026.
async function pedir(u, etiqueta) {
  for (let intento = 1; ; intento++) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return extraer(new TextDecoder('windows-1252').decode(await res.arrayBuffer()));
    } catch (e) {
      if (intento >= 3) throw new Error(`${etiqueta}: ${e.message} (tras ${intento} intentos)`);
      await new Promise(r => setTimeout(r, 2500 * intento));
    }
  }
}

function extraer(html) {
  const i = html.indexOf('listaPuntos');
  if (i < 0) return [];
  // cortar en el cierre del eval, NO en el primer "}]" (ese cierra "productos")
  const e = html.indexOf("+ ')'", i);
  if (e < 0) throw new Error('no pude delimitar el JSON (¿cambió la página?)');
  const a = html.indexOf('[{', i);
  if (a < 0 || a > e) return [];              // distrito sin grifos: listaPuntos = []
  return JSON.parse(html.slice(a, e).trim().replace(/'\s*$/, '').trim());
}

// La fuente escapa las comillas para el literal JS ("MZ. \'D\'"); las devolvemos a normal.
function limpiar(s) {
  return String(s).replace(/\\(['"])/g, '$1').replace(/\s+/g, ' ').trim();
}

function precio(p, re) {
  const x = p.productos.find(y => re.test(y.producto));
  return x && x.precioVenta != null ? x.precioVenta : null;
}

// Distritos ya conocidos: primero lo guardado, luego el respaldo manual.
function distritosGuardados() {
  const previo = {};
  const extra = path.join(ROOT, 'data', 'distritos-extra.json');
  if (fs.existsSync(extra)) {
    const j = JSON.parse(fs.readFileSync(extra, 'utf8'));
    Object.keys(j).forEach(k => { if (!k.startsWith('_')) previo[k] = j[k]; });
  }
  if (fs.existsSync(ARCHIVO)) {
    global.window = {};
    delete require.cache[require.resolve(ARCHIVO)];
    require(ARCHIVO);
    (global.window.DATA || []).forEach(r => { if (r[3]) previo[r[0]] = r[3]; });
  }
  return previo;
}

(async () => {
  const puntos = [];
  const zonaDe = {};
  for (const dep of Object.keys(DISTRITOS)) {
    const { prov, zona } = DISTRITOS[dep];
    const lote = await pedir(url(dep, prov, '9999999'), prov);
    lote.forEach(p => { zonaDe[p.codigoOsinergmin] = zona; puntos.push(p); });
    console.log(`  ${prov}: ${lote.length} grifos`);
  }

  // segunda pasada: quien vive en que distrito
  const distrito = distritosGuardados();
  let vistos = 0;
  for (const dep of Object.keys(DISTRITOS)) {
    const { prov, nombres } = DISTRITOS[dep];
    for (let k = 0; k < nombres.length; k++) {
      const cod = String(+prov + k + 1);     // 150100 + 1 => 150101
      const lote = await pedir(url(dep, prov, cod), nombres[k]);
      lote.forEach(p => { distrito[p.codigoOsinergmin] = nombres[k]; vistos++; });
    }
  }
  console.log(`  distritos: ${vistos} grifos ubicados`);

  // Facilito no indexa todos los grifos por distrito: Pueblo Libre (150121) devuelve 0,
  // y un grifo que desaparece un rato de Facilito pierde el distrito recordado.
  // Respaldo: geocodificacion inversa, aceptada solo si cae en un distrito conocido.
  // Maximo 15 por corrida para respetar el limite de Nominatim (1 por segundo).
  const sinTilde = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  const conocidos = {};
  Object.values(DISTRITOS).forEach(d => d.nombres.forEach(n => { conocidos[sinTilde(n)] = n; }));
  const pendientes = puntos.filter(p => !distrito[p.codigoOsinergmin]).slice(0, 15);
  for (const p of pendientes) {
    try {
      await new Promise(r => setTimeout(r, 1200));
      const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14' +
        `&lat=${p.latitud}&lon=${p.longitud}`,
        { headers: { 'User-Agent': 'grifos-lima/1.0 (github.com/Yufagb/grifos-lima)', 'Accept-Language': 'es' } });
      const a = (await res.json()).address || {};
      const nombre = sinTilde(a.city_district || a.suburb || a.town || a.city || '')
        .replace(/^CERCADO DE LIMA$/, 'LIMA');
      if (conocidos[nombre]) distrito[p.codigoOsinergmin] = conocidos[nombre];
    } catch (e) { /* queda sin distrito: la app muestra solo la zona */ }
  }
  if (pendientes.length) {
    const ok = pendientes.filter(p => distrito[p.codigoOsinergmin]).length;
    console.log(`  geocodificacion inversa: ${ok} de ${pendientes.length} resueltos`);
  }

  const sinDistrito = [];
  const filas = puntos.map(p => {
    const cod = p.codigoOsinergmin;
    if (!distrito[cod]) sinDistrito.push(`${cod} — ${limpiar(p.direccion).slice(0, 50)}`);
    return [
      cod, marca(p.unidad), zonaDe[cod] || 'L', distrito[cod] || '',
      limpiar(p.direccion), +p.latitud, +p.longitud,
      precio(p, /GASOHOL REGULAR/i), precio(p, /GASOHOL PREMIUM/i), precio(p, /Diesel/i),
      limpiar(p.unidad)
    ];
  }).sort((a, b) => (a[8] ?? 99) - (b[8] ?? 99));

  const hoy = new Date().toISOString().slice(0, 10);
  const porMarca = filas.reduce((o, f) => { o[f[1]] = (o[f[1]] || 0) + 1; return o; }, {});

  const cabecera = `// Grifos de Lima Metropolitana y Callao
// Fuente: Osinergmin Facilito, endpoint MapaAction.do?method=mostrarMapa (variable listaPuntos).
// Coordenadas, precios y distritos OFICIALES del propio Osinergmin. Consultado ${hoy}.
// [codigo, marca, zona, distrito, direccion, lat, lon, regular, premium, diesel, razonSocial]
// marca: C = COESTI (Primax operada), P = Primax afiliada, R = Repsol Comercial,
//        A = AVA (Global Fuel), I = independiente / sin cadena identificable.
//        Facilito publica la razon social, no el letrero: un "I" puede tener bandera de marca.
// zona:  L = Lima Metropolitana, K = Callao.   Precio null = producto no reportado.
window.FUENTE = "Osinergmin - Facilito (facilito.gob.pe)";
window.FECHA = "${hoy}";
window.DESCUENTOS = { C: 1.00, P: 1.00, R: 3.00, A: 0.00, I: 0.00 };
window.PRODUCTOS = [
  { id: 8, nombre: "Gasohol Premium" },
  { id: 7, nombre: "Gasohol Regular" },
  { id: 9, nombre: "Diesel B5 S-50 UV" }
];
`;

  fs.writeFileSync(ARCHIVO,
    cabecera + 'window.DATA = [\n' +
    filas.map(f => JSON.stringify(f)).join(',\n') + '\n];\n', 'utf8');

  console.log(`\nListo: ${filas.length} grifos, precios del ${hoy}`);
  console.log('  por marca:', JSON.stringify(porMarca));
  if (sinDistrito.length) {
    console.log(`\nAVISO — ${sinDistrito.length} sin distrito (no aparecieron en ninguna consulta distrital):`);
    sinDistrito.slice(0, 10).forEach(s => console.log('  ' + s));
  }
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
