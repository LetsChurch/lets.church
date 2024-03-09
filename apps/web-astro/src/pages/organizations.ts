import type { APIContext } from 'astro';
import { createClient } from '../util/server/gql';
import { ministriesQuery, organizationQuery } from '../queries/churches';

export async function GET({ request, cookies }: APIContext) {
  if (request.headers.get('accept') !== 'application/json') {
    return new Response(null, { status: 400 });
  }

  const id = new URL(request.url).searchParams.get('id')?.trim();

  const client = await createClient(
    request.headers,
    cookies.get('lcSession')?.value,
  );

  if (id) {
    const data = await client.request(organizationQuery, { id });

    return new Response(JSON.stringify(data.organizationById), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const q = new URL(request.url).searchParams.get('q')?.trim();

  if (!q) {
    return new Response(null, { status: 400 });
  }

  const data = await client.request(ministriesQuery, {
    query: q,
  });

  return new Response(JSON.stringify(data.search.edges), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
