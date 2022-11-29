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

export async function getSessionJwt(request: Request) {
  const cookie = request.headers.get('Cookie') ?? '';
  const session = await storage.getSession(cookie);
  const jwt: string = session.get('jwt');

  if (!jwt) return null;

  return jwt;
}
