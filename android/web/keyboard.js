// Programmatic focus keeps keyboard/scanner navigation, without opening the IME.
// Only an actual pointer gesture on an editable field requests the soft keyboard.
(()=>{'use strict';const original=new WeakMap();let touched=null;
 const editable=el=>el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement&&!['button','submit','checkbox','radio','file','range','color','date','time','hidden'].includes(el.type)||el?.isContentEditable;
 function remember(el){if(!original.has(el))original.set(el,el.getAttribute('inputmode')||(['number','tel'].includes(el.type)?el.type==='tel'?'tel':'decimal':el.type==='email'?'email':'text'));}
 function suppress(el){if(!editable(el))return;remember(el);el.setAttribute('inputmode','none');}
 function prepare(root){if(root.nodeType!==1&&root!==document)return;if(editable(root))suppress(root);root.querySelectorAll?.('input,textarea,[contenteditable="true"]').forEach(el=>{if(el!==document.activeElement||el!==touched)suppress(el);});}
 document.addEventListener('pointerdown',event=>{if(!event.isTrusted)return;const el=event.target.closest?.('input,textarea,[contenteditable="true"]');if(!el||!editable(el)||el.disabled||el.readOnly){touched=null;return;}remember(el);touched=el;el.setAttribute('inputmode',original.get(el));setTimeout(()=>{if(document.activeElement===el&&touched===el)AndroidShell.keyboard?.(true);},0);},true);
 document.addEventListener('focusin',event=>{if(!editable(event.target))return;if(touched!==event.target){suppress(event.target);AndroidShell.keyboard?.(false);}},true);
 document.addEventListener('focusout',event=>{if(editable(event.target)){suppress(event.target);if(touched===event.target)touched=null;}},true);
 prepare(document);new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)prepare(node);}).observe(document.documentElement,{childList:true,subtree:true});
 window.AndroidKeyboard={automatic:false};
})();
