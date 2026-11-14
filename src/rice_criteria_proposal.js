'use strict';
/**
 * CROPWISE: propuesta EXPLORATORIA de evaluación C1/C2/C7 para Morropón.
 * No altera engine.js, climate.js ni rice.js. No es una recomendación agronómica.
 * Entradas deben provenir de las salidas existentes y/o registros documentados.
 * Valores nulos nunca se sustituyen por cero ni por una media arbitraria.
 */
const DEFAULT_WEIGHTS = Object.freeze({ C1: 0.50, C2: 0.40, C7: 0.10 });
const is01 = v => Number.isFinite(v) && v >= 0 && v <= 1;
const clamp = v => Math.max(0, Math.min(1, v));
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
function weightsOrThrow(w = DEFAULT_WEIGHTS) {
  const keys = ['C1','C2','C7'];
  if (keys.some(k => !Number.isFinite(w[k]) || w[k] < 0) || keys.reduce((s,k)=>s+w[k],0) <= 0) {
    throw Error('Pesos invalidos: C1, C2 y C7 deben ser >= 0 y alguno > 0');
  }
  const sum = keys.reduce((s,k)=>s+w[k],0);
  return Object.fromEntries(keys.map(k => [k, w[k]/sum]));
}
/**
 * data:
 *   irrigation_supply_mm, irrigation_requirement_mm (ambos por campaña, misma escala)
 *   water_satisfaction, drought_fraction (indicadores exploratorios del motor, 0..1)
 *   complete_fraction, complete_fraction_cold, flowering_heat_fraction (0..1)
 *   sequence: [crop_id, ...]; prior_crop_id; family_by_id: {crop_id: familia}
 * La suficiencia de agua solo se determina con dotación real y demanda total comparable.
 */
function evaluateRiceCriteria(data, opts={}) {
  const w = weightsOrThrow(opts.weights);
  const warnings=[], details={};
  const numeric = (v) => Number.isFinite(v) ? v : null;
  const supply=numeric(data.irrigation_supply_mm), requirement=numeric(data.irrigation_requirement_mm);
  const waterData = supply !== null && requirement !== null && supply >= 0 && requirement > 0;
  // C1: no ofrecer puntuación de suficiencia real sin información crítica.
  let c1=null;
  if (waterData) {
    c1 = clamp(supply / requirement);
    details.C1={score:c1, method:'dotacion / requerimiento total documentado (cociente exploratorio)', supply_mm:supply, required_mm:requirement, confidence:'pendiente de validacion', status:'calculable_condicionado'};
  } else {
    details.C1={score:null, status:'insuficiente', missing:['dotacion de riego real por campana','requerimiento TOTAL de agua del arroz (incluye percolacion, saturacion, etc.)'], et_c_mm:numeric(data.etc_mm), water_satisfaction:is01(data.water_satisfaction)?data.water_satisfaction:null, drought_fraction:is01(data.drought_fraction)?data.drought_fraction:null};
    warnings.push('C1 indeterminado: ETc, lluvia o ETa/ETc no equivalen al requerimiento total ni a la dotacion de riego.');
  }
  // C2: combinacion provisional de terminacion de ciclo y exposicion termica.
  const cf=data.complete_fraction, cfCold=data.complete_fraction_cold, heat=data.flowering_heat_fraction;
  const c2Parts=[cf,cfCold].filter(is01);
  const completion = c2Parts.length ? mean(c2Parts) : null;
  const c2= completion !== null && is01(heat) ? clamp(0.6*completion+0.4*(1-heat)) : null;
  details.C2={score:c2, completion, flowering_heat_fraction:is01(heat)?heat:null, status:c2===null?'insuficiente':'hipotesis_de_diseno', rule:'0.6*fraccion_completada+0.4*(1-fraccion_calor_floracion)', caveat:'pesos internos y umbral de calor no calibrados'};
  if(c2===null) warnings.push('C2 incompleto: falta completitud del ciclo o riesgo termico especificamente en floracion.');
  // C7: penalizaciones por repeticion SOLO como indicador ordinal de alternancia; no inferir sanidad ni fertilidad.
  const seq=data.sequence;
  let c7=null;
  if(Array.isArray(seq) && seq.length>0 && seq.every(x=>typeof x==='string' && x.length>0)) {
    const chain=[...(typeof data.prior_crop_id==='string'?[data.prior_crop_id]:[]),...seq];
    let repetitions=0, sameFamily=0;
    for(let i=1;i<chain.length;i++) {
      if(chain[i]===chain[i-1]) repetitions++;
      else if(data.family_by_id && data.family_by_id[chain[i]] && data.family_by_id[chain[i-1]] && data.family_by_id[chain[i]]===data.family_by_id[chain[i-1]]) sameFamily++;
    }
    const edges=chain.length-1;
    c7=edges>0?clamp(1-(repetitions+0.5*sameFamily)/edges):null;
    details.C7={score:c7, repetitions, same_family_transitions:sameFamily, status:'ordinal_provisional', caveat:'solo diversidad de sucesion; NO estima nitrogeno, sanidad ni mejora de suelo'};
  } else details.C7={score:null,status:'insuficiente'};
  if(c7===null) warnings.push('C7 sin secuencia suficiente para evaluar alternancia.');
  const scores={C1:c1,C2:c2,C7:c7};
  const known=Object.keys(scores).filter(k=>is01(scores[k]) && w[k]>0);
  const knownWeight=known.reduce((s,k)=>s+w[k],0);
  // Solo indice parcial descriptivo: NO subirlo a escala 0..100 como si fuera recomendacion completa.
  const diagnosticPartial = knownWeight>0 ? 100*known.reduce((s,k)=>s+w[k]*scores[k],0)/knownWeight : null;
  const full=Object.keys(scores).every(k=>w[k]===0 || is01(scores[k]));
  const fullScore=full?100*Object.keys(scores).reduce((s,k)=>s+w[k]*scores[k],0):null;
  const permissible = full && waterData && opts.agronomic_reviewed === true;
  return {weights:w, criteria:details, partial_diagnostic_score:diagnosticPartial, complete_score:fullScore, coverage_weight:knownWeight, status:permissible?'revisado_por_especialista':'EXPLORATORIO_NO_RECOMENDACION', may_label_as_recommendation:false, warnings, provenance:opts.provenance||null, note:'La revision de un especialista no equivale a ensayo de campo. No hay prediccion de rendimiento, salud del suelo ni ahorro de agua.'};
}
module.exports={evaluateRiceCriteria,weightsOrThrow,DEFAULT_WEIGHTS};
