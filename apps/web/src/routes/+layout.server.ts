import type { LayoutServerLoad } from './$types';
import { getSelfServiceLogoutUrl, whoAmI } from './auth/ory.server';

export const load: LayoutServerLoad = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const session = await whoAmI(cookie);
  const logoutUrl = await getSelfServiceLogoutUrl(cookie);

  return { logoutUrl, session };
};
