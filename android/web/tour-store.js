(()=>{'use strict';
 const allowed=new Set(['offered','active','paused','dismissed','completed']);
 function normalize(value){if(!value||!allowed.has(value.status)||!Number.isInteger(value.chapter)||value.chapter<0||value.chapter>100||!Number.isInteger(value.step)||value.step<0||value.step>200)return null;return {status:value.status,chapter:value.chapter,step:value.step};}
 const key=id=>'elmuelle.android.adminTour.v1.'+id;
 window.AndroidTourStore={
  read(id){try{const raw=typeof AndroidShell.tourProgress==='function'?AndroidShell.tourProgress(String(id)):localStorage.getItem(key(id));return normalize(JSON.parse(raw||'null'));}catch{return null;}},
  write(id,value){const record=normalize(value);if(!record)return false;try{const raw=JSON.stringify(record);if(typeof AndroidShell.saveTourProgress==='function')AndroidShell.saveTourProgress(String(id),raw);else localStorage.setItem(key(id),raw);return true;}catch{return false;}}
 };
})();
