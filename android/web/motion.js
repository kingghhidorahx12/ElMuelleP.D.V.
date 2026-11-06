(()=>{'use strict';
 let running=[],ghost=null,generation=0;
 function clear(){for(const a of running)a.cancel();running=[];ghost?.remove();ghost=null;document.body.classList.remove('android-shell-moving');}
 function run(kind,change){
  const epoch=++generation;clear();
  const shell=document.querySelector('.app-shell'),sidebar=document.querySelector('.sidebar'),ticket=document.querySelector('.ticket-panel');
  const before=shell?.getBoundingClientRect(),sideBefore=sidebar?.getBoundingClientRect(),ticketBefore=ticket?.getBoundingClientRect();
  const wasOpen=!document.body.classList.contains('ticket-collapsed');
  const reduce=document.body.classList.contains('pos-motion-reduced')||matchMedia('(prefers-reduced-motion: reduce)').matches;
  let oldTicket;
  if(!reduce&&kind==='ticket'&&wasOpen&&ticketBefore?.width>0)oldTicket=ticket.cloneNode(true);
  const result=change();
  const after=shell?.getBoundingClientRect(),sideAfter=sidebar?.getBoundingClientRect();
  if(reduce||!before||!after||document.hidden)return result;
  const animate=(element,keyframes)=>{const a=element.animate(keyframes,{duration:200,easing:'cubic-bezier(.2,.7,.2,1)'});running.push(a);};
  document.body.classList.add('android-shell-moving');
  if(before.left!==after.left)animate(shell,[{transform:`translateX(${before.left-after.left}px)`},{transform:'translateX(0)'}]);
  if(kind==='sidebar'&&sideBefore.width!==sideAfter.width){
   sidebar.style.transformOrigin='left center';
   animate(sidebar,[{transform:`scaleX(${sideBefore.width/sideAfter.width})`,opacity:.86},{transform:'scaleX(1)',opacity:1}]);
  }
  const nowOpen=!document.body.classList.contains('ticket-collapsed');
  if(kind==='ticket'&&wasOpen!==nowOpen){
   if(nowOpen&&ticket)animate(ticket,[{transform:'translateX(40px)',opacity:0},{transform:'translateX(0)',opacity:1}]);
   else if(oldTicket){
    ghost=oldTicket;ghost.classList.add('android-ticket-ghost');ghost.inert=true;ghost.setAttribute('aria-hidden','true');
    for(const node of [ghost,...ghost.querySelectorAll('[id]')])node.removeAttribute('id');
    Object.assign(ghost.style,{left:ticketBefore.left+'px',top:ticketBefore.top+'px',width:ticketBefore.width+'px',height:ticketBefore.height+'px'});
    document.body.append(ghost);animate(ghost,[{transform:'translateX(0)',opacity:1},{transform:'translateX(40px)',opacity:0}]);
   }
  }
  Promise.all(running.map(a=>a.finished.catch(()=>{}))).then(()=>{if(epoch===generation)clear();});
  return result;
 }
 window.AndroidMotion={run};
})();
