import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryUrl,phUrl,folderName,mergeProduct,sortProducts,metrics,coverage} from '../lib/core.js';
import {crc32,zip} from '../lib/zip.js';

test('category URLs start at page one, preserve filters, support editorial /all',()=>{
  assert.equal(categoryUrl('https://producthunt.com/categories/productivity?page=3&order=top&ref=footer#content'),'https://www.producthunt.com/categories/productivity?order=top');
  assert.equal(categoryUrl('https://www.producthunt.com/categories/ai-workflow-automation/all?page=2'),'https://www.producthunt.com/categories/ai-workflow-automation/all');
});
test('reject foreign, deceptive and credential-bearing URLs',()=>{
  for(const u of [null,undefined,'','https://www.producthunt.com.evil.test/categories/a','javascript:alert(1)','https://evil.test','http://www.producthunt.com','https://secret@www.producthunt.com/categories/a','https://www.producthunt.com:444/categories/a'])assert.equal(phUrl(u),null);
  assert.throws(()=>categoryUrl('https://www.producthunt.com/products/n8n'));
});
test('folder names cannot escape chosen folder or create reserved Windows files',()=>{
  assert(!/[\/\\:]/.test(folderName('../hello/../../bad:name')));
  assert(!folderName('../hello/../../bad:name').includes('..'));
  assert.equal(folderName('CON'),'category');assert.equal(folderName('Productivity'),'Productivity');
});
test('missing numeric values sort last; equal ratings retain category order',()=>{
  const list=[{slug:'a',rating_average:null,category_position:1},{slug:'b',rating_average:4.8,category_position:3},{slug:'c',rating_average:4.8,category_position:2},{slug:'d',rating_average:0,category_position:4}];
  assert.deepEqual(sortProducts(list,'rating').map(p=>p.slug),['c','b','d','a']);
  assert.deepEqual(list.map(p=>p.slug),['a','b','c','d']);
});
test('resuming merges reviews without duplicates or null overwrites',()=>{
  const p=mergeProduct({name:'Alpha',description:'Full',reviews:[{id:'1',text:'A'}],source_urls:['a']},{name:null,description:null,reviews:[{id:'1',rating:5},{id:'2',text:'B'}],source_urls:['a','b']});
  assert.equal(p.name,'Alpha');assert.equal(p.description,'Full');assert.equal(p.reviews.length,2);assert.equal(p.reviews[0].text,'A');assert.deepEqual(p.source_urls,['a','b']);
});
test('launch points are never confused with ratings or invented from missing counts',()=>{
  const p={rating_average:4.75,rating_count:56,launches:[{url:'one',upvotes_count:211,comments_count:5},{url:'two',upvotes_count:280,comments_count:20}],coverage:{launches:{complete:true}}};
  assert.equal(metrics(p).upvotes_count,491);assert.equal(metrics(p).rating_average,4.75);assert.equal(metrics(p).launch_comments_count,25);
  assert.equal(metrics({...p,coverage:{launches:{complete:false}}}).upvotes_count,null);
  assert.equal(metrics({...p,launches:[{url:'one'}]}).upvotes_count,null);
});
test('coverage rejects missing, interrupted and deliberately limited exports',()=>{
  const job={category:{reported_products:2},category_exhausted:true,options:{maxProducts:0}};
  const complete={state:'complete',coverage:{reviews:{requested:true,complete:true}}};
  assert.equal(coverage(job,[complete,complete]).complete,true);assert.equal(coverage(job,[complete]).complete,false);
  assert.equal(coverage(job,[complete,complete,complete]).complete,false);
  assert.equal(coverage({...job,category_exhausted:false},[complete,complete]).complete,false);
  assert.equal(coverage({...job,options:{maxProducts:2}},[complete,complete]).complete,false);
  assert.equal(coverage(job,[complete,{...complete,coverage:{reviews:{requested:true,complete:false}}}]).complete,false);
});
test('ZIP has standard CRC, UTF-8 filename flag and end directory',async()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const blob=await zip([{name:'بهره‌وری/products-0001.json',data:'{"hello":"سلام"}\n'}]);
  const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer);
  assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint16(6,true),0x800);assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);
  assert.equal(v.getUint16(bytes.length-12,true),1);
});
