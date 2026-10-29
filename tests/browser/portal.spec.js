import { test, expect } from '@playwright/test';
import { harness } from '../helpers.js';

let h;
test.beforeEach(async ({context}) => {
  h = await harness();
  h.config.origin = h.origin;
  const auth = await h.session();
  await context.addCookies([{name: 'planificador-session', value: auth.raw, url: h.origin, httpOnly: true, sameSite: 'Lax'}]);
  await context.addInitScript(() => localStorage.setItem('planificador-v2-carrera', 'mecanica'));
});
test.afterEach(async () => h.close());

async function open(page) {
  await page.goto(h.origin);
  await expect(page.locator('body')).not.toHaveClass(/portal-esperando/);
  await page.evaluate(() => document.fonts.ready);
}

test('academic views render with CSP, assets and responsive layout', async ({page}, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  for (const view of ['hoy', 'materias', 'grilla', 'agenda', 'mapa', 'simulador', 'avance']) {
    await page.locator(`.nav-int button[data-vista="${view}"]`).click();
    await expect(page.locator('#vista-' + view)).toBeVisible();
  }
  await page.locator('.nav-int button[data-vista="materias"]').click();
  const typography = await page.evaluate(() => ({
    family: getComputedStyle(document.body).fontFamily,
    loaded: [...document.fonts].some(font => font.family === 'Inter' && font.status === 'loaded'),
  }));
  expect(typography.family).toContain('Inter');
  expect(typography.loaded).toBe(true);
  await page.screenshot({path: info.outputPath('materias.png'), fullPage: true});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  expect(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
});

test('saving and reloading preserve server data without browser progress storage', async ({page}) => {
  await open(page);
  await page.evaluate(() => { ST.estados[1] = 'aprobada'; guardar(); });
  await expect.poll(() => h.store.getPlan((h.config.tenantId + ':33333333-3333-3333-3333-333333333333'), 'mecanica').then(x => x?.data.estados[1])).toBe('aprobada');
  await expect(page.locator('#estadoSync')).toContainText('Guardado');
  await page.reload();
  await expect(page.locator('body')).not.toHaveClass(/portal-esperando/);
  expect(await page.evaluate(() => ST.estados[1])).toBe('aprobada');
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /frh-v1|sync-activo/.test(key)))).toBe(false);
});

test('account menu groups data actions, works with the keyboard and keeps the header compact', async ({page}, info) => {
  await open(page);
  const menu = page.locator('#menuCuenta'), button = page.locator('#btnSync');
  await expect(menu).toBeHidden();
  await button.focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#syncSubir')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btnExportar')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('#syncSalirMicrosoft')).toBeFocused();
  await expect(page.locator('#btnReiniciar')).toContainText('Reiniciar plan de Mecánica');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await expect(menu).toBeVisible();
  await page.screenshot({path: info.outputPath('menu-cuenta.png')});
  await page.locator('main').click({position: {x: 5, y: 5}});
  await expect(menu).toBeHidden();
  const header = await page.locator('.head-int').boundingBox();
  expect(header.height).toBeLessThan(info.project.name === 'mobile' ? 70 : 80);
});

