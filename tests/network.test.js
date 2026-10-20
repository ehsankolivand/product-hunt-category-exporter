import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchHTML,createHTMLMessageHandler,fetchPublicHTML} from '../lib/network.js';
import {FastHttp,RequestGate,RateLimited,HttpUnavailable} from '../lib/transport.js';
const url='https://www.producthunt.com/categories/productivity';
const runtime={id:'fixture',getURL:path=>'chrome-extension://fixture/'+path};
const sender={id:runtime.id,url:runtime.getURL('dashboard.html')+'?category='+encodeURIComponent(url)};

test('worker fetch preserves HTML and retry headers without forwarding preload headers',async()=>{
  let options;const result=await fetchHTML(url,async(target,config)=>{
    assert.equal(target,url);options=config;
    return new Response('<p>Full HTML</p>',{status:200,headers:{Link:'</style.css>; rel=preload; as=style','Retry-After':'60',Date:'Tue, 20 Oct 2026 12:00:00 GMT'}});
  });
  assert.equal(options.credentials,'include');assert.equal(options.headers.Accept,'text/html');
  assert.equal(result.body,'<p>Full HTML</p>');assert.equal(result.url,url);assert.equal(result.headers['retry-after'],'60');
  assert(!('link' in result.headers));assert.equal(result.status,200);
});
test('the background fetch cannot be used to request other hosts or unsafe URLs',async()=>{
  let calls=0;
  for(const target of ['https://example.com','http://www.producthunt.com/','https://www.producthunt.com.evil.test/','https://secret@www.producthunt.com/']){
    await assert.rejects(fetchHTML(target,async()=>{calls++;}),error=>error.i18n?.key==='error.fetchDomain');
  }
  assert.equal(calls,0);
});
test('429 is forwarded intact without downloading its response body',async()=>{
  let read=false,cancelled=false;
  const result=await fetchHTML(url,async()=>({status:429,ok:false,url,headers:new Headers({'Retry-After':'60'}),text:async()=>{read=true;return 'Limit';},body:{cancel:async()=>{cancelled=true;}}}));
  assert.equal(result.status,429);assert.equal(result.headers['retry-after'],'60');assert.equal(read,false);assert.equal(cancelled,true);
});
test('message handler rejects content scripts, other extensions and other extension pages',()=>{
  let calls=0;const handle=createHTMLMessageHandler(runtime,async()=>{calls++;});
  for(const source of [{id:runtime.id,url:'https://www.producthunt.com/'},{id:'other',url:sender.url},{id:runtime.id,url:runtime.getURL('other.html')}]){
    let result;assert.equal(handle({type:'ph_fetch_html',url},source,value=>result=value),false);assert(result.error);
  }
  assert.equal(calls,0);assert.equal(handle({type:'other'},sender,()=>{}),false);
});
test('dashboard message is answered asynchronously with the full HTML',async()=>{
  const handle=createHTMLMessageHandler(runtime,async()=>new Response('Public HTML',{status:200}));
  const result=await new Promise(resolve=>assert.equal(handle({type:'ph_fetch_html',url},sender,resolve),true));
  assert.equal(result.result.body,'Public HTML');assert.equal(result.result.status,200);
});
test('installed client uses background messages and never performs a foreground fetch',async()=>{
  const previousChrome=globalThis.chrome,previousFetch=globalThis.fetch;let calls=0;
  const handle=createHTMLMessageHandler(runtime,async()=>{calls++;return new Response('Complete HTML',{status:200});});
  globalThis.chrome={runtime:{...runtime,sendMessage:message=>new Promise(resolve=>handle(message,sender,resolve))}};
  globalThis.fetch=async()=>{throw new Error('Foreground fetch must not run');};
  try{const response=await fetchPublicHTML(url);assert.equal(response.ok,true);assert.equal(await response.text(),'Complete HTML');assert.equal(calls,1);}
  finally{globalThis.chrome=previousChrome;globalThis.fetch=previousFetch;}
});
test('rate limiting still reaches the shared gate when fetch runs in the background',async()=>{
  const previous=globalThis.chrome;
  const handle=createHTMLMessageHandler(runtime,async()=>new Response('',{status:429,headers:{'Retry-After':'60'}}));
  globalThis.chrome={runtime:{...runtime,sendMessage:message=>new Promise(resolve=>handle(message,sender,resolve))}};
  try{
    const gate=new RequestGate(0),stats={requests:0};const http=new FastHttp(gate,()=>{},stats);
    await assert.rejects(http.get(url,'category'),e=>e instanceof RateLimited && e.retryAfter===60000 && e.waitSource==='server');
    assert.equal(stats.rate_limit_pauses,1);assert(gate.blockedUntil>Date.now()+59000);
  }finally{globalThis.chrome=previous;}
});
