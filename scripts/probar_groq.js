'use strict';
/**
 * Prueba REAL de conectividad con Groq (requiere GROQ_API_KEY en .env o en el entorno). No usa dobles.
 *   node scripts/probar_groq.js
 * Verifica: (1) clave válida y modelo disponible en la cuenta, (2) una respuesta de texto, (3) que el modelo invoque una herramienta.
 * No imprime la clave. Sin clave, termina con código 2 y NO simula ninguna respuesta.
 */
const { getConfig, loadDotEnv, isConfigured } = require('../src/assistant/config');
const { createGroqClient } = require('../src/assistant/groqClient');

(async () => {
  loadDotEnv();
  const cfg = getConfig();
  if (!isConfigured(cfg)) { console.log('Sin GROQ_API_KEY: no se puede probar Groq. Copia .env.example a .env y completa la clave (https://console.groq.com/keys).'); process.exit(2); }
  const client = createGroqClient(cfg, { log: (o) => console.log('  [log]', JSON.stringify(o)) });
  console.log(`Modelo configurado: ${cfg.model} (tiempo límite ${cfg.timeoutMs} ms, máx. ${cfg.maxOutputTokens} tokens)`);
  const st = await client.checkModel();
  console.log('1) Cuenta/modelo:', JSON.stringify(st));
  if (!st.reachable) process.exit(1);
  if (!st.model_available) console.log('   AVISO: el modelo no aparece en la lista de tu cuenta; cambia GROQ_MODEL.');
  try {
    const t = await client.chat({ messages: [{ role: 'user', content: 'Responde solo con la palabra: listo' }] });
    console.log('2) Texto:', JSON.stringify(t.content.slice(0, 80)), 'uso:', JSON.stringify(t.usage));
    const tool = [{ type: 'function', function: { name: 'get_current_analysis', description: 'Devuelve el resumen del análisis activo.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }];
    const c = await client.chat({ messages: [{ role: 'system', content: 'Usa siempre la herramienta para obtener datos.' }, { role: 'user', content: 'Dame el resumen del análisis activo.' }], tools: tool });
    console.log('3) Herramientas:', c.tool_calls.length ? `el modelo llamó a ${c.tool_calls.map((x) => x.name).join(', ')}` : 'el modelo NO llamó a la herramienta (revisa el modelo; algunos ignoran tools)');
    process.exit(0);
  } catch (e) { console.log('Fallo:', e.code || e.name, '-', e.message); process.exit(1); }
})();
