import { useSession } from '@solidjs/start/server';
import { getRequestEvent, type RequestEvent } from 'solid-js/web';
import invariant from 'tiny-invariant';

export async function getSessionJwt(event?: RequestEvent) {
  'use server';

  if (!event) return null;

  const session = await useSession(event, {
    password: 'TODO: port port port port port port port port',
  });

  const jwt: string = session.data['jwt'];

  if (!jwt) return null;

  return jwt;
}

export async function setSessionJwt(jwt: string) {
  'use server';
  const event = getRequestEvent();

  invariant(event, 'Event should be defined');

  const session = await useSession(event, {
    password: 'TODO: port port port port port port port port',
  });

  await session.update((d) => {
    d['jwt'] = jwt;
  });
}

export async function clearSessionJwt() {
  'use server';
  const event = getRequestEvent();

  invariant(event, 'Event should be defined');

  const session = await useSession(event, {
    password: 'TODO: port port port port port port port port',
  });

  await session.update((d) => {
    d['jwt'] = undefined;
  });
}
