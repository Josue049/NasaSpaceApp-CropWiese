'use strict';
// El inventario de parámetros debe estar completo, bien clasificado y ser coherente con el motor.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { inventory, CATS } = require('../src/parametros');
const E2 = require('../src/engine2');

const inv = inventory();

test('Todo parámetro del motor v2 (PARAMS) está inventariado y con la misma categoría', () => {
  for (const [k, p] of Object.entries(E2.PARAMS)) {
    const hits = inv.filter((x) => x.donde.includes('PARAMS.' + k) || x.donde.includes('PARAMS.' + k.replace('_mm_day', '').replace('_mm', '')) || x.id === k);
    const alt = inv.filter((x) => new RegExp(`PARAMS\\.${k}\\b|PARAMS\\.${k.replace(/_/g, '[_/]')}`).test(x.donde));
    assert.ok(hits.length + alt.length > 0, `parámetro sin inventariar: ${k}`);
    const cat = (hits[0] || alt[0]).cat;
    assert.equal(cat, p.cat, `categoría distinta para ${k}: inventario ${cat}, motor ${p.cat}`);
  }
});

test('Categorías válidas; todo parámetro E (hipótesis) declara su efecto y no se llama «literatura»', () => {
  for (const x of inv) {
    assert.ok(CATS[x.cat], `categoría inválida en ${x.id}`);
    assert.ok(x.fuente && x.metodo && x.efecto && x.agricultor, `faltan campos en ${x.id}`);
  }
  for (const [k, p] of Object.entries(E2.PARAMS)) if (p.cat === 'E') assert.ok(!/LITERATURA/.test(p.status), `hipótesis presentada como literatura: ${k}`);
  assert.ok(inv.some((x) => x.cat === 'A') && inv.some((x) => x.cat === 'B') && inv.some((x) => x.cat === 'C') && inv.some((x) => x.cat === 'D') && inv.some((x) => x.cat === 'E'));
});

test('Los parámetros de conocimiento científico no se piden al agricultor; los datos de su parcela sí son opcionales', () => {
  const por = (id) => inv.find((x) => x.id === id);
  for (const id of ['loctao_tstress', 'rice_tstress', 'rain_sources', 'cover_hard', 'rot_penalty', 'etc_kc']) assert.match(por(id).agricultor, /^No/, id);
  for (const id of ['supply_m3_ha', 'percolation_declared', 'soil_texture', 'soil_ph_declared', 'first_sowing_date', 'cycle_days', 'economics']) assert.match(por(id).agricultor, /opcional/, id);
});

test('Los valores decisivos se marcan y las hipótesis críticas llegan a la respuesta del motor', () => {
  const dec = inv.filter((x) => x.decisivo).map((x) => x.id);
  for (const id of ['irrigation', 'rice_perc', 'loctao_tstress', 'loctao_cycle', 'rot_penalty', 'rain_sources']) assert.ok(dec.includes(id), `no marcado decisivo: ${id}`);
  const ids = Object.keys(E2.PARAMS);
  for (const id of ['loctao_cycle_days', 'loctao_t_stress_c', 'rice_t_stress_c']) assert.ok(ids.includes(id), `la hipótesis ${id} debe ser un parámetro explícito del motor`);
});