test('central schedules replace user overrides and preserve choices and progress without manual extraction', async ({page}) => {
  await open(page);
  await page.locator('.nav-int button[data-vista="grilla"]').click();
  await expect(page.locator('#btnActualizarHorarios')).toHaveCount(0);
  const choice = await page.evaluate(async () => {
    const c = COMISIONES[0];
    ST.estados[c.orden] = 'cursando'; ST.grilla[c.orden] = claveCom(c);
    guardar(); await pushRemoto();
    return {orden: c.orden, curso: c.curso, key: claveCom(c), materia: c.materia};
  });
  let retired = false;
  await page.route('**/api/schedules/mecanica', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.cycle = '2027'; body.hash = retired ? 'new-withdrawn' : 'new-hours'; body.kind = 'official';
    body.checkedAt = '2026-10-10T12:00:00Z'; body.updatedAt = body.checkedAt; body.stale = false;
    body.comisiones = body.comisiones.filter(c => !retired || c.curso !== choice.curso || c.materia !== choice.materia);
    for (const c of body.comisiones) if (c.curso === choice.curso && c.materia === choice.materia) c.bloques[0].aula = 'Aula actualizada';
    await route.fulfill({response, json: body});
  });
  await page.evaluate(() => cargarHorariosServidor('mecanica'));
  expect(await page.evaluate(key => todasComs().find(c => claveCom(c) === key).bloques[0].aula, choice.key)).toBe('Aula actualizada');
  await expect(page.locator('#subCarrera')).toContainText('Horarios 2027');
  await expect(page.locator('#horariosInfo')).toContainText('Verificados');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  retired = true;
  await page.evaluate(() => cargarHorariosServidor('mecanica'));
  const state = await page.evaluate(o => ({choice: ST.grilla[o], progress: ST.estados[o], personalSchedules: ST.horarios}), choice.orden);
  expect(state).toEqual({choice: choice.key, progress: 'cursando', personalSchedules: null});
  const saved = await h.store.getPlan(h.config.tenantId + ':33333333-3333-3333-3333-333333333333', 'mecanica');
  expect(saved.revision).toBe(1);
});

test('offline locks the UI, retires workers and allows online recovery', async ({page, context}) => {
  await open(page);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(x => x.length))).toBe(0);
  await context.setOffline(true);
  await expect(page.locator('body')).toHaveClass(/portal-esperando/);
  await expect(page.locator('#portalMensaje')).toHaveText('Sin conexión');
  await expect(page.locator('header')).toBeHidden();
  await context.setOffline(false);
  await page.locator('#portalReintentar').click();
  await expect(page.locator('body')).not.toHaveClass(/portal-esperando/);
});

test('concurrent devices ask before replacing data and can choose the server copy', async ({page, context}) => {
  await open(page);
  const second = await context.newPage();
  await open(second);
  await page.evaluate(async () => { ST.estados[1] = 'aprobada'; guardar(); await pushRemoto(); });
  await second.evaluate(() => { ST.estados[1] = 'regular'; guardar(); });
  await expect(second.locator('#confServidor')).toBeVisible();
  await second.locator('#confServidor').click();
  expect(await second.evaluate(() => ST.estados[1])).toBe('aprobada');
});

test('logging out clears the plan and cannot reopen protected views', async ({page}) => {
  await open(page);
  await page.locator('#btnSync').click();
  await page.locator('#syncSalir').click();
  await expect(page).toHaveURL(h.origin + '/login');
  await page.goto(h.origin);
  await expect(page).toHaveURL(/\/login/);
});

test('switching accounts in another tab does not transfer the previous plan', async ({page, context}) => {
  await open(page);
  await page.evaluate(async () => { ST.estados[1] = 'aprobada'; guardar(); await pushRemoto(); });
  const next = await h.session('44444444-4444-4444-4444-444444444444');
  await context.addCookies([{name: 'planificador-session', value: next.raw, url: h.origin, httpOnly: true, sameSite: 'Lax'}]);
  await page.evaluate(() => apiPortal('/api/session').catch(() => {}));
  await expect(page.locator('body')).not.toHaveClass(/portal-esperando/);
  await expect.poll(() => page.evaluate(() => ST.estados[1])).toBe(undefined);
  expect(await h.store.getPlan(next.session.userId, 'mecanica')).toBe(null);
});

test('switching careers while saving keeps independent plans', async ({page}) => {
  await open(page);
  await page.evaluate(() => { ST.estados[1] = 'aprobada'; guardar(); usarCarrera('industrial'); });
  await expect(page.locator('body')).not.toHaveClass(/portal-esperando/);
  await page.evaluate(async () => { ST.estados[1] = 'regular'; guardar(); await pushRemoto(); });
  await page.evaluate(() => usarCarrera('mecanica'));
  await expect(page.locator('body')).not.toHaveClass(/portal-esperando/);
  expect(await page.evaluate(() => ST.estados[1])).toBe('aprobada');
  await page.evaluate(() => usarCarrera('industrial'));
  await expect(page.locator('body')).not.toHaveClass(/portal-esperando/);
  expect(await page.evaluate(() => ST.estados[1])).toBe('regular');
});
