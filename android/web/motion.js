(()=>{'use strict';
 let running=[],exiting=null,generation=0,depth=0;
 function clear(){for(const a of running)a.cancel();running=[];if(exiting){exiting.classList.remove('android-ticket-exit');for(const key of ['left','top','width','height'])exiting.style.removeProperty('--android-ticket-'+key);exiting=null;}}
 function run(kind,change){
  // toggleTicketPanel can call closeTicketDrawer: animate only once.
  if(depth)return change();
  const epoch=++generation;clear();
  const sidebar=document.querySelector('.sidebar'),ticket=document.querySelector('.ticket-panel');
  const wasOpen=!document.body.classList.contains('ticket-collapsed');
  const reduce=document.body.classList.contains('pos-motion-reduced')||matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden;
  // Only the closing panel needs geometry. Never retexture the entire catalogue
  // or duplicate a long sale to animate a gesture.
  const rect=!reduce&&kind==='ticket'&&wasOpen?ticket?.getBoundingClientRect():null;
  let result;depth++;try{result=change();}finally{depth--;}
  if(reduce)return result;
  const animate=(element,keyframes)=>{if(!element)return;const a=element.animate(keyframes,{duration:160,easing:'cubic-bezier(.2,.7,.2,1)'});running.push(a);};
  if(kind==='sidebar')animate(sidebar,[{transform:'translateX(-8px)',opacity:.8},{transform:'translateX(0)',opacity:1}]);
  const nowOpen=!document.body.classList.contains('ticket-collapsed');
  if(kind==='ticket'&&wasOpen!==nowOpen){
   if(nowOpen&&ticket)animate(ticket,[{transform:'translateX(24px)',opacity:0},{transform:'translateX(0)',opacity:1}]);
   else if(rect?.width>0&&ticket){
    exiting=ticket;for(const key of ['left','top','width','height'])ticket.style.setProperty('--android-ticket-'+key,rect[key]+'px');
    ticket.classList.add('android-ticket-exit');
    animate(ticket,[{transform:'translateX(0)',opacity:1},{transform:'translateX(24px)',opacity:0}]);
   }
  }
  Promise.all(running.map(a=>a.finished.catch(()=>{}))).then(()=>{if(epoch===generation)clear();});
  return result;
 }
 window.AndroidMotion={run};
})();
