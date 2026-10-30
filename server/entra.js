import { ConfidentialClientApplication } from '@azure/msal-node';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import { IdentityValidationError, memberIdentity } from './security.js';

// Only fixed diagnostic labels reach logs; provider messages can contain secrets.
export function authFailureReason(error, fallback = 'identity_validation') {
  const membership = ['tenant_mismatch', 'invalid_object_id', 'missing_acct', 'not_tenant_member', 'nonce_mismatch', 'blocked', 'renewal_identity'];
  if (error instanceof IdentityValidationError && membership.includes(error.reason)) return error.reason;
  const provider = {
    7000215: 'invalid_client_secret', 7000222: 'expired_client_secret',
    700016: 'application_not_found', 50011: 'redirect_uri_mismatch',
  };
  if (Object.hasOwn(provider, error?.errorNo)) return provider[error.errorNo];
  const codes = ['invalid_client', 'invalid_grant', 'unauthorized_client', 'invalid_client_credential',
    'network_error', 'post_request_failed', 'endpoints_resolution_error',
    'ERR_JWT_EXPIRED', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED', 'ERR_JWKS_TIMEOUT', 'ERR_JWKS_NO_MATCHING_KEY'];
  const code = error?.errorCode || error?.code;
  if (codes.includes(code)) return code;
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    const claims = ['acct', 'iss', 'aud', 'tid', 'oid', 'nonce', 'iat', 'exp', 'sub'];
    if (claims.includes(error.claim)) return 'token_claim_' + error.claim;
    return 'token_claim_validation';
  }
  return fallback;
}

export async function validateIdToken(idToken, config, nonce, keys) {
  const {payload} = await jwtVerify(idToken, keys, {
    issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
    audience: config.clientId, algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat', 'sub', 'tid', 'oid', 'nonce', 'acct'],
  });
  return memberIdentity(payload, config.tenantId, nonce);
}

export function createEntra(config) {
  const authority = `https://login.microsoftonline.com/${config.tenantId}`;
  const keys = createRemoteJWKSet(new URL(authority + '/discovery/v2.0/keys'), {timeoutDuration: 8000});
  const client = () => new ConfidentialClientApplication({
    auth: {clientId: config.clientId, authority, clientSecret: config.clientSecret},
    system: {loggerOptions: {piiLoggingEnabled: false, loggerCallback: () => {}}},
  });
  const redirectUri = config.origin + '/auth/callback';
  return {
    async authorize(tx, silent) {
      return client().getAuthCodeUrl({
        scopes: ['openid', 'profile'], redirectUri, responseMode: 'query',
        state: tx.state, nonce: tx.nonce, prompt: silent ? 'none' : 'select_account',
        codeChallenge: createHash('sha256').update(tx.verifier).digest('base64url'), codeChallengeMethod: 'S256',
      });
    },
    async exchange(code, tx) {
      const result = await client().acquireTokenByCode({code, scopes: ['openid', 'profile'], redirectUri, codeVerifier: tx.verifier});
      return validateIdToken(result.idToken, config, tx.nonce, keys);
    },
    logoutUrl() {
      const url = new URL(authority + '/oauth2/v2.0/logout');
      url.searchParams.set('post_logout_redirect_uri', config.origin + '/login');
      return url.href;
    },
  };
}
