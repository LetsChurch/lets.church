import { jwtVerify } from 'jose';

export interface Env {
  JWT_SECRET: string;
  PUBLIC: R2Bucket;
}

async function getAuthorizedPrefix(request: Request, env: Env) {
  const jwtSecret = new Uint8Array(
    env.JWT_SECRET.match(/../g)?.map((h) => parseInt(h, 16)) ?? [],
  );

  try {
    const jwt = request.headers.get('authorization')?.split(' ')[1];
    const {
      payload: { prefix },
    } = await jwtVerify(jwt ?? '', jwtSecret, { algorithms: ['HS512'] });

    if (typeof prefix !== 'string') {
      throw new Error();
    }

    return prefix;
  } catch (e) {
    return null;
  }
}

const ONE_DAY = `${60 * 60 * 24}`;
const Allow = 'GET, OPTIONS';

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === 'OPTIONS') {
      const headers = request.headers;
      const requestHeaders = headers.get('Access-Control-Request-Headers');

      if (
        headers.get('Origin') &&
        headers.get('Access-Control-Request-Method') &&
        requestHeaders
      ) {
        // Handle CORS pre-flight request
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
            'Access-Control-Max-Age': ONE_DAY,
            'Access-Control-Allow-Headers': requestHeaders,
          },
        });
      }

      // Handle standard options request
      return new Response(null, {
        headers: {
          Allow,
        },
      });
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          Allow,
        },
      });
    }

    const prefix = await getAuthorizedPrefix(request, env);

    if (!prefix) {
      return new Response('Bad Request', { status: 400 });
    }

    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    const cacheKey = url;

    if (!key.toUpperCase().startsWith(prefix.toUpperCase())) {
      return new Response('Bad Request', { status: 400 });
    }

    const cache = caches.default;

    let response = await cache.match(cacheKey);

    if (!response) {
      console.log(`CACHE MISS: ${cacheKey}`);
      const object = await env.PUBLIC.get(key);

      if (!object) {
        return new Response('Object Not Found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', `s-maxage=${ONE_DAY}`);
      headers.set('Access-Control-Allow-Origin', '*');

      response = new Response(object.body, { headers });

      console.log(`Storing in cache: ${cacheKey}`);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    } else {
      console.log(`CACHE HIT: ${cacheKey}`);
    }

    return response;
  },
};
