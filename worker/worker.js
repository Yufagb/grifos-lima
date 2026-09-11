// Proxy CORS para que la app pueda consultar Facilito en vivo desde el navegador.
//
// Facilito no envía cabeceras CORS, así que el navegador bloquea la lectura de la
// respuesta aunque el servidor la devuelva. Este Worker la reenvía agregándolas.
//
// Sólo deja pasar URLs de facilito.gob.pe: si aceptara cualquier destino sería un
// proxy abierto y cualquiera podría usarlo para lavar tráfico a través de tu cuenta.

const PERMITIDO = /^https:\/\/www\.facilito\.gob\.pe\/facilito\//;

// Pon aquí los orígenes que pueden usar el Worker. '*' también funciona, pero
// restringirlo evita que otros sitios consuman tu cuota.
const ORIGENES = [
  'https://yufagb.github.io',
  'http://localhost:5173'
];

function cors(origen) {
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request) {
    const origen = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origen) });
    }

    const destino = new URL(request.url).searchParams.get('url');
    if (!destino) {
      return new Response('Falta el parámetro ?url=', { status: 400, headers: cors(origen) });
    }
    if (!PERMITIDO.test(destino)) {
      return new Response('Sólo se permite facilito.gob.pe', { status: 403, headers: cors(origen) });
    }

    const res = await fetch(destino, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; grifos-lima/1.0)' },
      // 5 minutos de caché en el borde: varias recargas seguidas no golpean Osinergmin
      cf: { cacheTtl: 300, cacheEverything: true }
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        ...cors(origen),
        'Content-Type': res.headers.get('Content-Type') || 'text/html;charset=ISO-8859-1',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }
};
