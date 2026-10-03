/* Public gallery, immutable offline shelf, and shell readiness. No build required. */
(async function(){
'use strict';
await workspaceReady;
const config=window.POCKET_CONFIG||{}, backend=(config.supabaseUrl||'').replace(/\/$/,''), publishable=config.supabasePublishableKey||'';
const configured=/^https:\/\/[^/]+$/.test(backend)&&publishable.startsWith('sb_publishable_');
const SESSION_KEY='pocket-session:'+backend;
function localRead(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function localWrite(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
let session=localRead(SESSION_KEY,null),manualOffline=localRead('pocket-offline-mode',false),activeSection='workspace',galleryRows=[],galleryOffset=0,galleryMine=false,galleryRequest=0,signup=false,publishingFile=null,viewerItem=null,snapshotBusy=false,refreshPromise=null;
const isOffline=()=>manualOffline||!navigator.onLine;
const PUBLIC_FIELDS='id,owner_id,title,description,author,filename,revision,created_at,updated_at';
const ONLINE_NOTE='External dependencies may need internet. Runs in an isolated preview.';
function errorAt(id,error){$(id).textContent=error?.message||String(error);$(id).hidden=false}
function hideError(id){$(id).hidden=true;$(id).textContent=''}
function niceDate(s){return new Date(s).toLocaleString([],{dateStyle:'medium',timeStyle:'short'})}
function clearSession(){session=null;try{localStorage.removeItem(SESSION_KEY)}catch{}renderAccount()}
function storeSession(value){session={access_token:value.access_token,refresh_token:value.refresh_token,expires_at:value.expires_at||Math.floor(Date.now()/1000)+(value.expires_in||3600),user:value.user};localWrite(SESSION_KEY,session);renderAccount()}
async function request(path,{method='GET',body,authenticated=false,headers={}}={}){
 if(isOffline())throw new Error('You are offline. Reconnect or turn off offline mode to use the public gallery.');
 if(!configured)throw new Error('The site owner needs to configure the public gallery. See Setup instructions.');
 if(authenticated){if(!session)throw new Error('Sign in first.');await freshSession()}
 const token=authenticated?session?.access_token:null;
 const response=await fetch(backend+path,{method,headers:{apikey:publishable,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(25000)});
 let result=null;const raw=await response.text();try{result=raw?JSON.parse(raw):null}catch{result={message:raw.slice(0,300)}}
 if(!response.ok){if(response.status===401&&authenticated)clearSession();throw new Error(result?.msg||result?.message||result?.error_description||result?.error||'Request failed ('+response.status+'). Check setup and try again.')}
 return result;
}
async function freshSession(){
 if(!session)return;if(session.expires_at>Date.now()/1000+60)return;
 if(!refreshPromise)refreshPromise=(async()=>{try{const value=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});storeSession(value)}catch(e){clearSession();throw new Error('Your session expired. Sign in again.')}finally{refreshPromise=null}})();
 await refreshPromise;
}
function showSection(which){
 if(which==='share'&&isOffline()){toast('Peer sharing needs an internet connection for pairing.');return}
 activeSection=which;
 const sectionIds={workspace:'workSection',share:'shareSection',gallery:'gallerySection',offline:'offlineSection'};
 const navIds={workspace:'workspaceNav',share:'shareNav',gallery:'galleryNav',offline:'offlineNav'};
 for(const [key,id]of Object.entries(sectionIds))$(id).classList.toggle('hidden',key!==which);
 for(const [key,id]of Object.entries(navIds))$(id).classList.toggle('active',key===which);
 $('sectionName').textContent={workspace:'Files & editor',share:'Peer-to-peer sharing',gallery:'Public gallery',offline:'Offline shelf'}[which];
 if(which==='gallery')loadGallery();if(which==='offline')renderOffline();
}
switchTab=share=>showSection(share?'share':'workspace');
$('workspaceNav').onclick=()=>showSection('workspace');$('shareNav').onclick=()=>showSection('share');$('galleryNav').onclick=()=>showSection('gallery');$('offlineNav').onclick=()=>showSection('offline');
function networkUI(){
 const offline=isOffline();document.body.classList.toggle('offline-mode',offline);$('networkPill').textContent=offline?'Offline':'Online';$('networkPill').classList.toggle('off',offline);$('offlineModeBtn').textContent=manualOffline?'Exit offline mode':'Use offline mode';
 if(offline){peer?.destroy();if(conn)resetConnection('Sharing paused offline');if($('htmlViewer').open&&!viewerItem?.frozen)$('htmlViewer').close()}
 if(activeSection==='gallery')loadGallery();
}
$('offlineModeBtn').onclick=()=>{manualOffline=!manualOffline;localWrite('pocket-offline-mode',manualOffline);networkUI();if(manualOffline){stopPreview();showSection('offline');toast('Offline mode on. Your saved copies stay frozen.')}else toast(navigator.onLine?'Online features are available again.':'Offline mode off, but this device is still disconnected.')};
window.addEventListener('online',networkUI);window.addEventListener('offline',()=>{networkUI();showSection('offline')});networkUI();
const priorEnable=$('enableShare').onclick;$('enableShare').onclick=()=>{if(isOffline())return toast('Turn off offline mode and reconnect to share.');return priorEnable()};
const originalRun=run;
run=async()=>{
 if(!isOffline()||!htmlExt.test(current()?.name||''))return originalRun();
 try{flush();const f=current(),copy=await PocketSnapshot.make(await f.blob.text(),{localFiles:files,allowNetwork:false});stopPreview();const frame=document.createElement('iframe');frame.title='Offline HTML preview';frame.setAttribute('sandbox','allow-scripts allow-modals allow-downloads');frame.srcdoc=copy.html;$('preview').replaceChildren(frame);if(innerWidth<=720)setMobile(true)}catch(e){toast('Use a saved offline copy, or reconnect to preload the missing assets.');showSection('offline')}
};$('runBtn').onclick=()=>run();
function renderAccount(){$('accountEmail').textContent=session?.user?.email||'';$('accountBtn').textContent=session?'Sign out':'Sign in';$('galleryMine').classList.toggle('dark',galleryMine)}
renderAccount();
function openAccount(){if(!configured){$('featureHelp').showModal();return}if(isOffline()){toast('Reconnect to sign in.');return}hideError('authError');$('authNote').textContent='';$('accountDialog').showModal()}
$('accountBtn').onclick=async()=>{if(session){const token=session.access_token;clearSession();galleryMine=false;if(!isOffline())fetch(backend+'/auth/v1/logout',{method:'POST',headers:{apikey:publishable,Authorization:'Bearer '+token}}).catch(()=>{});loadGallery();toast('Signed out on this device.')}else openAccount()};
$('authClose').onclick=()=>$('accountDialog').close();$('authToggle').onclick=()=>{signup=!signup;$('accountTitle').textContent=signup?'Create a publishing account':'Sign in to publish';$('authSubmit').textContent=signup?'Create account':'Sign in';$('authToggle').textContent=signup?'I already have an account':'Create account';$('authPassword').autocomplete=signup?'new-password':'current-password';hideError('authError')};
$('accountForm').onsubmit=async e=>{e.preventDefault();hideError('authError');$('authSubmit').disabled=true;try{const email=$('authEmail').value.trim(),password=$('authPassword').value;const value=await request(signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});if(value?.access_token){storeSession(value);$('accountDialog').close();$('authPassword').value='';toast('Signed in. You can publish HTMLs.');if(activeSection==='gallery')loadGallery()}else{$('authNote').textContent='Check your email to confirm the account, then sign in here. If email is not arriving, ask the site owner to check SMTP setup.';$('authPassword').value=''}}catch(error){errorAt('authError',error)}finally{$('authSubmit').disabled=false}};
// Confirmation redirects can contain auth tokens. Remove them from the visible URL;
// sign-in happens through the password form rather than trusting a URL-provided session.
if(location.hash.includes('access_token=')||location.hash.includes('error_description=')){history.replaceState(null,'',location.pathname+location.search);toast('Return to Public and sign in after confirming your email.')}
$('setupBtn').onclick=()=>$('featureHelp').showModal();$('featureHelpClose').onclick=()=>$('featureHelp').close();
function emptyTile(parent,title,description,action){const el=document.createElement('div');el.className='featureempty';const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=description;el.append(h,p);if(action)el.append(action);parent.append(el)}
async function loadGallery(more=false){
 const ticket=++galleryRequest;if(!more){galleryOffset=0;galleryRows=[];$('galleryList').replaceChildren()}
 $('galleryMore').hidden=true;$('gallerySetupNotice').classList.toggle('hidden',configured);
 if(!configured){$('galleryStatus').textContent='Not connected to shared storage';emptyTile($('galleryList'),'Public gallery isn’t set up yet.','The site owner only needs to configure it once. Offline saving and your private workspace already work.');return}
 if(isOffline()){$('galleryStatus').textContent='Public gallery is unavailable offline.';emptyTile($('galleryList'),'Your offline copies are ready.','The public gallery needs internet. Your frozen versions live on the Offline shelf.',button('Open offline shelf',()=>showSection('offline')));return}
 if(galleryMine&&!session){galleryMine=false;renderAccount()}
 $('galleryStatus').textContent='Loading public HTMLs…';
 try{const query=new URLSearchParams({select:PUBLIC_FIELDS,order:'updated_at.desc,id.asc',limit:'24',offset:String(galleryOffset)});const term=$('gallerySearch').value.trim();if(term)query.set('title','ilike.%'+term.replace(/[%_]/g,'\\$&')+'%');if(galleryMine)query.set('owner_id','eq.'+session.user.id);
 const rows=await request('/rest/v1/pocket_html?'+query);if(ticket!==galleryRequest)return;if(!Array.isArray(rows))throw new Error('Unexpected gallery response. Check the SQL setup.');galleryRows=more?galleryRows.concat(rows):rows;galleryOffset+=rows.length;renderGallery();$('galleryStatus').textContent=galleryRows.length+' HTML'+(galleryRows.length===1?'':'s')+' shown'+(galleryMine?' · your uploads':'');$('galleryMore').hidden=rows.length<24;
 }catch(error){if(ticket!==galleryRequest)return;$('galleryStatus').textContent=error.message;if(!galleryRows.length)emptyTile($('galleryList'),'Could not load the gallery.','Check your connection and the site’s Supabase configuration, then press Refresh.')}
}
function renderGallery(){
 $('galleryList').replaceChildren();if(!galleryRows.length){emptyTile($('galleryList'),'No HTMLs here yet.','Publish a workspace HTML or upload one to share it with everyone.');return}
 for(const item of galleryRows){const card=document.createElement('article');card.className='tile';const badge=document.createElement('span');badge.className='typebadge';badge.textContent='HTML · v'+item.revision;const title=document.createElement('h3');title.textContent=item.title;const desc=document.createElement('p');desc.className='muted small';desc.textContent=item.description||'No description';const by=document.createElement('p');by.className='byline';by.textContent=item.author+' · '+niceDate(item.updated_at);const actions=document.createElement('div');actions.className='row';actions.append(button('Run',()=>publicAction(item,'run'),'dark'),button('Save offline',()=>publicAction(item,'offline')),button('Edit a copy',()=>publicAction(item,'edit')));if(session?.user?.id===item.owner_id)actions.append(button('Delete',()=>deletePublic(item),'danger'));card.append(badge,title,desc,by,actions);$('galleryList').append(card)}
}
async function getPublic(id){const rows=await request('/rest/v1/pocket_html?'+new URLSearchParams({select:'*',id:'eq.'+id,limit:'1'}));if(!rows?.[0])throw new Error('This public HTML was removed. Existing offline copies are unchanged.');return rows[0]}
async function publicAction(item,action){try{const full=await getPublic(item.id);if(action==='run')showViewer({...full,frozen:false});else if(action==='offline')prepareSnapshot(full.html,{title:full.title,name:full.filename,source:{kind:'public',id:full.id,backend,revision:full.revision},localFiles:[]});else await publicToWorkspace(full)}catch(e){toast(e.message)}}
async function publicToWorkspace(item){const f=await addFile(new File([item.html],cleanName(item.filename),{type:'text/html'}));if(!f)return;Object.assign(f,{publicId:item.id,publicOwner:item.owner_id,publicBackend:backend,publicRevision:item.revision,publicTitle:item.title,publicDescription:item.description,publicAuthor:item.author});await persist(f);showSection('workspace');toast('Private working copy opened. Publish when you want to share your edits.');return f}
async function deletePublic(item){if(!confirm('Remove “'+item.title+'” from the public gallery? Existing offline copies will remain.'))return;try{await request('/rest/v1/pocket_html?id=eq.'+encodeURIComponent(item.id),{method:'DELETE',authenticated:true});toast('Removed from the public gallery.');loadGallery()}catch(e){toast(e.message)}}
$('galleryRefresh').onclick=()=>loadGallery();$('galleryMore').onclick=()=>loadGallery(true);$('galleryMine').onclick=()=>{if(!session){openAccount();return}galleryMine=!galleryMine;renderAccount();loadGallery()};let searchTimer;$('gallerySearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadGallery(),350)};
function openPublish(){
 if(!configured){$('featureHelp').showModal();return}if(isOffline()){toast('Reconnect to publish.');return}if(!session){openAccount();return}
 flush();const f=current();if(!f||!htmlExt.test(f.name)){toast('Select or import an HTML file first.');return}
 publishingFile=f;hideError('publishError');const own=f.publicBackend===backend&&f.publicOwner===session.user.id&&f.publicId;
 $('publishHeading').textContent=own?'Publish your updated version':'Publish to everyone';$('publishSource').textContent=f.name+(own?' · currently based on public v'+f.publicRevision:'');$('publishTitle').value=f.publicTitle||f.name.replace(/\.html?$/i,'');$('publishDescription').value=f.publicDescription||'';$('publishAuthor').value=f.publicAuthor||localRead('pocket-author','');$('publishNewWrap').hidden=!own;$('publishAsNew').checked=false;$('publishSubmit').disabled=false;$('publishDialog').showModal();
}
$('publishBtn').onclick=openPublish;$('publishCancel').onclick=()=>$('publishDialog').close();$('publicUploadBtn').onclick=()=>{if(!configured){$('featureHelp').showModal();return}if(!session){openAccount();return}if(isOffline()){toast('Reconnect to upload.');return}$('publicFileInput').click()};
$('publicFileInput').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(!htmlExt.test(f.name)){toast('Choose an HTML file.');return}await addFile(f);openPublish()};
$('publishForm').onsubmit=async e=>{e.preventDefault();hideError('publishError');$('publishSubmit').disabled=true;$('publishSubmit').textContent='Publishing…';try{
 const f=publishingFile;if(!f||!files.includes(f))throw new Error('The selected file was removed.');if(f.id===selected)flush();
 const bundled=await compiledHTML(f);if(new Blob([bundled]).size>2*1024*1024)throw new Error('The HTML and embedded assets exceed the 2 MB public limit.');
 const own=!$('publishAsNew').checked&&f.publicBackend===backend&&f.publicOwner===session.user.id&&f.publicId;
 const result=await request('/rest/v1/rpc/pocket_publish',{method:'POST',authenticated:true,body:{p_title:$('publishTitle').value.trim(),p_description:$('publishDescription').value,p_author:$('publishAuthor').value.trim(),p_filename:f.name,p_html:bundled,p_id:own?f.publicId:null,p_expected_revision:own?f.publicRevision:null}});
 const saved=Array.isArray(result)?result[0]:result;if(!saved?.id)throw new Error('Unexpected publish response.');Object.assign(f,{publicId:saved.id,publicOwner:saved.owner_id,publicBackend:backend,publicRevision:saved.revision,publicTitle:saved.title,publicDescription:saved.description,publicAuthor:saved.author});await persist(f);localWrite('pocket-author',saved.author);$('publishDialog').close();showSection('gallery');toast('Published v'+saved.revision+'. Existing offline copies have not changed.');
 }catch(error){errorAt('publishError',error)}finally{$('publishSubmit').disabled=false;$('publishSubmit').textContent='Publish'}};
function showViewer(item){viewerItem=item;$('viewerTitle').textContent=item.title;$('viewerSubtitle').textContent=item.frozen?'Frozen copy · saved '+niceDate(item.savedAt)+' · does not update':ONLINE_NOTE;$('viewerSave').hidden=!!item.frozen;$('viewerFrame').srcdoc=item.frozen?PocketSnapshot.seal(item.html):item.html;$('htmlViewer').showModal()}
$('viewerClose').onclick=()=>$('htmlViewer').close();
const viewerFullscreenBtn=$('viewerFullscreen');
function viewerIsFullscreen(){return document.fullscreenElement===$('htmlViewer')||document.webkitFullscreenElement===$('htmlViewer')||$('htmlViewer').classList.contains('viewer-fallback-fullscreen')}
function updateViewerFullscreenButton(){viewerFullscreenBtn.textContent=viewerIsFullscreen()?'Exit fullscreen':'Fullscreen'}
async function toggleViewerFullscreen(){const viewer=$('htmlViewer');try{if(document.fullscreenElement||document.webkitFullscreenElement){if(document.exitFullscreen)await document.exitFullscreen();else if(document.webkitExitFullscreen)document.webkitExitFullscreen()}else if(viewer.requestFullscreen)await viewer.requestFullscreen();else if(viewer.webkitRequestFullscreen)viewer.webkitRequestFullscreen();else{viewer.classList.toggle('viewer-fallback-fullscreen');document.body.classList.toggle('viewer-fullscreen-fallback',viewer.classList.contains('viewer-fallback-fullscreen'))}}catch(e){viewer.classList.toggle('viewer-fallback-fullscreen');document.body.classList.toggle('viewer-fullscreen-fallback',viewer.classList.contains('viewer-fallback-fullscreen'))}updateViewerFullscreenButton()}
viewerFullscreenBtn.onclick=toggleViewerFullscreen;
document.addEventListener('fullscreenchange',updateViewerFullscreenButton);document.addEventListener('webkitfullscreenchange',updateViewerFullscreenButton);
$('htmlViewer').addEventListener('close',()=>{if(document.fullscreenElement===$('htmlViewer')&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});else if(document.webkitFullscreenElement===$('htmlViewer')&&document.webkitExitFullscreen)document.webkitExitFullscreen();$('htmlViewer').classList.remove('viewer-fallback-fullscreen');document.body.classList.remove('viewer-fullscreen-fallback');updateViewerFullscreenButton();$('viewerFrame').srcdoc='';viewerItem=null});$('viewerSave').onclick=()=>{const item=viewerItem;$('htmlViewer').close();prepareSnapshot(item.html,{title:item.title,name:item.filename,source:{kind:'public',id:item.id,backend,revision:item.revision},localFiles:[]})};
$('viewerEdit').onclick=async()=>{const item=viewerItem;$('htmlViewer').close();if(!item.frozen)await publicToWorkspace(item);else{await addFile(new File([item.html],item.name,{type:'text/html'}));showSection('workspace');toast('Editing a separate copy. The frozen version is unchanged.')}};
async function offlineTx(mode,fn){if(!db)throw new Error('Browser storage is unavailable. Offline copies cannot be saved here.');return new Promise((resolve,reject)=>{const tx=db.transaction('offline',mode),r=fn(tx.objectStore('offline'));tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error||new Error('Storage failed.'));tx.onabort=()=>reject(tx.error||new Error('Storage cancelled.'))})}
async function renderOffline(){
 try{const copies=await offlineTx('readonly',s=>s.getAll());copies.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));$('shelfCount').textContent=copies.length+' frozen '+(copies.length===1?'copy':'copies')+' · '+size(copies.reduce((n,c)=>n+new Blob([c.html]).size,0));$('offlineList').replaceChildren();
 if(!copies.length){emptyTile($('offlineList'),'A shelf for the versions you want to keep.','Use Save offline on a workspace HTML or a public upload. Open this site online once before disconnecting.');return}
 for(const item of copies){const card=document.createElement('article');card.className='tile';const badge=document.createElement('span');badge.className='typebadge';badge.textContent='FROZEN'+(item.source?.revision?' · v'+item.source.revision:'');const title=document.createElement('h3');title.textContent=item.title;const by=document.createElement('p');by.className='byline';by.textContent='Saved '+niceDate(item.savedAt)+' · '+size(new Blob([item.html]).size);const note=document.createElement('p');note.className='frozen-note';note.textContent='This copy never updates automatically.';const actions=document.createElement('div');actions.className='row';actions.append(button('Run offline',()=>showViewer({...item,frozen:true}),'dark'),button('Download',()=>download(new Blob([item.html],{type:'text/html'}),item.name)),button('Replace copy',()=>replaceSnapshot(item)),button('Remove',async()=>{if(!confirm('Remove this offline copy of “'+item.title+'”?'))return;try{await offlineTx('readwrite',s=>s.delete(item.id));renderOffline()}catch(e){toast(e.message)}},'danger'));card.append(badge,title,by,note);if(item.warnings?.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Offline limitations';const p=document.createElement('p');p.textContent=item.warnings.join(' ');details.append(summary,p);card.append(details)}card.append(actions);$('offlineList').append(card)}
 }catch(e){$('shelfCount').textContent='Storage unavailable';$('offlineList').replaceChildren();emptyTile($('offlineList'),'Offline saving isn’t available.',e.message)}
}
async function prepareSnapshot(html,options){
 if(snapshotBusy){toast('Another HTML is being preloaded.');return}
 snapshotBusy=true;$('snapshotTitle').textContent=options.replaceId?'Replace the frozen copy':'Save a frozen copy';$('snapshotProgress').textContent='Preloading HTML and its assets…';hideError('snapshotError');$('snapshotWarnings').hidden=true;$('snapshotFinish').hidden=true;$('snapshotClose').disabled=true;$('snapshotDialog').showModal();
 try{if(!db)throw new Error('Browser storage is unavailable.');const result=await PocketSnapshot.make(html,{localFiles:options.localFiles??files,allowNetwork:!isOffline(),onProgress:text=>$('snapshotProgress').textContent=text});
 const item={id:options.replaceId||uid(),title:options.title,name:cleanName(options.name||'offline.html'),html:result.html,warnings:result.warnings,source:options.source||{kind:'file'},savedAt:new Date().toISOString()};
 $('snapshotProgress').textContent='Preloaded '+size(new Blob([item.html]).size)+'. This snapshot will never refresh itself.';
 if(item.warnings.length){$('snapshotWarnings').textContent=item.warnings.join(' ');$('snapshotWarnings').hidden=false}
 $('snapshotFinish').hidden=false;$('snapshotFinish').disabled=false;$('snapshotFinish').onclick=async()=>{try{$('snapshotFinish').disabled=true;await offlineTx('readwrite',s=>s.put(item));$('snapshotDialog').close();showSection('offline');toast('Frozen copy saved. Run it once to check it before disconnecting.')}catch(e){errorAt('snapshotError',e);$('snapshotFinish').disabled=false}};
 }catch(e){errorAt('snapshotError',e);$('snapshotProgress').textContent='Nothing was changed. Your existing copies are safe.'}finally{snapshotBusy=false;$('snapshotClose').disabled=false}
}
$('snapshotDialog').addEventListener('cancel',e=>{if(snapshotBusy)e.preventDefault()});$('snapshotClose').onclick=()=>$('snapshotDialog').close();
$('saveOfflineBtn').onclick=async()=>{flush();const f=current();if(!f||!htmlExt.test(f.name)){toast('Select an HTML file to preload.');return}prepareSnapshot(await f.blob.text(),{title:f.name,name:f.name,source:{kind:'workspace',id:f.id},localFiles:files})};
$('preloadFileBtn').onclick=()=>$('preloadFileInput').click();$('preloadFileInput').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(!htmlExt.test(file.name)){toast('Choose an HTML file.');return}if(file.size>25*1024*1024){toast('Offline copies are limited to 25 MB.');return}prepareSnapshot(await file.text(),{title:file.name,name:file.name,source:{kind:'file'},localFiles:files})};
async function replaceSnapshot(item){
 if(!confirm('Replace the frozen version of “'+item.title+'” with a newly preloaded copy? This is the only way it changes.'))return;
 try{if(item.source?.kind==='public'){if(item.source.backend!==backend)throw new Error('This copy came from a different gallery. Import its latest HTML manually.');const full=await getPublic(item.source.id);prepareSnapshot(full.html,{title:full.title,name:full.filename,replaceId:item.id,source:{kind:'public',id:full.id,backend,revision:full.revision},localFiles:[]})}
 else if(item.source?.kind==='workspace'){flush();const f=files.find(f=>f.id===item.source.id);if(!f)throw new Error('The workspace original was removed. Preload a new HTML separately.');prepareSnapshot(await f.blob.text(),{title:f.name,name:f.name,replaceId:item.id,source:item.source,localFiles:files})}
 else{toast('Preload the revised file as a new copy, then remove the old one when ready.')}}catch(e){toast(e.message)}
}
$('persistStorageBtn').onclick=async()=>{if(!navigator.storage?.persist){toast('This browser manages storage automatically. Download backups.');return}try{const kept=await navigator.storage.persist();toast(kept?'Persistent storage granted for this device.':'The browser did not grant persistent storage. Keep downloaded backups.')}catch{toast('Storage permission was unavailable. Download important copies.')}};
async function checkReadiness(){
 if(!('serviceWorker'in navigator)||!window.isSecureContext){$('offlineAppStatus').textContent='Open the hosted HTTPS site first';$('offlineAppDetail').textContent='Offline app launching needs GitHub Pages or localhost, not a file:// address.';return}
 try{const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline installation is still pending. Check that all app files were uploaded.')),15000))]);
 const active=registration.active||navigator.serviceWorker.controller;if(!active)throw new Error('Reload once to finish offline setup.');
 const result=await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('Offline check timed out.')),4000);channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};active.postMessage({type:'CHECK_SHELL'},[channel.port2])});
 if(!result.ready)throw new Error('App files are missing from the cache. Reopen online and reload.');
 $('offlineAppStatus').textContent='App ready to open offline';$('offlineAppDetail').textContent='Reopen this same site address in this browser. Saved HTML copies are ready on this shelf.';
 }catch(e){$('offlineAppStatus').textContent='Offline app setup incomplete';$('offlineAppDetail').textContent=e.message}
}
$('checkOfflineBtn').onclick=checkReadiness;
checkReadiness();renderOffline();if(isOffline())showSection('offline');
// A testable, minimal surface for app diagnostics. Contains no session or credentials.
window.PocketFeatures={showSection,checkReadiness,renderOffline,isOffline};
})();
