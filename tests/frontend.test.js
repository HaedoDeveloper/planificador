import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext, runInContext } from 'node:vm';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const legacy = await readFile(new URL('../legacy/index.html', import.meta.url), 'utf8');
test('academic datasets remain identical to the supplied application', () => {
  for (const name of ['CARRERAS', 'CALENDARIO']) {
    const line = source => source.split(/\r?\n/).find(x => x.startsWith('const ' + name + ' ='));
    assert.equal(line(index), line(legacy));
  }
  for (const match of index.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new Script(match[1]);
  assert.ok(!index.includes('GoogleAuthProvider'));
  assert.ok(!index.includes('serviceWorker.register'));
  assert.ok(!/\bonclick="/.test(index));
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
