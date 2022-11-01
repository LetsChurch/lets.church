import { redirect } from '@sveltejs/kit';
import {
  getSelfServiceRedirect,
  getSelfServiceVerificationFlow,
} from '../ory.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request }) => {
  const params = url.searchParams;
  const flowId = params.get('flow');

  if (!flowId) {
    throw redirect(...getSelfServiceRedirect('verification'));
  }

  // The built-in authenticated fetch sends too much data to Ory and Ory rejects the request as a CSRF mismatch
  const cookie = request.headers.get('cookie') ?? '';
  const flowRes = await getSelfServiceVerificationFlow(flowId, cookie);

  return { oryUi: flowRes.ui };
};