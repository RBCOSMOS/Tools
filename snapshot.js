/* Creates immutable HTML bundles. No fetched responses are stored outside the snapshot. */
(function(){
const BUDGET=25*1024*1024;
const offlinePolicy="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; manifest-src 'none'";
const readData=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)});
function sealHTML(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 doc.querySelectorAll('base,meta[http-equiv="refresh" i],meta[http-equiv="Content-Security-Policy" i],link[rel="preconnect"],link[rel="dns-prefetch"],link[rel="prefetch"],link[rel="prerender"],link[rel="modulepreload"],link[rel="preload"],link[rel="manifest"],iframe,object,embed').forEach(n=>n.remove());
 const meta=doc.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content=offlinePolicy;doc.head.prepend(meta);
 // Offline copies are standalone: prevent outbound navigation even in the child frame.
 const guard=doc.createElement('script');guard.textContent="document.addEventListener('click',e=>{const a=e.target.closest?.('a');if(a&&!((a.getAttribute('href')||'').startsWith('#')))e.preventDefault()},true);document.addEventListener('submit',e=>e.preventDefault(),true);";doc.head.insertBefore(guard,meta.nextSibling);
 doc.querySelectorAll('a,area').forEach(a=>{const h=a.getAttribute('href')||'';if(h&&!h.startsWith('#'))a.removeAttribute('href');a.removeAttribute('target');a.removeAttribute('ping')});
 return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
async function makeSnapshot(html,{localFiles=[],allowNetwork=true,onProgress=()=>{}}={}){
 const doc=new DOMParser().parseFromString(html,'text/html'),failures=[],warnings=new Set(),cache=new Map();let bytes=0,count=0;
 const localMap=new Map(localFiles.map(f=>[f.name,f]));
 // HTML source files have no reliable web origin. Only absolute remote URLs are fetched.
 async function get(ref,base=''){
  ref=ref.trim();if(!ref||ref.startsWith('#'))return null;
  if(ref.startsWith('data:')){const r=await fetch(ref);return {blob:await r.blob(),base:''}}
  if(ref.startsWith('blob:'))throw new Error('Temporary blob URLs cannot be saved. Import the original asset.');
  let local=localMap.get(ref.split(/[?#]/)[0].replace(/^\.\//,''));if(local)return {blob:local.blob,base:''};
  let url;try{url=new URL(ref,base||undefined)}catch{throw new Error('Missing local asset: '+ref)}
  if(!['https:','http:'].includes(url.protocol))throw new Error('Unsupported asset: '+ref);
  if(url.username||url.password)throw new Error('Asset URL contains credentials.');
  if(!allowNetwork)throw new Error('Reconnect to preload: '+url.href);
  if(!cache.has(url.href))cache.set(url.href,(async()=>{
   onProgress('Preloading asset '+(++count)+'…');
   const response=await fetch(url.href,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error('Could not preload '+url.href+' ('+response.status+')');
   const length=Number(response.headers.get('content-length')||0);if(length>BUDGET-bytes)throw new Error('Assets exceed the 25 MB offline limit.');
   const reader=response.body?.getReader();let blob;
   if(reader){const parts=[];while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>BUDGET){await reader.cancel();throw new Error('Assets exceed the 25 MB offline limit.')}parts.push(part.value)}blob=new Blob(parts,{type:response.headers.get('content-type')||'application/octet-stream'})}else{blob=await response.blob();bytes+=blob.size;if(bytes>BUDGET)throw new Error('Assets exceed the 25 MB offline limit.')}
   return {blob,base:response.url||url.href};
  })());return cache.get(url.href);
 }
 async function dataRef(ref,base=''){if(!ref||ref.startsWith('#')||ref.startsWith('data:'))return ref;const a=await get(ref,base);return a?await readData(a.blob):ref}
 async function guarded(fn,ref){try{return await fn()}catch(e){failures.push(e.message||ref);return null}}
 async function css(text,base='',trail=new Set()){
  let result='',last=0;
  const imports=/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)]+))\s*\)?\s*([^;]*);/gi;
  for(const m of text.matchAll(imports)){const ref=m[1]||m[2]||m[3];const key=base+'|'+ref;let replacement='';if(trail.has(key))throw new Error('Circular CSS import: '+ref);const a=await get(ref,base);if(a){const next=new Set(trail);next.add(key);replacement=await css(await a.blob.text(),a.base,next);if(m[4].trim())replacement='@media '+m[4].trim()+'{'+replacement+'}'}result+=text.slice(last,m.index)+replacement;last=m.index+m[0].length}result+=text.slice(last);text=result;result='';last=0;
  for(const m of text.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g)){result+=text.slice(last,m.index)+'url("'+await dataRef(m[2],base)+'")';last=m.index+m[0].length}return result+text.slice(last);
 }
 for(const script of doc.querySelectorAll('script')){
  if(script.type==='module')warnings.add('JavaScript modules may import other files at runtime. Those imports are blocked offline.');
  const ref=script.getAttribute('src');if(ref){const result=await guarded(()=>dataRef(ref),ref);if(result){script.src=result;script.removeAttribute('integrity');script.removeAttribute('crossorigin')}}
  if(/\b(fetch\s*\(|XMLHttpRequest|WebSocket|import\s*\(|serviceWorker|https?:\/\/)/.test(script.textContent))warnings.add('This HTML contains code that may request online resources. Network calls are blocked in offline copies.');
 }
 for(const link of [...doc.querySelectorAll('link[rel="stylesheet"][href]')]){
  const ref=link.getAttribute('href');const result=await guarded(async()=>{const a=await get(ref);return a?await css(await a.blob.text(),a.base):''},ref);
  if(result!==null){const style=doc.createElement('style');style.textContent=result;if(link.media)style.media=link.media;link.replaceWith(style)}
 }
 for(const style of doc.querySelectorAll('style')){const result=await guarded(()=>css(style.textContent),'embedded CSS');if(result!==null)style.textContent=result}
 for(const el of doc.querySelectorAll('[style]')){const result=await guarded(()=>css(el.getAttribute('style')),'inline CSS');if(result!==null)el.setAttribute('style',result)}
 for(const el of doc.querySelectorAll('img[src],audio[src],video[src],source[src],track[src],input[type="image"][src],video[poster],image[href],image[xlink\\:href]')){
  for(const attr of ['src','poster','href','xlink:href']){if(!el.hasAttribute(attr))continue;const ref=el.getAttribute(attr);const result=await guarded(()=>dataRef(ref),ref);if(result!==null)el.setAttribute(attr,result)}
 }
 for(const img of doc.querySelectorAll('[srcset]')){
  // Select one image for this frozen copy. Keep a supplied src when available.
  const original=img.getAttribute('srcset');if(!img.getAttribute('src')){if(original.trim().startsWith('data:'))failures.push('Use an image src instead of a data-URL srcset.');else{const ref=original.split(',')[0].trim().split(/\s+/)[0];const result=await guarded(()=>dataRef(ref),ref);if(result!==null){if(img.tagName==='SOURCE'){const fallback=img.closest('picture')?.querySelector('img');if(fallback&&!fallback.src)fallback.src=result}else img.src=result}}}img.removeAttribute('srcset');img.removeAttribute('sizes');
 }
 for(const link of [...doc.querySelectorAll('link')]){if(!link.rel.includes('stylesheet'))link.remove()}
 if(doc.querySelector('iframe,object,embed'))warnings.add('Embedded pages and plugins are excluded from the offline copy.');
 if(doc.querySelector('a[href]:not([href^="#"]),form'))warnings.add('External links and form submissions are disabled in offline copies.');
 if(failures.length){const error=new Error('Not saved. These assets could not be preloaded:\n'+[...new Set(failures)].slice(0,8).join('\n')+'\nImport missing files alongside the HTML, or use a self-contained HTML. Remote servers must permit cross-origin downloads.');error.assetFailures=failures;throw error}
 const bundled='<!doctype html>\n'+doc.documentElement.outerHTML;
 const result=sealHTML(bundled);if(new Blob([result]).size>BUDGET)throw new Error('The bundled copy exceeds 25 MB.');
 return {html:result,warnings:[...warnings]};
}
window.PocketSnapshot={make:makeSnapshot,seal:sealHTML};
})();
