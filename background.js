import {detectCategorySource} from './lib/source.js';
import {createHTMLMessageHandler} from './lib/network.js';

chrome.runtime.onMessage.addListener(createHTMLMessageHandler(chrome.runtime));

chrome.action.onClicked.addListener(async (tab) => {
  const target = new URL(chrome.runtime.getURL('dashboard.html'));
  const source=await detectCategorySource(tab,chrome);
  if(source) {
    target.searchParams.set('category',source.url);
    target.searchParams.set('source',source.source);
  }
  await chrome.tabs.create({url: target.href});
});
