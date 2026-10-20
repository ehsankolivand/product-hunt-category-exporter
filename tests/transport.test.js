import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestGate,FastHttp,RateLimited,retryAfterMs,hasRetryAfter} from '../lib/transport.js';

const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function clock(start=0){
  let time=start;const sleepers=[];
  return {now:()=>time,sleep:ms=>new Promise(resolve=>sleepers.push({at:time+ms,resolve})),async advance(ms){
    const target=time+ms;await flush();
    while(true){sleepers.sort((a,b)=>a.at-b.at);if(!sleepers.length || sleepers[0].at>target)break;
      const next=sleepers.shift();time=next.at;next.resolve();await flush();
    }
    time=target;await flush();
  }};
}
const check=()=>{};
test('four concurrent callers start in FIFO order with no initial slowdown',async()=>{
  const time=clock(),gate=new RequestGate(150,time),starts=[];
  const pending=Array.from({length:4},(_,i)=>gate.enter(check).then(t=>starts.push([i,t.startedAt])));
  await time.advance(450);await Promise.all(pending);
  assert.deepEqual(starts,[[0,0],[1,150],[2,300],[3,450]]);
});
test('a newly received 429 pauses callers that were already waiting; no post-wait burst',async()=>{
  const time=clock(),gate=new RequestGate(150,time),starts=[];await gate.enter(check);
  const pending=[gate.enter(check).then(t=>starts.push(t.startedAt)),gate.enter(check).then(t=>starts.push(t.startedAt))];
  await time.advance(30);gate.backoff(1000);
  await time.advance(999);assert.deepEqual(starts,[]);
  await time.advance(1);assert.deepEqual(starts,[1030]);
  await time.advance(149);assert.equal(starts.length,1);
  await time.advance(1);await Promise.all(pending);assert.deepEqual(starts,[1030,1180]);
});
test('a later Retry-After extends the deadline for the existing queue',async()=>{
  const time=clock(),gate=new RequestGate(150,time);await gate.enter(check);gate.backoff(1000);
  let started=null;const pending=gate.enter(check).then(t=>started=t.startedAt);
  await time.advance(500);gate.backoff(2000);
  await time.advance(1999);assert.equal(started,null);
  await time.advance(1);await pending;assert.equal(started,2500);
});
test('first-limit duplicates cause one pause and keep pacing; a failed resume adds one step',async()=>{
  const time=clock(),gate=new RequestGate(150,time);
  const decisions=Array.from({length:4},()=>gate.backoff(1000));
  assert.equal(gate.interval,150);assert.equal(gate.episode,1);
  assert.equal(decisions.filter(d=>d.newEpisode).length,1);
  await time.advance(1000);const probe=await gate.enter(check);gate.backoff(1000,probe);assert.equal(gate.interval,250);assert.equal(gate.episode,2);
});
test('late responses from a pre-pause flight cannot create another penalty after the deadline',async()=>{
  const time=clock(),gate=new RequestGate(0,time);
  const old=await gate.enter(check),another=await gate.enter(check);
  gate.backoff(1000,old);await time.advance(1500);
  const late=gate.backoff(1000,another);
  assert.equal(late.newEpisode,false);assert.equal(gate.episode,1);assert.equal(gate.interval,0);assert.equal(gate.penalty,1);
});
test('old responses arriving during a newer pause never increase its interval',async()=>{
  const time=clock(),gate=new RequestGate(0,time),old=await gate.enter(check);
  gate.backoff(1000,old);await time.advance(1000);
  const probe=await gate.enter(check);assert.equal(gate.backoff(2000,probe).newEpisode,true);
  const deadline=gate.blockedUntil;
  await time.advance(100);gate.backoff(1000,old);
  assert.equal(gate.interval,100);assert.equal(gate.episode,2);assert.equal(gate.blockedUntil,deadline);
});
test('duplicate locally timed responses cannot restart or extend the same pause',async()=>{
  const time=clock(),gate=new RequestGate(0,time),tickets=await Promise.all(Array.from({length:4},()=>gate.enter(check)));
  gate.backoff(20000,tickets[0],{extend:false});
  for(let i=1;i<4;i++){await time.advance(1000);gate.backoff(40000,tickets[i],{extend:false});}
  assert.equal(gate.blockedUntil,20000);assert.equal(gate.interval,0);assert.equal(gate.penalty,1);
});
test('recovery requires sustained successes and keeps the configured minimum',async()=>{
  const time=clock(),gate=new RequestGate(150,time);gate.backoff(1000);
  await time.advance(1000);gate.backoff(1000,await gate.enter(check));
  await time.advance(30000);for(let i=0;i<19;i++)gate.success({episode:gate.episode});
  assert.equal(gate.interval,250);assert.equal(gate.penalty,2);gate.success({episode:gate.episode});assert.equal(gate.interval,225);assert.equal(gate.penalty,0);
  assert.equal(new RequestGate(150,time).interval,150);
});
test('late successful responses cannot undo a newer rate limit',async()=>{
  const time=clock(),gate=new RequestGate(150,time),old=await gate.enter(check);
  gate.backoff(1000);await time.advance(60000);
  for(let i=0;i<100;i++)gate.success(old);assert.equal(gate.interval,150);assert.equal(gate.penalty,1);
});
test('pause cancels a waiting request without poisoning future admissions',async()=>{
  const time=clock(),gate=new RequestGate(150,time);await gate.enter(check);
  let paused=false;const pending=gate.enter(()=>{if(paused)throw new Error('paused');});
  const rejected=assert.rejects(pending,/paused/);
  await time.advance(20);paused=true;await time.advance(100);await rejected;
  const next=gate.enter(check);await time.advance(30);assert.equal((await next).startedAt,150);
});
test('stored cooldown and learned pace survive recreating the scheduler',async()=>{
  const time=clock(10000),first=new RequestGate(150,time);first.backoff(2000);
  const next=new RequestGate(150,time);next.configure(150,first.snapshot());
  let admitted=false;const pending=next.enter(check).then(()=>admitted=true);
  await time.advance(1999);assert.equal(admitted,false);
  await time.advance(1);await pending;assert.equal(next.interval,150);assert.equal(next.penalty,1);
});
test('stale stored pace expires without discarding an active valid cooldown',()=>{
  const time=clock(200000000),gate=new RequestGate(150,time);
  gate.configure(150,{updated_at:1,interval:30000,blocked_until:300000000});
  assert.equal(gate.interval,150);assert.equal(gate.blockedUntil,300000000);
});
test('the latest recovered pace wins over an older job with a slower saved pace',()=>{
  const time=clock(10000),gate=new RequestGate(150,time);
  gate.configure(150,{updated_at:8000,interval:2000,penalty:3,pacing_policy:'failed-resume-add100-v1'},{updated_at:9000,interval:500,penalty:0,pacing_policy:'failed-resume-add100-v1'});
  assert.equal(gate.interval,500);assert.equal(gate.penalty,0);
});
test('the old exponential penalty is reset while a saved active deadline remains honored',()=>{
  const time=clock(10000),gate=new RequestGate(150,time);
  gate.configure(150,{updated_at:9000,interval:2000,penalty:4,blocked_until:250000});
  assert.equal(gate.penalty,0);assert.equal(gate.interval,150);assert.equal(gate.blockedUntil,250000);
});
test('Retry-After supports seconds, HTTP dates and clock skew; invalid input uses backoff',()=>{
  assert.equal(retryAfterMs('2'),2000);assert.equal(retryAfterMs('0'),1000);
  assert.equal(retryAfterMs('Wed, 21 Oct 2026 10:00:20 GMT','Wed, 21 Oct 2026 10:00:00 GMT',0),20000);
  assert.equal(retryAfterMs('Wed, 21 Oct 2026 10:00:20 GMT',null,Date.parse('Wed, 21 Oct 2026 10:00:10 GMT')),10000);
  assert.equal(retryAfterMs(null,null,0,30000),30000);assert.equal(retryAfterMs('invalid',null,0,30000),30000);
  assert.equal(retryAfterMs('-1',null,0,30000),30000);
});
test('429 preserves a shared cooldown, exposes decisions and never switches transport',async()=>{
  const time=clock(),gate=new RequestGate(150,time),stats={requests:0},url='https://www.producthunt.com/categories/productivity';let calls=0;
  const http=new FastHttp(gate,check,stats,async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'2'}});});
  await assert.rejects(http.get(url,'category'),e=>e instanceof RateLimited && e.retryAfter===2000 && e.newEpisode===true);
  assert.equal(calls,1);assert.equal(gate.blockedUntil,2000);assert.equal(stats.rate_limit_pauses,1);assert.equal(http.disabled,false);
  const pending=assert.rejects(http.get(url,'category'),RateLimited);await time.advance(1999);assert.equal(calls,1);
  await time.advance(1);await pending;assert.equal(calls,2);assert.equal(gate.interval,250);
});
test('missing Retry-After uses 20, 40, 60, 80 second steps only after a fresh failed probe',async()=>{
  const time=clock(),gate=new RequestGate(0,time),stats={requests:0},url='https://www.producthunt.com/categories/productivity';
  const http=new FastHttp(gate,check,stats,async()=>new Response('',{status:429}));
  for(const [index,expected] of [20000,40000,60000,80000].entries()){
    let error;try{await http.get(url,'category');}catch(e){error=e;}
    assert(error instanceof RateLimited);assert.equal(error.retryAfter,expected);assert.equal(error.waitSource,'local');
    assert.equal(gate.interval,index*100);assert.equal(error.intervalChanged,index>0);
    await time.advance(expected);
  }
});
test('four delayed initial HTTP 429 responses share one pause and no pacing change',async()=>{
  const time=clock(),gate=new RequestGate(0,time),stats={requests:0};const deliveries=[];
  const http=new FastHttp(gate,check,stats,()=>new Promise(resolve=>deliveries.push(resolve)));
  const pending=Array.from({length:4},(_,i)=>http.get('https://www.producthunt.com/products/p-'+i,'product').catch(e=>e));
  await flush();assert.equal(deliveries.length,4);
  deliveries[0](new Response('',{status:429}));await flush();
  const deadline=gate.blockedUntil;
  for(let i=1;i<4;i++){await time.advance(1000);deliveries[i](new Response('',{status:429}));await flush();}
  const errors=await Promise.all(pending);
  assert.equal(stats.rate_limit_pauses,1);assert.equal(stats.rate_limit_responses,4);
  assert.equal(gate.interval,0);assert.equal(gate.blockedUntil,deadline);
  assert.equal(errors.filter(e=>e.newEpisode).length,1);
});
test('waiting, countdown expiry and admitting a resumed request never change pacing',async()=>{
  const time=clock(),gate=new RequestGate(150,time),normal=await gate.enter(check);
  assert.equal(gate.backoff(20000,normal,{extend:false}).intervalChanged,false);
  await time.advance(19999);assert.equal(gate.interval,150);
  await time.advance(1);assert.equal(gate.interval,150);
  const resumed=await gate.enter(check);assert.equal(resumed.afterPause,true);assert.equal(gate.interval,150);
  const failed=gate.backoff(40000,resumed,{extend:false});assert.equal(failed.intervalChanged,true);assert.equal(gate.interval,250);
  for(let i=0;i<4;i++)gate.backoff(40000,resumed,{extend:false});assert.equal(gate.interval,250);
});
test('a successful resumption leaves pacing unchanged and returns later requests to normal',async()=>{
  const time=clock(),gate=new RequestGate(150,time),normal=await gate.enter(check);
  gate.backoff(20000,normal,{extend:false});await time.advance(20000);
  const resumed=await gate.enter(check);gate.success(resumed);assert.equal(gate.interval,150);
  const pending=gate.enter(check);await time.advance(150);const later=await pending;
  assert.equal(later.afterPause,false);assert.equal(gate.backoff(40000,later,{extend:false}).intervalChanged,false);
  assert.equal(gate.interval,150);
});
test('four resumed lanes rejected together increase spacing once for that entire batch',async()=>{
  const time=clock(),gate=new RequestGate(0,time),first=await gate.enter(check);
  gate.backoff(20000,first,{extend:false});await time.advance(20000);
  const batch=await Promise.all(Array.from({length:4},()=>gate.enter(check)));
  assert(batch.every(ticket=>ticket.afterPause));
  const decisions=batch.map(ticket=>gate.backoff(40000,ticket,{extend:false}));
  assert.equal(gate.interval,100);assert.equal(gate.penalty,2);
  assert.equal(decisions.filter(result=>result.intervalChanged).length,1);
  await time.advance(10000);gate.backoff(40000,batch[0],{extend:false});
  assert.equal(gate.interval,100);assert.equal(gate.blockedUntil,60000);
});
test('sustained successful resumption resets the pause penalty even at minimum pace',async()=>{
  const time=clock(),gate=new RequestGate(150,time),normal=await gate.enter(check);
  gate.backoff(20000,normal,{extend:false});await time.advance(30000);
  const resumed=await gate.enter(check);for(let i=0;i<20;i++)gate.success(resumed);
  assert.equal(gate.interval,150);assert.equal(gate.penalty,0);
});
test('a resumed dashboard preserves a failed-resume step without increasing it again',async()=>{
  const time=clock(),first=new RequestGate(150,time),normal=await first.enter(check);
  first.backoff(20000,normal,{extend:false});await time.advance(20000);
  first.backoff(40000,await first.enter(check),{extend:false});assert.equal(first.interval,250);
  const restored=new RequestGate(150,time);restored.configure(150,first.snapshot());assert.equal(restored.interval,250);
  await time.advance(40000);assert.equal(restored.interval,250);
  const resumed=await restored.enter(check);assert.equal(restored.interval,250);
  restored.backoff(60000,resumed,{extend:false});assert.equal(restored.interval,350);
});
test('an explicit server Retry-After remains authoritative and is labeled correctly',async()=>{
  const time=clock(),gate=new RequestGate(0,time),http=new FastHttp(gate,check,{requests:0},async()=>new Response('',{status:429,headers:{'Retry-After':'240'}}));
  await assert.rejects(http.get('https://www.producthunt.com/categories/productivity','category'),e=>e.retryAfter===240000 && e.waitSource==='server');
  assert.equal(gate.blockedUntil,240000);
  assert.equal(hasRetryAfter('nonsense'),false);assert.equal(hasRetryAfter('240'),true);assert.equal(hasRetryAfter('Wed, 21 Oct 2026 10:00:20 GMT'),true);
});
