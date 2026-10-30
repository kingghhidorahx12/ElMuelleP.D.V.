const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function extract(name){const match=source.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^}','m'));assert.ok(match,name);return match[0];}
function harness(){
  const calls=[],nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:'',dataset:{},classList:{toggle(){},remove(){}},setAttribute(){},replaceChildren(){this.textContent='';},scrollTop:0,scrollLeft:0});return nodes.get(id);};
  const workspace={scrollTop:250,scrollLeft:0,scrollTo(options){calls.push(['scroll',options]);this.scrollTop=options.top;this.scrollLeft=options.left;}};
  const nav={scrollTop:35};
  const state={activeView:'sales',currentUser:{role:'admin'},reportsMode:'reports'};
  const context={state,document:{querySelector:selector=>selector==='.workspace'?workspace:selector==='.settings-layout'?node('settings-layout'):null},$:node,$$:selector=>selector==='.app-view'?['pos','sales','products','inventory','billing','dashboard','reports','settings'].map(id=>node(id+'View')):[],isAdminUser:()=>state.currentUser.role==='admin',isAdminView:id=>['products','inventory','dashboard','settings'].includes(id),posFeedbackByElement:new WeakMap(),viewLabels:{sales:['Ventas',''],products:['Productos',''],inventory:['Inventario',''],pos:['POS','']},animatePosFeedback:()=>calls.push(['animate']),updateShellState(){},syncTopbarContext(){},syncReportNavigation(){},closePieceQuantityModal(){},clearSelectedProduct(){},showToast(){},loadSalesAdmin(){calls.push(['refresh']);},renderAdminProducts(){},loadInventoryEntries(){},loadDashboard(){},loadRecentSales(){},loadCashCut(){},loadReports(){},updateScaleUi(){},renderUserSettings(){},loadAuditEvents(){}};
  vm.createContext(context);vm.runInContext(['canAccessView','resetNavigationScroll','setView','setSettingsMode'].map(extract).join('\n'),context);
  return {context,calls,workspace,nav,state,nodes,node};
}
test('Navegación real: scroll inmediato antes de animación, cambios rápidos sin restauraciones tardías',()=>{
  const h=harness();h.context.setView('products');assert.equal(h.workspace.scrollTop,0);assert.equal(h.calls[0][0],'scroll');assert.equal(h.calls[0][1].behavior,'instant');assert.equal(h.calls[1][0],'animate');
  for(const target of ['inventory','sales','products','sales']){h.workspace.scrollTop=300;h.context.setView(target);assert.equal(h.workspace.scrollTop,0);}assert.equal(h.nav.scrollTop,35);
});
test('Actualizar el mismo módulo conserva scroll y cambiar de sección sólo restaura el contenido',()=>{
  const h=harness();h.workspace.scrollTop=240;h.context.setView('sales');assert.equal(h.workspace.scrollTop,240);assert.equal(h.calls.filter(c=>c[0]==='scroll').length,0);
  const root=h.node('settings-layout');root.dataset.settingsMode='general';h.context.setSettingsMode('scale');assert.equal(h.workspace.scrollTop,0);
  h.workspace.scrollTop=150;h.context.setSettingsMode('scale');assert.equal(h.workspace.scrollTop,150);
});
test('Caja y Reportes se autorizan por separado; un permiso de Configuración no habilita secciones administrativas',()=>{
  const h=harness();h.state.currentUser={role:'employee',permissions:{cash:false,reports:true,settings:true}};
  assert.equal(h.context.canAccessView('reports','cash'),false);assert.equal(h.context.canAccessView('reports','reports'),true);assert.equal(h.context.canAccessView('settings'),true);
  const root=h.node('settings-layout');root.dataset.settingsMode='general';h.context.setSettingsMode('users');assert.equal(root.dataset.settingsMode,'general');h.context.setSettingsMode('scale');assert.equal(root.dataset.settingsMode,'scale');
  h.state.currentUser.role='admin';assert.equal(h.context.canAccessView('products'),true);
});
