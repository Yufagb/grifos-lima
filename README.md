# Precios de combustible — Lima y Callao (Primax vs Repsol)

**App en vivo: https://yufagb.github.io/grifos-lima/**

Los precios se actualizan solos cada 3 horas
([workflow](.github/workflows/actualizar.yml)). Cada cambio republica el sitio.

## Marco normativo

El **Procedimiento PRICE**, aprobado por Resolución de Consejo Directivo
**Osinergmin N° 256-2021-OS/CD** (publicada el 27/12/2021, reemplaza a la RCD
N° 394-2005-OS/CD), rige lo que Facilito publica. Tres artículos importan acá:

- **Art. 5** — el registro de precios «debe ser actualizado **inmediatamente** cuando
  los precios sean objeto de alguna modificación». No hay ventana horaria ni día fijo:
  un precio puede cambiar a cualquier hora. Por eso el cron sondea cada 3 horas en vez
  de una vez al día.
- **Art. 3** — los agentes registran su lista de precios **sin considerar los descuentos
  comerciales**. Es decir, el precio de Facilito es el de lista: aplicar encima tu
  descuento de convenio, que es lo que hace esta app, es lo correcto. Pero ojo: un grifo
  puede tener promociones propias que tampoco están reflejadas.
- **Art. 18** — Facilito publica el último precio reportado «hasta por el plazo máximo de
  **treinta (30) días calendario**». Un grifo que no reporte puede mostrar un precio de
  hasta un mes atrás. La fecha que ves en la app es cuándo *nosotros* consultamos, no
  cuándo el grifo fijó ese precio.


Datos scrapeados de **Facilito (Osinergmin)** para comparar el precio real que pagas
aplicando tus descuentos de convenio.

| Marca | Descuento aplicado |
|---|---|
| Primax / COESTI | S/ 1.00 por galón (deducido de tus últimos 4 consumos) |
| Repsol | S/ 3.00 por galón |

## Archivos

- `data/data.js` — los 199 grifos COESTI/Primax y Repsol de Lima Metropolitana y Callao,
  con **coordenadas oficiales de Osinergmin** y los tres productos (Regular, Premium, Diesel B5 S-50).
- `data/premium-lima-callao.csv` — tabla final: precio de lista, descuento, precio final,
  coordenadas y código Osinergmin de cada grifo.
- `app/index.html` — mapa interactivo: todos los grifos con su precio, ranking, búsqueda
  alrededor y buscador de grifos sobre una ruta A → B.
- `scripts/build.js` — regenera el CSV y el resumen comparativo.

## Uso

Bajar precios frescos y regenerar todo:

```bash
node scripts/actualizar.js && node scripts/build.js && node scripts/mymaps.js
```

`actualizar.js` no necesita navegador: `MapaAction.do` responde a un GET pelado, sin sesión
ni reCAPTCHA. Por eso `.github/workflows/actualizar.yml` puede correrlo solo cada día.

Luego abre `app/index.html` en el navegador (funciona con doble clic, no necesita servidor).

En la app:

**Arriba, siempre a mano:** combustible (Premium / Regular / Diesel), marcas y **↻ Actualizar**,
que consulta Facilito en vivo a través del Worker de Cloudflare.

**Cerca de mí** — escribe un lugar, usa ◎ (tu ubicación) o ⌖ (marcar en el mapa) y busca solo.
Radio, galones y orden (costo total / precio / distancia); cambiarlos rehace la búsqueda.
Da una recomendación con su porqué, comparando contra el más barato y el más cercano.

**En mi ruta** — A y B, cada uno con ◎ y ⌖, y botón para invertirlos. Traza la ruta con OSRM y
lista los grifos a menos del desvío elegido, por **costo total** (tanqueo + combustible del
desvío ida y vuelta). Etiquetas: *precio más bajo*, *más cerca de B*, desvío y % del trayecto.

**Buscador**
- Busca primero entre los propios grifos (`repsol javier prado`, `primax surquillo`) y luego
  lugares en OpenStreetMap (Photon → Nominatim), **acotado a Lima y Callao**. Sin ese acote
  Photon buscaba en todo el mundo.
- Flechas y Enter para elegir. Si escribes y pulsas buscar sin elegir, toma el primer resultado.
- ◎ y ⌖ muestran la dirección real (geocodificación inversa), no coordenadas.
- Negocios pequeños que no están en OpenStreetMap: márcalos con ⌖, o pega tu API key de Google
  (Places API New) en *Ajustes* — se guarda solo en tu navegador.

**Mapa** — de lejos cada grifo es un punto de color y solo los resultados muestran precio; desde
zoom 13 aparecen todos. Evita la pila ilegible de 199 etiquetas en la vista de ciudad.
En el celular el mapa queda fijo arriba y la lista se desplaza por debajo.

**Navegación** — cada grifo trae Google Maps y Waze con las coordenadas oficiales de Osinergmin.

**Ajustes y filtros** (plegado, con resumen visible): descuentos por marca, rango de precio,
API key de Google y proxy alternativo.

## Cómo se scrapeó

`buscadorEESS.jsp` valida un token reCAPTCHA v3 **en el servidor**, así que `curl` recibe
`errorRecaptcha.jsp`. Todo se hace desde el navegador, regenerando el token con
`grecaptcha.execute()` en cada POST a `PreciosCombustibleAutomotorAction.do`:

1. `method=inicio` con `departamento_elegido`
2. `method=cambiarProvincia` con `provincia`
3. `method=cambiarProducto` con `producto=127` y `distrito=9999999`
   (el comodín devuelve **toda la provincia** de una sola vez)

Esa tabla da distrito, razón social, dirección y precio — pero **no coordenadas**.
Las coordenadas salen de otro endpoint, el que alimenta el mapa de Facilito:

```
/facilito/actions/MapaAction.do?departamento=150000&provincia=150100
  &distrito=9999999&producto=127&method=mostrarMapa&subtitulocabecera=1&tipo=LIQ&codigoOSI=0
```

La respuesta es una página con Google Maps que trae los datos embebidos en
`var listaPuntos = eval('(' + '[...]' + ')')`. Ese JSON tiene lo que importa:

```json
{"codigoOsinergmin":"9149","latitud":-12.173354,"longitud":-76.97784,
 "unidad":"REPSOL COMERCIAL S.A.C.","direccion":"CARRETERA PANAMERICANA SUR KM. 14.00 - URB. SAN JUAN",
 "productos":[{"producto":"GASOHOL REGULAR","precioVenta":19.99},
              {"producto":"GASOHOL PREMIUM","precioVenta":20.99},
              {"producto":"Diesel B5 S-50 UV","precioVenta":25.99}]}
```

Para extraerlo: buscar `[{` después de `listaPuntos` y cortar en `+ ')'` (no en el primer `}]`,
que cierra el array interno `productos`). El distrito no viene aquí; se une con la tabla de
precios normalizando la dirección.

Una versión anterior geocodificaba las direcciones contra Nominatim: **quedaba mal**.
El grifo 9149, por ejemplo, caía a 2.2 km de su ubicación real. No uses geocodificación
mientras `MapaAction` esté disponible.

## Limitaciones

- Los precios son los que cada grifo declara a Osinergmin; pueden estar desactualizados
  respecto al surtidor.
- Un par de grifos no reportan alguno de los tres productos; en la app desaparecen del mapa
  al seleccionar ese combustible (199 en Premium, 198 en Regular y Diesel).
- Se incluyen solo estaciones operadas por COESTI S.A. / Repsol Comercial S.A.C. y dos afiliadas
  Primax. Si tu convenio no aplica en afiliadas, filtra por marca `COESTI (Primax)`.
