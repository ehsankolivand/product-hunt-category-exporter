import {db} from './lib/db.js';
import {newJob,Runner} from './lib/runner.js';
import {sortProducts,categoryUrl} from './lib/core.js';
import {downloadZip,writeDirectory} from './lib/export.js';
import {t,message,translate,localizedError,initLanguage,setLanguage,getLanguage,locale,formatNumber as fmt,applyTranslations} from './lib/i18n.js';
import './collector.js';

const $=id=>document.getElementById(id);
let job=null,root=null,summaries=[],busy=false,lastTable=0,refreshing=false,noticeMessage='',noticeDescriptor;
const installed=!!globalThis.chrome?.runtime?.id;
function raw(id,value){const element=$(id);delete element.dataset.i18n;delete element.dataset.i18nParams;element.textContent=value;}
function text(id,key,params={}){const element=$(id);element.dataset.i18n=key;element.dataset.i18nParams=JSON.stringify(params);element.textContent=t(key,params);}
function display(id,value,descriptor){if(descriptor?.key)text(id,descriptor.key,descriptor.params);else raw(id,translate(value));}
const runner=new Runner(update,async current=>{
  if(!root) return;
  try {
    const path=await writeDirectory(current,root);text('savedPath','export.saved',{path});current.file_error=null;current.file_error_i18n=null;
  } catch(e){
    current.file_error=e.message;current.file_error_i18n=e.i18n;await db.saveJob(current);
    showNotice('',message('export.folderFailed',{error:e.i18n || e.message}));
  }
});

