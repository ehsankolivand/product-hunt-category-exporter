import {phUrl} from './core.js';
import {localizedError} from './i18n.js';

// Fetch in a context without a Document. A foreground fetch can process HTTP Link
// preload headers before its response body reaches the HTML parser.
export async function fetchHTML(url,fetcher=globalThis.fetch?.bind(globalThis)){
  const safe=phUrl(url);if(!safe)throw localizedError('error.fetchDomain');
  const response=await fetcher(safe,{credentials:'include',redirect:'follow',signal:AbortSignal.timeout(20000),headers:{Accept:'text/html'}});
  const headers={};
  for(const key of ['retry-after','date']){const value=response.headers.get(key);if(value!==null)headers[key]=value;}
  const body=response.ok ? await response.text() : '';
  if(!response.ok)try{await response.body?.cancel();}catch{}
  return {status:response.status,url:response.url||safe,headers,body};
}

export function createHTMLMessageHandler(runtime,fetcher){
  return (message,sender,reply)=>{
    if(message?.type!=='ph_fetch_html')return false;
    // Content scripts and other extensions cannot use this as a cross-origin proxy.
    const source=typeof sender?.url==='string' ? sender.url.split(/[?#]/)[0] : '';
    if(sender?.id!==runtime.id || source!==runtime.getURL('dashboard.html')){
      const error=localizedError('error.dashboardOnly');reply({error:error.message,error_i18n:error.i18n});return false;
    }
    fetchHTML(message.url,fetcher).then(result=>reply({result}),error=>reply({error:error.message,error_i18n:error.i18n}));
    return true;
  };
}

export async function fetchPublicHTML(url,options){
  const runtime=globalThis.chrome?.runtime;
  if(!runtime?.id)return globalThis.fetch(url,options); // Local test harness, without an installed extension.
  let timer;
  try{
    const result=await Promise.race([
      runtime.sendMessage({type:'ph_fetch_html',url}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(localizedError('error.backgroundTimeout')),25000);})
    ]);
    if(!result?.result){
      if(result?.error_i18n)throw localizedError(result.error_i18n.key,result.error_i18n.params);
      throw result?.error ? new Error(result.error) : localizedError('error.backgroundResponse');
    }
    const response=result.result;
    return {status:response.status,ok:response.status>=200 && response.status<300,url:response.url,headers:new Headers(response.headers),text:async()=>response.body};
  }finally{clearTimeout(timer);}
}
