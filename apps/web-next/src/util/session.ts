import envariant from '@knpwrs/envariant';
import { useSession } from 'vinxi/http';
import { getRequestEvent } from 'solid-js/web';
import invariant from 'tiny-invariant';

const COOKIE_SECRET = envariant('COOKIE_SECRET');

async function useConfiguredSession() {
  'use server';
  const event = getRequestEvent();
  invariant(event, 'event should be defined');

  return useSession({
    password: COOKIE_SECRET,
    cookie: {
      sameSite: 'lax',
    },
  });
}

export async function getSessionJwt() {
  'use server';
  const session = await useConfiguredSession();

  const jwt: string = session.data['jwt'];

  if (!jwt) return null;

  return jwt;
}

export async function setSessionJwt(jwt: string) {
  'use server';
  const session = await useConfiguredSession();

  await session.update((d) => {
    d['jwt'] = jwt;
  });
}

export async function clearSessionJwt() {
  'use server';
  const session = await useConfiguredSession();

  await session.update((d) => {
    d['jwt'] = undefined;
  });
}
