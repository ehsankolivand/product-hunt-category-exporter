import {localizedError} from './i18n.js';
import {summary} from './core.js';
let openPromise;
function open() {
  return openPromise ||= new Promise((resolve,reject)=>{
    const request = indexedDB.open('product-hunt-category-exporter', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('jobs', {keyPath:'id'});
      const products = db.createObjectStore('products', {keyPath:['job_id','slug']});
      products.createIndex('job_id', 'job_id');
      db.createObjectStore('handles');
    };
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>reject(request.error);
    request.onblocked = ()=>reject(localizedError('error.dbBlocked'));
  });
}
async function transaction(stores, mode, action) {
  const db = await open();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(stores,mode);
    let output;
    try { output = action(tx); } catch(e) { tx.abort(); reject(e); return; }
    tx.oncomplete=()=>resolve(typeof output === 'function' ? output() : output);
    tx.onerror=()=>reject(tx.error || localizedError('error.dbSave'));
    tx.onabort=()=>reject(tx.error || localizedError('error.dbAbort'));
  });
}
export const db = {
  async jobs() { return transaction(['jobs'],'readonly',tx=>{const q=tx.objectStore('jobs').getAll();return ()=>q.result;}); },
  async job(id) { return transaction(['jobs'],'readonly',tx=>{const q=tx.objectStore('jobs').get(id);return ()=>q.result;}); },
  async saveJob(job) { job.updated_at=new Date().toISOString(); return transaction(['jobs'],'readwrite',tx=>tx.objectStore('jobs').put(job)); },
  async products(id) { return transaction(['products'],'readonly',tx=>{const q=tx.objectStore('products').index('job_id').getAll(id);return ()=>q.result;}); },
  async records(id,slugs) { return transaction(['products'],'readonly',tx=>{const requests=slugs.map(slug=>tx.objectStore('products').get([id,slug]));return ()=>requests.map(q=>q.result).filter(Boolean);}); },
  async summaries(id) {return transaction(['products'],'readonly',tx=>{const rows=[],q=tx.objectStore('products').index('job_id').openCursor(IDBKeyRange.only(id));q.onsuccess=()=>{const c=q.result;if(c){rows.push({...summary(c.value),coverage:c.value.coverage});c.continue();}};return ()=>rows;});},
  async product(id,slug) { return transaction(['products'],'readonly',tx=>{const q=tx.objectStore('products').get([id,slug]);return ()=>q.result;}); },
  async commit(job, products=[]) {
    job.updated_at=new Date().toISOString();
    return transaction(['jobs','products'],'readwrite',tx=>{
      tx.objectStore('jobs').put(job);
      for (const p of products) tx.objectStore('products').put({...p,job_id:job.id});
    });
  },
  async saveProduct(id,p) { return transaction(['products'],'readwrite',tx=>tx.objectStore('products').put({...p,job_id:id})); },
  async handle(id) { return transaction(['handles'],'readonly',tx=>{const q=tx.objectStore('handles').get(id);return ()=>q.result;}); },
  async saveHandle(id, handle) { return transaction(['handles'],'readwrite',tx=>tx.objectStore('handles').put(handle,id)); }
};
