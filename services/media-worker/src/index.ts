export interface Env {
  PUBLIC: R2Bucket;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          Allow: 'GET',
        },
      });
    }

    const url = new URL(request.url);
    const key = url.pathname.slice(1);

    const object = await env.PUBLIC.get(key);

    if (!object) {
      return new Response('Object Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
  },
};
