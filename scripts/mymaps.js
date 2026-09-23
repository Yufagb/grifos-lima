// Genera data/mymaps-lima-callao.csv, listo para importar en Google My Maps.
// El nombre del punto ya trae el precio, para que se lea en el pin sin abrirlo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.window = {};
require(path.join(ROOT, 'data', 'data.js'));
const { DATA, DESCUENTOS, FECHA } = global.window;

const MARCA = { C: 'Primax', P: 'Primax', R: 'Repsol', A: 'AVA' };
const ZONA = { L: 'Lima', K: 'Callao' };
const REGULAR = 7, PREMIUM = 8, DIESEL = 9;

// Producto para el nombre del pin: el que pases como argumento, o Premium.
const arg = (process.argv[2] || 'premium').toLowerCase();
const COL = arg === 'regular' ? REGULAR : arg === 'diesel' ? DIESEL : PREMIUM;
const ETIQUETA = COL === REGULAR ? 'Regular' : COL === DIESEL ? 'Diesel' : 'Premium';

const precio = (r, c) => (r[c] == null ? '' : r[c].toFixed(2));
const conDesc = (r, c) => (r[c] == null ? '' : (r[c] - DESCUENTOS[r[1]]).toFixed(2));

const rows = DATA
  .filter(r => r[COL] != null)
  .map(r => ({
    // My Maps usa la primera columna como título del pin si no eliges otra
    Nombre: MARCA[r[1]] + ' S/ ' + conDesc(r, COL),
    // My Maps detecta el rol por el nombre: en español confunde ambas con latitud
    // (la longitud de Lima, -77, tambien es una latitud valida). En ingles no falla.
    Latitude: r[5],
    Longitude: r[6],
    Marca: MARCA[r[1]],
    Distrito: r[3],
    Zona: ZONA[r[2]],
    Direccion: r[4],
    [ETIQUETA + '_con_descuento']: conDesc(r, COL),
    [ETIQUETA + '_lista']: precio(r, COL),
    Descuento: DESCUENTOS[r[1]].toFixed(2),
    Regular_lista: precio(r, REGULAR),
    Premium_lista: precio(r, PREMIUM),
    Diesel_lista: precio(r, DIESEL),
    Codigo_Osinergmin: r[0],
    Actualizado: FECHA
  }))
  .sort((a, b) => +a[ETIQUETA + '_con_descuento'] - +b[ETIQUETA + '_con_descuento']);

const cols = Object.keys(rows[0]);
const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
const csv = [cols.join(',')]
  .concat(rows.map(r => cols.map(c => q(r[c])).join(',')))
  .join('\n');

const salida = path.join(ROOT, 'data', 'mymaps-lima-callao.csv');
fs.writeFileSync(salida, '﻿' + csv, 'utf8');
console.log('Escrito:', salida);
console.log('Filas:', rows.length, '(límite de My Maps: 2000 por capa)');
console.log('Producto en el nombre del pin:', ETIQUETA);
console.log('\nEn My Maps: Importar -> posición por Latitud/Longitud -> título "Nombre"');
console.log('Luego: Estilo por "Marca" (color) y Etiquetas por "Nombre".');
