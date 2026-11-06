(()=>{'use strict';
 const frame=document.getElementById('desktopApp'),desktopWidth=1366;
 let pending=false;
 function fit(){
  pending=false;
  const width=document.documentElement.clientWidth;
  const height=Math.min(document.documentElement.clientHeight,window.visualViewport?.height||Infinity);
  if(width<=0||height<=0)return;
  const scale=width/desktopWidth,desktopHeight=height/scale;
  frame.style.width=desktopWidth+'px';
  frame.style.height=desktopHeight+'px';
  frame.style.transform=`scale(${scale})`;
  frame.style.visibility='visible';
  window.scrollTo(0,0);
  // All metrics are geometry only. No account, PIN, catalogue or business data.
  window.androidDesktopGeometry={width,height,desktopWidth,desktopHeight,scale};
  window.androidDesktopReady=true;
 }
 function schedule(){if(!pending){pending=true;requestAnimationFrame(fit);}}
 frame.addEventListener('load',schedule);
 window.addEventListener('resize',schedule);
 window.addEventListener('android-viewport-changed',schedule);
 window.visualViewport?.addEventListener('resize',schedule);
 window.addEventListener('scroll',()=>window.scrollTo(0,0),{passive:true});
 schedule();
})();
