// Keep message IDs with saved jobs so changing language also translates their logs.
export const messages = {
  en: {
    'app.title': 'Product Hunt · Category Exporter',
    'app.subtitle': 'Concurrent collection with adaptive pacing',
    'app.local': 'Saved on your device',
    'app.language': 'Language',
    'intro.eyebrow': 'One category, one organized collection',
    'intro.title': 'Collect products in one place.',
    'intro.description': 'Descriptions, ratings and user feedback, in JSON files of up to 50 products.',
    'setup.title': 'New collection',
    'setup.url': 'Category URL',
    'setup.urlHint': 'Starts from page one, even if you are on page three. Filters and sorting in the URL are preserved.',
    'setup.noCategory': 'No category selected yet',
    'setup.invalidUrl': 'Enter a valid category URL.',
    'setup.mode': 'Collection mode',
    'setup.full': 'Fast and complete: all reviews and comments',
    'setup.catalog': 'Quick catalog: descriptions and ratings, without review text',
    'setup.modeHint': 'All reviews and comments are preserved. Speed depends on their number and the website’s limits.',
    'setup.catalogHint': 'All products with descriptions and ratings. Review text and launch votes are omitted in this mode.',
    'setup.settings': 'Collection settings',
    'setup.reviews': 'Full review text and user ratings',
    'setup.comments': 'Launch comments and replies (slower)',
    'setup.maxProducts': 'Maximum products; 0 means all',
    'setup.concurrency': 'Concurrent requests',
    'setup.delay': 'Minimum request interval (seconds)',
    'setup.delayHint': 'The first rate limit only pauses requests. If resuming is also rate-limited, the interval increases by just 0.1 seconds.',
    'setup.maxReviews': 'Maximum reviews per product; 0 means all',
    'setup.maxComments': 'Maximum comments per launch; 0 means all',
    'setup.startFolder': 'Choose folder and collect',
    'setup.start': 'Collect and save in extension',
    'setup.folderHint': 'A folder is created for each category. You can also download a ZIP later without choosing a folder.',
    'history.title': 'Previous collections',
    'history.empty': 'No collections started yet.',
    'history.collection': 'Collection',
    'history.entry': '{count} products · {status} · {date}',
    'progress.ready': 'Ready to start',
    'progress.choose': 'Choose a category',
    'progress.category': 'Category',
    'progress.initial': 'Open a Product Hunt category page and click the extension icon.',
    'progress.label': 'Collection progress',
    'progress.catalog': 'Quick catalog · descriptions and ratings',
    'progress.stage1': 'Stage 1 of 2 · product list',
    'progress.stage2': 'Stage 2 of 2 · descriptions and reviews',
    'progress.continue': 'Ready to resume',
    'progress.found': 'products found',
    'progress.processed': 'products processed',
    'progress.reviews': 'user reviews',
    'progress.comments': 'launch comments',
    'progress.coverage': '{found} of {total} reported products · {pages} category pages',
    'progress.pages': '{pages} category pages collected',
    'progress.partial': 'The export is usable. Missing data and its reasons are listed in manifest.json and each product’s coverage.',
    'progress.speed': '{http} direct pages · {browser} browser pages · {concurrency} concurrent requests',
    'progress.interval': ' · request interval {seconds} seconds',
    'progress.wait': ' · resuming in {seconds} seconds',
    'progress.countdown': 'Temporary pause: {seconds} seconds remaining; queued requests are paused.',
    'progress.resuming': 'Pause ended; trying to resume collection…',
    'progress.resume': 'Resume collection',
    'progress.pause': 'Pause',
    'progress.worker': 'Show collection page',
    'progress.retry': 'Retry incomplete items',
    'progress.keepOpen': 'Keep this page open. Closing it, putting the device to sleep or losing internet stops collection. Saved data can be resumed.',
    'progress.interrupted': 'The previous collection was interrupted. Resume from the last save.',
    'progress.pausing': 'Pausing and saving the latest data…',
    'export.title': 'Export files',
    'export.chunk': '50 products per file',
    'export.sort': 'Sort by',
    'export.category': 'Category order',
    'export.rating': 'Highest average rating',
    'export.ratings': 'Most ratings',
    'export.reviews': 'Most reviews',
    'export.votes': 'Most launch votes',
    'export.name': 'Product name',
    'export.zip': 'Download ZIP',
    'export.folder': 'Save to folder',
    'export.note': 'Star ratings and launch votes are stored separately. Unavailable values are shown as “—”.',
    'export.saved': 'Saved: {path}',
    'export.folderFailed': 'Your data is safe in the extension, but saving to the folder failed: {error}',
    'export.preparing': 'Preparing ZIP file…',
    'export.ready': 'The ZIP file is ready to save.',
    'table.title': 'Collected products',
    'table.search': 'Search products',
    'table.placeholder': 'Search product names…',
    'table.product': 'Product',
    'table.average': 'Average',
    'table.ratings': 'Ratings',
    'table.votes': 'Votes',
    'table.status': 'Status',
    'table.initial': 'Products will appear here after collection starts.',
    'table.empty': 'No products to display.',
    'table.note': 'Showing {shown} of {total} products. The export includes all collected products.',
    'logs.title': 'Collection log and incomplete items',
    'app.footer': 'No data sent to another server · No API key required',
    'status.ready': 'Ready', 'status.running': 'Collecting', 'status.paused': 'Paused',
    'status.complete': 'Complete', 'status.partial': 'Has incomplete items',
    'status.blocked': 'Page needs attention', 'status.error': 'Stopped with error',
    'state.queued': 'Queued', 'state.collecting': 'Collecting', 'state.complete': 'Complete',
    'state.partial': 'Incomplete', 'state.error': 'Error',
    'error.limits': 'Limits must be whole numbers greater than or equal to zero.',
    'error.delay': 'The request interval must be between 0.1 and 30 seconds.',
    'error.concurrency': 'Concurrent requests must be between 1 and 6.',
    'error.install': 'To start, load the extension folder in Chrome at chrome://extensions.',
    'error.domain': 'The URL must belong to producthunt.com.',
    'error.categoryUrl': 'Open a category page, such as /categories/productivity.',
    'error.dbBlocked': 'The database is open in another window. Close older extension windows.',
    'error.dbSave': 'Saving data failed.', 'error.dbAbort': 'Saving data was cancelled.',
    'error.zipCapacity': 'The export exceeds standard ZIP capacity. Choose Save to folder.',
    'error.zipLarge': 'The export is too large. Choose Save to folder.',
    'error.folderPermission': 'Folder permission was lost. Choose the folder again.',
    'error.paused': 'Collection paused; your data has been saved.',
    'error.noResponse': 'The page did not respond to the collector.',
    'error.siteBlocked': 'The website blocked the request or requires human verification. Check the collection page.',
    'error.unavailable': 'The page was removed or is unavailable: {url}',
    'error.foreignUrl': 'Pages outside Product Hunt cannot be collected.',
    'rate.server': 'Pause requested by the website',
    'rate.local': 'Precautionary extension pause; the website did not specify a duration',
    'rate.increased': 'Resuming was rate-limited; the interval increased by one step',
    'rate.unchanged': 'The request interval did not change',
    'rate.message': '{reason}: {wait} seconds. {pacing}: {interval} seconds.',
    'error.rateLimit': 'The website is still rate-limiting after several attempts. Your data and the resume deadline have been saved.',
    'runner.browserFallback': 'Pages that need a browser are collected concurrently in separate tabs.',
    'error.redirect': 'The page redirected outside Product Hunt; collection stopped.',
    'error.loadTimeout': 'The page took more than 45 seconds to load.',
    'error.notReady': 'The expected page content did not load.',
    'error.pageMismatch': 'The collected page does not match the requested page.',
    'runner.retryPage': 'The page was incomplete; retry {attempt} of 3.',
    'error.categoryMismatch': 'The page category does not match the selected URL. No data from another category was saved.',
    'error.browseMismatch': 'The full product list points to a different category.',
    'error.noProducts': 'Product cards were not found. The page structure may have changed or the list has not loaded yet.',
    'error.repeatedPage': 'The website repeated the previous page; collection stopped to avoid an incomplete export.',
    'error.tooManyPages': 'The page count became unusually high; collection stopped.',
    'runner.category': 'Stage 1 of 2: collecting {pages} pages concurrently — {found} products saved',
    'error.launchPages': 'Launch pagination exceeded the expected limit.',
    'error.repeatedReviews': 'A review page was repeated.',
    'error.reviewPages': 'Review pagination became unusually large.',
    'runner.comments': 'Stage 2 of 2: comments for {product} — {launch}',
    'runner.detail': 'Stage 2 of 2: {index} of {total} — {product}',
    'error.noProduct': 'The main product information was not found.',
    'runner.partialProduct': '{product}: some data could not be collected; it is marked in the export.',
    'error.active': 'Pause the current collection first.',
    'error.locked': 'Collection is active in another window. Continue in that window.',
    'runner.complete': 'Collection complete; your files are ready.',
    'runner.partial': 'Collection finished; incomplete items are marked in the export report.',
    'error.temporaryLimit': 'The website temporarily rate-limited requests.',
    'error.fetchDomain': 'Only Product Hunt HTTPS URLs can be fetched.',
    'error.dashboardOnly': 'This request must come from the exporter dashboard.',
    'error.backgroundTimeout': 'Background HTML request timed out.',
    'error.backgroundResponse': 'Background HTML request returned no response.'
  },
  fa: {
    'app.title': 'Product Hunt · خروجی دسته‌بندی',
    'app.subtitle': 'دریافت هم‌زمان با سرعت تطبیقی',
    'app.local': 'ذخیره روی دستگاه خودت', 'app.language': 'زبان',
    'intro.eyebrow': 'یک دسته‌بندی، یک مجموعهٔ مرتب',
    'intro.title': 'محصول‌ها را یک‌جا جمع کن.',
    'intro.description': 'توضیحات، امتیازها و حرف کاربران؛ در فایل‌های JSON حداکثر ۵۰تایی.',
    'setup.title': 'دریافت جدید', 'setup.url': 'آدرس دسته‌بندی',
    'setup.urlHint': 'دریافت از صفحهٔ اول شروع می‌شود؛ حتی اگر الان در صفحهٔ سوم باشی. فیلتر و ترتیبِ موجود در آدرس حفظ می‌شود.',
    'setup.noCategory': 'دسته‌بندی هنوز انتخاب نشده', 'setup.invalidUrl': 'آدرس معتبر یک دسته‌بندی را وارد کن.',
    'setup.mode': 'نوع دریافت',
    'setup.full': 'سریع و کامل؛ همهٔ نظرات و دیدگاه‌ها',
    'setup.catalog': 'فهرست فوری؛ توضیحات و امتیازها، بدون متن نظرات',
    'setup.modeHint': 'همهٔ نظرات و دیدگاه‌ها حفظ می‌شوند؛ سرعت به تعداد آن‌ها و محدودیت سایت بستگی دارد.',
    'setup.catalogHint': 'همهٔ محصولات با توضیحات و امتیازها؛ متن نظرات و رأی معرفی‌ها در این حالت دریافت نمی‌شود.',
    'setup.settings': 'تنظیمات دریافت', 'setup.reviews': 'متن کامل نظرات و امتیاز کاربران',
    'setup.comments': 'دیدگاه‌ها و پاسخ‌های معرفی‌ها (کندتر)',
    'setup.maxProducts': 'حداکثر محصول؛ صفر یعنی همه', 'setup.concurrency': 'تعداد دریافت هم‌زمان',
    'setup.delay': 'حداقل فاصلهٔ درخواست‌ها (ثانیه)',
    'setup.delayHint': 'محدودیت اول فقط مکث می‌دهد. اگر شروع دوباره هم محدود شود، فاصله فقط ۰٫۱ ثانیه بیشتر می‌شود.',
    'setup.maxReviews': 'حداکثر نظر هر محصول؛ صفر یعنی همه',
    'setup.maxComments': 'حداکثر دیدگاه هر معرفی؛ صفر یعنی همه',
    'setup.startFolder': 'انتخاب پوشه و دریافت', 'setup.start': 'دریافت و ذخیره در افزونه',
    'setup.folderHint': 'پوشهٔ هر دسته‌بندی خودکار ساخته می‌شود. بدون انتخاب پوشه هم می‌توانی بعداً ZIP بگیری.',
    'history.title': 'دریافت‌های قبلی', 'history.empty': 'هنوز دریافتی شروع نشده.',
    'history.collection': 'دریافت', 'history.entry': '{count} محصول · {status} · {date}',
    'progress.ready': 'آمادهٔ شروع', 'progress.choose': 'دسته‌بندی را انتخاب کن',
    'progress.category': 'دسته‌بندی',
    'progress.initial': 'صفحهٔ یک دسته‌بندی را در پروداکت هانت باز کن و روی آیکن افزونه بزن.',
    'progress.label': 'پیشرفت دریافت', 'progress.catalog': 'فهرست فوری · توضیحات و امتیازها',
    'progress.stage1': 'مرحلهٔ ۱ از ۲ · فهرست محصولات', 'progress.stage2': 'مرحلهٔ ۲ از ۲ · توضیحات و نظرها',
    'progress.continue': 'آمادهٔ ادامه', 'progress.found': 'محصول پیدا شد',
    'progress.processed': 'محصول بررسی شد', 'progress.reviews': 'نظر کاربران', 'progress.comments': 'دیدگاه معرفی‌ها',
    'progress.coverage': '{found} محصول از {total} محصول اعلام‌شده · {pages} صفحهٔ فهرست',
    'progress.pages': '{pages} صفحهٔ فهرست دریافت شده',
    'progress.partial': 'خروجی قابل‌استفاده است. تعداد داده‌های ناقص و علت آن‌ها در manifest.json و coverage هر محصول آمده است.',
    'progress.speed': '{http} صفحه مستقیم · {browser} صفحه مرورگری · {concurrency} دریافت هم‌زمان',
    'progress.interval': ' · فاصلهٔ بین دریافت‌ها {seconds} ثانیه', 'progress.wait': ' · ادامه تا {seconds} ثانیهٔ دیگر',
    'progress.countdown': 'مکث موقت: {seconds} ثانیه باقی مانده؛ درخواست‌های منتظر متوقف‌اند.',
    'progress.resuming': 'مکث تمام شد؛ در حال تلاش برای ادامهٔ دریافت…',
    'progress.resume': 'ادامهٔ دریافت', 'progress.pause': 'توقف', 'progress.worker': 'نمایش صفحهٔ دریافت',
    'progress.retry': 'تلاش دوبارهٔ موارد ناقص',
    'progress.keepOpen': 'این صفحه باز بماند. بستن صفحه، خواب دستگاه یا قطع اینترنت، دریافت را متوقف می‌کند؛ اطلاعات ثبت‌شده باقی می‌ماند و قابل‌ادامه است.',
    'progress.interrupted': 'دریافت قبلی قطع شده؛ از آخرین ذخیره ادامه بده.', 'progress.pausing': 'در حال توقف و ثبت آخرین اطلاعات…',
    'export.title': 'فایل‌های خروجی', 'export.chunk': '۵۰ محصول در هر فایل', 'export.sort': 'مرتب‌سازی',
    'export.category': 'ترتیب دسته‌بندی', 'export.rating': 'بیشترین میانگین امتیاز', 'export.ratings': 'بیشترین تعداد امتیاز',
    'export.reviews': 'بیشترین تعداد نظر', 'export.votes': 'بیشترین رأی معرفی‌ها', 'export.name': 'نام محصول',
    'export.zip': 'دریافت ZIP', 'export.folder': 'ذخیره در پوشه',
    'export.note': 'امتیاز ستاره‌ای و رأی معرفی‌ها، جدا ذخیره می‌شوند. مقدار ناموجود با «—» نمایش داده می‌شود.',
    'export.saved': 'ذخیره شد: {path}',
    'export.folderFailed': 'اطلاعات در افزونه محفوظ است، اما ذخیره در پوشه انجام نشد: {error}',
    'export.preparing': 'در حال آماده‌سازی فایل ZIP…', 'export.ready': 'فایل ZIP برای ذخیره آماده شد.',
    'table.title': 'محصول‌های جمع‌آوری‌شده', 'table.search': 'جستجوی محصول', 'table.placeholder': 'جستجو در نام محصول…',
    'table.product': 'محصول', 'table.average': 'میانگین', 'table.ratings': 'تعداد امتیاز', 'table.votes': 'رأی‌ها',
    'table.status': 'وضعیت', 'table.initial': 'محصول‌ها بعد از شروع اینجا نمایش داده می‌شوند.',
    'table.empty': 'محصولی برای نمایش پیدا نشد.',
    'table.note': 'نمایش {shown} محصول از {total}؛ خروجی همهٔ محصول‌های جمع‌آوری‌شده را شامل می‌شود.',
    'logs.title': 'گزارش دریافت و موارد ناقص', 'app.footer': 'بدون ارسال اطلاعات به سرور دیگر · بدون نیاز به کلید API',
    'status.ready': 'آماده', 'status.running': 'در حال دریافت', 'status.paused': 'متوقف',
    'status.complete': 'کامل', 'status.partial': 'دارای موارد ناقص', 'status.blocked': 'نیاز به بررسی صفحه', 'status.error': 'متوقف با خطا',
    'state.queued': 'در صف', 'state.collecting': 'در حال دریافت', 'state.complete': 'کامل', 'state.partial': 'ناقص', 'state.error': 'خطا',
    'error.limits': 'محدودیت‌ها باید عدد صحیح و صفر یا بیشتر باشند.',
    'error.delay': 'فاصلهٔ درخواست‌ها باید بین ۰٫۱ تا ۳۰ ثانیه باشد.', 'error.concurrency': 'تعداد دریافت هم‌زمان باید بین ۱ تا ۶ باشد.',
    'error.install': 'برای شروع، پوشهٔ افزونه را از صفحهٔ chrome://extensions در کروم بارگذاری کن.',
    'error.domain': 'آدرس باید متعلق به producthunt.com باشد.',
    'error.categoryUrl': 'صفحهٔ یک دسته‌بندی را باز کن؛ مثلاً /categories/productivity',
    'error.dbBlocked': 'پایگاه داده در پنجرهٔ دیگری باز است. پنجره‌های قدیمی افزونه را ببند.',
    'error.dbSave': 'ذخیرهٔ اطلاعات ناموفق بود.', 'error.dbAbort': 'ذخیرهٔ اطلاعات لغو شد.',
    'error.zipCapacity': 'حجم خروجی از ظرفیت ZIP معمولی بیشتر است؛ ذخیره در پوشه را انتخاب کن.',
    'error.zipLarge': 'خروجی بسیار بزرگ است؛ ذخیره در پوشه را انتخاب کن.',
    'error.folderPermission': 'دسترسی به پوشه قطع شده؛ دوباره پوشه را انتخاب کن.',
    'error.paused': 'دریافت متوقف شد؛ اطلاعات ذخیره شده است.', 'error.noResponse': 'صفحه پاسخی به ابزار دریافت نداد.',
    'error.siteBlocked': 'سایت درخواست را متوقف کرده یا تأیید انسانی می‌خواهد. صفحهٔ دریافت را بررسی کن.',
    'error.unavailable': 'صفحه حذف شده یا در دسترس نیست: {url}',
    'error.foreignUrl': 'مسیر خارج از پروداکت هانت دریافت نمی‌شود.',
    'rate.server': 'مکث درخواستی سایت', 'rate.local': 'مکث احتیاطی افزونه؛ سایت مدت مشخصی نداده',
    'rate.increased': 'شروع دوباره محدود شد؛ فاصله فقط یک پله بیشتر شد', 'rate.unchanged': 'فاصلهٔ دریافت تغییر نکرد',
    'rate.message': '{reason}: {wait} ثانیه. {pacing}: {interval} ثانیه.',
    'error.rateLimit': 'محدودیت سایت بعد از چند تلاش ادامه دارد. اطلاعات محفوظ است؛ زمان مجاز ادامه هم ذخیره شد.',
    'runner.browserFallback': 'برای صفحه‌های نیازمند مرورگر، دریافت هم‌زمان در تب‌های جدا انجام می‌شود.',
    'error.redirect': 'صفحه به خارج از پروداکت هانت منتقل شد؛ دریافت متوقف شد.',
    'error.loadTimeout': 'بارگذاری صفحه بیش از ۴۵ ثانیه طول کشید.', 'error.notReady': 'محتوای مورد انتظار صفحه بارگذاری نشد.',
    'error.pageMismatch': 'صفحهٔ دریافت‌شده با صفحهٔ درخواستی یکسان نیست.', 'runner.retryPage': 'صفحه کامل نشد؛ تلاش دوباره {attempt} از ۳.',
    'error.categoryMismatch': 'دسته‌بندی صفحه با آدرس انتخاب‌شده یکسان نیست؛ هیچ داده‌ای از دستهٔ دیگر ذخیره نشد.',
    'error.browseMismatch': 'مسیر فهرست کامل به دستهٔ دیگری اشاره می‌کند.',
    'error.noProducts': 'کارت محصولات پیدا نشد. ساختار صفحه تغییر کرده یا فهرست هنوز بارگذاری نشده است.',
    'error.repeatedPage': 'سایت همان صفحهٔ قبلی را تکرار کرد؛ برای جلوگیری از خروجی ناقص دریافت متوقف شد.',
    'error.tooManyPages': 'تعداد صفحه‌ها غیرعادی شد؛ دریافت متوقف شد.',
    'runner.category': 'مرحلهٔ ۱ از ۲: دریافت {pages} صفحه هم‌زمان — {found} محصول ثبت شده',
    'error.launchPages': 'صفحه‌بندی معرفی‌ها از حد انتظار بیشتر شد.', 'error.repeatedReviews': 'صفحهٔ نظرات تکرار شد.',
    'error.reviewPages': 'صفحه‌بندی نظرات غیرعادی شد.', 'runner.comments': 'مرحلهٔ ۲ از ۲: دیدگاه‌های {product} — {launch}',
    'runner.detail': 'مرحلهٔ ۲ از ۲: {index} از {total} — {product}', 'error.noProduct': 'اطلاعات اصلی محصول پیدا نشد.',
    'runner.partialProduct': '{product}: بخشی از داده‌ها دریافت نشد؛ در خروجی مشخص می‌شود.',
    'error.active': 'ابتدا دریافت جاری را متوقف کن.', 'error.locked': 'دریافت در پنجرهٔ دیگری فعال است؛ همان پنجره را ادامه بده.',
    'runner.complete': 'دریافت کامل شد؛ فایل‌ها آماده‌اند.', 'runner.partial': 'دریافت تمام شد؛ موارد ناقص در گزارش خروجی مشخص شده‌اند.',
    'error.temporaryLimit': 'سایت محدودیت موقت درخواست گذاشت.',
    'error.fetchDomain': 'فقط آدرس‌های HTTPS پروداکت هانت قابل دریافت‌اند.',
    'error.dashboardOnly': 'این درخواست باید از داشبورد افزونه ارسال شود.',
    'error.backgroundTimeout': 'مهلت دریافت HTML در پس‌زمینه تمام شد.', 'error.backgroundResponse': 'دریافت HTML در پس‌زمینه پاسخی نداد.'
  }
};

