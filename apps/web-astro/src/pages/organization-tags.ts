import type { APIContext } from 'astro';
import { createClient } from '../util/server/gql';
import { organizationTagsQuery } from '../queries/churches';

export async function GET({ request, cookies }: APIContext) {
  if (request.headers.get('accept') !== 'application/json') {
    return new Response(null, { status: 400 });
  }

  const client = await createClient(
    request.headers,
    cookies.get('lcSession')?.value,
  );

  const res = await client.request(organizationTagsQuery);

  return new Response(JSON.stringify(res), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
