import {db} from '../lib/db.js';
import {newJob,Runner} from '../lib/runner.js';
import {exportFiles,writeDirectory} from '../lib/export.js';
import {categoryUrl} from '../lib/core.js';
import {parsePublicHTML,FastHttp,RequestGate,HttpUnavailable,RateLimited} from '../lib/transport.js';
import {createHTMLMessageHandler} from '../lib/network.js';
import {setLanguage,message,translate} from '../lib/i18n.js';
setLanguage('fa',{persist:false});
const results=[],out=document.getElementById('results');
function assert(value,message){if(!value)throw new Error(message);}
async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack});}out.textContent=JSON.stringify(results,null,2);}
const origin='https://www.producthunt.com';
function doc(body,ld=[],title='Product Hunt'){return new DOMParser().parseFromString(`<title>${title}</title>${ld.map(x=>`<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('')}${body}`,'text/html');}
function product(i,extra={}){return {'@type':['WebApplication','Product'],name:'Product '+i,url:origin+'/products/p-'+i,description:'Full description '+i,aggregateRating:{ratingValue:'4.75',ratingCount:0,bestRating:5},...extra};}
function productDoc(i,count=0,launches=0){return doc(`<h1>Product ${i}</h1><a href="/products/p-${i}/reviews">${count} reviews</a><a data-test="product-navigation-item-reviews">Reviews ${count}</a><a data-test="product-navigation-item-launches" href="/products/p-${i}/launches">Launches ${launches}</a>`,[product(i,{aggregateRating:{ratingValue:'4.75',ratingCount:count,bestRating:5}})]);}
function categoryDoc(from,to,total,next){const list=[];for(let i=from;i<=to;i++)list.push(product(i));return doc(`<section id="content"><ul>${list.map((p,index)=>`<li><div data-test="product:p-${from+index}"><a href="/products/p-${from+index}"><span class="font-semibold">${p.name}</span><span class="text-secondary">Tagline ${from+index}</span></a><span><span class="font-semibold">4.8</span> (<a href="/products/p-${from+index}/reviews">0 reviews</a>)</span></div></li>`).join('')}</ul><span>Showing ${from}-${to} of ${total} products</span>${next?`<a href="${next}">Next</a>`:''}</section>`,[{'@type':'CollectionPage',headline:'Productivity',url:origin+'/categories/productivity',mainEntity:{itemListElement:list.map(item=>({item}))}}]);}
function reviewDoc(ids,{groups=false,next=null,filter=null}={}){
  const d=productDoc(1,5,0);const root=d.createElement('section');root.innerHTML=ids.map(id=>`<div id="DetailedReview-${id}"><a href="/@person-${id}">Person ${id}</a><div><label data-test="star-1-readonly"><svg data-test="star-1-filled"></svg><svg data-test="star-2-filled"></svg></label></div><div class="prose"><p>Useful complete review ${id}</p></div><button data-test="detailed-review-${id}-vote-button">Helpful (2)</button><time datetime="2026-10-01">ago</time></div>`).join('')+(groups?'<button>View all founder reviews</button><button>View all</button>':'')+(next?`<a href="${next}">Next</a>`:'');d.body.append(root);return d;
}
const pages=new Map();let current=origin,expandCalls=[],navigations=[],session={},interrupt=null;
globalThis.chrome={
  tabs:{create:async({url})=>{current=url;return {id:77,url};},get:async()=>({id:77,url:current,status:'complete'}),update:async(id,options)=>{if(options.url){current=options.url;navigations.push(current);if(interrupt)interrupt(current);}return {id:77,url:current};},remove:async()=>{}},
  storage:{session:{get:async key=>({[key]:session[key]}),set:async object=>Object.assign(session,object),remove:async key=>delete session[key]}},
  scripting:{executeScript:async args=>{
    if(args.files)return [];
    const command=args.args[0];
    if(command.op==='expand_reviews'){
      expandCalls.push(command.group);const filter=command.group==='founder'?'founder':'other';current=origin+`/products/p-1/reviews?filter=${filter}&page=1`;
      return [{result:{expanded:true,...PHCollector.extract(pages.get(current),current,'reviews')}}];
    }
    const source=pages.get(current);if(!source)throw new Error('Missing test fixture '+current);
    return [{result:PHCollector.extract(source,current,command.mode)}];
  }}
};
await test('Parse actual category selectors, precise JSON-LD score, displayed score and range',async()=>{
  const p=PHCollector.extract(categoryDoc(31,45,9730,'/categories/productivity?page=4#content'),origin+'/categories/productivity?page=3','category');
  assert(p.products.length===15,'15 products');assert(p.products[0].rating_average===4.75,'precise average');assert(p.products[0].rating_displayed===4.8,'displayed average');assert(p.products[0].rating_count===0,'explicit rating count');assert(p.category.reported_products===9730,'reported total');assert(p.next_url.endsWith('?page=4'),'next page');assert(p.products[0].category_position===31,'absolute position');
});
await test('Editorial category follows Browse all, not just the award winners',async()=>{
  const p=PHCollector.extract(doc('<dl><dt>Products considered</dt><dd>421</dd></dl><a href="/categories/ai-workflow-automation/all">Browse all 421 products</a>'),origin+'/categories/ai-workflow-automation','category');
  assert(p.browse_url.endsWith('/all'),'browse link');assert(p.category.reported_products===421,'editorial count');assert(p.products.length===0,'no invented cards');
});
await test('Review text, rating, author, helpful count and full positive/negative notes',async()=>{
  const d=reviewDoc(['12']);const s=d.createElement('script');s.type='application/ld+json';s.textContent=JSON.stringify({'@type':'Review','@id':origin+'/products/p-1/reviews?review=12',reviewRating:{ratingValue:4,bestRating:5},reviewBody:'<p>Body</p>',positiveNotes:{itemListElement:[{name:'<p>Full positive</p>'}]},negativeNotes:{itemListElement:[{name:'<p>Full negative</p>'}]}});d.body.append(s);
  const p=PHCollector.extract(d,origin+'/products/p-1/reviews','reviews');assert(p.reviews[0].rating===4,'rating from LD');assert(p.reviews[0].positive_notes[0]==='Full positive','positive');assert(p.reviews[0].negative_notes[0]==='Full negative','negative');assert(p.reviews[0].helpful_count===2,'helpful');assert(p.reviews[0].text.includes('complete review'),'untruncated prose');
});
await test('Launch comments and replies preserve text and parent IDs',async()=>{
  const d=doc('<div data-test="comments-feed"><div data-test="comment-10"><a href="/@alpha">Alpha</a><div class="prose">First comment</div><button data-test="action-bar-vote-button">Upvote (3)</button><div data-test="comment-11"><a href="/@beta">Beta</a><div class="prose">Reply text</div></div></div></div>');
  const p=PHCollector.extract(d,origin+'/products/p-1/launches/hello','launch');assert(p.comments.length===2,'both comments');assert(p.comments[0].text==='First comment','parent excludes reply');assert(p.comments[1].parent_id==='10','parent id');assert(p.comments[0].upvotes_count===3,'comment votes');
});
await test('Recognize site challenges without attempting to bypass them',async()=>{
  assert(PHCollector.extract(doc('Please wait',[],'Just a moment...'),origin+'/categories/productivity','category').blocked,'challenge');
});
await test('Full runner: all category pages, 52 products, atomic checkpoints and 50/2 export',async()=>{
  pages.clear();pages.set(origin+'/categories/productivity',categoryDoc(1,30,52,'/categories/productivity?page=2'));pages.set(origin+'/categories/productivity?page=2',categoryDoc(31,52,52,null));
  for(let i=1;i<=52;i++)pages.set(origin+'/products/p-'+i,productDoc(i));
  const j=newJob(origin+'/categories/productivity?page=3',{transport:'browser',concurrency:1,checkpointEvery:50,delay:0,reviews:false,comments:false});await db.saveJob(j);let checkpoints=0;const r=new Runner(()=>{},async()=>{checkpoints++;});await r.run(j);
  assert(j.status==='complete','job complete: '+j.error);assert(j.stats.found===52 && j.stats.processed===52,'all products');assert(checkpoints===2,'50 and final checkpoints');
  const files=[];for await(const file of exportFiles(j))files.push(file);
  const chunks=files.filter(f=>f.name.startsWith('products-')).map(f=>JSON.parse(f.data));assert(chunks.length===2,'2 chunks');assert(chunks[0].products.length===50 && chunks[1].products.length===2,'50/2');assert(!('job_id' in chunks[0].products[0]),'no internal IDB field');
  const manifest=JSON.parse(files.find(f=>f.name==='manifest.json').data);assert(manifest.coverage.complete,'true coverage');assert(manifest.files[0].sha256.length===64,'SHA256 checksums');
  const memory=new Map();const root={queryPermission:async()=> 'granted',getDirectoryHandle:async name=>directory(name)};
  function directory(path){return {getDirectoryHandle:async name=>directory(path+'/'+name),getFileHandle:async(name,opts={})=>{if(!opts.create && !memory.has(path+'/'+name))throw new Error('Not found');return {createWritable:async()=>({write:async data=>memory.set(path+'/'+name,data),close:async()=>{},abort:async()=>{}})};}};}
  await writeDirectory(j,root);assert([...memory.keys()].some(k=>k.endsWith('/manifest.json')),'folder manifest');assert([...memory.keys()].filter(k=>/products-/.test(k)).length===2,'2 folder chunks');
  memory.clear();await writeDirectory(j,root);assert([...memory.keys()].filter(k=>/products-/.test(k)).length===2,'recreate deleted files or new destination');
});
await test('All founder AND other review pages are collected and deduplicated',async()=>{
  pages.clear();expandCalls=[];
  pages.set(origin+'/products/p-1/reviews',reviewDoc(['1','3'],{groups:true}));
  pages.set(origin+'/products/p-1/reviews?filter=founder&page=1',reviewDoc(['1'],{next:'/products/p-1/reviews?filter=founder&page=2'}));
  pages.set(origin+'/products/p-1/reviews?filter=founder&page=2',reviewDoc(['2']));
  pages.set(origin+'/products/p-1/reviews?filter=other&page=1',reviewDoc(['3'],{next:'/products/p-1/reviews?filter=other&page=2'}));
  pages.set(origin+'/products/p-1/reviews?filter=other&page=2',reviewDoc(['4','5']));
  const j=newJob(origin+'/categories/productivity',{transport:'browser',concurrency:1,checkpointEvery:50,delay:0});await db.saveJob(j);const r=new Runner();await r.ensureWorker();const p={...PHCollector.extract(productDoc(1,5),origin+'/products/p-1','product').product,state:'collecting',reviews:[],comments:[],coverage:{}};
  const full=await r.reviews(j,p);assert(full.reviews.length===5,'all 5 reviews');assert(expandCalls.join(',')==='founder,other','both groups');assert(full.coverage.reviews.complete,'complete reviews');
});
await test('Pause during reviews keeps already committed text and can resume without duplicates',async()=>{
  const j=newJob(origin+'/categories/productivity',{transport:'browser',concurrency:1,checkpointEvery:50,delay:0});await db.saveJob(j);const r=new Runner();await r.ensureWorker();const p={...PHCollector.extract(productDoc(1,5),origin+'/products/p-1','product').product,state:'collecting',reviews:[],comments:[],coverage:{}};
  interrupt=url=>{if(url.includes('filter=founder&page=2'))r.pause();};let paused=false;try{await r.reviews(j,p);}catch{paused=true;}interrupt=null;
  assert(paused,'pause raised');assert(p.reviews.length>=2,'in-memory reviews survive');const saved=await db.product(j.id,'p-1');assert(saved.reviews.length>=2,'IDB reviews survive');
  r.stopRequested=false;r.shared.stopped=false;const full=await r.reviews(j,saved);assert(full.reviews.length===5,'resume deduplicates');
});
await test('Repeated category pages stop instead of reporting a false full export',async()=>{
  pages.clear();pages.set(origin+'/categories/productivity',categoryDoc(1,15,30,'/categories/productivity?page=2'));pages.set(origin+'/categories/productivity?page=2',categoryDoc(1,15,30,null));
  const j=newJob(origin+'/categories/productivity',{transport:'browser',concurrency:1,checkpointEvery:50,delay:0});await db.saveJob(j);await new Runner().run(j);assert(j.status==='error','stopped');assert(j.stats.found===15,'only unique products');assert(!j.category_exhausted,'not exhausted');
});
await test('Launch comments follow every Next page, including replies',async()=>{
  pages.clear();
  function launchDoc(ids,next){return doc(`<div data-test="post-active-notice">Archived</div><button data-test="vote-button">211</button><div data-test="comments-feed">${ids.map(id=>`<div data-test="comment-${id}"><a href="/@u${id}">User ${id}</a><div class="prose">Full comment ${id}</div></div>`).join('')}${next?`<a href="${next}"><span class="sr-only">Next</span></a>`:''}</div>`);}
  const first=origin+'/products/p-1/launches/launch';pages.set(first,launchDoc(['10','11'],'/products/p-1/launches/launch?page=2#comments'));pages.set(first+'?page=2',launchDoc(['12','13','14'],null));
  const j=newJob(origin+'/categories/productivity',{transport:'browser',concurrency:1,checkpointEvery:50,delay:0});await db.saveJob(j);const r=new Runner();await r.ensureWorker();const p={slug:'p-1',name:'P',state:'collecting',launches:[{url:first,name:'Launch',comments_count:5,upvotes_count:211}],reviews:[],comments:[],source_urls:[],coverage:{launches:{requested:true,complete:true}},launch_comments_count:5};
  await r.comments(j,p);assert(p.comments.length===5,'all 5 comments');assert(p.coverage.comments.complete,'complete comment coverage');assert(navigations.includes(first+'?page=2'),'navigated to page2');
});
await test('Editorial award cards never replace the full Browse all category',async()=>{
  pages.clear();
  const editorial=categoryDoc(1,2,52,null),a=editorial.createElement('a');a.href='/categories/productivity/all';a.textContent='Browse all 52 products';editorial.body.append(a);
  pages.set(origin+'/categories/productivity',editorial);pages.set(origin+'/categories/productivity/all',categoryDoc(1,52,52,null));
  const j=newJob(origin+'/categories/productivity',{transport:'browser',concurrency:1,checkpointEvery:50,delay:0});await db.saveJob(j);await new Runner().enumerate(j);assert(j.queue.length===52,'all products, not just two awards');assert(j.category_exhausted,'all pages done');
});
await test('Missing comments are explicitly incomplete, never an invented complete export',async()=>{
  pages.clear();const url=origin+'/products/p-1/launches/short';pages.set(url,doc('<div data-test="post-active-notice">Archived</div><div data-test="comments-feed"><div data-test="comment-1"><div class="prose">Only public comment</div></div></div>'));
  const j=newJob(origin+'/categories/productivity',{transport:'browser',concurrency:1,checkpointEvery:50,delay:0});await db.saveJob(j);const r=new Runner();await r.ensureWorker();const p={slug:'p-1',name:'P',state:'collecting',launches:[{url,name:'Short',comments_count:2,upvotes_count:0}],reviews:[],comments:[],source_urls:[],coverage:{launches:{requested:true,complete:true}},launch_comments_count:2};
  await r.comments(j,p);assert(p.comments.length===1,'preserve available comment');assert(p.coverage.comments.complete===false,'incomplete');assert(p.launches[0].comments_coverage.reason,'missing reason');
});
await test('Fast HTTP parser reads offline HTML without executing page scripts',async()=>{
  const html=categoryDoc(1,15,179,'/categories/productivity?page=2').documentElement.outerHTML+'<script>globalThis.__untrustedExecuted=true</script>';
  const data=parsePublicHTML(html,origin+'/categories/productivity','category');assert(data.products.length===15,'all products');assert(data.transport==='http','direct mode');assert(!globalThis.__untrustedExecuted,'scripts never run');assert(data.products[0].rating_average===4.75,'precise ratings survive');
});
await test('Streamed JSON-LD category is usable before browser hydration',async()=>{
  const entity=product(1,{aggregateRating:{ratingValue:'4.75',ratingCount:56,bestRating:5}});
  const source=doc('<div>Showing 1-1 of 1 products</div>',[{'@type':'CollectionPage',headline:'Productivity',url:origin+'/categories/productivity',mainEntity:{itemListElement:[{item:entity}]}}]);
  const data=parsePublicHTML(source.documentElement.outerHTML,origin+'/categories/productivity','category');assert(data.products.length===1,'LD fallback');assert(data.products[0].rating_count===56,'rating count');assert(data.products[0].review_count===null,'no guessed review count');
});
await test('HTTP cache avoids duplicate requests and protects cached objects from mutation',async()=>{
  let requests=0;const stats={requests:0,http_pages:0,cache_hits:0};const html=categoryDoc(1,2,2,null).documentElement.outerHTML;
  const http=new FastHttp(new RequestGate(0),()=>{},stats,async()=>{requests++;return new Response(html,{status:200});});
  const first=await http.get(origin+'/categories/productivity','category');first.products[0].name='Mutated';const second=await http.get(origin+'/categories/productivity','category');assert(requests===1,'one request');assert(second.products[0].name==='Product 1','immutable cache');assert(stats.cache_hits===1,'cache count');
});
await test('HTTP 403 disables repeated direct attempts; 429 respects Retry-After',async()=>{
  let calls=0,wait=0;const stats={requests:0,http_pages:0,cache_hits:0};
  const denied=new FastHttp(new RequestGate(0),()=>{},stats,async()=>{calls++;return new Response('',{status:403});});
  for(let i=0;i<2;i++){let refused=false;try{await denied.get(origin+'/categories/productivity','category');}catch(e){refused=e instanceof HttpUnavailable;}assert(refused,'fallback required');}assert(calls===1,'no repeated 403 fetch');
  const limited=new FastHttp({enter:async()=>{},backoff:ms=>wait=ms},()=>{},stats,async()=>new Response('',{status:429,headers:{'Retry-After':'2'}}));let respected=false;try{await limited.get(origin+'/categories/productivity','category');}catch(e){respected=e instanceof RateLimited;}assert(respected && wait===2000,'retry after honored');
});
await test('Four simultaneous product lanes preserve all products and exact counters',async()=>{
  pages.clear();pages.set(origin+'/categories/productivity',categoryDoc(1,15,30,'/categories/productivity?page=2'));pages.set(origin+'/categories/productivity?page=2',categoryDoc(16,30,30,null));for(let i=1;i<=30;i++)pages.set(origin+'/products/p-'+i,productDoc(i));
  const j=newJob(origin+'/categories/productivity',{transport:'auto',concurrency:4,delay:0,reviews:false,comments:false});await db.saveJob(j);const r=new Runner();let active=0,peak=0;
  r.shared.gate=new RequestGate(0);r.shared.http={disabled:false,get:async(url,mode)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,15));const data=PHCollector.extract(pages.get(url),url,mode);active--;j.stats.http_pages++;return {...data,transport:'http'};}};
  await r.run(j);assert(peak===4,'four active requests');assert(j.status==='complete','complete concurrent run '+j.error);assert(j.stats.found===30 && j.stats.processed===30,'exact counters');const rows=await db.products(j.id);assert(rows.length===30 && rows.every(p=>p.state==='complete'),'all persisted');
});
await test('Catalog mode never visits product/review pages and labels omitted data',async()=>{
  pages.clear();pages.set(origin+'/categories/productivity',categoryDoc(1,15,20,'/categories/productivity?page=2'));pages.set(origin+'/categories/productivity?page=2',categoryDoc(16,20,20,null));const before=navigations.length;
  const j=newJob(origin+'/categories/productivity',{transport:'browser',concurrency:1,mode:'catalog',delay:0,reviews:false,comments:false});await db.saveJob(j);await new Runner().run(j);
  const rows=await db.products(j.id);assert(j.stats.processed===20,'all catalog products ready');assert(navigations.length-before===2,'only category pages');assert(rows.every(p=>p.coverage.reviews.requested===false && p.coverage.comments.requested===false),'omissions explicit');assert(j.status==='complete','catalog completed');
});
await test('A rate-limited runner retries automatically without switching to a browser or losing products',async()=>{
  const originalFetch=globalThis.fetch,before=navigations.length;let clock=Date.now(),calls=0;
  const starts=[],html=categoryDoc(1,1,1,null).documentElement.outerHTML;
  globalThis.fetch=async()=>{starts.push(clock);calls++;return calls===1 ? new Response('',{status:429,headers:{'Retry-After':'1'}}) : new Response(html,{status:200});};
  try{
    const j=newJob(origin+'/categories/productivity',{mode:'catalog',delay:0,concurrency:4});await db.saveJob(j);
    const r=new Runner();r.shared.gate=new RequestGate(0,{now:()=>clock,sleep:async ms=>{clock+=ms;}});
    await r.run(j);
    assert(j.status==='complete','automatic retry completed '+j.error);assert(j.stats.found===1,'product retained');
    assert(calls===2 && starts[1]-starts[0]>=1000,'retry waits for server');assert(navigations.length===before,'no browser fallback on 429');
    assert(j.stats.rate_limit_pauses===1,'one shared pause');assert(j.log.filter(x=>x.level==='warning').length===1,'one warning for pause');
    assert(j.rate_limit_state.interval===0,'first limit leaves configured pacing unchanged');
  }finally{globalThis.fetch=originalFetch;}
});
await test('Runner fallback pauses increase by 20 seconds and are labeled as local decisions',async()=>{
  const originalFetch=globalThis.fetch;let clock=Date.now(),calls=0;const starts=[];
  const html=categoryDoc(1,1,1,null).documentElement.outerHTML;
  globalThis.fetch=async()=>{starts.push(clock);return ++calls<=3 ? new Response('',{status:429}) : new Response(html,{status:200});};
  try{
    const j=newJob(origin+'/categories/productivity',{mode:'catalog',delay:0,concurrency:4});await db.saveJob(j);
    const r=new Runner();r.shared.gate=new RequestGate(0,{now:()=>clock,sleep:async ms=>{clock+=ms;}});await r.run(j);
    assert(j.status==='complete','automatic retries preserve completed export');
    assert(starts.slice(1).map((t,i)=>t-starts[i]).join(',')==='20000,40000,60000','20 second increments');
    const warnings=j.log.filter(x=>x.level==='warning');assert(warnings.length===3,'one warning per new failed probe');
    assert(warnings.every(x=>x.message.includes('مکث احتیاطی افزونه')),'local wait never attributed to server');
    assert(warnings[0].message.includes('فاصلهٔ دریافت تغییر نکرد'),'first limit only changes the pause');
    assert(warnings.slice(1).every(x=>x.message.includes('فاصله فقط یک پله بیشتر شد')),'pacing changes only on failed resumptions');
    assert(j.rate_limit_state.interval===200,'two failed resumptions add two 100ms steps');
  }finally{globalThis.fetch=originalFetch;}
});
await test('A new dashboard restores the learned pace and cooldown from local extension storage',async()=>{
  const previous=chrome.storage.local,now=Date.now();let saved={updated_at:now,interval:1200,blocked_until:now+60000,episode:3,last_limited_at:now,pacing_policy:'failed-resume-add100-v1',awaiting_recovery:true};
  chrome.storage.local={get:async()=>({ph_export_rate_policy_v1:saved}),set:async row=>{saved=row.ph_export_rate_policy_v1;}};
  try{
    const j=newJob(origin+'/categories/productivity'),r=new Runner();await r.restorePolicy(j);await r.shared.policyWriteTail;
    assert(r.shared.gate.interval===1200,'learned pace restored');assert(r.shared.gate.blockedUntil===now+60000,'server cooldown restored');
    assert(j.rate_limit_state.interval===1200,'job exposes adaptive pace');assert(saved.blocked_until===now+60000,'state remains persisted');
  }finally{chrome.storage.local=previous;}
});
await test('Installed background bridge preserves parsed products, descriptions and precise ratings',async()=>{
  const previous=chrome.runtime,previousFetch=globalThis.fetch;
  const runtime={id:'bridge-fixture',getURL:path=>'chrome-extension://bridge-fixture/'+path};
  const source=categoryDoc(1,2,2,null).documentElement.outerHTML;let calls=0;
  const handler=createHTMLMessageHandler(runtime,async()=>{calls++;return new Response(source,{status:200,headers:{Link:'</never-needed.css>; rel=preload; as=style'}});});
  chrome.runtime={...runtime,sendMessage:message=>new Promise(resolve=>handler(message,{id:runtime.id,url:runtime.getURL('dashboard.html')},resolve))};
  globalThis.fetch=async()=>{throw new Error('The installed dashboard must not fetch website responses directly');};
  try{
    const stats={requests:0,http_pages:0,cache_hits:0},http=new FastHttp(new RequestGate(0),()=>{},stats);
    const data=await http.get(origin+'/categories/productivity','category');
    assert(calls===1 && data.products.length===2,'full response crosses bridge');
    assert(data.products[0].description==='Full description 1','description retained');assert(data.products[0].rating_average===4.75,'precise score retained');
  }finally{chrome.runtime=previous;globalThis.fetch=previousFetch;}
});
await test('Wrong category payload cannot overwrite the user-selected category',async()=>{
  const j=newJob(origin+'/categories/ai-meeting-notetakers',{transport:'browser',concurrency:1,delay:0});await db.saveJob(j);let refused=false;
  try{await new Runner().acceptCategory(j,{url:origin+'/categories/m',category:{slug:'m'},products:[]});}catch{refused=true;}
  assert(refused,'wrong category refused');assert(j.queue.length===0,'no wrong products');assert(j.category_url.endsWith('/ai-meeting-notetakers'),'full category retained');
});
await test('Saved runner logs and errors switch language without changing product data',async()=>{
  const j=newJob(origin+'/categories/productivity'),r=new Runner();await db.saveJob(j);
  setLanguage('fa',{persist:false});await r.note(j,message('runner.detail',{index:1,total:2,product:'نام محصول'}));
  const saved=await db.job(j.id);assert(saved.current_message.includes('نام محصول'),'source name preserved');
  setLanguage('en',{persist:false});
  assert(translate(saved.log[0].message,saved.log[0].i18n)==='Stage 2 of 2: 1 of 2 — نام محصول','saved descriptor translated');
  await r.note(j,message('runner.complete'));assert(j.current_message==='Collection complete; your files are ready.','new English messages');
  setLanguage('fa',{persist:false});
});
await test('Dashboard language switch translates empty search results, preserves settings and survives reload',async()=>{
  const previous=localStorage.getItem('ph_export_language'),frame=document.createElement('iframe');
  frame.style.cssText='position:absolute;left:-9999px;width:1200px;height:900px';
  try{
    localStorage.setItem('ph_export_language','en');
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    frame.src='../dashboard.html';document.body.append(frame);await loaded;
    const view=frame.contentWindow,d=view.document,el=id=>d.getElementById(id);
    assert(d.documentElement.lang==='en' && d.documentElement.dir==='ltr','English initial direction');
    el('category').value=origin+'/categories/productivity';el('maxProducts').value='5';el('mode').value='catalog';el('mode').dispatchEvent(new view.Event('change'));
    el('search').value='not found';el('search').dispatchEvent(new view.Event('input'));
    assert(el('products').textContent.includes('No products to display.'),'English empty search');
    el('language').value='fa';el('language').dispatchEvent(new view.Event('change'));
    assert(d.documentElement.lang==='fa' && d.documentElement.dir==='rtl','Persian direction');
    assert(el('products').textContent.includes('محصولی برای نمایش پیدا نشد.'),'empty search translated');
    assert(el('found').textContent==='۰','Persian numbers');
    assert(el('progress').getAttribute('aria-label')==='پیشرفت دریافت','accessible label translated');
    assert(el('category').value.endsWith('/productivity') && el('maxProducts').value==='5','settings preserved');
    assert(el('mode').value==='catalog' && el('reviews').disabled,'mode preserved');
    const reloaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));view.location.reload();await reloaded;
    assert(frame.contentDocument.documentElement.lang==='fa','saved choice restored');
  }finally{
    frame.remove();if(previous===null)localStorage.removeItem('ph_export_language');else localStorage.setItem('ph_export_language',previous);
  }
});
document.documentElement.dataset.tests=results.every(r=>r.passed)?'passed':'failed';
document.documentElement.dataset.count=String(results.length);
