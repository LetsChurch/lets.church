import type { Session } from '@ory/client';
import envariant from '@knpwrs/envariant';
import { getProperty, hasProperty } from 'dot-prop';

const KRATOS_URL = envariant('KRATOS_URL');

const anonymous = {
  'X-Hasura-Role': 'anonymous',
};

export default eventHandler(async (event) => {
  const cookieHeader =
    getHeader(event, 'cookie') ?? getHeader(event, 'x-cookie');

  const res = await fetch(`${KRATOS_URL}/sessions/whoami`, {
    headers: {
      Cookie: Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader,
    },
  });

  if (!res.ok) {
    return anonymous;
  }

  const session: Session = await res.json();

  if (!hasProperty(session.identity.metadata_public, 'role')) {
    return anonymous;
  }

  return {
    'X-Hasura-User-Id': session.identity.id,
    'X-Hasura-User-Verified': `${session.identity.verifiable_addresses.some(
      (a) => a.verified,
    )}`,
    'X-Hasura-Role': getProperty(session.identity.metadata_public, 'role'),
  };
});
