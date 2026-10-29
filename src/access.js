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
  function allows(user,modules) { const permissions=effective(user);return modules.some(id=>permissions[id]===true); }
  function sessionUser(user) {return {id:user.id,name:user.name,role:user.role,active:user.active!==false,hasPin:user.role==='admin'||Boolean(user.pinSalt&&user.pinHash),permissions:effective(user)};}
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
    res.set('Cache-Control','no-store').json({employee:{id:employee.id,name:employee.name,role:employee.role},permissions:effective(employee)});
  });
  app.put('/api/users/:id/permissions',(req,res)=>{
    const admin=requireAdminUser(req,res);if(!admin)return;
    const employee=findEmployee(req.params.id);if(!employee)return res.status(404).json({message:'Empleado no encontrado.'});
    const input=req.body?.permissions;
    if(!req.body||Object.keys(req.body).some(key=>key!=='permissions')||!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length!==MODULES.length||MODULES.some(id=>typeof input[id]!=='boolean')||Object.keys(input).some(id=>!MODULES.includes(id)))return res.status(400).json({message:'Envía un permiso booleano por cada módulo admitido.'});
    const previous=effective(employee),permissions=Object.fromEntries(MODULES.map(id=>[id,input[id]]));
    database.transaction(()=>{
      database.saveDocument('screen-permissions',employee.id,{permissions,updatedAt:new Date().toISOString()});
      for(const module of MODULES)if(previous[module]!==permissions[module])recordAuditEvent('screen_permission_changed','user',employee.id,admin,{module,previous:previous[module],next:permissions[module]});
    });
    for(const client of clients)if(client.userId===employee.id)send(client);
    res.set('Cache-Control','no-store').json({employee:{id:employee.id,name:employee.name,role:employee.role},permissions:effective(employee)});
  });
  // Las rutas conservan además su autorización por rol y por operación.
  app.use('/api',(req,res,next)=>{
    const p=req.path.toLowerCase().replace(/\/+$/,''),method=req.method;
    let modules=null;
    if(p.startsWith('/product-photos/'))modules=['pos','products','inventory','dashboard','reports'];
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
  return {effective,allows,sessionUser,notifyUsers};
}
module.exports={registerAccess,MODULES,EMPLOYEE_DEFAULTS};
