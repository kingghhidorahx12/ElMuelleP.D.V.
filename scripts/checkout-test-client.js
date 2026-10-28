// Sólo consultas al servidor sintético recibido; no abre datos ni crea archivos.
const { randomUUID } = require('node:crypto');
async function completeCheckout(base, body, headers) {
  if (!body || !Array.isArray(body.items)) return body;
  const next = { checkoutIntentId:randomUUID(), ...body };
  if (next.cashSessionId === undefined) {
    const response = await fetch(base + '/api/cash-sessions/current', { headers });
    const current = await response.json();
    next.cashSessionId = current.session?.id || 'synthetic-closed-cash';
  }
  return next;
}
module.exports = { completeCheckout };
