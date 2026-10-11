import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchedules, parseScheduleHTML, MAX_SCHEDULE_BYTES, SCHEDULE_SOURCE } from '../server/schedules.js';
import { createStore } from '../server/store.js';
import { harness, testConfig } from './helpers.js';

const rules = {carrera: 'Mecánica', planActual: '2023', planesViejos: ['94'], regexIngles: '^(IN|I)[12]-M'};
const academic = {cycle: '2026', careers: {mecanica: {carrera: {horarios: rules}, comisiones: {comisiones: [{curso: 'bundled'}]}}}};
const row = overrides => ({Curso: '1M1', 'Nombre Materia': 'Física II', Plan: '2023', 'Tipo Dictado': 'A',
  'Día': 'Lunes', 'H. Comienzo': '18:30', 'H. Fin': '22:30', Aula: '101', Titular: 'Docente & colaborador', ...overrides});
const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;');
const block = (c = row(), career = rules.carrera, modality = 'presencial') =>
  `<div data-comision='${escape(JSON.stringify(c))}' data-carrera-nombre='${career}' data-modalidad='${modality}' class='materia-bloque extra'></div>`;
const html = (blocks = block(), cycle = '2026') => `<html><body><p id="page-hero-sub">Ciclo lectivo ${cycle}</p>${blocks}</body></html>`;
const response = content => new Response(content, {headers: {'content-type': 'text/html; charset=UTF-8'}});

test('HTML parser decodes entities, separates careers, groups days and supports mixed classes', async () => {
  const content = html(block() + block(row({'Día': 'Miércoles', Aula: 'Virtual'}), rules.carrera, 'virtual') + block() +
    block(row({Curso: '2E1'}), 'Electrónica') + block(row({Curso: 'IN1-M', 'Nombre Materia': 'Inglés I'}), 'Básicas') +
    block(row({Curso: 'A', 'Nombre Materia': 'Álgebra y Geometría Analítica'}), 'Básicas'));
  const parsed = await parseScheduleHTML(content, academic.careers);
  const physics = parsed.careers.mecanica.find(c => c.curso === '1M1');
  assert.equal(parsed.cycle, '2026');
  assert.equal(parsed.careers.mecanica.length, 3);
  assert.equal(physics.bloques.length, 2);
  assert.equal(physics.modalidad, 'mixta');
  assert.deepEqual(physics.docentes, ['Docente & colaborador']);
  assert.equal(physics.bloques[0].inicio, 1110);
});

test('current plans win over old plans and redundant recursante groups are excluded', async () => {
  const content = html(block() + block(row({Plan: '94', Curso: '1M2'})) +
    block(row({Plan: '94', Curso: '3M1', 'Nombre Materia': 'Materia compartida'})) +
    block(row({Plan: '94', Curso: '3M1-R', 'Nombre Materia': 'Materia compartida'})));
  const {careers} = await parseScheduleHTML(content, academic.careers);
  assert.deepEqual(careers.mecanica.map(c => [c.curso, c.compartida]), [['1M1', false], ['3M1', true]]);
});

test('invalid times, missing cycle, truncated HTML and oversized downloads are rejected', async () => {
  for (const content of [html(block(row({'H. Fin': '27:10'}))), html(block(row({'H. Fin': '17:30'}))),
    html().replace('Ciclo lectivo 2026', ''), html().replace('</html>', ''), 'x'.repeat(MAX_SCHEDULE_BYTES + 1)]) {
    await assert.rejects(parseScheduleHTML(content, academic.careers));
  }
});

