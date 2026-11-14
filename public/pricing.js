/* One deterministic price rule, shared by the ticket and the server. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CommercialPricing=api;})(typeof globalThis==='object'?globalThis:this,()=>{
  const money=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
  function resolve(product,quantity,customer){
    const options=[{price:money(product.price),source:'public',label:'Precio al público'}];
    const special=customer?.prices?.find(p=>p.productId===product.id);
    if(special&&Number(special.price)>0)options.push({price:money(special.price),source:'customer',label:'Precio de cliente'});
    if(Number(product.wholesaleMin)>0&&quantity>=Number(product.wholesaleMin)&&Number(product.wholesalePrice)>0)options.push({price:money(product.wholesalePrice),source:'wholesale',label:'Precio de mayoreo'});
    return options.reduce((best,next)=>next.price<best.price?next:best);
  }
  function quantities(items){const totals=new Map();for(const i of items)totals.set(i.productId,Math.round(((totals.get(i.productId)||0)+Number(i.quantity))*1000)/1000);return totals;}
  return {resolve,quantities};
});
