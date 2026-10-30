import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { readConfig, SESSION_POLICY } from '../server/config.js';
import { IdentityValidationError, memberIdentity, sessionStatus, validState } from '../server/security.js';
import { authFailureReason, validateIdToken } from '../server/entra.js';
import { testConfig, tenant, client, oid } from './helpers.js';

test('production rejects missing secrets, HTTP, SQLite and public bindings', () => {
  assert.throws(() => readConfig({NODE_ENV: 'production'}));
  assert.throws(() => readConfig({NODE_ENV: 'production', APP_ORIGIN: 'https://planificador.frh.utn.edu.ar'}));
  assert.throws(() => readConfig({HOST: '0.0.0.0'}));
  assert.throws(() => readConfig({APP_ORIGIN: 'http://example.com'}));
  assert.throws(() => readConfig({MICROSOFT_TENANT_ID: 'common'}));
  assert.equal(readConfig({}).authConfigured, false);
});
test('session boundaries enforce idle, absolute and authority freshness independently', () => {
  const session = {createdAt: 0, lastActive: 0, validatedAt: 0};
  assert.equal(sessionStatus(session, 1, SESSION_POLICY), 'valid');
  assert.equal(sessionStatus(session, SESSION_POLICY.revalidateMs, SESSION_POLICY), 'reauth_required');
  assert.equal(sessionStatus(session, SESSION_POLICY.idleMs, SESSION_POLICY), 'expired');
  assert.equal(sessionStatus({...session, lastActive: SESSION_POLICY.absoluteMs, validatedAt: SESSION_POLICY.absoluteMs}, SESSION_POLICY.absoluteMs, SESSION_POLICY), 'expired');
});
test('membership fails closed for guests, missing acct, other tenants and nonce mismatch', () => {
  const claims = {tid: tenant, oid, acct: 0, nonce: 'test-nonce'};
  assert.equal(memberIdentity(claims, tenant, claims.nonce).id, tenant + ':' + oid);
  assert.equal(memberIdentity({...claims, acct: '0'}, tenant, claims.nonce).id, tenant + ':' + oid);
  for (const extra of [{acct: 1}, {acct: undefined}, {tid: client}, {nonce: 'different'}, {oid: ''}]) {
    assert.throws(() => memberIdentity({...claims, ...extra}, tenant, 'test-nonce'));
  }
});
test('JWT validation checks signature, issuer, audience, expiry, nonce and member status', async () => {
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const config = testConfig();
  const issue = (overrides = {}, key = privateKey) => new SignJWT({tid: tenant, oid, acct: 0, nonce: 'nonce',
    iss: `https://login.microsoftonline.com/${tenant}/v2.0`, aud: client, sub: 'subject',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...overrides})
    .setProtectedHeader({alg: 'RS256'}).sign(key);
  assert.equal((await validateIdToken(await issue(), config, 'nonce', publicKey)).id, tenant + ':' + oid);
  for (const claims of [{iss: 'https://example.invalid'}, {aud: tenant}, {exp: 1}, {nonce: 'wrong'}, {acct: 1}, {tid: client}]) {
    await assert.rejects(validateIdToken(await issue(claims), config, 'nonce', publicKey));
  }
  await assert.rejects(validateIdToken(await issue({}, other.privateKey), config, 'nonce', publicKey));
});
test('authentication diagnostics identify failures without logging provider data', () => {
  const sensitive = 'synthetic-test-credential sensitive provider detail';
  for (const [error, reason] of [
    [new IdentityValidationError('not_tenant_member'), 'not_tenant_member'],
    [{errorNo: '7000215', errorMessage: sensitive}, 'invalid_client_secret'],
    [{errorNo: 7000222}, 'expired_client_secret'],
    [{errorCode: 'invalid_client', message: sensitive}, 'invalid_client'],
    [{code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'acct', payload: sensitive}, 'token_claim_acct'],
    [{code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: sensitive}, 'token_claim_validation'],
    [{code: 'ERR_JWT_EXPIRED'}, 'ERR_JWT_EXPIRED'],
    [{errorCode: sensitive, code: sensitive, message: sensitive}, 'identity_validation'],
    [new Error(sensitive), 'identity_validation'],
    [null, 'identity_validation'],
  ]) assert.equal(authFailureReason(error), reason);
  assert.equal(authFailureReason(new Error(sensitive), 'session_persistence'), 'session_persistence');
  const claims = {tid: tenant, oid, acct: 0, nonce: 'nonce'};
  for (const [extra, reason] of [
    [{acct: undefined}, 'missing_acct'], [{acct: 1}, 'not_tenant_member'],
    [{tid: client}, 'tenant_mismatch'], [{oid: ''}, 'invalid_object_id'],
    [{nonce: 'wrong'}, 'nonce_mismatch'],
  ]) {
    assert.throws(() => memberIdentity({...claims, ...extra}, tenant, 'nonce'),
      error => authFailureReason(error) === reason);
  }
});

test('state validation bounds nesting, size and prototype keys', () => {
  assert.equal(validState({version: 1, estados: {}, examenes: []}), true);
  assert.equal(validState({version: 1, estados: []}), false);
  assert.equal(validState({version: 1, estados: {}, notes: 'x'.repeat(2001)}), false);
  assert.equal(validState(JSON.parse('{"version":1,"estados":{},"__proto__":{}}')), false);
});
