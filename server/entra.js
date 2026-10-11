import { ConfidentialClientApplication } from '@azure/msal-node';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import { memberIdentity } from './security.js';

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
