import {t, localizedError} from './i18n.js';
import {phUrl} from './core.js';
import {fetchPublicHTML} from './network.js';

export class HttpUnavailable extends Error {}
export class RateLimited extends Error {
  constructor(message,retryAfter=15000,decision={}){super(message);this.retryAfter=retryAfter;Object.assign(this,decision);}
}

export class RequestGate {
  constructor(interval=150,{now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
    this.now=now;this.sleep=sleep;this.minimum=interval;this.interval=interval;
    this.blockedUntil=0;this.lastStart=null;this.episode=0;this.penalty=0;this.lastLimitedAt=0;this.awaitingRecovery=false;
    this.lastRecoveryAt=now();this.successes=0;this.tail=Promise.resolve();this.onChange=()=>{};
  }
  snapshot(){return {interval:this.interval,blocked_until:this.blockedUntil,episode:this.episode,penalty:this.penalty,retry_policy:'linear20-v1',pacing_policy:'failed-resume-add100-v1',awaiting_recovery:this.awaitingRecovery,last_limited_at:this.lastLimitedAt,updated_at:this.now()};}
  configure(minimum,...states){
    this.minimum=minimum;this.interval=Math.max(minimum,this.interval);
    const recent=states.filter(s=>s && Number.isFinite(s.updated_at) && this.now()-s.updated_at<=86400000).sort((a,b)=>b.updated_at-a.updated_at);
    const latest=recent[0];
    if(latest){
      // Discard the old multiplicative pacing rule, keeping the active cooldown below.
      this.interval=latest.pacing_policy==='failed-resume-add100-v1' && Number.isFinite(latest.interval)?Math.max(minimum,Math.min(30000,latest.interval)):minimum;
    }
    if(latest)this.penalty=latest.retry_policy==='linear20-v1' && Number.isInteger(latest.penalty)?Math.max(0,Math.min(14,latest.penalty)):0;
    for(const state of states){
      if(!state)continue;
      // A long explicit server cooldown must survive even when learned pacing has expired.
      if(Number.isFinite(state.blocked_until))this.blockedUntil=Math.max(this.blockedUntil,state.blocked_until);
      if(!recent.includes(state))continue;
      if(Number.isInteger(state.episode))this.episode=Math.max(this.episode,state.episode);
      if(Number.isFinite(state.last_limited_at))this.lastLimitedAt=Math.max(this.lastLimitedAt,state.last_limited_at);
    }
    if(latest)this.awaitingRecovery=latest.pacing_policy==='failed-resume-add100-v1'?!!latest.awaiting_recovery:this.blockedUntil>this.now();
    if(this.blockedUntil>this.now())this.awaitingRecovery=true;
    this.onChange(this.snapshot());
  }
  backoff(ms,ticket=null,{extend=true}={}){
    const now=this.now(),currentFlight=!ticket || ticket.episode===this.episode;
    const newEpisode=now>=this.blockedUntil && currentFlight;
    // A first limit changes only the pause. Pacing changes once only if a request
    // actually admitted AFTER that pause is rate-limited again.
    const failedResume=newEpisode && ticket?.afterPause===true;
    const before=this.interval;
    if(newEpisode){
      if(failedResume)this.interval=Math.min(30000,Math.max(this.minimum,this.interval)+100);
      this.episode++;this.penalty=Math.min(14,this.penalty+1);this.awaitingRecovery=true;
    }
    // Only an explicit server deadline can extend an existing pause. Duplicate fallback
    // responses must not restart it. Late responses from older flights cannot raise pace.
    if(newEpisode || extend){this.blockedUntil=Math.max(this.blockedUntil,now+Math.max(1000,ms));this.awaitingRecovery=true;}
    this.lastLimitedAt=now;this.lastRecoveryAt=now;this.successes=0;this.onChange(this.snapshot());
    return {newEpisode,episode:this.episode,interval:this.interval,intervalChanged:this.interval!==before,failedResume};
  }
  success(ticket){
    // Responses already in flight before a limit do not count as evidence of recovery.
    if(!ticket || ticket.episode!==this.episode || this.now()<this.blockedUntil)return;
    if(ticket.afterPause && this.awaitingRecovery){this.awaitingRecovery=false;this.onChange(this.snapshot());}
    this.successes++;
    if(this.successes>=20 && this.now()-this.lastRecoveryAt>=30000){
      this.interval=Math.max(this.minimum,Math.floor(this.interval*0.9));
      this.successes=0;this.penalty=0;this.lastRecoveryAt=this.now();this.onChange(this.snapshot());
    }
  }
  enter(check){
    // Serialize admission only, not the actual fetches: multiple downloads remain in flight.
    const admitted=this.tail.then(async()=>{
      while(true){
        check();const now=this.now();
        const when=Math.max(this.blockedUntil,this.lastStart===null?now:this.lastStart+this.interval);
        if(now>=when){this.lastStart=now;return {startedAt:now,episode:this.episode,afterPause:this.awaitingRecovery && this.blockedUntil>0 && now>=this.blockedUntil};}
        // Re-read the deadline on every iteration; a newer 429 also pauses existing waiters.
        await this.sleep(Math.min(100,when-now));
      }
    });
    this.tail=admitted.catch(()=>{});return admitted;
  }
}

export function retryAfterMs(value,serverDate=null,now=Date.now(),fallback=15000){
  const raw=String(value??'').trim();
  if(/^\d+$/.test(raw) && Number.isFinite(Number(raw)*1000))return Math.max(1000,Number(raw)*1000);
  const deadline=/[a-z]{3}/i.test(raw) ? Date.parse(raw) : NaN;
  if(Number.isFinite(deadline)){
    const origin=Date.parse(serverDate);
    return Math.max(1000,deadline-(Number.isFinite(origin)?origin:now));
  }
  return Math.max(1000,fallback);
}

export function hasRetryAfter(value){
  const raw=String(value??'').trim();
  return /^\d+$/.test(raw) && Number.isFinite(Number(raw)*1000) || /[a-z]{3}/i.test(raw) && Number.isFinite(Date.parse(raw));
}

export function parsePublicHTML(html,url,mode,expected={}) {
  // Template parsing is inert. Remove loading resources before constructing an offline document.
  const template=document.createElement('template');template.innerHTML=html;
  template.content.querySelectorAll('link,style,iframe,object,embed,base,script:not([type="application/ld+json"])').forEach(n=>n.remove());
  for(const n of template.content.querySelectorAll('[src],[srcset],[poster]')) {
    if(n.hasAttribute('src'))n.setAttribute('data-original-src',n.getAttribute('src'));
    n.removeAttribute('src');n.removeAttribute('srcset');n.removeAttribute('poster');
  }
  const doc=document.implementation.createHTMLDocument('');doc.head.querySelector('title')?.remove();doc.body.append(template.content);
  const data=globalThis.PHCollector.extract(doc,url,mode);
  const title=doc.querySelector('title')?.textContent || '';
  if(data.blocked || /just a moment|attention required|verify you are human/i.test(title))throw new HttpUnavailable('normal_browser_required');
  if(data.unavailable)throw localizedError('error.unavailable',{url});
  const okay=mode==='category' ? data.products.length || data.browse_url || data.category.reported_products===0 :
    mode==='launch' ? data.launch_loaded && (data.comments.length || expected.comments===0) :
    mode==='reviews' ? data.product.name && (data.reviews.length || data.product.review_count===0) :
    data.product.name && data.product.description && data.product.launches_reported!=null && (!data.product.launches_reported || data.launches.length);
  if(!okay)throw new HttpUnavailable('client_render_required');
  // Some routes render a generic preview on the server, then apply the filter in the browser.
  if(mode==='reviews' && new URL(url).searchParams.has('filter') && data.review_expand_groups.length)throw new HttpUnavailable('filtered_client_render_required');
  return {...data,transport:'http'};
}

export class FastHttp {
  constructor(gate,check,stats,fetcher=fetchPublicHTML){
    this.gate=gate;this.check=check;this.stats=stats;this.fetcher=fetcher;this.disabled=false;this.cache=new Map();this.inflight=new Map();
  }
  async get(url,mode,expected={}){
    if(this.disabled || !this.fetcher)throw new HttpUnavailable('http_unavailable');
    const key=mode+' '+url;
    if(this.cache.has(key)){this.stats.cache_hits++;return structuredClone(this.cache.get(key));}
    if(this.inflight.has(key))return structuredClone(await this.inflight.get(key));
    const promise=this.load(url,mode,expected);this.inflight.set(key,promise);
    try {
      const data=await promise;this.cache.set(key,structuredClone(data));
      while(this.cache.size>48)this.cache.delete(this.cache.keys().next().value);
      return data;
    }finally{this.inflight.delete(key);}
  }
  async load(url,mode,expected){
    const ticket=await this.gate.enter(this.check);this.stats.requests++;
    let response;
    try {response=await this.fetcher(url,{credentials:'include',redirect:'follow',signal:AbortSignal.timeout(20000),headers:{Accept:'text/html'}});}
    catch(e){this.check();throw new HttpUnavailable(e.message);}
    if(response.status===429){
      const fallback=Math.min(300000,20000*(1+Math.min(this.gate.penalty||0,14)));
      const advice=response.headers.get('retry-after'),serverWait=hasRetryAfter(advice);
      const wait=retryAfterMs(advice,response.headers.get('date'),Date.now(),fallback);
      const decision=this.gate.backoff(wait,ticket,{extend:serverWait}) || {newEpisode:true};
      this.stats.rate_limit_responses=(this.stats.rate_limit_responses||0)+1;
      if(decision.newEpisode)this.stats.rate_limit_pauses=(this.stats.rate_limit_pauses||0)+1;
      throw new RateLimited(t('error.temporaryLimit'),wait,{...decision,waitSource:serverWait?'server':'local'});
    }
    if([401,403].includes(response.status)){this.disabled=true;throw new HttpUnavailable('session_browser_required');}
    if(!response.ok)throw new HttpUnavailable('HTTP '+response.status);
    this.gate.success?.(ticket);
    const finalUrl=phUrl(response.url || url);
    if(!finalUrl || new URL(finalUrl).pathname!==new URL(url).pathname)throw new HttpUnavailable('redirect_requires_browser');
    const html=await response.text();this.check();
    const data=parsePublicHTML(html,url,mode,expected);this.stats.http_pages++;
    return data;
  }
}
