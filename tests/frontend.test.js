import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext, runInContext } from 'node:vm';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const legacy = await readFile(new URL('../legacy/index.html', import.meta.url), 'utf8');
const dataset = (source, name) => {
  const line = source.split(/\r?\n/).find(line => line.startsWith('const ' + name + ' ='));
  return JSON.parse(line.slice(line.indexOf('=') + 1).trim().replace(/;$/, ''));
};
const careers = dataset(index, 'CARRERAS');
const aero2026 = JSON.parse(await readFile(new URL('./fixtures/aeronautica-ord2187.json', import.meta.url), 'utf8'));

test('other careers, elective rules and calendar retain their original datasets', () => {
  const original = dataset(legacy, 'CARRERAS');
  for (const slug of Object.keys(original).filter(slug => slug !== 'aeronautica')) {
    assert.deepEqual(careers[slug], original[slug], slug);
  }
  const unchangedAero = source => {
    const aero = structuredClone(source.aeronautica);
    delete aero.carrera.normativa;
    delete aero.carrera.fuente;
    delete aero.catalogo._generado;
    delete aero.catalogo.integradoraExigeElectivas;
    delete aero.catalogo.reglasEspeciales['50'];
    for (const order of [3, 13, 15, 29, 39, 40]) delete aero.catalogo.correlativas[order];
    for (const m of aero.catalogo.materias) if ([3, 29, 39].includes(m.o)) delete m.nivel;
    return aero;
  };
  assert.deepEqual(unchangedAero(careers), unchangedAero(original));
  assert.deepEqual(dataset(index, 'CALENDARIO'), dataset(legacy, 'CALENDARIO'));
  for (const match of index.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new Script(match[1]);
  assert.ok(!index.includes('GoogleAuthProvider'));
  assert.ok(!index.includes('serviceWorker.register'));
  assert.ok(!/\bonclick="/.test(index));
});
test('all 50 Aeroespacial subjects match the levels and prerequisites in Ord. 2187', () => {
  const catalog = careers.aeronautica.catalogo;
  assert.equal(catalog.materias.filter(m => !m.electiva).length, 50);
  for (const [level, orders] of Object.entries(aero2026.niveles)) {
    for (const order of orders) {
      assert.equal(catalog.materias.find(m => m.o === order).nivel, Number(level), 'nivel ' + order);
      const actual = catalog.correlativas[order] || {c: [], a: []};
      const expected = aero2026.correlativas[order] || {c: [], a: []};
      for (const type of ['c', 'a']) assert.deepEqual([...actual[type]].sort((a,b) => a-b),
        [...expected[type]].sort((a,b) => a-b), 'materia ' + order + ' ' + type);
    }
  }
});

test('Aeroespacial eligibility follows the new chains and requires electives for Proyecto Final', () => {
  const catalog = careers.aeronautica.catalogo;
  const ctx = createContext({});
  runInContext(index.slice(index.indexOf('(function (raiz, fabrica)'), index.indexOf('const CARRERAS =')), ctx);
  const motor = ctx.crearMotorAcademico({...catalog,
    horasElectiva: m => m.hs * (m.cuatrimestral ? 0.5 : 1)});
  assert.equal(motor.cursableCon(3, {2: 'regular'}), false);
  assert.equal(motor.cursableCon(3, {1: 'regular', 2: 'regular', 4: 'regular'}), true);
  assert.equal(motor.cursableCon(13, {2: 'regular', 5: 'regular'}), true);
  assert.equal(motor.cursableCon(13, {3: 'regular', 5: 'regular'}), false);
  assert.equal(motor.cursableCon(15, {4: 'regular', 5: 'regular', 6: 'regular'}), true);
  assert.equal(motor.cursableCon(15, {6: 'regular', 14: 'regular'}), false);
  const motors = {10: 'aprobada', 12: 'aprobada', 22: 'regular', 24: 'regular', 26: 'regular'};
  assert.equal(motor.cursableCon(29, motors), false);
  assert.equal(motor.cursableCon(29, {...motors, 31: 'regular'}), true);
  const design = {10: 'aprobada', 20: 'regular', 24: 'regular', 26: 'regular'};
  assert.equal(motor.cursableCon(39, design), true);
  assert.equal(motor.rendibleCon(39, {...design, 39: 'regular'}), false);
  assert.equal(motor.rendibleCon(39, {10: 'aprobada', 20: 'aprobada', 24: 'aprobada', 26: 'aprobada', 39: 'regular'}), true);
  const flight = {10: 'aprobada', 20: 'aprobada', 29: 'regular', 32: 'regular', 33: 'regular'};
  assert.equal(motor.cursableCon(40, flight), false);
  assert.equal(motor.cursableCon(40, {...flight, 29: 'sin', 39: 'regular'}), true);
  const completed = Object.fromEntries(catalog.materias.filter(m => !m.electiva).map(m => [m.o, 'aprobada']));
  completed[50] = 'regular';
  assert.equal(motor.rendibleCon(50, completed), false);
  assert.equal(motor.rendibleCon(50, {...completed, 101: 'aprobada'}), false);
  assert.equal(motor.rendibleCon(50, {...completed, 101: 'aprobada', 102: 'aprobada'}), true);
  assert.ok(Number.isFinite(motor.analizarRutaCritica({}).escalones));
});

test('imported HTML is escaped in conflict rendering and invalid exam time is dropped', () => {
  const helper = index.slice(index.indexOf('const LARGO ='), index.indexOf('const minToTime ='));
  const sanitizer = index.slice(index.indexOf('function sanearEstado(d){'), index.indexOf('function aplicarComisionesDe('));
  const escaping = index.slice(index.indexOf('const escHTML ='), index.indexOf('const LARGO ='));
  const line = index.split(/\r?\n/).find(x => x.includes('const avisos=choques.map'));
  const ctx = createContext({porOrden:{1:{nombre:'Materia'}}, ESTADOS:{}, TIPOS_EX:{parcial:'Parcial'}, PRIORIDADES:{media:'Media'}, DIAS:['','Lunes'], MAX_ITEMS:20,
    hm:n=>String(n), ocupados:[], choques:[{a:{orden:1,curso:'<b>prueba</b>'}, b:{orden:1,curso:'B'},dia:1,ba:{inicio:10,fin:30},bb:{inicio:20,fin:40}}]});
  runInContext(escaping + helper + sanitizer + line + ';globalThis.output=avisos[0];globalThis.clean=sanearEstado({version:1,estados:{},examenes:[{id:1,o:1,tipo:"parcial",fecha:null,hora:"<b>"}]});', ctx);
  assert.ok(ctx.output.includes('&lt;b&gt;prueba&lt;/b&gt;'));
  assert.ok(!ctx.output.includes('<b>prueba</b>'));
  assert.equal(ctx.clean.examenes[0].hora, '');
  runInContext('globalThis.personal=sanearEstado({version:1,estados:{},horarios:{actualizado:"2026",comisiones:[{curso:"privado",materia:"Materia",bloques:[]}]}});', ctx);
  assert.equal(ctx.personal.horarios, null);
});
