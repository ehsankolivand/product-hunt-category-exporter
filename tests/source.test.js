import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCategorySource,detectCategorySource} from '../lib/source.js';
const correct='https://www.producthunt.com/categories/ai-meeting-notetakers';
test('read the live category instead of stale /m tab metadata or canonical link',()=>{
  const result=resolveCategorySource({location_url:correct+'?page=3#content',tab_url:'https://www.producthunt.com/categories/m',canonical_url:'https://www.producthunt.com/categories/m'});
  assert.equal(result.url,correct);assert.equal(result.source,'live_document');
});
test('a live product page cannot select a stale category from the old tab URL',()=>{
  assert.equal(resolveCategorySource({location_url:'https://www.producthunt.com/products/granola',tab_url:'https://www.producthunt.com/categories/m'}),null);
});
test('browser tab URL is a fallback only when the live document cannot be read',()=>{
  assert.equal(resolveCategorySource({tab_url:correct}).url,correct);assert.equal(resolveCategorySource({tab_url:'https://evil.test/categories/m'}),null);
});
test('toolbar click reads the clicked tab document and keeps the complete slug',async()=>{
  const api={scripting:{executeScript:async args=>{assert.equal(args.target.tabId,44);return [{result:{location_url:correct,title:'AI notetakers'}}];}}};
  assert.equal((await detectCategorySource({id:44,url:'https://www.producthunt.com/categories/m'},api)).url,correct);
});
