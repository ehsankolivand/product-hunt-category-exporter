import {t, message, localizedError} from './i18n.js';
import {db} from './db.js';
import {categoryUrl, phUrl, uniqueBy, mergeProduct, metrics, coverage, runId} from './core.js';
import {FastHttp,RequestGate,HttpUnavailable,RateLimited} from './transport.js';

class Paused extends Error {}
export class SiteBlocked extends Error {}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function newJob(url,options={}) {
  const source=categoryUrl(url);
  return {id:runId(),category_url:source,category:{name:new URL(source).pathname.split('/')[2],slug:new URL(source).pathname.split('/')[2]},
    created_at:new Date().toISOString(),status:'ready',stage:'category',next_category_url:source,
    queue:[],category_pages:[],category_fingerprints:[],category_exhausted:false,
    engine_version:'1.2.3',options:{mode:'full',transport:'auto',concurrency:4,reviews:true,comments:true,maxProducts:0,maxReviews:0,maxComments:0,delay:150,checkpointEvery:250,...options},
    stats:{found:0,processed:0,reviews:0,comments:0,requests:0,http_pages:0,browser_pages:0,cache_hits:0,rate_limit_responses:0,rate_limit_pauses:0},log:[]};
}

export class Runner {
  constructor(onUpdate=()=>{},onCheckpoint=async()=>{}) {
    this.onUpdate=onUpdate;this.onCheckpoint=onCheckpoint;this.active=false;this.stopRequested=false;this.workerId=null;this.lastVisit=0;
    this.root=this;this.laneIndex=0;this.lanes=[this];this.shared={stopped:false,writeTail:Promise.resolve(),checkpointTail:Promise.resolve(),fatal:null,blockedWorkerId:null};
  }
  lane(index){
    if(this.root.lanes[index])return this.root.lanes[index];
    const child=new Runner(this.onUpdate);child.root=this.root;child.shared=this.shared;child.laneIndex=index;this.root.lanes[index]=child;return child;
  }
  prepare(job){
    if(!this.shared.http){
      for(const key of ['http_pages','browser_pages','cache_hits'])job.stats[key] ||= 0;
      this.shared.gate ||= new RequestGate(job.options.delay ?? 150);
      this.shared.http=new FastHttp(this.shared.gate,()=>this.root.check(),job.stats);
    }
  }
  async restorePolicy(job){
    let stored;
    try{stored=(await chrome.storage.local?.get('ph_export_rate_policy_v1'))?.ph_export_rate_policy_v1;}catch{}
    this.prepare(job);
    this.shared.gate.onChange=state=>{
      job.rate_limit_state=state;this.onUpdate(job);
      if(chrome.storage.local?.set){
        this.shared.policyWriteTail=(this.shared.policyWriteTail||Promise.resolve()).catch(()=>{}).then(()=>chrome.storage.local.set({ph_export_rate_policy_v1:state})).catch(()=>{});
      }
    };
    this.shared.gate.configure(job.options.delay ?? 150,job.rate_limit_state,stored);
  }
  commit(action){const next=this.shared.writeTail.then(action);this.shared.writeTail=next.catch(()=>{});return next;}
  pause() {this.stopRequested=true;this.shared.stopped=true;}
  check() {if(this.stopRequested || this.shared.stopped) throw localizedError('error.paused',{},Paused);}
  async note(job,value,level='info') {return this.commit(async()=>{
    const descriptor=typeof value==='object' ? value : null;
    const rendered=descriptor ? t(descriptor.key,descriptor.params) : value;
    job.current_message=rendered;job.current_message_i18n=descriptor;
    job.log.push({time:new Date().toISOString(),level,message:rendered,...(descriptor ? {i18n:descriptor} : {})});
    job.log=job.log.slice(-200);await db.saveJob(job);this.onUpdate(job);
  });}
  async ensureWorker() {
    if(this.workerId!==null) {try {await chrome.tabs.get(this.workerId);return;}catch{this.workerId=null;}}
    const key=this.laneIndex ? 'ph_export_worker_'+this.laneIndex : 'ph_export_worker';
    const saved=(await chrome.storage.session.get(key))[key];
    if(saved?.id) {
      try {const tab=await chrome.tabs.get(saved.id);if(phUrl(tab.url)) this.workerId=tab.id;}catch{}
    }
    if(this.workerId===null) {
      const tab=await chrome.tabs.create({url:'https://www.producthunt.com/',active:false});this.workerId=tab.id;
      await chrome.storage.session.set({[key]:{id:tab.id}});
    }
  }
  async closeWorker() {
    if(this.workerId!==null) {try{await chrome.tabs.remove(this.workerId);}catch{}this.workerId=null;}
    await chrome.storage.session.remove(this.laneIndex ? 'ph_export_worker_'+this.laneIndex : 'ph_export_worker');
  }
  async closeWorkers(){await Promise.allSettled(this.root.lanes.map(l=>l.closeWorker()));}
  async showWorker() {if(this.shared.blockedWorkerId!=null){await chrome.tabs.update(this.shared.blockedWorkerId,{active:true});return;}await this.ensureWorker();await chrome.tabs.update(this.workerId,{active:true});}
  async delay(ms) {const end=Date.now()+ms;while(Date.now()<end){this.check();await sleep(Math.min(250,end-Date.now()));}}
  async collect(command) {
    this.check();
    await chrome.scripting.executeScript({target:{tabId:this.workerId},files:['collector.js']});
    const output=await chrome.scripting.executeScript({target:{tabId:this.workerId},func:async command=>globalThis.PHCollector.command(command),args:[command]});
    const data=output?.[0]?.result;
    if(!data) throw localizedError('error.noResponse');
    if(data.blocked) {this.shared.blockedWorkerId=this.workerId;throw localizedError('error.siteBlocked',{},SiteBlocked);}
    if(data.unavailable) throw localizedError('error.unavailable',{url:data.url});
    return data;
  }
  async visit(job,url,mode,expected={}) {
    this.prepare(job);
    const safe=phUrl(url);
    if(!safe) throw localizedError('error.foreignUrl');
    const wanted=new URL(safe);
    const matches=value=>{
      try {
        const actual=new URL(value);
        return actual.pathname===wanted.pathname && Number(actual.searchParams.get('page')||1)===Number(wanted.searchParams.get('page')||1) &&
          ['filter','order'].every(key=>(actual.searchParams.get(key)||'')===(wanted.searchParams.get(key)||''));
      }catch{return false;}
    };
    if(job.options.transport!=='browser' && !this.shared.http.disabled) {
      for(let attempt=0;attempt<4;attempt++) {
        try {return await this.shared.http.get(safe,mode,expected);}
        catch(error){
          this.check();
          if(error instanceof RateLimited){
            if(error.newEpisode!==false){
              const reason=message(error.waitSource==='server'?'rate.server':'rate.local');
              const pacing=message(error.intervalChanged?'rate.increased':'rate.unchanged');
              const descriptor=message('rate.message',{reason,pacing,wait:Math.ceil(error.retryAfter/1000),interval:(error.interval??this.shared.gate.interval)/1000});
              job.rate_limit_message=t(descriptor.key,descriptor.params);
              await this.note(job,descriptor,'warning');
            }
            else await this.commit(()=>db.saveJob(job));
            if(attempt<3)continue;
            throw localizedError('error.rateLimit',{},SiteBlocked);
          }
          if(!(error instanceof HttpUnavailable))throw error;
          if(!this.shared.fallbackNoted){this.shared.fallbackNoted=true;await this.note(job,message('runner.browserFallback'));}
          break;
        }
      }
    }
    for(let attempt=0;attempt<3;attempt++) {
      this.check();
      await this.shared.gate.enter(()=>this.check());
      try {
        await this.ensureWorker();this.lastVisit=Date.now();job.stats.requests++;
        await chrome.tabs.update(this.workerId,{url:safe});
        const started=Date.now();let loaded=false;
        while(Date.now()-started<45000) {
          this.check();
          const tab=await chrome.tabs.get(this.workerId);
          if(tab.status==='complete' && !tab.pendingUrl) {
            if(!phUrl(tab.url)) throw localizedError('error.redirect',{},SiteBlocked);
            if(matches(tab.url)){loaded=true;break;}
          }
          await sleep(400);
        }
        if(!loaded) throw localizedError('error.loadTimeout');
        const data=await this.collect({mode,expected});
        if(data.readiness_timeout) throw localizedError('error.notReady');
        if(!matches(data.url)) throw localizedError('error.pageMismatch');
        job.stats.browser_pages++;return {...data,transport:'browser'};
      } catch(error) {
        if(error instanceof Paused || error instanceof SiteBlocked) throw error;
        if(attempt===2) throw error;
        await this.note(job,message('runner.retryPage',{attempt:attempt+2}), 'warning');
        await this.delay([4000,10000][attempt]);
      }
    }
  }
  async saveProduct(job,product) {
    return this.commit(async()=>{
    const original=product;
    product=metrics(product);
    const oldReviews=product._counted_reviews || 0,oldComments=product._counted_comments || 0;
    job.stats.reviews+=product.reviews_collected-oldReviews;job.stats.comments+=product.comments_collected-oldComments;
    product._counted_reviews=product.reviews_collected;product._counted_comments=product.comments_collected;
    if(product.details_attempted && !product._counted_processed){job.stats.processed++;product._counted_processed=true;}
    await db.commit(job,[product]);Object.assign(original,product);this.onUpdate(job);
    });
  }
  async acceptCategory(job,page) {
      const requestedSlug=new URL(job.category_url).pathname.split('/')[2];
      if(page.category.slug!==requestedSlug || new URL(page.url).pathname.split('/')[2]!==requestedSlug)throw localizedError('error.categoryMismatch');
      if(page.browse_url && phUrl(page.browse_url)!==phUrl(page.url) && !job.category_pages.includes(page.browse_url)) {
        if(new URL(page.browse_url).pathname.split('/')[2]!==requestedSlug)throw localizedError('error.browseMismatch');
        job.category_pages.push(page.url);job.next_category_url=page.browse_url;await db.saveJob(job);return;
      }
      if(!page.products.length && page.category.reported_products!==0) throw localizedError('error.noProducts');
      const fingerprint=page.products.map(p=>p.slug).join('|');
      if(fingerprint && job.category_fingerprints.includes(fingerprint)) throw localizedError('error.repeatedPage');
      const initial=job.category.reported_products_initial ?? page.category.reported_products;
      job.category={...job.category,...page.category,url:job.category_url,reported_products_initial:initial};
      const pending=[];
      for(const incoming of page.products) {
        const exists=job.queue.includes(incoming.slug);
        if(!exists && job.options.maxProducts && job.queue.length>=job.options.maxProducts) break;
        const old=exists ? await db.product(job.id,incoming.slug) : null;
        if(!exists){incoming.category_position=job.queue.length+1;job.queue.push(incoming.slug);}
        // A repeated category page must never erase already-collected details.
        const product=old || {...incoming,job_id:job.id};
        if(job.options.mode==='catalog'){
          product.state=product.name && product.description ? 'complete':'partial';product.details_attempted=true;product._counted_processed=true;
          product.coverage={metadata:{requested:true,complete:product.state==='complete'},launches:{requested:false,complete:false,reason:'catalog_mode'},reviews:{requested:false,complete:false,reason:'catalog_mode'},comments:{requested:false,complete:false,reason:'catalog_mode'}};
        }
        pending.push(product);
      }
      job.stats.found=job.queue.length;job.category_pages.push(page.url);if(fingerprint)job.category_fingerprints.push(fingerprint);
      job.next_category_url=page.next_url;
      if(!page.next_url) job.category_exhausted=true;
      if(page.range && page.range.to>=page.range.from)job._page_size=page.range.to-page.range.from+1;
      if(job.options.maxProducts && job.queue.length>=job.options.maxProducts){job.next_category_url=null;job.sample_reached=true;}
      if(job.options.mode==='catalog')job.stats.processed=job.queue.length;
      await this.commit(()=>db.commit(job,pending));this.onUpdate(job);
      if(job.category_pages.length%20===0) await this.root.onCheckpoint(job,false);
      if(job.category_pages.length>10000) throw localizedError('error.tooManyPages');
  }
  async enumerate(job) {
    while(job.next_category_url) {
      this.check();
      const urls=[job.next_category_url],first=new URL(job.next_category_url),size=job._page_size;
      const pages=size && job.category.reported_products ? Math.ceil(job.category.reported_products/size):1;
      const max=job.options.maxProducts && size ? Math.ceil(job.options.maxProducts/size):pages;
      const firstPage=Number(first.searchParams.get('page')||1);
      if(size)for(let i=1;i<(job.options.concurrency||1) && firstPage+i<=Math.min(pages,max);i++){const u=new URL(first);u.searchParams.set('page',String(firstPage+i));urls.push(u.href);}
      await this.note(job,message('runner.category',{pages:urls.length,found:job.stats.found}));
      const batch=await Promise.allSettled(urls.map((url,i)=>this.lane(i).visit(job,url,'category').catch(error=>{if(error instanceof SiteBlocked){this.shared.fatal=error;this.shared.stopped=true;}throw error;})));
      if(this.shared.fatal)throw this.shared.fatal;
      for(let i=0;i<batch.length;i++){
        this.check();if(batch[i].status==='rejected')throw batch[i].reason;
        await this.acceptCategory(job,batch[i].value);
        if(!job.next_category_url)break;
      }
    }
    job.stage='details';await db.saveJob(job);
  }
  async launches(job,product,initial) {
    product.launches=uniqueBy([...(product.launches || []),...initial.launches]);
    let next=initial.launches.length < (product.launches_reported ?? 0) ? initial.launches_url : null;
    const seen=new Set();
    while(next && !seen.has(next)) {
      seen.add(next);const page=await this.visit(job,next,'product');
      product.launches=uniqueBy([...product.launches,...page.launches]);product.source_urls.push(page.url);
      await this.saveProduct(job,product);next=page.next_url;
      if(seen.size>500) throw localizedError('error.launchPages');
    }
    const expected=product.launches_reported;
    product.coverage.launches={requested:true,expected_count:expected ?? null,collected_count:product.launches.length,
      complete:expected!==null && expected!==undefined && product.launches.length>=expected,
      reason:expected==null ? 'launch_total_not_published' : product.launches.length<expected ? 'launch_list_incomplete' : null};
  }
  async reviews(job,product) {
    if(!job.options.reviews){product.coverage.reviews={requested:false,complete:false,reason:'disabled_by_user'};return;}
    const base=product.url+'/reviews';let current=await this.visit(job,base,'reviews');
    const expected=current.product.review_count ?? product.review_count;
    Object.assign(product,mergeProduct(product,{...current.product,reviews:current.reviews}));
    const groups=current.review_expand_groups;const seen=new Set();let limit=false;
    const save=async page=>{Object.assign(product,mergeProduct(product,{reviews:page.reviews,source_urls:[page.url]}));if(job.options.maxReviews && product.reviews.length>=job.options.maxReviews){product.reviews=product.reviews.slice(0,job.options.maxReviews);limit=true;}await this.saveProduct(job,product);};
    await save(current);
    const follow=async page=>{
      while(page.next_url && !limit) {
        this.check();if(seen.has(page.next_url)) throw localizedError('error.repeatedReviews');
        seen.add(page.next_url);page=await this.visit(job,page.next_url,'reviews');await save(page);
        if(seen.size>10000) throw localizedError('error.reviewPages');
      }
    };
    await follow(current);
    for(const group of groups) {
      if(limit) break;
      // Default PH pages show separate founder/other previews. Expand both groups, not only founders.
      if(group!==groups[0] || seen.size) current=await this.visit(job,base,'reviews');
      this.check();
      if(current.transport==='http'){
        const direct=new URL(base);direct.searchParams.set('filter',group==='founder'?'founder':'other');direct.searchParams.set('page','1');
        current=await this.visit(job,direct.href,'reviews');current.expanded=true;
      }else current=await this.collect({op:'expand_reviews',group});
      if(current.expanded){await save(current);await follow(current);}
    }
    product.coverage.reviews={requested:true,expected_count:expected ?? null,collected_count:product.reviews.length,
      complete:expected!=null && product.reviews.length>=expected,
      reason:limit ? 'user_review_limit' : expected==null ? 'review_total_not_published' : product.reviews.length<expected ? 'some_reviews_unavailable_or_pagination_incomplete' : null};
    return product;
  }
  async comments(job,product) {
    if(!job.options.comments){product.coverage.comments={requested:false,complete:false,reason:'disabled_by_user'};return;}
    for(const launch of product.launches) {
      this.check();if(launch.comments_coverage?.complete) continue;
      if(launch.comments_count===0){launch.comments_coverage={complete:true,collected_count:0,expected_count:0};continue;}
      await this.note(job,message('runner.comments',{product:product.name,launch:launch.name}));
      let page=await this.visit(job,launch.url,'launch',{comments:launch.comments_count});let stagnant=0,attempts=0,limit=false;
      const seenPages=new Set([page.url]);
      const expected=launch.comments_count;
      while(true) {
        const before=product.comments.length;
        product.comments=uniqueBy([...product.comments,...page.comments],'id');product.source_urls=[...new Set([...product.source_urls,page.url])];
        if(page.launch_upvotes!==null) launch.upvotes_count=page.launch_upvotes;
        if(page.launch_description) launch.description=page.launch_description;
        let own=product.comments.filter(c=>c.launch_url===new URL(launch.url).origin+new URL(launch.url).pathname);
        if(job.options.maxComments && own.length>=job.options.maxComments){const allowed=new Set(own.slice(0,job.options.maxComments).map(c=>c.id));product.comments=product.comments.filter(c=>c.launch_url!==own[0].launch_url || allowed.has(c.id));limit=true;own=own.slice(0,job.options.maxComments);}
        launch.comments_coverage={expected_count:expected ?? null,collected_count:own.length,complete:expected!=null && own.length>=expected,reason:null};
        await this.saveProduct(job,product);
        if(launch.comments_coverage.complete || limit) break;
        stagnant=product.comments.length===before ? stagnant+1 : 0;
        if(attempts++>=1000) break;
        if(page.next_url && (!page.comment_expand_available || stagnant>=2)) {
          if(seenPages.has(page.next_url)) break;
          seenPages.add(page.next_url);page=await this.visit(job,page.next_url,'launch',{comments:launch.comments_count});stagnant=0;continue;
        }
        if(stagnant>=2) break;
        this.check();
        if(page.transport==='http')page=await this.visitBrowser(job,page.url,'launch');
        await this.delay(job.options.delay);
        page=await this.collect({op:'expand_comments'});
        if(!page.expanded && !page.control_found) {stagnant++;if(stagnant>=2) break;}
      }
      if(!launch.comments_coverage.complete) launch.comments_coverage.reason=limit ? 'user_comment_limit' : 'some_comments_unavailable_or_pagination_incomplete';
    }
    const expected=product.launch_comments_count ?? (product.coverage.launches.complete && product.launches.every(l=>l.comments_count!=null) ? product.launches.reduce((n,l)=>n+l.comments_count,0):null);
    product.coverage.comments={requested:true,expected_count:expected,collected_count:product.comments.length,
      complete:product.coverage.launches.complete && product.launches.every(l=>l.comments_coverage?.complete===true),
      reason:product.launches.every(l=>l.comments_coverage?.complete) ? null : 'see_launch_comments_coverage'};
  }
  async detail(job,product) {
    product.state='collecting';await this.saveProduct(job,product);
    await this.note(job,message('runner.detail',{index:job.stats.processed+1,total:job.queue.length,product:product.name}));
    try {
      const page=await this.visit(job,product.url,'product',{launches:product.launches_reported>0});
      if(!page.product.name) throw localizedError('error.noProduct');
      product=mergeProduct(product,page.product);
      product.coverage.metadata={requested:true,complete:!!product.name && !!product.description};
      await this.launches(job,product,page);await this.saveProduct(job,product);
      const reviewed=await this.reviews(job,product);if(reviewed)product=reviewed;
      await this.comments(job,product);
      product.state=Object.values(product.coverage).every(c=>c.requested===false || c.complete===true) ? 'complete' : 'partial';
      product.details_attempted=true;product.error=null;product.error_i18n=null;
    } catch(error) {
      if(error instanceof Paused || error instanceof SiteBlocked) {await this.saveProduct(job,product);throw error;}
      product.state='partial';product.details_attempted=true;product.error=error.message;product.error_i18n=error.i18n || null;
      await this.note(job,message('runner.partialProduct',{product:product.name}), 'warning');
    }
    product.collected_at=new Date().toISOString();await this.saveProduct(job,product);
  }
  async visitBrowser(job,url,mode){return this.visit({...job,options:{...job.options,transport:'browser'}},url,mode);}
  async retryIncomplete(job) {
    if(this.active) throw localizedError('error.active');
    const products=await db.products(job.id);
    for(const p of products) if(p.state==='partial' || p.state==='error') {p.state='collecting';await db.saveProduct(job.id,p);}
    job.stage=job.next_category_url ? 'category' : 'details';job.status='paused';await db.saveJob(job);
  }
  async run(job) {
    if(this.active) return;
    await navigator.locks.request('product-hunt-export-crawler',{ifAvailable:true},async lock=>{
      if(!lock) throw localizedError('error.locked');
      this.active=true;this.stopRequested=false;this.shared.stopped=false;this.shared.fatal=null;
      try {
        if(this.shared.jobId && this.shared.jobId!==job.id){this.shared.http=null;this.shared.fallbackNoted=false;this.shared.blockedWorkerId=null;}
        this.shared.jobId=job.id;this.shared.checkpointTail=Promise.resolve();
        if(!['1.1.0','1.2.0','1.2.1','1.2.2','1.2.3'].includes(job.engine_version))job.options={...job.options,transport:'auto',concurrency:4,delay:150,checkpointEvery:250};
        job.engine_version='1.2.3';await this.restorePolicy(job);
        job.status='running';job.error=null;job.error_i18n=null;await db.saveJob(job);this.onUpdate(job);
        if(job.stage==='category') await this.enumerate(job);
        let index=0,nextCheckpoint=job.stats.processed+(job.options.checkpointEvery||250);
        const tasks=Array.from({length:Math.max(1,Math.min(6,job.options.concurrency||1))},(_,laneIndex)=>(async()=>{
          const lane=this.lane(laneIndex);
          try{
            while(index<job.queue.length){
              this.check();const slug=job.queue[index++],p=await db.product(job.id,slug);
              if(!p || ['complete','partial','error'].includes(p.state))continue;
              await lane.detail(job,p);
              if(job.stats.processed>=nextCheckpoint){nextCheckpoint=job.stats.processed+(job.options.checkpointEvery||250);this.shared.checkpointTail=this.shared.checkpointTail.then(()=>this.onCheckpoint(job,false));}
            }
          }catch(error){if(!(error instanceof Paused))this.shared.fatal ||= error;this.shared.stopped=true;throw error;}
        })());
        const outcomes=await Promise.allSettled(tasks);
        if(this.shared.fatal)throw this.shared.fatal;
        const failure=outcomes.find(r=>r.status==='rejected');if(failure)throw failure.reason;
        await this.shared.checkpointTail;
        const products=await db.products(job.id);job.coverage=coverage(job,products);
        job.status=job.coverage.complete ? 'complete' : 'partial';job.finished_at=new Date().toISOString();
        await this.note(job,message(job.coverage.complete ? 'runner.complete' : 'runner.partial'),job.coverage.complete?'info':'warning');
        await this.onCheckpoint(job,true);await this.closeWorkers();
      } catch(error) {
        job.status=error instanceof Paused ? 'paused' : error instanceof SiteBlocked ? 'blocked' : 'error';job.error=error instanceof Paused ? null : error.message;
        job.error_i18n=error instanceof Paused ? null : error.i18n || null;
        await this.note(job,error.i18n || error.message,'warning');
        // Export the committed portion on a normal pause, too.
        try {await this.shared.checkpointTail;await this.onCheckpoint(job,false);}catch(e){job.file_error=e.message;job.file_error_i18n=e.i18n || null;await db.saveJob(job);}
      } finally {await this.shared.policyWriteTail;this.active=false;this.onUpdate(job);}
    });
  }
}
