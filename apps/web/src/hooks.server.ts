import envariant from '@knpwrs/envariant';
import type { HandleFetch } from '@sveltejs/kit';

const GRAPHQL_URL = envariant('GRAPHQL_URL');
const COOKIE_KEY = 'lcSessionId';

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  const cookie = event.request.headers.get('cookie');

  if (request.url.startsWith(GRAPHQL_URL) && cookie) {
    request.headers.set('cookie', cookie);
  }

  const res = await fetch(request);

  const cookieValue = res.headers
    .get('set-cookie')
    ?.replace(`${COOKIE_KEY}=`, '');

  if (cookieValue) {
    event.cookies.set(COOKIE_KEY, cookieValue, {
      sameSite: 'lax',
      httpOnly: true,
      path: '/',
    });
  }

  return res;
};
