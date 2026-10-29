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
  const products=await (await fetch(base+'/api/products',{headers})).json();
  if(!Array.isArray(products))return next;
  next.items=next.items.map(item=>item.source===undefined&&products.find(p=>p.id===item.productId)?.unit==='kg'?{...item,source:'scale'}:item); // lectura sintética declarada, sin simular una autorización manual
  return next;
}
function completeCatalogOperation(route,method,body){if(!body||Array.isArray(body)||typeof body!=='object'||!['POST','PUT','PATCH'].includes(method)||!/^\/api\/(products(?:\/|$)|inventory\/)/.test(route))return body;return {operationId:randomUUID(),...body};}
module.exports = { completeCheckout, completeCatalogOperation };
