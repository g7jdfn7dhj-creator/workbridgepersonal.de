/* Logistik-Hub on-device storage. Everything stays on this device; nothing is ever sent anywhere.
   Primary: localStorage (existing keys lhub.r4.* and lhub.lang, so current data carries over).
   Second local copy: IndexedDB "lhub-local" (one snapshot record), written on every change and flushed on hide/pagehide.
   On start: if localStorage lost the data (e.g. iOS eviction) or the IndexedDB copy is newer, it is restored automatically. */
(function(){'use strict';
const DBN='lhub-local',ST='kv',SNAP='snapshot',REV='lhub.r4.rev';
const ours=k=>!!k&&(k.indexOf('lhub.r4.')===0||k==='lhub.lang');
const DATA_KEYS=['lhub.r4.data','lhub.r4.params'];
const LS=(()=>{try{const s=window.localStorage;s.getItem('x');return s}catch(e){return null}})();
const isQuota=e=>!!e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014);
let db=null,cache={},rev=0,timer=null,listeners=[];
const failed=new Set();   // keys localStorage refused (quota): while non-empty, localStorage's revision is not advanced, so the newer IndexedDB copy wins on next start
const status={idb:false,restored:false,restoredKeys:0,lsQuota:false,idbQuota:false,idbError:null,lastMirror:null,persisted:null,usage:null,quota:null};
function emit(){for(const f of listeners)try{f(status)}catch(e){}}
function readLS(){const o={};if(!LS)return o;try{for(let i=0;i<LS.length;i++){const k=LS.key(i);if(ours(k))o[k]=LS.getItem(k)}}catch(e){}return o}
function lsSet(k,v){if(!LS)return false;try{LS.setItem(k,v);if(k!==REV&&failed.delete(k)&&!failed.size){status.lsQuota=false;emit()}return true}catch(e){if(k!==REV)failed.add(k);if(isQuota(e)){status.lsQuota=true;emit()}return false}}
function openDB(){return new Promise(res=>{if(!('indexedDB' in window))return res(null);let r;try{r=indexedDB.open(DBN,1)}catch(e){return res(null)}
  r.onupgradeneeded=()=>{try{r.result.createObjectStore(ST)}catch(e){}};r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>{try{d.close()}catch(e){}db=null};res(d)};r.onerror=()=>res(null);r.onblocked=()=>res(null)})}
function idbGet(){return new Promise(res=>{if(!db)return res(null);try{const q=db.transaction(ST,'readonly').objectStore(ST).get(SNAP);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)}catch(e){res(null)}})}
function idbPut(){return new Promise(res=>{if(!db)return res(false);try{const tx=db.transaction(ST,'readwrite');tx.objectStore(ST).put({rev,savedAt:Date.now(),items:Object.assign({},cache)},SNAP);
  tx.oncomplete=()=>{status.lastMirror=new Date();status.idbQuota=false;status.idbError=null;emit();res(true)};
  tx.onabort=tx.onerror=()=>{const e=tx.error;if(isQuota(e))status.idbQuota=true;status.idbError=e?e.name:'error';emit();res(false)}}catch(e){status.idbError=e.name||'error';emit();res(false)}})}
function flush(){if(timer){clearTimeout(timer);timer=null}return idbPut()}
function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(flush,120)}
function bump(){rev++;cache[REV]=String(rev);if(!failed.size)lsSet(REV,String(rev))}
const api={
  status,
  get(k){return Object.prototype.hasOwnProperty.call(cache,k)?cache[k]:(LS?LS.getItem(k):null)},
  /* write: localStorage first (primary); cache keeps the value even if localStorage is full, so the IndexedDB copy still gets it */
  set(k,v){v=String(v);if(cache[k]===v&&LS&&LS.getItem(k)===v)return true;cache[k]=v;const ok=lsSet(k,v);bump();schedule();if(DATA_KEYS.includes(k))api.persist();return ok},
  remove(k){delete cache[k];failed.delete(k);try{LS&&LS.removeItem(k)}catch(e){}bump();schedule()},
  /* «Очистить всё»: own keys only (never Arbeitzeit's), in both copies */
  clearAll(){for(const k of Object.keys(cache))if(k.indexOf('lhub.r4.')===0&&k!==REV)delete cache[k];
    try{const ks=[];for(let i=0;i<LS.length;i++){const k=LS.key(i);if(k&&k.indexOf('lhub.r4.')===0&&k!==REV)ks.push(k)}ks.forEach(k=>LS.removeItem(k))}catch(e){}
    bump();return flush()},
  flush,
  onChange(f){listeners.push(f)},
  persistAsked:false,
  async persist(force){if(!navigator.storage||!navigator.storage.persist)return null;if(api.persistAsked&&!force)return status.persisted;api.persistAsked=true;
    try{status.persisted=(await navigator.storage.persisted())||(await navigator.storage.persist())}catch(e){}await api.estimate();return status.persisted},
  async estimate(){try{if(navigator.storage&&navigator.storage.persisted&&status.persisted===null)status.persisted=await navigator.storage.persisted();
    if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();status.usage=e.usage;status.quota=e.quota}}catch(e){}emit()}
};
api.ready=(async()=>{const ls=readLS();cache=Object.assign({},ls);rev=+ls[REV]||0;
  db=await openDB();status.idb=!!db;const snap=await idbGet();
  const lsHas=DATA_KEYS.some(k=>k in ls),snapHas=snap&&snap.items&&DATA_KEYS.some(k=>k in snap.items);
  if(snap&&snap.items&&((snapHas&&!lsHas)||(+snap.rev||0)>rev)){            // localStorage lost/older -> restore the local IndexedDB copy
    let n=0;for(const k of Object.keys(snap.items)){if(!ours(k))continue;cache[k]=snap.items[k];if(ls[k]!==snap.items[k]){lsSet(k,snap.items[k]);n++}}
    rev=Math.max(rev,+snap.rev||0);cache[REV]=String(rev);if(!failed.size)lsSet(REV,String(rev));status.restored=n>0;status.restoredKeys=n}
  if(!snap||!status.restored&&(+snap.rev||0)!==rev)await idbPut();          // first run / existing users: create the mirror now
  else status.lastMirror=snap&&snap.savedAt?new Date(snap.savedAt):null;
  if(DATA_KEYS.some(k=>k in cache))api.persist();else api.estimate();
})().catch(()=>{});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
addEventListener('pagehide',()=>{flush()});
window.LHStore=api;
})();
