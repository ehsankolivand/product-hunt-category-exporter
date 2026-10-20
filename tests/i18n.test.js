import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {messages,t,message,translate,localizedError,setLanguage,getLanguage,initLanguage,locale,formatNumber} from '../lib/i18n.js';

test('both languages cover every message and use the same parameters',()=>{
  assert.deepEqual(Object.keys(messages.en).sort(),Object.keys(messages.fa).sort());
  const parameters=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const key of Object.keys(messages.en)){
    assert(messages.fa[key] && messages.en[key],key);
    assert.deepEqual(parameters(messages.en[key]),parameters(messages.fa[key]),key);
  }
});
test('every translation referenced by the dashboard or engine exists',()=>{
  const html=readFileSync(new URL('../dashboard.html',import.meta.url),'utf8');
  const sources=['dashboard.js',...readdirSync(new URL('../lib',import.meta.url)).filter(name=>name.endsWith('.js') && name!=='i18n.js').map(name=>'lib/'+name)];
  const keys=[...html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)].map(match=>match[1]);
  for(const source of sources){
    const code=readFileSync(new URL('../'+source,import.meta.url),'utf8');
    keys.push(...[...code.matchAll(/(?:t|message|localizedError|text)\('([^']+)'/g)].map(match=>match[1]).filter(key=>key.includes('.') && !key.endsWith('.')));
  }
  for(const key of keys)assert(Object.hasOwn(messages.en,key),key);
});
test('saved descriptors translate nested rate-limit decisions and localized numbers',()=>{
  const descriptor=JSON.parse(JSON.stringify(message('rate.message',{reason:message('rate.local'),pacing:message('rate.increased'),wait:40,interval:0.25})));
  setLanguage('fa',{persist:false});const persian=t(descriptor.key,descriptor.params);
  assert(persian.includes('۴۰'));assert(persian.includes('۰٫۲۵'));assert.equal(locale(),'fa-IR');
  setLanguage('en',{persist:false});const english=translate(persian,descriptor);
  assert(english.includes('40 seconds'));assert(english.includes('0.25 seconds'));assert(english.includes('Precautionary extension pause'));
  assert(!/[\u0600-\u06ff]/.test(english));assert.equal(formatNumber(1234),'1,234');
  setLanguage('fa',{persist:false});
});
test('changing language preserves raw product text and error metadata',()=>{
  const product='محصول <img src=x onerror=alert(1)>';
  setLanguage('fa',{persist:false});const error=localizedError('error.unavailable',{url:'https://www.producthunt.com/products/example'});
  setLanguage('en',{persist:false});
  assert.equal(t('runner.partialProduct',{product}).slice(0,product.length),product);
  assert(translate(error.message,error.i18n).startsWith('The page was removed'));
  assert.equal(translate(messages.fa['error.paused']),messages.en['error.paused']);
  assert.equal(setLanguage('de',{persist:false}),false);assert.equal(getLanguage(),'en');
  setLanguage('fa',{persist:false});
});
test('language follows browser initially, persists selection, and works without storage',()=>{
  const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),originalChrome=globalThis.chrome,originalDocument=globalThis.document;
  const stored=new Map();
  try{
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)}});
    globalThis.chrome={i18n:{getUILanguage:()=> 'en-US'}};
    globalThis.document={documentElement:{}};
    assert.equal(initLanguage(),'en');assert.equal(document.documentElement.dir,'ltr');
    setLanguage('fa');assert.equal(document.documentElement.lang,'fa');assert.equal(document.documentElement.dir,'rtl');
    assert.equal(initLanguage(),'fa');
    stored.set('ph_export_language','unsupported');globalThis.chrome.i18n.getUILanguage=()=> 'fa-IR';
    assert.equal(initLanguage(),'fa');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage disabled');}});
    globalThis.chrome.i18n.getUILanguage=()=> 'en-GB';assert.equal(initLanguage(),'en');assert.equal(setLanguage('fa'),true);
  }finally{
    if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete globalThis.localStorage;
    if(originalChrome===undefined)delete globalThis.chrome;else globalThis.chrome=originalChrome;
    if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
    setLanguage('fa',{persist:false});
  }
});
test('Chrome metadata resolves in both locales and respects manifest limits',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url)));
  assert.equal(manifest.default_locale,'en');
  for(const language of ['en','fa']){
    const strings=JSON.parse(readFileSync(new URL(`../_locales/${language}/messages.json`,import.meta.url)));
    for(const value of [manifest.name,manifest.description,manifest.action.default_title])assert(strings[value.slice(6,-2)]?.message,value);
    assert(strings.extensionName.message.length<=45);assert(strings.extensionDescription.message.length<=132);
  }
});
