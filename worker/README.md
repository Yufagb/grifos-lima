# Proxy para "Actualizar precios ahora"

El botón de la app consulta Facilito en vivo, pero Facilito no envía cabeceras CORS
(verificado: la respuesta llega sin `Access-Control-Allow-Origin`, y un preflight
`OPTIONS` devuelve 403). El navegador recibe los bytes y se niega a dejárselos leer
al JavaScript. Por eso hace falta un intermediario que los reenvíe con esas cabeceras.

Por defecto la app usa `api.allorigins.win`, gratuito y sin registro, pero que se
satura con los ~259 KB de la consulta de Lima — en pruebas devolvió 500, 408 y 522
en tres intentos seguidos. Funciona a ratos; no es base para nada serio.

## Desplegar el tuyo (gratis, ~3 minutos)

1. Crea una cuenta en [dash.cloudflare.com](https://dash.cloudflare.com) si no tienes.
2. **Workers & Pages** → **Create** → **Start with Hello World!** → **Deploy**.
3. **Edit code**, borra todo y pega el contenido de [`worker.js`](worker.js).
4. Ajusta la lista `ORIGENES` si tu app vive en otra URL. **Deploy**.
5. Copia la URL que te queda (algo como `https://xxx.tu-usuario.workers.dev`).
6. En la app: **Buscador de lugares — configuración** → pega la URL en
   *Proxy propio*. Se guarda en tu navegador; no hay que tocar código.

El plan gratuito da 100 000 peticiones diarias. Cada "Actualizar precios ahora"
consume 2.

## Por qué el Worker sólo acepta facilito.gob.pe

Un proxy que reenvía a cualquier destino es un proxy abierto: cualquiera que
descubra tu URL puede usarlo para dirigir tráfico hacia otros sitios desde tu
cuenta. La lista blanca lo evita.
