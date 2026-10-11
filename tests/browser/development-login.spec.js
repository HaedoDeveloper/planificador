import { test, expect } from '@playwright/test';
import { harness } from '../helpers.js';

let h;
test.beforeEach(async ({context}) => {
  h = await harness({authConfigured: false, developmentLoginEnabled: true});
  h.config.origin = h.origin;
  await context.addInitScript(() => localStorage.setItem('planificador-v2-carrera', 'mecanica'));
});
test.afterEach(async () => h.close());

test('temporary button opens the planner and supports saving and logout', async ({page}, info) => {
  await page.goto(h.origin);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [...document.fonts].some(font => font.family === 'Inter' && font.status === 'loaded'))).toBe(true);
  await expect(page.getByRole('button', {name: 'Ingresar para pruebas'})).toBeVisible();
  await page.screenshot({path: info.outputPath('temporary-login.png')});
  await page.getByRole('button', {name: 'Ingresar para pruebas'}).click();
  await expect(page.locator('body')).not.toHaveClass(/portal-esperando/);
  await expect(page.locator('#h1Carrera')).toContainText('Mecánica');
  await page.evaluate(async () => { ST.estados[1] = 'aprobada'; guardar(); await pushRemoto(); });
  expect((await h.store.getPlan('development:local-preview', 'mecanica')).data.estados[1]).toBe('aprobada');
  await page.locator('#btnSync').click();
  await expect(page.locator('#modal')).toContainText('Cuenta de prueba local');
  await page.locator('#syncSalir').click();
  await expect(page).toHaveURL(h.origin + '/login');
});

test('disabled temporary login has neither a button nor an accessible endpoint', async ({page}) => {
  const disabled = await harness({authConfigured: false, developmentLoginEnabled: false});
  try {
    await page.goto(disabled.origin + '/login');
    await expect(page.getByRole('button', {name: 'Ingresar para pruebas'})).toHaveCount(0);
    expect((await disabled.request('/auth/dev-login', {method: 'POST'})).status).toBe(404);
  } finally { await disabled.close(); }
});
