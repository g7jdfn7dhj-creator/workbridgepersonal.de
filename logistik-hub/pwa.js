/* Logistik-Hub PWA glue: service worker registration, update notice, install button. Touches no app data. */
(function(){'use strict';
const ru=()=>(document.documentElement.lang||'ru')!=='de';
const L={upd:['Доступна новая версия — обновить?','Neue Version verfügbar — aktualisieren?'],updB:['Обновить','Aktualisieren'],
  inst:['⤓ Установить приложение','⤓ App installieren'],
  ios:['Установка на iPhone/iPad: откройте в Safari, нажмите «Поделиться» (квадрат со стрелкой) → «На экран „Домой“» → «Добавить».','Installation auf iPhone/iPad: in Safari öffnen, „Teilen“ (Quadrat mit Pfeil) → „Zum Home-Bildschirm“ → „Hinzufügen“.'],
  ok:['Понятно','OK']};
const t=k=>L[k][ru()?0:1];
const $=id=>document.getElementById(id);const bar=$('pwaBar'),btn=$('installBtn');
let barAct=null;
function show(txt,okTxt,act){$('pwaTxt').textContent=txt;$('pwaOk').textContent=okTxt;barAct=act;bar.hidden=false}
$('pwaOk').onclick=()=>{const a=barAct;bar.hidden=true;if(a)a()};$('pwaX').onclick=()=>{bar.hidden=true};
const standalone=()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
/* install */
let deferred=null;
function setBtn(on){btn.hidden=!on;btn.textContent=t('inst')}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;setBtn(true)});
window.addEventListener('appinstalled',()=>{deferred=null;setBtn(false)});
btn.onclick=async()=>{if(deferred){deferred.prompt();try{await deferred.userChoice}catch(e){}deferred=null;setBtn(false)}else if(ios)show(t('ios'),t('ok'),null)};
if(ios&&!standalone())setBtn(true);
new MutationObserver(()=>{if(!btn.hidden)btn.textContent=t('inst')}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
/* service worker + update notice */
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  let wantReload=false;                               // reload only after the user accepted an update (not on the first install's clients.claim())
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!wantReload)return;wantReload=false;location.reload()});
  const offer=w=>show(t('upd'),t('updB'),()=>{const go=()=>{wantReload=true;w.postMessage('SKIP_WAITING')};   // updates replace only the app shell cache; localStorage/IndexedDB stay untouched
    (window.LHStore?LHStore.flush():Promise.resolve()).then(go,go)});
  window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
    if(reg.waiting&&navigator.serviceWorker.controller)offer(reg.waiting);
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)offer(w)})});
    let lastChk=Date.now();const check=()=>{if(navigator.onLine===false)return;lastChk=Date.now();reg.update().catch(()=>{})};
    if(navigator.serviceWorker.controller)check();                                   // on launch (installed app / reopened tab)
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastChk>30000)check()});   // when the app becomes visible again
    addEventListener('online',check);
    setInterval(check,60*60*1000);
  }).catch(err=>console.warn('SW registration failed',err))});
}
})();