const storageKey = 'ph_export_language';
let language = 'fa';
export const locale = () => language === 'fa' ? 'fa-IR' : 'en-US';
export const getLanguage = () => language;
export const formatNumber = value => Number(value || 0).toLocaleString(locale());
export const message = (key, params = {}) => ({key, params});
export function t(key, params = {}) {
  const template = messages[language][key] ?? messages.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params[name];
    if (value === undefined) return match;
    if (typeof value === 'number') return formatNumber(value);
    if (value && typeof value === 'object' && value.key) return t(value.key, value.params);
    return String(value);
  });
}
export function translate(value, descriptor) {
  if (descriptor?.key) return t(descriptor.key, descriptor.params);
  // Older saved jobs did not include message IDs. Translate known fixed messages too.
  const key = Object.keys(messages.fa).find(key => messages.fa[key] === value || messages.en[key] === value);
  return key ? t(key) : value;
}
export function localizedError(key, params = {}, ErrorType = Error) {
  const error = new ErrorType(t(key, params));
  error.i18n = message(key, params);
  return error;
}
export function setLanguage(value, {persist = true} = {}) {
  if (!Object.hasOwn(messages, value)) return false;
  language = value;
  if (persist) try { globalThis.localStorage?.setItem(storageKey, value); } catch { /* Storage can be disabled. */ }
  if (globalThis.document) {
    document.documentElement.lang = value;
    document.documentElement.dir = value === 'fa' ? 'rtl' : 'ltr';
  }
  return true;
}
export function initLanguage() {
  let saved;
  try { saved = globalThis.localStorage?.getItem(storageKey); } catch { /* Use the browser language. */ }
  const browserLanguage = globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || 'en';
  setLanguage(Object.hasOwn(messages, saved) ? saved : /^fa(?:-|$)/i.test(browserLanguage) ? 'fa' : 'en', {persist:false});
  return language;
}
export function applyTranslations(root = document) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n, JSON.parse(element.dataset.i18nParams || '{}'));
  }
  for (const [attribute, dataName] of [['placeholder','i18nPlaceholder'], ['aria-label','i18nAriaLabel']]) {
    for (const element of root.querySelectorAll(`[data-${dataName.replace(/[A-Z]/g, c => '-'+c.toLowerCase())}]`)) {
      element.setAttribute(attribute, t(element.dataset[dataName]));
    }
  }
}
