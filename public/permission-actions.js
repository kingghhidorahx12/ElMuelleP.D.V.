(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.PermissionActions=value;})(typeof globalThis==='object'?globalThis:this,()=>{
 const groups={
  pos:[['sell','Cobrar ventas',true],['discount','Aplicar descuentos',false],['manualWeight','Solicitar peso manual con autorización',true],['print','Imprimir tickets',true]],
  sales:[['cancel','Cancelar ventas propias',false],['print','Reimprimir tickets propios',true]],
  cash:[['open','Abrir caja',true],['close','Cerrar caja',true],['entry','Registrar entradas de efectivo',false],['withdraw','Registrar retiros o gastos',false],['print','Imprimir cortes',true]],
  billing:[['request','Guardar solicitudes de factura propias',false]],
  products:[['create','Crear productos',false],['edit','Editar información y fotografías',false],['prices','Cambiar precios de venta',false],['status','Activar o desactivar productos',false]],
  inventory:[['receive','Registrar entradas de mercancía',false],['adjustUp','Ajustar aumentando existencias',false],['adjustDown','Ajustar reduciendo existencias',false],['waste','Registrar mermas',false],['count','Registrar conteo inicial',false],['limits','Cambiar mínimos de inventario',false],['history','Consultar historial',true],['restitution','Conciliar devoluciones pendientes',false]],
  dashboard:[],reports:[['export','Exportar reportes',true],['print','Imprimir reportes',true]],
  settings:[['scale','Configurar báscula',false],['printer','Configurar impresora',false]]
 };
 const ids=Object.entries(groups).flatMap(([section,actions])=>actions.map(([id])=>section+'.'+id));
 const legacy=Object.fromEntries(Object.entries(groups).flatMap(([section,actions])=>actions.map(([id,,allowed])=>[section+'.'+id,allowed])));
 function effective(permissions,saved={},admin=false){return Object.fromEntries(ids.map(id=>[id,admin||permissions[id.split('.')[0]]===true&&(typeof saved[id]==='boolean'?saved[id]:legacy[id])]));}
 return {groups,ids,legacy,effective};
});
