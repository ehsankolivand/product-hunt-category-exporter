import {categoryUrl} from './core.js';

export function resolveCategorySource({location_url,tab_url,pending_url,canonical_url,title}={}) {
  // Location in the clicked document is authoritative; a stale tab URL or old job is not.
  if(location_url){try{return {url:categoryUrl(location_url),observed_url:location_url,source:'live_document',title:title || null};}catch{return null;}}
  for(const [source,url] of [['live_document',location_url],['browser_tab',tab_url],['pending_navigation',pending_url]]) {
    try {return {url:categoryUrl(url),observed_url:url,source,title:title || null};}catch{}
  }
  return null;
}

export async function detectCategorySource(tab,api) {
  let live={};
  if(tab?.id!=null) {
    try {
      const result=await api.scripting.executeScript({target:{tabId:tab.id},func:()=>({
        location_url:location.href,canonical_url:document.querySelector('link[rel="canonical"]')?.href || null,title:document.title
      })});
      live=result?.[0]?.result || {};
    }catch { /* Permission-less or navigating tabs still have a browser URL fallback. */ }
  }
  return resolveCategorySource({...live,tab_url:tab?.url,pending_url:tab?.pendingUrl});
}
