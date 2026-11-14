'use strict';
// Las pruebas usan SOLO la instantánea real de data/demo (sin red): caché temporal vacía + DEMO_DIR.
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.FIELDSHIFT_DOMAIN = process.env.FIELDSHIFT_DOMAIN || 'peru'; // las pruebas heredadas usan el demo de Moyobamba
process.env.FIELDSHIFT_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-cache-'));
const { gatherData, analyze, SCENARIOS } = require('../src/pipeline');

const LAT = -6.034, LON = -76.971;
const baseInput = () => ({
  lat: LAT, lon: LON, area_ha: 1.5, irrigation: false, start_slot: 'A', history: ['maiz', 'maiz', 'maiz', 'maiz'],
  priorities: { protect_soil: 4, water: 3, resilience: 4, pests: 3, income: 3, low_cost: 3 }, excluded_crops: [], market_pref: {},
});
let cached;
async function demoData() { return (cached ||= await gatherData(LAT, LON)); }
module.exports = { demoData, baseInput, analyze, SCENARIOS, LAT, LON };
