import { createCookieSessionStorage } from 'solid-start';

export const storage = createCookieSessionStorage({
  cookie: {
    name: 'lcSession',
    secure: import.meta.env.PROD,
    // secrets: [], // Not needed since gateway provides its own mechanism
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14, // 14 days
    httpOnly: true,
  },
});

export async function getSession(request: Request) {
  const cookie = request.headers.get('Cookie') ?? '';
  const session = await storage.getSession(cookie);

  return session;
}

export async function getSessionJwt(request: Request) {
  const session = await getSession(request);
  const jwt: string = session.get('jwt');

  if (!jwt) return null;

  return jwt;
}

export async function commitSession(
  ...args: Parameters<typeof storage.commitSession>
) {
  return storage.commitSession(...args);
}

export async function flashSuccess(request: Request, message: string) {
  const session = await getSession(request);
  const success = Array.from<string>(session.get('success') ?? []);
  session.flash('success', [...success, message]);

  return {
    headers: { 'Set-Cookie': await commitSession(session) },
  };
}

export async function getSuccessMessages(request: Request) {
  const session = await getSession(request);
  const success = Array.from<string>(session.get('success') ?? []);

  return {
    success,
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  };
}
