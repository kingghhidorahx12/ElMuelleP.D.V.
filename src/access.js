const ACTIONS=require('../public/permission-actions');
const MODULES = Object.freeze(['pos','sales','cash','billing','products','inventory','dashboard','reports','settings']);
// Exactamente las pantallas disponibles al encargado antes de permisos individuales.
const EMPLOYEE_DEFAULTS = Object.freeze(Object.fromEntries(MODULES.map(id => [id, ['pos','sales','cash','billing','reports'].includes(id)])));

function registerAccess({app,database,getSessionUser,requireAdminUser,recordAuditEvent,readUsers}) {
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const clients = new Set();
  function effective(user) {
    if (user.role === 'admin') return Object.fromEntries(MODULES.map(id => [id,true]));
    const saved = database.readDocument('screen-permissions',user.id);
    return Object.fromEntries(MODULES.map(id => [id, typeof saved?.permissions?.[id] === 'boolean' ? saved.permissions[id] : EMPLOYEE_DEFAULTS[id]]));
  }
  function effectiveActions(user){return ACTIONS.effective(effective(user),database.readDocument('screen-permissions',user.id)?.actions||{},user.role==='admin');}
  function allowsAction(user,id){return ACTIONS.ids.includes(id)&&effectiveActions(user)[id]===true;}
  function assertAction(user,id){if(!allowsAction(user,id))throw Object.assign(Error('No tienes permiso para esta acción.'),{statusCode:403,code:'ACTION_FORBIDDEN'});return user;}
  function requireAction(req,res,id){const user=getSessionUser(req);if(!user){res.status(401).json({message:'Inicia sesión nuevamente.'});return null;}if(!allowsAction(user,id)){res.status(403).json({message:'No tienes permiso para esta acción.',code:'ACTION_FORBIDDEN'});return null;}return user;}
  function allows(user,modules) { const permissions=effective(user);return modules.some(id=>permissions[id]===true); }
  function sessionUser(user) {return {id:user.id,name:user.name,role:user.role,active:user.active!==false,hasPin:user.role==='admin'||Boolean(user.pinSalt&&user.pinHash),permissions:effective(user),actions:effectiveActions(user)};}
  function send(client) {
    const user=getSessionUser(client.req,false);
    if(!user){client.res.write('event: expired\ndata: {}\n\n');client.res.end();return;}
    client.res.write(`event: permissions\ndata: ${JSON.stringify(sessionUser(user))}\n\n`);
  }
  app.get('/api/access/events',(req,res)=>{
    const user=getSessionUser(req);
    if(!user)return res.status(401).json({message:'Inicia sesión nuevamente.'});
    res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
    const client={req,res,userId:user.id};clients.add(client);send(client);
    const heartbeat=setInterval(()=>{if(!getSessionUser(req,false)){res.write('event: expired\ndata: {}\n\n');res.end();}else res.write(': active\n\n');},15000);heartbeat.unref();
    res.on('close',()=>{clearInterval(heartbeat);clients.delete(client);});
  });
  const findEmployee=(id)=>readUsers().find(user=>user.id===id&&user.role==='employee');
  app.get('/api/users/:id/permissions',(req,res)=>{
    if(!requireAdminUser(req,res))return;
    const employee=findEmployee(req.params.id);if(!employee)return res.status(404).json({message:'Empleado no encontrado.'});
    res.set('Cache-Control','no-store').json({employee:{id:employee.id,name:employee.name,role:employee.role},permissions:effective(employee),actions:effectiveActions(employee)});
  });
  app.put('/api/users/:id/permissions',(req,res)=>{
    const admin=requireAdminUser(req,res);if(!admin)return;
    const employee=findEmployee(req.params.id);if(!employee)return res.status(404).json({message:'Empleado no encontrado.'});
    const input=req.body?.permissions;
    if(!req.body||Object.keys(req.body).some(key=>!['permissions','actions'].includes(key))||!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length!==MODULES.length||MODULES.some(id=>typeof input[id]!=='boolean')||Object.keys(input).some(id=>!MODULES.includes(id)))return res.status(400).json({message:'Envía un permiso booleano por cada módulo admitido.'});
    const supplied=req.body.actions;
    if(supplied!==undefined&&(!supplied||Array.isArray(supplied)||Object.keys(supplied).length!==ACTIONS.ids.length||ACTIONS.ids.some(id=>typeof supplied[id]!=='boolean')||Object.keys(supplied).some(id=>!ACTIONS.ids.includes(id))))return res.status(400).json({message:'Envía un permiso booleano por cada acción admitida.'});
    const previous=effective(employee),previousActions=effectiveActions(employee),permissions=Object.fromEntries(MODULES.map(id=>[id,input[id]])),actions=supplied||database.readDocument('screen-permissions',employee.id)?.actions||{};
    database.transaction(()=>{
      database.saveDocument('screen-permissions',employee.id,{permissions,actions,updatedAt:new Date().toISOString()});
      for(const action of ACTIONS.ids){const next=ACTIONS.effective(permissions,actions)[action];if(previousActions[action]!==next)recordAuditEvent('action_permission_changed','user',employee.id,admin,{action,previous:previousActions[action],next});}
      for(const module of MODULES)if(previous[module]!==permissions[module])recordAuditEvent('screen_permission_changed','user',employee.id,admin,{module,previous:previous[module],next:permissions[module]});
    });
    for(const client of clients)if(client.userId===employee.id)send(client);
    res.set('Cache-Control','no-store').json({employee:{id:employee.id,name:employee.name,role:employee.role},permissions:effective(employee),actions:effectiveActions(employee)});
  });
  // Las rutas conservan además su autorización por rol y por operación.
  app.use('/api',(req,res,next)=>{
    const p=req.path.toLowerCase().replace(/\/+$/,''),method=req.method;
    let modules=null;
    if(p==='/commerce/options')modules=['pos','products'];
    else if(p.startsWith('/commerce/lots'))modules=['inventory'];
    else if(p==='/commerce/financial')modules=['dashboard','reports'];
    else if(p.startsWith('/commerce/drafts/product'))modules=['products'];
    else if(p.startsWith('/commerce/drafts/inventory'))modules=['inventory'];
    else if(p.startsWith('/commerce/'))modules=['settings','products'];
    else if(p.startsWith('/product-photos/'))modules=['pos','products','inventory','dashboard','reports'];
    else if(p==='/products')modules=method==='GET'?['pos','products','inventory','dashboard','reports']:['products'];
    else if(/^\/products\/[^/]+\/inventory$/.test(p))modules=['inventory'];
    else if(/^\/products\/[^/]+$/.test(p))modules=['products'];
    else if(p.startsWith('/inventory/'))modules=['inventory'];
    else if(p==='/authorizations/manual-weight')modules=['pos'];
    else if(p==='/sales')modules=method==='POST'||req.query.context==='pos'?['pos']:['sales','billing','inventory','dashboard','reports','cash'];
    else if(/^\/sales\/[^/]+\/invoice$/.test(p))modules=['billing'];
    else if(/^\/sales\/[^/]+\/cancel$/.test(p))modules=['sales'];
    else if(/^\/sales\/[^/]+$/.test(p))modules=['sales','billing','reports','cash'];
    else if((p.startsWith('/cash-sessions')&&p!=='/cash-sessions/current')||p==='/cash-shifts')modules=['cash'];
    else if(p.startsWith('/configuration')||p==='/audit-events')modules=['settings'];
    if(!modules)return next();
    const user=getSessionUser(req);if(!user)return res.status(401).json({message:'La sesión venció. Inicia sesión nuevamente.'});
    if(!allows(user,modules))return res.status(403).json({message:'No tienes autorización para esta pantalla.',code:'SCREEN_FORBIDDEN'});
    next();
  });
  function notifyUsers(ids) { for (const client of clients) if (ids.has(client.userId)) send(client); }
  function notifyScanner(value) {for(const client of clients){const user=getSessionUser(client.req,false);if(user&&(user.role==='admin'||allows(user,['pos'])))client.res.write(`event: scanner\ndata: ${JSON.stringify(value)}\n\n`);}}
  function notifyPaymentMethods(value){for(const client of clients){const user=getSessionUser(client.req,false);if(user&&(user.role==='admin'||allows(user,['pos'])))client.res.write(`event: payment-methods\ndata: ${JSON.stringify(value)}\n\n`);}}
  return {effective,effectiveActions,allows,allowsAction,assertAction,requireAction,sessionUser,notifyUsers,notifyScanner,notifyPaymentMethods};
}
module.exports={registerAccess,MODULES,EMPLOYEE_DEFAULTS};
