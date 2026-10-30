import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { createEntra } from '../server/entra.js';
import { testConfig, tenant, client, oid } from './helpers.js';

test('real MSAL code exchange binds the transaction nonce and rejects a different token nonce', async () => {
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const authority = `https://login.microsoftonline.com/${tenant}`;
  const issuer = authority + '/v2.0';
  const tx = {nonce: 'transaction-nonce', verifier: 'transaction-verifier'};
  let tokenNonce = tx.nonce;
  let networkFailure;
  const networkClient = {
    async sendGetRequestAsync(url) {
      if (url.includes('/discovery/instance')) {
        return {status: 200, headers: {}, body: {
          tenant_discovery_endpoint: authority + '/v2.0/.well-known/openid-configuration',
          metadata: [{preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.windows.net',
            aliases: ['login.microsoftonline.com', 'login.windows.net', 'login.microsoft.com', 'sts.windows.net']}],
        }};
      }
      assert.ok(url.includes('/.well-known/openid-configuration'));
      return {status: 200, headers: {}, body: {
        authorization_endpoint: authority + '/oauth2/v2.0/authorize',
        token_endpoint: authority + '/oauth2/v2.0/token',
        end_session_endpoint: authority + '/oauth2/v2.0/logout',
        issuer, jwks_uri: authority + '/discovery/v2.0/keys',
      }};
    },
    async sendPostRequestAsync(url, options) {
      try {
        const endpoint = new URL(url);
        assert.equal(endpoint.origin + endpoint.pathname, authority + '/oauth2/v2.0/token');
        const body = new URLSearchParams(options.body);
        assert.equal(body.get('code_verifier'), tx.verifier);
        assert.equal(body.get('redirect_uri'), testConfig().origin + '/auth/callback');
        const idToken = await new SignJWT({tid: tenant, oid, acct: 0, nonce: tokenNonce, name: 'Test member'})
          .setProtectedHeader({alg: 'RS256'}).setIssuer(issuer).setAudience(client)
          .setSubject('test-subject').setIssuedAt().setExpirationTime('5m').sign(privateKey);
        return {status: 200, headers: {}, body: {
          token_type: 'Bearer', scope: 'openid profile', expires_in: 300,
          access_token: 'synthetic-access-token', id_token: idToken,
          client_info: Buffer.from(JSON.stringify({uid: oid, utid: tenant})).toString('base64url'),
        }};
      } catch (error) { networkFailure = error; throw error; }
    },
  };
  const entra = createEntra(testConfig(), {networkClient, signingKeys: publicKey});
  const profile = await entra.exchange('synthetic-code', tx).catch(error => { throw networkFailure || error; });
  assert.equal(profile.id, tenant + ':' + oid);
  await assert.rejects(entra.exchange('synthetic-code', {...tx, nonce: undefined}),
    error => error.errorCode === 'nonce_mismatch');
  tokenNonce = 'another-login-nonce';
  await assert.rejects(entra.exchange('synthetic-code', tx), error => error.errorCode === 'nonce_mismatch');
});
