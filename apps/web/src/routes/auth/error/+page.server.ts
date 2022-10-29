import { redirect } from '@sveltejs/kit';
import { getSelfServiceError } from '../ory.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request }) => {
  const params = url.searchParams;
  const id = params.get('id');

  if (!id) {
    throw redirect(307, '/');
  }

  // The built-in authenticated fetch sends too much data to Ory and Ory rejects the request as a CSRF mismatch
  const cookie = request.headers.get('cookie') ?? '';
  const error = await getSelfServiceError(id, cookie);

  return { error };
};
