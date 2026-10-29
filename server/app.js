import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cookie, digest, equal, sessionStatus, token, validState } from './security.js';
import { createSchedules } from './schedules.js';

export const CAREERS = new Set(['aeronautica', 'bioingenieria', 'electronica', 'ferroviaria', 'industrial', 'mecanica']);
const root = resolve(import.meta.dirname, '..');

export async function createApp({config, store, entra, schedules, now = Date.now, audit = event => console.log(JSON.stringify(event))}) {
  const app = express();
  schedules ||= await createSchedules({store, now, intervalMs: config.scheduleRefreshMs, audit});
  const index = await readFile(resolve(root, 'index.html'), 'utf8');
  const login = await readFile(resolve(root, 'client/login.html'), 'utf8');
  // HTML parsers normalize CRLF before checking inline-script CSP hashes.
  const scripts = [...index.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].filter(m => m[1]).map(m => "'sha256-" + createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64') + "'");
  const sessionName = config.production ? '__Host-planificador' : 'planificador-session';
  const flowName = config.production ? '__Host-planificador-flow' : 'planificador-flow';
  const options = {httpOnly: true, secure: config.production, sameSite: 'lax', path: '/'};
  const developmentLogin = config.developmentLoginEnabled && !config.production && !config.authConfigured && !config.trustProxy;
  const developmentUserId = 'development:local-preview';
  const developmentCookie = 'planificador-dev-login';
  function localDevelopmentRequest(req) {
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
      req.get('host') === new URL(config.origin).host &&
      !req.get('x-forwarded-for') && !req.get('x-forwarded-proto') && !req.get('forwarded');
  }
  const emit = (event, req, reason) => audit({event, requestId: req.requestId,
    ...(req.user ? {actor: digest(req.user.id, config.sessionSecret).slice(0, 16)} : {}), ...(reason ? {reason} : {})});
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    req.requestId = token();
    res.set({'Cache-Control': 'no-store', 'X-Request-ID': req.requestId});
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: {directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", ...scripts], scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"],
      frameAncestors: ["'none'"], formAction: ["'self'"], baseUri: ["'none'"],
      upgradeInsecureRequests: config.production ? [] : null,
    }},
    strictTransportSecurity: config.production ? {maxAge: 31536000} : false,
    referrerPolicy: {policy: 'no-referrer'},
  }));
  app.use(express.json({limit: '1mb', strict: true}));
  app.get('/health/live', (req, res) => res.json({status: 'ok'}));
  app.get('/health/ready', async (req, res) => {
    try { await store.healthy(); res.status(config.authConfigured || developmentLogin ? 200 : 503).json({status: config.authConfigured ? 'ready' : developmentLogin ? 'development_ready' : 'configuration_pending'}); }
    catch { res.status(503).json({status: 'unavailable'}); }
  });
  for (const [url, file] of Object.entries({
    '/cleanup.js': 'client/cleanup.js', '/login.css': 'client/login.css', '/portal.js': 'client/portal.js', '/theme.js': 'client/theme.js',
    '/typography.css': 'client/typography.css', '/fonts/inter-variable.woff2': 'client/fonts/InterVariable.woff2',
    '/icon-192.png': 'icon-192.png', '/icon-512.png': 'icon-512.png', '/manifest.webmanifest': 'manifest.webmanifest',
  })) app.get(url, (req, res) => res.sendFile(resolve(root, file), {cacheControl: false}));
  app.get('/sw.js', (req, res) => res.type('application/javascript').sendFile(resolve(root, 'sw.js'), {cacheControl: false}));
  app.get('/login', (req, res) => {
    let message = config.authConfigured ? 'Ingresá con tu cuenta institucional.' : 'La configuración del acceso institucional está pendiente.';
    if (config.authConfigured && req.query.error) message = 'No se pudo autorizar el acceso. Usá una cuenta miembro de la universidad.';
    if (req.query.expired) message = 'La sesión terminó. Volvé a iniciar sesión.';
    const warning = !config.authConfigured || !!req.query.error || !!req.query.expired;
    let developmentForm = '';
    if (developmentLogin && localDevelopmentRequest(req)) {
      res.set('Referrer-Policy', 'same-origin');
      const csrfToken = token();
      res.cookie(developmentCookie, csrfToken, {...options, maxAge: config.policy.transactionMs});
      developmentForm = `<form action="/auth/dev-login" method="post"><input type="hidden" name="token" value="${csrfToken}"><button class="btn-alt" type="submit">Ingresar para pruebas</button></form>`;
    }
    res.type('html').send(login.replace('<!--MESSAGE-->', message).replace('<!--MESSAGE_CLASS-->', warning ? ' aviso' : '')
      .replace('<!--DISABLED-->', config.authConfigured ? '' : 'aria-disabled="true" tabindex="-1"')
      .replace('<!--DEVELOPMENT_LOGIN-->', developmentForm));
  });
  async function loadSession(req) {
    const raw = cookie(req, sessionName);
    return raw ? store.getSession(digest(raw, config.sessionSecret)) : null;
  }
  const authLimit = rateLimit({windowMs: 15 * 60_000, limit: 3000, standardHeaders: 'draft-8', legacyHeaders: false, message: {code: 'rate_limited'}});
  app.post('/auth/dev-login', authLimit, express.urlencoded({extended: false, limit: '2kb'}), async (req, res) => {
    if (!developmentLogin) return res.status(404).json({code: 'not_found'});
    if (!localDevelopmentRequest(req) || req.get('origin') !== config.origin ||
        !equal(req.body?.token, cookie(req, developmentCookie))) {
      return res.status(403).json({code: 'request_rejected'});
    }
    res.clearCookie(developmentCookie, options);
    const user = await store.upsertUser({id: developmentUserId, name: 'Cuenta de prueba local', email: ''});
    if (user.blocked) return res.status(403).json({code: 'request_rejected'});
    const previous = await loadSession(req);
    if (previous) await store.deleteSession(previous.id);
    const raw = token();
    const session = {id: digest(raw, config.sessionSecret), userId: user.id, authMethod: 'development', csrf: token(),
      createdAt: now(), lastActive: now(), validatedAt: now(), expiresAt: now() + config.policy.idleMs};
    await store.saveSession(session);
    res.cookie(sessionName, raw, options);
    req.user = user;
    emit('development_auth_succeeded', req);
    res.redirect('/');
  });
  app.get('/auth/login', authLimit, async (req, res) => {
    if (!config.authConfigured) return res.redirect('/login');
    const session = await loadSession(req);
    const status = sessionStatus(session, now(), config.policy);
    const renew = req.query.renew === '1' && status !== 'expired';
    const state = token(), binding = token();
    const tx = {
      id: digest(state, config.sessionSecret), state, nonce: token(), verifier: token(),
      binding: digest(binding, config.sessionSecret), expiresAt: now() + config.policy.transactionMs,
      sessionId: renew ? session.id : null,
    };
    await store.saveTransaction(tx);
    res.cookie(flowName, binding, {...options, maxAge: config.policy.transactionMs});
    emit('auth_started', req);
    res.redirect(await entra.authorize(tx, renew && req.query.interactive !== '1'));
  });
  app.get('/auth/callback', authLimit, async (req, res) => {
    if (!config.authConfigured) return res.redirect('/login');
    const state = req.query.state;
    const binding = cookie(req, flowName);
    const tx = typeof state === 'string' && /^[A-Za-z0-9_-]{43}$/.test(state) ? await store.takeTransaction(digest(state, config.sessionSecret)) : null;
    res.clearCookie(flowName, options);
    if (!tx || !binding || !equal(tx.binding, digest(binding, config.sessionSecret)) || tx.expiresAt <= now()) {
      emit('auth_rejected', req, 'invalid_transaction');
      return res.redirect('/login?error=authorization');
    }
    if (['login_required', 'interaction_required', 'consent_required'].includes(req.query.error)) {
      return res.redirect('/auth/login?renew=1&interactive=1');
    }
    if (req.query.error || typeof req.query.code !== 'string' || req.query.code.length > 8192) {
      emit('auth_rejected', req, 'provider_rejected');
      return res.redirect('/login?error=authorization');
    }
    try {
      const profile = await entra.exchange(req.query.code, tx);
      const user = await store.upsertUser(profile);
      if (user.blocked) throw new Error('blocked');
      req.user = user;
      const current = await loadSession(req);
      const previous = tx.sessionId ? await store.getSession(tx.sessionId) : null;
      if (tx.sessionId && (!previous || previous.id !== current?.id || previous.userId !== user.id || sessionStatus(previous, now(), config.policy) === 'expired')) throw new Error('renewal_identity');
      const raw = token();
      const session = {
        id: digest(raw, config.sessionSecret), userId: user.id, csrf: token(),
        createdAt: previous?.createdAt ?? now(), lastActive: previous?.lastActive ?? now(), validatedAt: now(),
      };
      session.expiresAt = Math.min(session.createdAt + config.policy.absoluteMs, session.lastActive + config.policy.idleMs);
      if (current) await store.deleteSession(current.id);
      await store.saveSession(session);
      res.cookie(sessionName, raw, options);
      emit('auth_succeeded', req);
      res.redirect('/');
    } catch {
      emit('auth_rejected', req, 'identity_validation');
      res.redirect('/login?error=authorization');
    }
  });
  async function authenticate(req, res, next) {
    if (!config.authConfigured && !developmentLogin) {
      if (req.originalUrl.startsWith('/api/')) return res.status(401).json({code: 'session_expired', login: '/login'});
      return res.redirect('/login');
    }
    const session = await loadSession(req);
    if (session?.authMethod === 'development' &&
        (!developmentLogin || !localDevelopmentRequest(req) || session.userId !== developmentUserId)) {
      await store.deleteSession(session.id);
      res.clearCookie(sessionName, options);
      if (req.originalUrl.startsWith('/api/')) return res.status(401).json({code: 'session_expired', login: '/login'});
      return res.redirect('/login');
    }
    if (!config.authConfigured && session && session.authMethod !== 'development') {
      if (req.originalUrl.startsWith('/api/')) return res.status(401).json({code: 'session_expired', login: '/login'});
      return res.redirect('/login');
    }
    const status = sessionStatus(session, now(), config.policy);
    const user = session ? await store.getUser(session.userId) : null;
    if (status === 'expired' || !user || user.blocked) {
      if (session) await store.deleteSession(session.id);
      res.clearCookie(sessionName, options);
      if (req.originalUrl.startsWith('/api/')) return res.status(401).json({code: 'session_expired', login: '/login?expired=1'});
      return res.redirect('/login?expired=1');
    }
    if (status === 'reauth_required') {
      const loginUrl = session.authMethod === 'development' ? '/login?expired=1' : '/auth/login?renew=1';
      if (req.originalUrl.startsWith('/api/')) return res.status(401).json({code: status, login: loginUrl});
      return res.redirect(loginUrl);
    }
    req.session = session;
    req.user = user;
    next();
  }
  function csrf(req, res, next) {
    if (req.get('origin') !== config.origin || !equal(req.get('x-csrf-token'), req.session.csrf)) {
      emit('csrf_rejected', req);
      return res.status(403).json({code: 'request_rejected'});
    }
    next();
  }
  async function touch(req) {
    req.session.lastActive = now();
    req.session.expiresAt = Math.min(req.session.createdAt + config.policy.absoluteMs, now() + config.policy.idleMs);
    await store.updateSession(req.session);
  }
  app.post('/auth/logout', async (req, res, next) => {
    req.session = await loadSession(req);
    if (!req.session) { res.clearCookie(sessionName, options); return res.json({redirect: '/login'}); }
    csrf(req, res, next);
  }, async (req, res) => {
    await store.deleteSession(req.session.id);
    res.clearCookie(sessionName, options);
    res.set('Clear-Site-Data', '"cache", "storage"');
    emit('logout', req);
    res.json({redirect: req.body?.microsoft === true && config.authConfigured ? entra.logoutUrl() : '/login'});
  });
  app.use('/api', authenticate, rateLimit({windowMs: 60_000, limit: 120, keyGenerator: req => req.session.id, standardHeaders: 'draft-8', legacyHeaders: false, message: {code: 'rate_limited'}}));
  app.get('/api/session', (req, res) => res.json({
    user: {account: digest(req.user.id, config.sessionSecret), name: req.user.name, email: req.user.email}, csrf: req.session.csrf,
    expiresAt: req.session.expiresAt, revalidateAt: req.session.validatedAt + config.policy.revalidateMs,
  }));
  app.use('/api', (req, res, next) => {
    if (!equal(req.get('x-portal-account'), digest(req.user.id, config.sessionSecret))) {
      return res.status(409).json({code: 'account_changed'});
    }
    next();
  });
  app.post('/api/activity', csrf, async (req, res) => { await touch(req); res.status(204).end(); });
  app.param('career', (req, res, next, career) => {
    if (!CAREERS.has(career)) return res.status(404).json({code: 'unknown_career'});
    next();
  });
  app.get('/api/plans/:career', async (req, res) => {
    const plan = await store.getPlan(req.user.id, req.params.career);
    res.json(plan || {revision: 0, data: null, updatedAt: null});
  });
  app.get('/api/schedules/:career', (req, res) => res.json(schedules.get(req.params.career)));
  app.put('/api/plans/:career', csrf, async (req, res) => {
    const {revision, data} = req.body || {};
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= 2147483647 || !validState(data)) return res.status(400).json({code: 'invalid_plan'});
    const plan = await store.putPlan(req.user.id, req.params.career, revision, data, now());
    if (!plan) return res.status(409).json({code: 'revision_conflict'});
    await touch(req);
    res.json(plan);
  });
  app.get(['/', '/index.html'], authenticate, (req, res) => res.type('html').send(index));
  app.use((req, res) => res.status(404).json({code: 'not_found'}));
  app.use((error, req, res, next) => {
    emit('request_failed', req, error.type === 'entity.too.large' ? 'body_limit' : 'internal');
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && error.status === 400 ? 400 : 503;
    res.status(status).json({code: status === 503 ? 'service_unavailable' : 'invalid_request', requestId: req.requestId});
  });
  return app;
}
