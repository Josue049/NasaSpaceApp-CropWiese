'use strict';
/**
 * Validación estricta de argumentos de herramientas contra un subconjunto de JSON Schema
 * (type, properties, required, additionalProperties:false, enum, minimum/maximum, maxLength, pattern, items, maxItems).
 * Cualquier propiedad no declarada se RECHAZA (no se ignora en silencio).
 */
function validate(schema, value, path = 'args') {
  const errs = [];
  const t = schema.type;
  const typeOk = (v) => (t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : t === 'array' ? Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'string' ? typeof v === 'string' : t === 'boolean' ? typeof v === 'boolean' : true);
  if (t && !typeOk(value)) return [`${path}: se esperaba ${t}`];
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: valor no permitido (${schema.enum.join(' | ')})`);
  if (typeof value === 'number') { if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: mínimo ${schema.minimum}`); if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: máximo ${schema.maximum}`); }
  if (typeof value === 'string') { if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${path}: máximo ${schema.maxLength} caracteres`); if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: formato inválido`); }
  if (t === 'array') { if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path}: máximo ${schema.maxItems} elementos`); if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`))); }
  if (t === 'object') {
    const props = schema.properties || {};
    for (const r of schema.required || []) if (!(r in value)) errs.push(`${path}.${r}: obligatorio`);
    for (const k of Object.keys(value)) { if (!(k in props)) { if (schema.additionalProperties === false) errs.push(`${path}.${k}: propiedad no permitida`); continue; } errs.push(...validate(props[k], value[k], `${path}.${k}`)); }
  }
  return errs;
}

/** Parsea los argumentos que entrega el modelo (cadena JSON) y los valida. */
function parseAndValidate(schema, raw) {
  let v;
  if (raw === '' || raw == null) v = {};
  else if (typeof raw === 'object') v = raw;
  else { try { v = JSON.parse(raw); } catch { return { ok: false, errors: ['los argumentos no son JSON válido'] }; } }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ok: false, errors: ['los argumentos deben ser un objeto'] };
  const errors = validate(schema, v);
  return errors.length ? { ok: false, errors } : { ok: true, args: v };
}

module.exports = { validate, parseAndValidate };
