/* Runs in Chrome's isolated world. Only reads public DOM/JSON-LD and clicks read-more controls. */
(() => {
  if (globalThis.PHCollector?.version === '1.1.0') return;
  const norm = s => String(s ?? '').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n/g,'\n\n').trim();
  const text = n => norm(n?.textContent);
  function number(value) {
    const s = String(value ?? '').trim().replace(/,/g,'');
    const m = s.match(/^([\d]+(?:\.\d+)?)\s*([kmb])?$/i);
    return m ? Number(m[1]) * ({k:1e3,m:1e6,b:1e9}[m[2]?.toLowerCase()] || 1) : null;
  }
  function safe(value, base) {
    if(typeof value!=='string' || !value.trim())return null;
    try {
      const u=new URL(value,base);
      if(u.protocol!=='https:' || !['www.producthunt.com','producthunt.com'].includes(u.hostname) || u.username || u.password || u.port) return null;
      u.hostname='www.producthunt.com';u.hash='';u.searchParams.delete('ref');
      return u.href;
    } catch {return null;}
  }
  function cleanHTML(value, doc) {
    if (!value) return '';
    const root=doc.createElement('template');
    root.innerHTML=String(value).replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|li)>/gi,'\n');
    root.content.querySelectorAll('script,style,iframe').forEach(n=>n.remove());
    return norm(root.content.textContent);
  }
  function ldNodes(doc) {
    const all=[];
    function walk(value,depth=0) {
      if(!value || typeof value!=='object' || depth>25 || all.length>15000) return;
      if(Array.isArray(value)) {value.forEach(v=>walk(v,depth+1));return;}
      if(value['@type']) all.push(value);
      Object.values(value).forEach(v=>walk(v,depth+1));
    }
    for(const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {walk(JSON.parse(s.textContent));} catch { /* One invalid block must not discard good blocks. */ }
    }
    return all;
  }
  function isType(node,type) {return [node['@type']].flat().includes(type);}
  function commentControls(doc) {
    const feed=doc.querySelector('[data-test="comments-feed"]');
    if(!feed)return [];
    return [...feed.querySelectorAll('button,[role="button"]')].filter(b=>!b.disabled && (
      /^(?:(?:show|view|load)\s+(?:\d+\s+)?(?:more|all)?\s*(?:comments?|replies|reply)|\d+\s+replies)$/i.test(text(b)) ||
      (!b.closest('[data-test^="comment-"]') && /^(show|view|load) more$/i.test(text(b)))
    ));
  }
  function nextLink(doc,base,path,root=doc) {
    const current=new URL(base),page=Number(current.searchParams.get('page')||1);
    const candidates=[...root.querySelectorAll('a[href]')].map(a=>({a,u:safe(a.getAttribute('href'),base)}))
      .filter(x=>x.u && new URL(x.u).pathname===path && !x.a.hasAttribute('aria-disabled'));
    const explicit=candidates.find(x=>/^next\b/i.test(text(x.a)) || x.a.getAttribute('rel')==='next');
    if(explicit && Number(new URL(explicit.u).searchParams.get('page')||1)>page) return explicit.u;
    return candidates.find(x=>Number(new URL(x.u).searchParams.get('page'))===page+1)?.u || null;
  }
  function extract(doc,url,mode) {
    const u=new URL(url),body=text(doc.body),nodes=ldNodes(doc);
    const blocked=doc.querySelector('#challenge-running,#challenge-form,iframe[src*="challenges.cloudflare.com"]') || /just a moment|attention required|verify you are human|too many requests|access denied/i.test(doc.title || '') || /^.{0,100}(too many requests|verify you are human)/i.test(body);
    if(blocked) return {blocked:true,url,message_key:'error.siteBlocked'};
    if(/page (not found|doesn.t exist)|404: this page could not be found/i.test(body.slice(0,1500))) return {unavailable:true,url};
    const result={url,observed_at:new Date().toISOString(),blocked:false};
    if(mode==='category') {
      const root=doc.querySelector('#content');
      const collection=nodes.find(n=>isType(n,'CollectionPage'));
      const crumb=nodes.find(n=>isType(n,'BreadcrumbList'))?.itemListElement?.at(-1);
      const range=(root ? text(root) : body).match(/Showing\s+([\d,]+)\s*[-–]\s*([\d,]+)\s+of\s+([\d,]+)\s+products/i) || body.match(/Showing\s+([\d,]+)\s*[-–]\s*([\d,]+)\s+of\s+([\d,]+)\s+products/i);
      let total=range ? number(range[3]) : null;
      if(total===null) {
        const labels=[...doc.querySelectorAll('dt')];
        const label=labels.find(n=>/Products considered/i.test(text(n)));
        total=number(text(label?.nextElementSibling));
      }
      const listed=collection?.mainEntity?.itemListElement || [];
      const entities=new Map(listed.map(n=>[safe(n.item?.url || n.item?.['@id'],url),n.item]));
      let cards=[...(root?.querySelectorAll('[data-test^="product:"]') || [])];
      if(!cards.length && entities.size)cards=[...doc.querySelectorAll('[data-test^="product:"]')].filter(n=>entities.has(safe(n.querySelector('a[href]')?.getAttribute('href'),url)));
      if(!cards.length && root) cards=[...root.querySelectorAll('ul > li')].filter(n=>n.querySelector('a[href^="/products/"]') && n.querySelector('img'));
      const seen=new Set();
      result.products=cards.flatMap((card,index)=>{
        if(card.closest('[data-ad-id]') || card.querySelector('img[alt="Promoted"]')) return [];
        const a=[...card.querySelectorAll('a[href]')].find(a=>{const link=safe(a.getAttribute('href'),url);return link && /^\/products\/[^/?#]+\/?$/.test(new URL(link).pathname);});
        const link=a && safe(a.getAttribute('href'),url);
        if(!link || seen.has(link)) return [];
        seen.add(link);
        const entity=entities.get(link) || {};
        const slug=new URL(link).pathname.split('/')[2];
        const primaryName=text(a.querySelector('span.font-semibold')) || entity.name || card.querySelector('img')?.getAttribute('alt') || text(a).split('\n')[0];
        const ratingLink=[...card.querySelectorAll('a[href]')].find(n=>/\/reviews(?:\?|$)/.test(n.getAttribute('href')) && /review/i.test(text(n)));
        const ratingText=text(ratingLink?.parentElement);
        const avg=ratingText.match(/([0-5](?:\.\d+)?)\s*\(/)?.[1];
        const count=text(ratingLink).match(/([\d,.]+\s*[KMB]?)\s+reviews?/i)?.[1];
        const agg=entity.aggregateRating || {};
        const name=entity.name || primaryName;
        const tagline=text(a.querySelector('span.text-secondary')) || null;
        return [{slug,name,url:link,tagline,description:cleanHTML(entity.description,doc) || null,
          rating_average:number(agg.ratingValue) ?? number(avg),rating_displayed:number(avg),
          rating_count:number(agg.ratingCount),review_count:number(agg.reviewCount) ?? (/[KMB]/i.test(count || '') ? null : number(count)),review_count_displayed:count || null,
          rating_scale:number(agg.bestRating) ?? (avg ? 5 : null),
          categories:[...card.querySelectorAll('a[href*="/categories/"]')].map(a=>({name:text(a),url:safe(a.getAttribute('href'),url)})),
          tags:[...card.querySelectorAll('button')].filter(b=>!b.getAttribute('aria-haspopup')).map(text).filter(Boolean),
          image_url:entity.image || card.querySelector('img')?.getAttribute('src') || card.querySelector('img')?.getAttribute('data-original-src') || null,
          screenshots:entity.screenshot || [],date_published:entity.datePublished || null,date_modified:entity.dateModified || null,
          makers:[entity.author || []].flat().map(p=>({name:p.name,url:p.url || null})),
          category_page:Number(u.searchParams.get('page')||1),category_position:range ? number(range[1])+index : null,
          source_urls:[url],state:'queued',reviews:[],comments:[],launches:[],coverage:{}}];
      });
      // Next.js can stream the ItemList separately from its hydrated card container.
      if(!result.products.length)for(const [link,entity] of entities){
        if(!link || !entity?.name || !/^\/products\/[^/]+$/.test(new URL(link).pathname))continue;
        const aggregate=entity.aggregateRating || {};
        result.products.push({slug:new URL(link).pathname.split('/')[2],name:entity.name,url:link,tagline:null,
          description:cleanHTML(entity.description,doc) || null,rating_average:number(aggregate.ratingValue),rating_displayed:null,
          rating_count:number(aggregate.ratingCount),review_count:number(aggregate.reviewCount),rating_scale:number(aggregate.bestRating),
          categories:[],tags:[],image_url:entity.image || null,screenshots:[entity.screenshot || []].flat(),makers:[entity.author || []].flat().map(p=>({name:p.name,url:p.url || null})),
          date_published:entity.datePublished || null,date_modified:entity.dateModified || null,
          category_page:Number(u.searchParams.get('page')||1),category_position:range ? number(range[1])+result.products.length : null,
          source_urls:[url],state:'queued',reviews:[],comments:[],launches:[],coverage:{}});
      }
      result.category={name:collection?.headline || crumb?.name || u.pathname.split('/')[2],slug:u.pathname.split('/')[2],url:collection?.url || u.origin+u.pathname,description:collection?.description || null,reported_products:total};
      result.range=range ? {from:number(range[1]),to:number(range[2]),total} : null;
      result.next_url=nextLink(doc,url,u.pathname,root || doc) || nextLink(doc,url,u.pathname);
      if(!result.next_url && range && number(range[2])<total) {const n=new URL(url);n.searchParams.set('page',String(Number(u.searchParams.get('page')||1)+1));result.next_url=n.href;result.pagination_inferred=true;}
      result.browse_url=[...doc.querySelectorAll('a[href]')].filter(a=>/browse all[\s\S]*products/i.test(text(a))).map(a=>safe(a.getAttribute('href'),url)).find(Boolean) || null;
      return result;
    }
    const slug=u.pathname.split('/')[2];
    const productUrl=`https://www.producthunt.com/products/${slug}`;
    const entity=nodes.find(n=>n.name && safe(n.url || n['@id'],url)===productUrl) || {};
    const nav=doc.querySelector('[data-test="product-navigation-item-reviews"]');
    const header=[...doc.querySelectorAll('a[href]')].filter(a=>safe(a.getAttribute('href'),url)===productUrl+'/reviews').slice(0,4);
    const reviewLabel=header.map(text).find(t=>/^[\d,.]+\s*[KMB]? reviews?$/i.test(t));
    const labelCount=reviewLabel?.match(/([\d,.]+\s*[KMB]?)\s+reviews?/i)?.[1] || text(nav).match(/reviews\s*([\d,.]+\s*[KMB]?)/i)?.[1];
    const explicitCount=body.match(/community submitted\s+([\d,]+)\s+reviews/i)?.[1];
    const agg=entity.aggregateRating || {};
    const launchNav=doc.querySelector('[data-test="product-navigation-item-launches"]');
    result.product={slug,url:productUrl,name:entity.name || null,description:cleanHTML(entity.description,doc) || null,
      rating_average:number(agg.ratingValue),rating_count:number(agg.ratingCount),
      review_count:number(agg.reviewCount) ?? number(explicitCount) ?? (/[KMB]/i.test(labelCount || '') ? null : number(labelCount)),review_count_displayed:labelCount || null,
      rating_scale:number(agg.bestRating),date_published:entity.datePublished || null,date_modified:entity.dateModified || null,
      screenshots:entity.screenshot || [],image_url:entity.image || null,
      website_url:[...doc.querySelectorAll('a[href]')].find(a=>/^Visit website$/i.test(text(a)))?.href || null,
      launches_reported:number(text(launchNav).match(/[\d,]+/)?.[0]),
      source_urls:[url]};
    result.launches=[...doc.querySelectorAll('section[data-container]')].flatMap(card=>{
      const a=[...card.querySelectorAll('a[href]')].find(a=>{const link=safe(a.getAttribute('href'),url);return link && new URL(link).pathname.startsWith(`/products/${slug}/launches/`);});
      if(!a) return [];
      const vote=card.querySelector('[data-test="vote-button"]');
      const commentButton=[...card.querySelectorAll('button')].find(b=>b!==vote && number(text(b))!==null && !b.hasAttribute('aria-haspopup'));
      return [{url:safe(a.getAttribute('href'),url),name:text(a),tagline:text(a.closest('span')?.nextElementSibling) || null,
        upvotes_count:number(text(vote)),comments_count:number(text(commentButton)),
        date_published:card.querySelector('time')?.getAttribute('datetime') || null,
        date_label:text(card.querySelector('time') || card.querySelector('p')) || null}];
    });
    result.launches_url=[...doc.querySelectorAll('a[href]')].map(a=>safe(a.getAttribute('href'),url)).find(v=>v && new URL(v).pathname===`/products/${slug}/launches`) || null;
    result.next_url=nextLink(doc,url,u.pathname);
    const reviews=new Map();
    for(const n of nodes.filter(n=>isType(n,'Review'))) {
      const id=String(n['@id'] || n.url || '').match(/review=(\d+)/)?.[1];
      if(!id) continue;
      const notes=key=>(n[key]?.itemListElement || []).map(v=>cleanHTML(v.name,doc)).filter(Boolean);
      const positive=notes('positiveNotes'),negative=notes('negativeNotes'),body=cleanHTML(n.reviewBody,doc);
      reviews.set(id,{id,url:n.url || n['@id'],author:{name:n.author?.name || null,url:n.author?.url || null},rating:number(n.reviewRating?.ratingValue),rating_scale:number(n.reviewRating?.bestRating),
        text:[body,...positive,...negative].filter(Boolean).join('\n\n'),body:body || null,positive_notes:positive,negative_notes:negative,
        date_published:n.datePublished || null,date_modified:n.dateModified || null,source_url:url,helpful_count:null});
    }
    for(const card of doc.querySelectorAll('[id^="DetailedReview-"]')) {
      const id=card.id.match(/^DetailedReview-(\d+)$/)?.[1];
      if(!id) continue;
      const existing=reviews.get(id) || {};
      const own=n=>n.closest('[id^="DetailedReview-"]')===card;
      const prose=[...card.querySelectorAll('.prose,[class*="richText"]')].filter(own).map(text).filter(Boolean);
      const a=[...card.querySelectorAll('a[href]')].find(n=>/^\/@[^/]+$/.test(n.getAttribute('href')));
      const starGroup=[...card.querySelectorAll('[data-test="star-1-readonly"]')].find(own)?.parentElement;
      const filled=starGroup?.querySelectorAll('[data-test$="-filled"]');
      const helpful=card.querySelector('[data-test$="-vote-button"]');
      const row={...existing,id,url:existing.url || productUrl+'/reviews?review='+id,
        author:existing.author || {name:text(a) || null,url:a ? safe(a.getAttribute('href'),url):null},
        rating:existing.rating ?? (filled ? filled.length : null),rating_scale:existing.rating_scale ?? (starGroup ? 5 : null),
        text:prose.length ? prose.join('\n\n') : existing.text || text(card),
        positive_notes:existing.positive_notes || [],negative_notes:existing.negative_notes || [],
        date_published:existing.date_published || card.querySelector('time')?.getAttribute('datetime') || null,
        helpful_count:number(text(helpful).match(/\(([\d,]+)\)/)?.[1]) ?? (helpful ? 0 : null),source_url:url};
      reviews.set(id,row);
    }
    result.reviews=[...reviews.values()];
    result.review_expand_groups=[...doc.querySelectorAll('button')].filter(b=>!b.closest('[id^="DetailedReview-"]')).map(text).flatMap(t=>/^View all founder reviews$/i.test(t) ? ['founder'] : /^View all$/i.test(t) && /\/reviews$/.test(u.pathname) ? ['other'] : []);
    result.review_group=u.searchParams.get('filter') || null;
    result.comments=[...doc.querySelectorAll('[data-test^="comment-"]')].filter(n=>/^comment-\d+$/.test(n.getAttribute('data-test'))).map(card=>{
      const id=card.getAttribute('data-test').slice(8);
      const own=n=>n.closest('[data-test^="comment-"]')===card;
      const a=[...card.querySelectorAll('a[href]')].find(n=>/^\/@[^/]+$/.test(n.getAttribute('href')) && own(n));
      const prose=[...card.querySelectorAll('.prose,[class*="richText"]')].filter(own);
      const parent=card.parentElement?.closest('[data-test^="comment-"]');
      const vote=[...card.querySelectorAll('[data-test="action-bar-vote-button"]')].find(own);
      return {id,parent_id:parent?.getAttribute('data-test')?.match(/^comment-(\d+)$/)?.[1] || null,
        author:{name:text(a) || a?.getAttribute('aria-label') || null,url:a ? safe(a.getAttribute('href'),url):null},
        text:prose.map(text).filter(Boolean).join('\n\n') || text(card),
        upvotes_count:number(text(vote).match(/\(([\d,]+)\)/)?.[1]) ?? (vote ? 0 : null),
        date_published:[...card.querySelectorAll('time')].find(own)?.getAttribute('datetime') || null,
        launch_url:u.origin+u.pathname,source_url:url,url:u.origin+u.pathname+'#comment-'+id};
    });
    result.comments_feed=!!doc.querySelector('[data-test="comments-feed"]');
    result.comment_expand_available=commentControls(doc).length>0;
    result.launch_loaded=!!doc.querySelector('[data-test="post-active-notice"],[data-test="post-archive-banner-launch-date"],[data-test="comments-feed"]');
    result.launch_upvotes=result.launch_loaded ? number(text(doc.querySelector('[data-test="vote-button"]'))) : null;
    result.launch_description=nodes.find(n=>n.name && !n.url && isType(n,'WebApplication'))?.description || null;
    return result;
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function signature(mode) {
    return [location.href,document.querySelectorAll('#content [data-test^="product:"]').length,document.querySelectorAll('[id^="DetailedReview-"]').length,document.querySelectorAll('[data-test^="comment-"]').length,document.querySelectorAll('section[data-container]').length,document.querySelectorAll('script[type="application/ld+json"]').length,document.querySelector('[data-test="comments-feed"]')?.textContent?.length || 0].join('|');
  }
  async function ready(mode, expected={}) {
    let last='',stable=0;const started=Date.now();
    while(Date.now()-started<30000) {
      const sig=signature(mode);stable=sig===last ? stable+1 : 0;last=sig;
      if(stable>=2 && Date.now()-started>=250) {
        const data=extract(document,location.href,mode);
        if(data.blocked || data.unavailable) return data;
        const okay=mode==='category' ? data.products.length || data.browse_url || data.category.reported_products===0 : mode==='launch' ? data.launch_loaded : mode==='reviews' ? data.reviews.length || data.product.review_count===0 : data.product.name && (!(expected.launches || data.product.launches_reported>0) || data.launches.length>0);
        if(okay) return data;
      }
      await sleep(125);
    }
    return {...extract(document,location.href,mode),readiness_timeout:true};
  }
  async function command({op='scan',mode='product',group,expected}={}) {
    if(op==='scan') return ready(mode,expected);
    if(op==='expand_reviews') {
      const button=[...document.querySelectorAll('button')].find(b=>!b.disabled && !b.closest('[id^="DetailedReview-"]') && (group==='founder' ? /^View all founder reviews$/i.test(text(b)) : /^View all$/i.test(text(b))));
      if(!button) return {expanded:false,...extract(document,location.href,'reviews')};
      const before=signature('reviews');button.click();
      for(let i=0;i<40 && signature('reviews')===before;i++) await sleep(250);
      return {expanded:signature('reviews')!==before,...await ready('reviews')};
    }
    if(op==='expand_comments') {
      const feed=document.querySelector('[data-test="comments-feed"]');
      if(!feed) return {expanded:false,...extract(document,location.href,'launch')};
      const buttons=commentControls(document);
      const before=signature('launch');
      if(buttons[0]) buttons[0].click();
      else feed.lastElementChild?.scrollIntoView({block:'end'});
      for(let i=0;i<24 && signature('launch')===before;i++) await sleep(250);
      return {expanded:signature('launch')!==before,control_found:!!buttons.length,...await ready('launch')};
    }
    throw new Error('Unknown collector operation');
  }
  globalThis.PHCollector={version:'1.1.0',extract,command,number};
})();
