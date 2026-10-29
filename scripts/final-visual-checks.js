// Evidencia técnica aislada; no abre datos ni servidores productivos.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dev=path.resolve(__dirname,'../.dev');
async function capture(page,label){
 assert.ok(['final-before','final-after'].includes(label));
 const result={controls:{},kpis:{},navigation:{},tabs:{},errors:[]};
 page.on('pageerror',error=>result.errors.push(error.message));
 async function open(view){
  await page.evaluate(async name=>{
   state.sidebarCollapsed=innerWidth<600;
   if(name==='cash'){setView('reports');setReportsMode('cash');await loadCashCut();setCashTab('current');}
   else {if(name==='reports')setReportsMode('reports');setView(name);if(name==='dashboard')await loadDashboard();if(name==='products')await loadProducts();if(name==='inventory'){await loadProducts();await loadInventoryEntries();}if(name==='reports'){await loadReports();$('reportTypeFilter').value='inventory';renderReports();}}
   updateShellState();resetNavigationScroll();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  },view);
 }
 async function controlStyles(){return page.locator('#dashboardView .business-edge-arrow').evaluateAll(nodes=>nodes.map(el=>{
  const properties=['width','height','min-width','min-height','padding','margin','border','border-radius','background','color','box-shadow','transform','opacity','outline','outline-offset','filter','transition','animation','position','top','left','right','bottom','mask','background-size'];
  const styles=pseudo=>{const s=getComputedStyle(el,pseudo);return Object.fromEntries(properties.map(p=>[p,s.getPropertyValue(p).replaceAll(location.origin,'')]));};
  const rect=el.getBoundingClientRect(),parent=el.closest('.business-card').getBoundingClientRect();
  return {data:{...el.dataset},disabled:el.disabled,title:el.title,normal:styles(null),before:styles('::before'),after:styles('::after'),relative:[rect.x-parent.x,rect.y-parent.y,rect.width,rect.height].map(n=>Math.round(n*100)/100)};
 }));}
 for(const [width,height]of [[1366,768],[1024,600],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await open('dashboard');await page.mouse.move(1,1);await page.evaluate(()=>document.activeElement?.blur());
  await page.waitForTimeout(250);result.controls[width]={normal:await controlStyles()};
  const next=page.locator('[data-dashboard-cycle="1"]');await next.hover();await page.waitForTimeout(250);result.controls[width].hover=await controlStyles();await next.focus();await page.waitForTimeout(250);result.controls[width].focus=await controlStyles();
  const title=()=>page.locator('[data-dashboard-cycle="1"]').locator('..').locator('h3').textContent();
  const before=await title();await next.press('Enter');assert.notEqual(await title(),before);await page.locator('[data-dashboard-cycle="-1"]').click();assert.equal(await title(),before);
  await page.mouse.move(1,1);await page.evaluate(()=>document.activeElement?.blur());
  for(const view of ['dashboard','products','inventory','cash','reports']){
   await open(view);
   const selector={dashboard:'#dashboardView .business-kpis > article',products:'#productsView .management-indicators > article',inventory:'#inventoryView .inventory-catalog-board .management-indicators > article',cash:'.cashdesk-kpis > article',reports:'#reportsView .report-kpis > article'}[view];
   const cards=await page.locator(selector).evaluateAll(nodes=>nodes.map(el=>({text:el.textContent.replace(/\s+/g,' ').trim(),ids:[...el.querySelectorAll('[id]')].map(n=>n.id)})));
   assert.equal(cards.length,view==='dashboard'?5:4,view+' KPI count');result.kpis[width+'-'+view]=cards;
   if(label==='final-after'){
    const clipped=await page.locator(selector+' strong').evaluateAll(nodes=>nodes.filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>({id:el.id,text:el.textContent,width:el.clientWidth,scroll:el.scrollWidth})));
    assert.deepEqual(clipped,[],view+' KPI text clipped at '+width);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,view+' document overflow '+width);
   if(view==='products'||view==='inventory')for(const badge of await page.locator('#'+view+'View .status-badge').evaluateAll(nodes=>nodes.map(el=>({font:parseFloat(getComputedStyle(el).fontSize),wrap:getComputedStyle(el).whiteSpace})))){assert.ok(badge.font<=11);assert.equal(badge.wrap,'nowrap');}
   await page.screenshot({path:path.join(dev,'em003-'+label+'-'+view+'-'+width+'.png')});
  }
 }
 await page.setViewportSize({width:1366,height:768});await open('products');
 const active=page.locator('.sidebar .nav-item.active');assert.equal(await active.count(),1);await page.locator('.sidebar .nav-item[data-view="inventory"]').hover();await page.waitForTimeout(450);
 result.navigation.hover=await page.locator('.sidebar .nav-item[data-view="inventory"]').evaluate(el=>({active:el.classList.contains('active'),background:getComputedStyle(el).backgroundColor,outline:getComputedStyle(el).outline}));
 await page.locator('.sidebar .nav-item[data-view="inventory"]').click();assert.equal(await active.count(),1);assert.equal(await active.getAttribute('data-view'),'inventory');
 await page.keyboard.press('Tab');result.navigation.keyboard=await page.locator(':focus-visible').evaluateAll(nodes=>nodes.map(el=>({id:el.id,outline:getComputedStyle(el).outline})));assert.ok(result.navigation.keyboard.some(item=>!/none|0px/.test(item.outline)));
 for(const [view,selector]of [['cash','.cashdesk-tabs'],['reports','.report-type-tabs']]){
  await open(view);const tabs=page.locator(selector+' [role=tab]');const first=tabs.first();await first.click();await first.press('ArrowRight');assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');await tabs.first().click();assert.equal(await page.locator(selector+' [aria-selected=true]').count(),1);
  result.tabs[view]=await tabs.evaluateAll(nodes=>nodes.map(el=>({text:el.textContent.trim(),role:el.getAttribute('role'),controls:el.getAttribute('aria-controls'),tabindex:el.getAttribute('tabindex')})));
 }
 assert.deepEqual(result.errors,[]);
 if(label==='final-after'){
  const before=JSON.parse(fs.readFileSync(path.join(dev,'em003-final-surfaces-before.json'),'utf8'));
  assert.deepEqual(result.controls,before.controls,'Carousel computed styles, geometry and interaction changed');
  assert.deepEqual(result.kpis,before.kpis,'KPI content changed');assert.deepEqual(result.tabs,before.tabs,'Tab contracts changed');
  assert.equal(result.navigation.hover.background,'rgba(164, 220, 255, 0.07)');
 }
 fs.writeFileSync(path.join(dev,'em003-final-surfaces-'+(label==='final-before'?'before':'after')+'.json'),JSON.stringify(result));
 console.log('FINAL_VISUAL_CHECK '+JSON.stringify({label,resolutions:4,kpiGroups:Object.keys(result.kpis).length,carouselStates:Object.keys(result.controls).length,errors:result.errors}));
}
module.exports={capture};
