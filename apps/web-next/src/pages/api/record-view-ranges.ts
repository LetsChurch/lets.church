import type { APIRoute } from 'astro';
import { gql } from 'graphql-request';
import * as z from 'zod';
import { createClient } from '../../util/server/gql';

const bodySchema = z.object({
  id: z.string(),
  viewId: z.string().uuid().nullable(),
  ranges: z.array(z.object({ start: z.number(), end: z.number() })),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  const client = await createClient(
    request.headers,
    cookies.get('lcSession')?.value,
  );

  const body = bodySchema.parse(await request.json());

  const res = await client.request(
    gql`
      mutation MediaRouteRecordViewRanges(
        $id: ShortUuid!
        $ranges: [TimeRange!]!
        $viewId: Uuid
      ) {
        viewId: recordUploadRangesView(
          uploadRecordId: $id
          ranges: $ranges
          viewId: $viewId
        )
      }
    `,
    body,
  );

  return new Response(JSON.stringify(res));
};