function showNotice(value,descriptor){
  noticeMessage=value;noticeDescriptor=descriptor;
  $('notice').hidden=!value && !descriptor;display('notice',value || '',descriptor);
}
function renderStats(){
  for(const [id,key] of [['found','found'],['processed','processed'],['reviewCount','reviews'],['commentCount','comments']])raw(id,fmt(job?.stats[key]));
}
function update(current) {
  job=current;
  if(current.category?.name)raw('categoryName',current.category.name);else text('categoryName','progress.category');
  text('status','status.'+current.status);$('status').dataset.status=current.status;
  text('stage',current.options.mode==='catalog' ? 'progress.catalog' : current.stage==='category' ? 'progress.stage1' : 'progress.stage2');
  if(current.current_message)display('message',current.current_message,current.current_message_i18n);else text('message','progress.continue');
  renderStats();
  const total=current.category?.reported_products,pages=current.category_pages.length;
  if(total!=null)text('coverage','progress.coverage',{found:current.stats.found,total,pages});else text('coverage','progress.pages',{pages});
  renderSpeed();
  $('progress').value=current.stage==='category' ? (total ? Math.min(30,30*current.stats.found/total):5) : 30+70*current.stats.processed/Math.max(1,current.stats.found);
  if(current.error || current.file_error)showNotice(current.error || current.file_error,current.error ? current.error_i18n : current.file_error_i18n);
  else if(current.status==='partial')showNotice('',message('progress.partial'));
  else showNotice('');
  buttons();renderLogs(current);
  if(Date.now()-lastTable>5000 || !runner.active)void refreshTable();
}
function renderSpeed(){
  if(!job)return;
  const policy=job.rate_limit_state,wait=runner.active ? Math.max(0,Math.ceil(((policy?.blocked_until||0)-Date.now())/1000)):0;
  raw('speed',t('progress.speed',{http:job.stats.http_pages,browser:job.stats.browser_pages,concurrency:job.options.concurrency||1})+
    (policy ? t('progress.interval',{seconds:policy.interval/1000}):'')+
    (wait ? t('progress.wait',{seconds:wait}):''));
  if(wait)text('message','progress.countdown',{seconds:wait});
  else if(runner.active && job.rate_limit_message && job.current_message===job.rate_limit_message)text('message','progress.resuming');
}
setInterval(()=>{if(runner.active)renderSpeed();},1000);
function buttons(){
  const running=runner.active || busy;
  $('start').disabled=running || !installed;$('startFolder').disabled=running || !installed || !globalThis.showDirectoryPicker;
  $('pause').disabled=!runner.active || runner.stopRequested;
  $('resume').disabled=!job || running || job.status==='complete' || (!job.next_category_url && job.stats.processed>=job.stats.found);
  $('retry').disabled=!job || running || !['partial','error','blocked'].includes(job.status);
  $('worker').disabled=!job || busy;
  $('zip').disabled=!job?.stats.found || running;$('folder').disabled=!job?.stats.found || running || !globalThis.showDirectoryPicker;
  for(const b of $('history').querySelectorAll('button'))b.disabled=running;
}
function renderLogs(current){
  $('logs').replaceChildren();
  for(const row of [...current.log].reverse().slice(0,35)){
    const div=document.createElement('div');div.className='log-row';div.dataset.level=row.level;
    const time=document.createElement('time');time.dateTime=row.time;time.textContent=new Date(row.time).toLocaleTimeString(locale());
    const msg=document.createElement('span');msg.textContent=translate(row.message,row.i18n);div.append(time,msg);$('logs').append(div);
  }
}
async function refreshTable(){
  if(!job || refreshing)return;refreshing=true;const id=job.id;
  try{const rows=await db.summaries(id);if(job?.id===id){summaries=rows;lastTable=Date.now();renderTable();}}
  catch(e){showNotice(e.message,e.i18n);}finally{refreshing=false;}
}
function renderTable(){
  const query=$('search').value.toLocaleLowerCase().trim(),sorted=sortProducts(summaries,$('sort').value).filter(p=>!query || p.name?.toLocaleLowerCase().includes(query));
  $('products').replaceChildren();
  for(const p of sorted.slice(0,50)){
    const tr=document.createElement('tr'),name=document.createElement('td'),a=document.createElement('a');
    a.textContent=p.name;a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';a.dir='auto';
    const tagline=document.createElement('span');tagline.className='tagline';tagline.textContent=p.tagline || '';tagline.dir='auto';name.append(a,tagline);tr.append(name);
    for(const key of ['rating_average','rating_count','upvotes_count']){const td=document.createElement('td');td.textContent=p[key]==null ? '—':fmt(p[key]);tr.append(td);}
    const state=document.createElement('td');state.className='state';state.dataset.state=p.state;state.textContent=t('state.'+p.state);tr.append(state);$('products').append(tr);
  }
  if(!sorted.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.dataset.i18n='table.empty';td.textContent=t('table.empty');tr.append(td);$('products').append(tr);}
  if(sorted.length)text('tableNote','table.note',{shown:Math.min(50,sorted.length),total:sorted.length});else raw('tableNote','');
}
async function history(){
  const jobs=(await db.jobs()).sort((a,b)=>b.created_at.localeCompare(a.created_at));$('history').replaceChildren();
  for(const entry of jobs){
    const b=document.createElement('button');b.className=entry.id===job?.id?'selected':'';
    const name=document.createElement('bdi');name.textContent=entry.category?.name || t('history.collection');
    const small=document.createElement('small');small.textContent=t('history.entry',{count:entry.stats.found,status:t('status.'+entry.status),date:new Date(entry.created_at).toLocaleDateString(locale())});
    b.append(name,small);b.addEventListener('click',()=>guard(()=>select(entry.id)));$('history').append(b);
  }
  if(!jobs.length){const p=document.createElement('p');p.className='hint';p.textContent=t('history.empty');$('history').append(p);}buttons();
  return jobs;
}
async function select(id){
  job=await db.job(id);root=await db.handle(id);$('category').value=job.category_url;sourcePreview();
  if(job.status==='running'){job.status='paused';job.current_message_i18n=message('progress.interrupted');job.current_message=t('progress.interrupted');}
  update(job);await refreshTable();await history();
}
async function guard(action){try{await action();}catch(e){if(e.name!=='AbortError')showNotice(e.message,e.i18n);}finally{busy=false;buttons();}}
function options(){
  const read=id=>{const n=Number($(id).value);if(!Number.isFinite(n) || n<0 || !Number.isInteger(n))throw localizedError('error.limits');return n;};
  const delay=Number($('delay').value);if(!Number.isFinite(delay) || delay<0.1 || delay>30)throw localizedError('error.delay');
  const concurrency=read('concurrency');if(concurrency<1 || concurrency>6)throw localizedError('error.concurrency');
  const mode=$('mode').value;
  return {mode,concurrency,transport:'auto',reviews:mode==='full' && $('reviews').checked,comments:mode==='full' && $('comments').checked,maxProducts:read('maxProducts'),maxReviews:read('maxReviews'),maxComments:read('maxComments'),delay:delay*1000};
}
function sourcePreview(){try{raw('sourcePreview',categoryUrl($('category').value));}catch{text('sourcePreview','setup.invalidUrl');}}
function modeChanged(){
  const catalog=$('mode').value==='catalog';$('reviews').disabled=catalog;$('comments').disabled=catalog;
  text('modeHint',catalog ? 'setup.catalogHint' : 'setup.modeHint');
}
async function start(withFolder){
  const url=categoryUrl($('category').value),config=options();busy=true;buttons();
  // Keep the directory picker in the user gesture, before IndexedDB awaits.
  const chosen=withFolder ? await showDirectoryPicker({mode:'readwrite',id:'ph-exports'}):null;
  job=newJob(url,config);root=chosen;await db.saveJob(job);if(root)await db.saveHandle(job.id,root);
  summaries=[];update(job);await history();busy=false;await runner.run(job);await history();await refreshTable();
}
async function languageChanged(){
  setLanguage($('language').value);applyTranslations();renderStats();renderSpeed();
  showNotice(noticeMessage,noticeDescriptor);
  if(job){renderLogs(job);renderTable();}
  if(installed)await history();
}
$('language').addEventListener('change',()=>{void languageChanged().catch(e=>showNotice(e.message,e.i18n));});
$('startFolder').addEventListener('click',()=>guard(()=>start(true)));
$('start').addEventListener('click',()=>guard(()=>start(false)));
$('pause').addEventListener('click',()=>{runner.pause();text('message','progress.pausing');buttons();});
$('resume').addEventListener('click',()=>guard(async()=>{await runner.run(job);await history();await refreshTable();}));
$('retry').addEventListener('click',()=>guard(async()=>{await runner.retryIncomplete(job);await runner.run(job);await history();await refreshTable();}));
$('worker').addEventListener('click',()=>guard(()=>runner.showWorker()));
$('sort').addEventListener('change',renderTable);$('search').addEventListener('input',renderTable);
$('category').addEventListener('input',sourcePreview);$('mode').addEventListener('change',modeChanged);
$('zip').addEventListener('click',()=>guard(async()=>{busy=true;buttons();text('message','export.preparing');await downloadZip(job,$('sort').value);text('message','export.ready');}));
$('folder').addEventListener('click',()=>guard(async()=>{const chosen=await showDirectoryPicker({mode:'readwrite',id:'ph-exports'});busy=true;buttons();root=chosen;await db.saveHandle(job.id,root);const path=await writeDirectory(job,root,$('sort').value,true);text('savedPath','export.saved',{path});showNotice('');}));
window.addEventListener('beforeunload',event=>{if(runner.active){event.preventDefault();event.returnValue='';}});
async function init(){
  initLanguage();applyTranslations();$('language').value=getLanguage();renderStats();
  const supplied=new URL(location.href).searchParams.get('category');if(supplied)$('category').value=categoryUrl(supplied);sourcePreview();modeChanged();
  if(!installed){showNotice('',message('error.install'));buttons();return;}
  await history();buttons();
}
void guard(init);
