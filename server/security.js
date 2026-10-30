import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const token = () => randomBytes(32).toString('base64url');
export const digest = (value, secret) => createHmac('sha256', secret).update(value).digest('hex');
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function cookie(req, name) {
  const entries = (req.headers.cookie || '').split(';').map(x => x.trim().split('='));
  const found = entries.filter(([key]) => key === name);
  return found.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(found[0][1] || '') ? found[0][1] : null;
}
export function sessionStatus(session, now, policy) {
  if (!session || now - session.createdAt >= policy.absoluteMs || now - session.lastActive >= policy.idleMs) return 'expired';
  if (now - session.validatedAt >= policy.revalidateMs) return 'reauth_required';
  return 'valid';
}
export class IdentityValidationError extends Error {
  constructor(reason) {
    super('Institutional membership validation failed.');
    this.reason = reason;
  }
}
export function memberIdentity(claims, tenantId, expectedNonce) {
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (claims.tid?.toLowerCase() !== tenantId) throw new IdentityValidationError('tenant_mismatch');
  if (!guid.test(claims.oid || '')) throw new IdentityValidationError('invalid_object_id');
  if (claims.acct === undefined) throw new IdentityValidationError('missing_acct');
  if (![0, '0'].includes(claims.acct)) throw new IdentityValidationError('not_tenant_member');
  if (!equal(claims.nonce, expectedNonce)) throw new IdentityValidationError('nonce_mismatch');
  return {
    id: tenantId + ':' + claims.oid.toLowerCase(),
    name: typeof claims.name === 'string' ? claims.name.slice(0, 160) : 'Cuenta institucional',
    email: typeof claims.preferred_username === 'string' ? claims.preferred_username.slice(0, 254) : '',
  };
}
export function validState(data) {
  if (!data || data.version !== 1 || !data.estados || typeof data.estados !== 'object' || Array.isArray(data.estados)) return false;
  // Bound work and reject prototype keys before accepting an imported JSON document.
  let count = 0;
  function check(value, depth = 0) {
    if (++count > 50_000 || depth > 16) return false;
    if (typeof value === 'string') return value.length <= 2000;
    if (typeof value === 'number') return Number.isFinite(value);
    if (value === null || typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length <= 2500 && value.every(x => check(x, depth + 1));
    if (typeof value !== 'object') return false;
    return Object.entries(value).every(([key, v]) => !['__proto__', 'constructor', 'prototype'].includes(key) && check(v, depth + 1));
  }
  return check(data);
}