test('central refresh persists atomically, deduplicates requests and retains last good data on failure', async t => {
  const store = await createStore(testConfig());
  await store.migrate(); t.after(() => store.close());
  let content = html(), time = Date.parse('2026-10-10T12:00:00Z'), calls = 0;
  const fetchImpl = async (url, options) => {
    assert.equal(url, SCHEDULE_SOURCE); assert.equal(options.redirect, 'error');
    calls++; await new Promise(resolve => setTimeout(resolve, 10)); return response(content);
  };
  const args = {store, academic, now: () => time, fetchImpl, audit: () => {}};
  const service = await createSchedules(args);
  assert.equal(service.get('mecanica').kind, 'bundled');
  await Promise.all([service.refresh(), service.refresh()]);
  assert.equal(calls, 1);
  const first = service.get('mecanica');
  assert.equal(first.kind, 'official');
  time += 1000;
  await service.refresh();
  assert.equal(service.get('mecanica').updatedAt, first.updatedAt);
  assert.notEqual(service.get('mecanica').checkedAt, first.checkedAt);
  const good = service.get('mecanica');
  content = html(block(row({Curso: '2E1'}), 'Electrónica'), '2027');
  await assert.rejects(service.refresh(), /incomplete_catalog/);
  assert.deepEqual(service.get('mecanica'), good);
  content = html(block(), '2025');
  await assert.rejects(service.refresh(), /cycle_regression/);
  assert.deepEqual((await createSchedules(args)).get('mecanica'), good);
  content = html(block(), '2027');
  await service.refresh();
  assert.equal(service.get('mecanica').cycle, '2027');
  time += 13 * 60 * 60_000;
  assert.equal(service.get('mecanica').stale, true);
  await service.stop();
});

test('partial catalogs and failed database writes never replace the active catalog', async () => {
  const baseline = {...academic, careers: {...academic.careers, electronica: academic.careers.mecanica}};
  baseline.careers.electronica = {carrera: {horarios: {...rules, carrera: 'Electrónica', regexIngles: '^IN1-E$'}}, comisiones: {comisiones: [{curso: 'base'}]}};
  const failingStore = {getSchedules: async () => null, putSchedules: async () => { throw new Error('storage_failure'); }};
  let content = html();
  const service = await createSchedules({store: failingStore, academic: baseline, fetchImpl: async () => response(content), audit: () => {}});
  await assert.rejects(service.refresh(), /incomplete_catalog/);
  content = html(block() + block(row({Curso: '2E1'}), 'Electrónica'));
  await assert.rejects(service.refresh(), /storage_failure/);
  assert.equal(service.get('mecanica').kind, 'bundled');
  await service.stop();
});

test('upstream content type, HTTP failure and streamed size limit are enforced', async () => {
  for (const factory of [() => new Response('bad', {status: 503}), () => new Response(html()),
    () => response('x'.repeat(MAX_SCHEDULE_BYTES + 1)),
    () => new Response('', {headers: {'content-type': 'text/html', 'content-length': String(MAX_SCHEDULE_BYTES + 1)}})]) {
    const service = await createSchedules({store: {getSchedules: async () => null}, academic, fetchImpl: async () => factory(), audit: () => {}});
    await assert.rejects(service.refresh());
    assert.equal(service.get('mecanica').kind, 'bundled');
    await service.stop();
  }
});

test('schedule API is read-only, authenticated, career-scoped and shared across users', async t => {
  const h = await harness(); t.after(() => h.close());
  assert.equal((await h.request('/api/schedules/mecanica')).status, 401);
  const a = await h.session(), b = await h.session('44444444-4444-4444-4444-444444444444');
  const headers = auth => ({cookie: auth.cookie, 'x-portal-account': auth.account});
  const own = await (await h.request('/api/schedules/mecanica', {headers: headers(a)})).json();
  assert.ok(own.comisiones.length > 0);
  assert.deepEqual(await (await h.request('/api/schedules/mecanica', {headers: headers(b)})).json(), own);
  assert.equal((await h.request('/api/schedules/no-existe', {headers: headers(a)})).status, 404);
  assert.equal((await h.request('/api/schedules/mecanica', {method: 'POST', headers: headers(a)})).status, 404);
});
