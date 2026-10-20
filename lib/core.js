import {localizedError} from './i18n.js';
export const VERSION = '1.0.0';
export const CHUNK_SIZE = 50;

export function phUrl(value, base = 'https://www.producthunt.com') {
  if(typeof value!=='string' || !value.trim())return null;
  try {
    const u = new URL(value, base);
    if (u.protocol !== 'https:' || !['www.producthunt.com', 'producthunt.com'].includes(u.hostname) || u.username || u.password || u.port) return null;
    u.hostname = 'www.producthunt.com';
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (key === 'ref' || key.startsWith('utm_')) u.searchParams.delete(key);
    return u.href;
  } catch { return null; }
}

export function categoryUrl(value) {
  const safe = phUrl(value);
  if (!safe) throw localizedError('error.domain');
  const u = new URL(safe);
  if (!/^\/categories\/[^/]+(?:\/all)?\/?$/.test(u.pathname)) throw localizedError('error.categoryUrl');
  u.pathname = u.pathname.replace(/\/$/, '');
  u.searchParams.delete('page');
  return u.href;
}

export function pageNumber(url) { return Math.max(1, Number(new URL(url).searchParams.get('page')) || 1); }
export function folderName(value) {
  const text = String(value || 'category').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\.{2,}/g, '-').replace(/[.\s]+$/g, '').trim().slice(0,100);
  return !text || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(text) ? 'category' : text;
}

export function uniqueBy(items, key = 'url') {
  const map = new Map();
  for (const item of items || []) {
    const id = typeof key === 'function' ? key(item) : item[key];
    if (id != null) map.set(id, {...map.get(id), ...item});
  }
  return [...map.values()];
}

export function mergeProduct(old, incoming) {
  if (!old) return incoming;
  const merged = {...old};
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined && value !== '') merged[key] = value;
  }
  for (const key of ['reviews', 'comments', 'launches']) {
    if (old[key] || incoming[key]) merged[key] = uniqueBy([...(old[key] || []), ...(incoming[key] || [])], key === 'launches' ? 'url' : 'id');
  }
  merged.source_urls = [...new Set([...(old.source_urls || []), ...(incoming.source_urls || [])])];
  return merged;
}

export function sortProducts(products, order = 'category') {
  const field = {rating: 'rating_average', ratings: 'rating_count', reviews: 'review_count', votes: 'upvotes_count', name: 'name', category: 'category_position'}[order] || 'category_position';
  return [...products].sort((a,b) => {
    const x = a[field], y = b[field];
    const xm = x === null || x === undefined, ym = y === null || y === undefined;
    if (xm !== ym) return xm ? 1 : -1;
    if (!xm && !ym && x !== y) return field === 'name' ? String(x).localeCompare(String(y)) : field === 'category_position' ? x-y : y-x;
    return (a.category_position ?? Infinity) - (b.category_position ?? Infinity) || a.slug.localeCompare(b.slug);
  });
}

export function metrics(product) {
  const launches = uniqueBy(product.launches || []);
  const complete = product.coverage?.launches?.complete === true;
  const sum = field => launches.reduce((n,l) => n + (typeof l[field] === 'number' ? l[field] : 0), 0);
  return {...product,
    upvotes_count: complete && launches.every(l => typeof l.upvotes_count === 'number') ? sum('upvotes_count') : null,
    upvotes_observed: sum('upvotes_count'),
    upvotes_scope: 'sum_of_collected_launch_points_not_unique_voters',
    launch_comments_count: complete && launches.every(l => typeof l.comments_count === 'number') ? sum('comments_count') : null,
    reviews_collected: (product.reviews || []).length,
    comments_collected: (product.comments || []).length
  };
}

export function summary(product) {
  return Object.fromEntries(['slug','name','url','tagline','category_position','rating_average','rating_displayed','rating_count','review_count','upvotes_count','upvotes_observed','launch_comments_count','reviews_collected','comments_collected','state'].map(k=>[k, product[k] ?? null]));
}

export function coverage(job, products) {
  const count = products.length;
  const reported = job.category?.reported_products ?? null;
  const missing = reported === null ? null : Math.max(0, reported-count);
  const allDetails = products.every(p=>p.state === 'complete');
  const allRequested = products.every(p=>Object.values(p.coverage || {}).every(c=>c.requested === false || c.complete === true));
  return {
    category_pagination_exhausted: job.category_exhausted === true,
    reported_products_at_start: job.category?.reported_products_initial ?? reported,
    reported_products_latest: reported,
    unique_products: count,
    missing_against_reported: missing,
    extra_against_reported: reported===null ? null : Math.max(0,count-reported),
    sample_limit: job.options.maxProducts || null,
    complete: job.category_exhausted === true && reported!==null && count===reported && allDetails && allRequested && !job.options.maxProducts,
    products_complete: products.filter(p=>p.state === 'complete').length,
    products_partial: products.filter(p=>p.state === 'partial').length,
    products_failed: products.filter(p=>p.state === 'error').length,
    products_pending: products.filter(p=>!['complete','partial','error'].includes(p.state)).length,
    website_is_live: true,
    notice: 'Counts can change during a long export. Missing data is null, never an invented zero. Product Hunt launch points are separate from star ratings.'
  };
}

export function json(value) { return JSON.stringify(value, null, 2) + '\n'; }
export function runId() { return new Date().toISOString().replace(/[:.]/g,'-') + '-' + crypto.randomUUID().slice(0,8); }
