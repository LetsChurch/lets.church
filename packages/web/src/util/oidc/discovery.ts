import { getIssuer, getOidcEndpoints, SUPPORTED_SCOPES } from './config';
import { SIGNING_ALG } from './keys';

// OpenID Provider metadata served at /.well-known/openid-configuration. Built
// lazily so importing this module doesn't require OIDC env to be configured.
export function getDiscoveryDocument() {
  const oidcEndpoints = getOidcEndpoints();
  return {
    issuer: getIssuer(),
    authorization_endpoint: oidcEndpoints.authorization,
    token_endpoint: oidcEndpoints.token,
    userinfo_endpoint: oidcEndpoints.userinfo,
    jwks_uri: oidcEndpoints.jwks,
    end_session_endpoint: oidcEndpoints.endSession,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [SIGNING_ALG],
    scopes_supported: [...SUPPORTED_SCOPES],
    // All clients are public (PKCE-only); no client authentication at the token
    // endpoint.
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'name',
      'preferred_username',
      'picture',
      'email',
      'email_verified',
    ],
  } as const;
}
