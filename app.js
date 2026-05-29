/* =====================================================================
   قاعدة بيانات القرآن الكريم — منطق التطبيق (app.js)
   مقسّم إلى دوال صغيرة واضحة المسؤولية:
   - تحميل البيانات (fetch من ملف JSON خارجي)
   - بناء الصفوف (createRow / createCell / createBadge)
   - الأداء (DocumentFragment عند البناء)
   - البحث والتصفية والفرز (searchData / filterData / sortData)
   - الإحصائيات (updateStats)
   - التفضيلات (LocalStorage) ولوحة الإعدادات الشاملة
   ===================================================================== */

'use strict';

/* ---------------------------------------------------------------------
   1) تعريف الأعمدة — مصدر واحد للحقيقة يقود الجدول والفرز والتصفية والتصدير
   --------------------------------------------------------------------- */
const COLUMNS = [
    { key: 'name',                label: 'اسم السورة',            icon: 'fa-book-quran',   type: 'text', defaultVisible: true },
    { key: 'number',              label: 'رقمها',                 icon: 'fa-hashtag',      type: 'num',  defaultVisible: true },
    { key: 'revelationOrder',     label: 'ترتيب النزول',          icon: 'fa-arrow-down-1-9', type: 'num', defaultVisible: true },
    { key: 'verses',              label: 'الآيات',                icon: 'fa-list-ol',      type: 'num',  defaultVisible: true },
    { key: 'words',               label: 'الكلمات',               icon: 'fa-font',         type: 'num',  defaultVisible: true },
    { key: 'letters',             label: 'الحروف',                icon: 'fa-spell-check',  type: 'num',  defaultVisible: true },
    { key: 'type',                label: 'التصنيف',               icon: 'fa-kaaba',        type: 'text', defaultVisible: true },
    { key: 'disconnectedLetters', label: 'حروف مقطعة',            icon: 'fa-puzzle-piece', type: 'text', defaultVisible: false },
    { key: 'sajdahs',             label: 'السجدات',               icon: 'fa-person-praying', type: 'num', defaultVisible: true },
    { key: 'allah',               label: 'ذكر «الله»',            icon: 'fa-mosque',       type: 'num',  defaultVisible: true },
    { key: 'firstWord',           label: 'أول كلمة',              icon: 'fa-quote-right',  type: 'text', defaultVisible: false },
    { key: 'lastWord',            label: 'آخر كلمة',              icon: 'fa-quote-left',   type: 'text', defaultVisible: false },
    { key: 'mostFrequentWord',    label: 'أكثر كلمة',             icon: 'fa-chart-simple', type: 'text', defaultVisible: false },
    { key: 'mostFrequentLetter',  label: 'أكثر حرف',              icon: 'fa-a',            type: 'text', defaultVisible: false },
    { key: 'allahNames',          label: 'أسماء الله المذكورة',   icon: 'fa-star-and-crescent', type: 'text', defaultVisible: false },
    { key: 'prophets',            label: 'الأنبياء المذكورون',    icon: 'fa-users',        type: 'text', defaultVisible: true },
    { key: 'numbers',             label: 'الأرقام المذكورة',      icon: 'fa-calculator',   type: 'text', defaultVisible: false },
    { key: 'colors',              label: 'الألوان المذكورة',      icon: 'fa-palette',      type: 'text', defaultVisible: false },
    { key: 'animals',             label: 'الحيوانات المذكورة',    icon: 'fa-dove',         type: 'text', defaultVisible: false },
    { key: 'longestVerse',        label: 'أطول آية',              icon: 'fa-maximize',     type: 'text', defaultVisible: false, verse: true },
    { key: 'shortestVerse',       label: 'أقصر آية',              icon: 'fa-minimize',     type: 'text', defaultVisible: false, verse: true },
    { key: 'avgWords',            label: 'متوسط الآية (كلمات)',   icon: 'fa-percent',      type: 'num',  defaultVisible: false },
    { key: 'avgLetters',          label: 'متوسط الآية (حروف)',    icon: 'fa-percent',      type: 'num',  defaultVisible: false },
    { key: 'uniqueLetters',       label: 'الحروف الفريدة',        icon: 'fa-fingerprint',  type: 'num',  defaultVisible: false },
    { key: 'mostCommonEndLetter', label: 'أكثر نهاية (حرف)',      icon: 'fa-flag-checkered', type: 'text', defaultVisible: false },
    { key: 'uniqueEndLetters',    label: 'نهايات فريدة',          icon: 'fa-fingerprint',  type: 'num',  defaultVisible: false },
    { key: 'mostCommonLastWord',  label: 'أكثر كلمة نهاية',       icon: 'fa-flag',         type: 'text', defaultVisible: false },
];

const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map(c => [c.key, c]));

/* ---------------------------------------------------------------------
   2) الحالة العامة للتطبيق
   --------------------------------------------------------------------- */
const state = {
    surahs: [],        // كل السور
    filtered: [],      // بعد البحث/التصفية/الفرز
    meta: {},
    sort: { key: null, asc: true },
    columnFilters: {}, // { key: value }
    settings: {},
    favorites: new Set(),
};

const PLACEHOLDER = 'ـــ';

/* ---------------------------------------------------------------------
   3) أدوات مساعدة صغيرة
   --------------------------------------------------------------------- */
function formatNumber(value) {
    return typeof value === 'number' ? value.toLocaleString('en-US') : value;
}

function cellText(surah, col) {
    let v = surah[col.key];
    if (v === undefined || v === null || v === '') return PLACEHOLDER;
    if (col.key === 'disconnectedLetters') return (v === 'لا') ? '0' : v;
    if (col.type === 'num' && typeof v === 'number') {
        return (col.key === 'avgWords' || col.key === 'avgLetters') ? v.toFixed(2) : formatNumber(v);
    }
    return v;
}

function toast(message) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------------------------------------------------------------------
   4) التفضيلات (LocalStorage)
   --------------------------------------------------------------------- */
const SETTINGS_KEY = 'quranSettings';
const FAV_KEY = 'quranFavorites';

function defaultSettings() {
    return {
        theme: 'light',
        motion: true,
        density: 'normal',
        fontSize: 11,
        favoritesOnly: false,
        lastSearch: '',
        visibleColumns: COLUMNS.filter(c => c.defaultVisible).map(c => c.key),
    };
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        state.settings = Object.assign(defaultSettings(), saved);
    } catch (e) {
        state.settings = defaultSettings();
    }
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function loadFavorites() {
    try {
        const arr = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
        state.favorites = new Set(arr);
    } catch (e) {
        state.favorites = new Set();
    }
}

function saveFavorites() {
    localStorage.setItem(FAV_KEY, JSON.stringify([...state.favorites]));
}

function isColumnVisible(key) {
    return state.settings.visibleColumns.includes(key);
}

function visibleColumns() {
    return COLUMNS.filter(c => isColumnVisible(c.key));
}

/* تطبيق التفضيلات على الصفحة (السمة، الحركة، الكثافة، حجم الخط) */
function applySettingsToDom() {
    const root = document.documentElement;
    root.setAttribute('data-theme', state.settings.theme);
    root.setAttribute('data-motion', state.settings.motion ? 'on' : 'off');
    root.setAttribute('data-density', state.settings.density);
    // حجم الخط يُطبَّق على الجدول كله لأن أحجام الخلايا نسبية (em)
    root.style.setProperty('--cell-font', state.settings.fontSize + 'px');
    syncThemeControls();
}

/* مزامنة زر الثيم والمفتاح في الإعدادات مع الحالة الحالية */
function syncThemeControls() {
    const dark = state.settings.theme === 'dark';
    const icon = document.querySelector('#btnTheme i');
    const label = document.getElementById('themeLabel');
    if (icon) icon.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    if (label) label.textContent = dark ? 'فاتح' : 'غامق';
    const btn = document.getElementById('btnTheme');
    if (btn) btn.classList.toggle('active', dark);
    const cb = document.getElementById('setTheme');
    if (cb) cb.checked = dark;
}

/* تبديل الوضع الفاتح/الغامق */
function setTheme(theme) {
    state.settings.theme = theme;
    applySettingsToDom();
    saveSettings();
}

/* ---------------------------------------------------------------------
   5) تحميل البيانات من ملف JSON خارجي
   --------------------------------------------------------------------- */
async function fetchData() {
    const res = await fetch('quran-data.json');
    if (!res.ok) throw new Error('تعذّر تحميل البيانات (' + res.status + ')');
    return res.json();
}

/* تحويل الصيغة العمودية { columns, data } إلى مصفوفة كائنات.
   يدعم أيضًا الصيغة القديمة { surahs: [...] } للتوافق. */
function normalizeData(raw) {
    if (Array.isArray(raw.surahs)) return raw.surahs;
    const cols = raw.columns;
    return raw.data.map(row => {
        const obj = {};
        cols.forEach((c, i) => { obj[c] = row[i]; });
        return obj;
    });
}

/* شريط تقدم بصري بسيط أثناء التحميل */
function runProgress(done) {
    const fill = document.getElementById('progressFill');
    if (!fill) { done(); return; }
    let p = 0;
    const iv = setInterval(() => {
        p += 12;
        fill.style.width = Math.min(p, 100) + '%';
        if (p >= 100) {
            clearInterval(iv);
            setTimeout(() => { fill.style.width = '0%'; done(); }, 250);
        }
    }, 60);
}

/* ---------------------------------------------------------------------
   6) بناء رأس الجدول
   --------------------------------------------------------------------- */
function renderHeader() {
    const tr = document.getElementById('headerRow');
    tr.innerHTML = '';

    // عمود التسلسل
    tr.appendChild(makeStaticTh('م', '40px', 'col-seq'));
    // عمود المفضلة
    tr.appendChild(makeStaticTh('★', '34px', 'col-fav'));

    visibleColumns().forEach(col => {
        const th = document.createElement('th');
        // ملاحظة: لا نضبط position:relative حتى لا نُلغِ تثبيت الرأس (sticky top)؛
        // فالعنصر sticky يصلح أصلًا كمرجع لأيقونة التصفية المطلقة.
        if (col.key === 'name') th.classList.add('col-name');

        const textSpan = document.createElement('span');
        textSpan.className = 'header-text';
        textSpan.innerHTML = `<i class="fa-solid ${col.icon}"></i> ${col.label}`;
        th.appendChild(textSpan);

        const sortInd = document.createElement('span');
        sortInd.className = 'sort-indicator';
        if (state.sort.key === col.key) sortInd.textContent = state.sort.asc ? '▲' : '▼';
        th.appendChild(sortInd);

        const filterIcon = document.createElement('span');
        filterIcon.className = 'filter-icon' + (state.columnFilters[col.key] ? ' filtered' : '');
        filterIcon.innerHTML = '&#x25BC;';
        filterIcon.addEventListener('click', e => { e.stopPropagation(); showFilterMenu(col, th); });
        th.appendChild(filterIcon);

        th.addEventListener('click', () => sortByKey(col.key));
        tr.appendChild(th);
    });
}

function makeStaticTh(label, width, className) {
    const th = document.createElement('th');
    th.textContent = label;
    th.style.width = width;
    th.style.cursor = 'default';
    if (className) th.className = className;
    return th;
}

/* ---------------------------------------------------------------------
   7) بناء الصفوف — createBadge / createCell / createRow + DocumentFragment
   --------------------------------------------------------------------- */
function createBadge(type) {
    const span = document.createElement('span');
    const makki = type === 'مكية';
    span.className = 'type-badge ' + (makki ? 'makki-badge' : 'madani-badge');
    span.innerHTML = `<i class="fa-solid ${makki ? 'fa-kaaba' : 'fa-moon'}"></i> ${type}`;
    return span;
}

function createCell(surah, col) {
    const td = document.createElement('td');
    if (col.key === 'type') {
        td.appendChild(createBadge(surah.type));
        return td;
    }
    const text = cellText(surah, col);
    if (col.verse) td.className = 'cell-verse';
    else if (col.type === 'text') td.classList.add('cell-tag');
    if (col.key === 'prophets' && text !== PLACEHOLDER) td.classList.add('cell-prophets');
    td.textContent = text;
    return td;
}

function createRow(surah, index) {
    const tr = document.createElement('tr');
    tr.className = surah.type === 'مكية' ? 'makki' : 'madani';

    // التسلسل
    const seq = document.createElement('td');
    seq.className = 'col-seq';
    seq.innerHTML = `<strong>${index + 1}</strong>`;
    tr.appendChild(seq);

    // المفضلة
    const favTd = document.createElement('td');
    favTd.className = 'col-fav';
    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn' + (state.favorites.has(surah.id) ? ' active' : '');
    favBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
    favBtn.title = 'إضافة إلى المفضلة';
    favBtn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(surah.id); });
    favTd.appendChild(favBtn);
    tr.appendChild(favTd);

    visibleColumns().forEach(col => {
        const cell = createCell(surah, col);
        if (col.key === 'name') {
            cell.classList.add('surah-name', 'col-name');
            cell.style.cursor = 'pointer';
            cell.title = 'عرض التفاصيل الكاملة';
            cell.addEventListener('click', () => openDetail(surah));
        }
        tr.appendChild(cell);
    });
    return tr;
}

/* رسم الجدول كاملًا باستخدام DocumentFragment لتقليل عمليات إعادة التدفق */
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const colSpan = visibleColumns().length + 2;

    if (state.filtered.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="${colSpan}">لا توجد نتائج مطابقة 🔍</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    state.filtered.forEach((surah, index) => fragment.appendChild(createRow(surah, index)));

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
    if (state.settings.motion) tbody.firstElementChild?.parentElement.classList.add('fade-in');
}

/* ---------------------------------------------------------------------
   8) البحث والتصفية والفرز
   --------------------------------------------------------------------- */
function searchData(list, term) {
    if (!term) return list;
    const t = term.toLowerCase();
    return list.filter(s =>
        s.name.toLowerCase().includes(t) ||
        String(s.number).includes(t) ||
        (s.prophets && s.prophets.toLowerCase().includes(t)) ||
        (s.allahNames && s.allahNames.toLowerCase().includes(t))
    );
}

function filterData(list) {
    return list.filter(s => {
        if (state.settings.favoritesOnly && !state.favorites.has(s.id)) return false;
        for (const key in state.columnFilters) {
            let v = s[key];
            if (v === undefined || v === null || v === '') v = PLACEHOLDER;
            if (String(v) !== String(state.columnFilters[key])) return false;
        }
        return true;
    });
}

function compareValues(a, b, asc) {
    if (typeof a === 'number' && typeof b === 'number') return asc ? a - b : b - a;
    const na = parseFloat(a), nb = parseFloat(b);
    const isNa = !isNaN(na) && /^\d/.test(a), isNb = !isNaN(nb) && /^\d/.test(b);
    if (isNa && isNb) return asc ? na - nb : nb - na;
    const sa = a || '', sb = b || '';
    return asc ? ('' + sa).localeCompare('' + sb, 'ar') : ('' + sb).localeCompare('' + sa, 'ar');
}

function sortData(list) {
    if (!state.sort.key) return list;
    const { key, asc } = state.sort;
    return [...list].sort((x, y) => compareValues(x[key], y[key], asc));
}

/* خط الأنابيب الموحّد: بحث ← تصفية ← فرز ← عرض ← إحصائيات */
function applyAll() {
    const term = document.getElementById('searchBox').value;
    state.settings.lastSearch = term;
    let list = searchData(state.surahs, term);
    list = filterData(list);
    list = sortData(list);
    state.filtered = list;
    renderTable();
    updateStats();
    saveSettings();
}

function sortByKey(key) {
    if (state.sort.key === key) state.sort.asc = !state.sort.asc;
    else { state.sort.key = key; state.sort.asc = true; }
    renderHeader();
    applyAll();
}

/* ---------------------------------------------------------------------
   9) قائمة تصفية الأعمدة
   --------------------------------------------------------------------- */
let openMenu = null;

function showFilterMenu(col, headerEl) {
    closeFilterMenu();
    const menu = document.createElement('div');
    menu.className = 'filter-menu';
    const ul = document.createElement('ul');
    menu.appendChild(ul);

    // حساب القيم الفريدة
    const counts = {};
    state.surahs.forEach(s => {
        let v = s[col.key];
        if (v === undefined || v === null || v === '') v = PLACEHOLDER;
        counts[v] = (counts[v] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => compareValues(a[0], b[0], true));

    ul.appendChild(makeFilterItem('عرض الكل', state.surahs.length, !state.columnFilters[col.key], () => {
        delete state.columnFilters[col.key];
        closeFilterMenu(); renderHeader(); applyAll();
    }));
    entries.forEach(([value, count]) => {
        ul.appendChild(makeFilterItem(value, count, state.columnFilters[col.key] === value, () => {
            state.columnFilters[col.key] = value;
            closeFilterMenu(); renderHeader(); applyAll();
        }));
    });

    document.body.appendChild(menu);
    const rect = headerEl.getBoundingClientRect();
    menu.style.top = (rect.bottom + window.scrollY) + 'px';
    menu.style.right = (window.innerWidth - rect.right - window.scrollX) + 'px';
    openMenu = menu;
}

function makeFilterItem(label, count, active, onClick) {
    const li = document.createElement('li');
    li.textContent = label;
    if (active) li.classList.add('active');
    const c = document.createElement('span');
    c.textContent = count;
    li.appendChild(c);
    li.addEventListener('click', onClick);
    return li;
}

function closeFilterMenu() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
}

document.addEventListener('click', e => {
    if (openMenu && !openMenu.contains(e.target) && !e.target.classList.contains('filter-icon')) {
        closeFilterMenu();
    }
});

/* ---------------------------------------------------------------------
   10) الإحصائيات
   --------------------------------------------------------------------- */
function updateStats() {
    const list = state.filtered;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('statShown', formatNumber(list.length));
    set('statMakki', formatNumber(list.filter(s => s.type === 'مكية').length));
    set('statMadani', formatNumber(list.filter(s => s.type === 'مدنية').length));
    set('statVerses', formatNumber(list.reduce((a, s) => a + (s.verses || 0), 0)));
    set('statWords', formatNumber(list.reduce((a, s) => a + (typeof s.words === 'number' ? s.words : 0), 0)));
    set('statSajdahs', formatNumber(list.reduce((a, s) => a + (s.sajdahs || 0), 0)));
    set('statFav', formatNumber(state.favorites.size));
    const withProphets = list.filter(s => s.prophets && s.prophets !== PLACEHOLDER).length;
    set('statProphets', formatNumber(withProphets));
    const rc = document.getElementById('resultCount');
    if (rc) rc.textContent = `عرض ${list.length} من ${state.surahs.length} سورة`;
}

/* ---------------------------------------------------------------------
   11) المفضلة
   --------------------------------------------------------------------- */
function toggleFavorite(id) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    saveFavorites();
    applyAll();
}

/* ---------------------------------------------------------------------
   12) نافذة تفاصيل السورة
   --------------------------------------------------------------------- */
function openDetail(surah) {
    const modal = document.getElementById('detailModal');
    document.getElementById('detailTitle').textContent = 'سورة ' + surah.name;
    const body = document.getElementById('detailBody');
    body.innerHTML = '';

    COLUMNS.forEach(col => {
        const item = document.createElement('div');
        item.className = 'detail-item' + (col.verse || col.key === 'allahNames' ? ' full' : '');
        item.innerHTML = `<div class="k">${col.label}</div><div class="v ${col.verse ? 'detail-verse' : ''}">${cellText(surah, col)}</div>`;
        body.appendChild(item);
    });

    document.getElementById('overlay').classList.add('open');
    modal.classList.add('open');
}

function closeDetail() {
    document.getElementById('detailModal').classList.remove('open');
    if (!document.getElementById('settingsDrawer').classList.contains('open')) {
        document.getElementById('overlay').classList.remove('open');
    }
}

/* ---------------------------------------------------------------------
   13) لوحة الإعدادات الشاملة
   --------------------------------------------------------------------- */
function buildSettingsPanel() {
    // قائمة الأعمدة القابلة للتأشير
    const list = document.getElementById('columnsList');
    list.innerHTML = '';
    COLUMNS.forEach(col => {
        const label = document.createElement('label');
        label.className = 'column-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = isColumnVisible(col.key);
        cb.addEventListener('change', () => {
            const set = new Set(state.settings.visibleColumns);
            if (cb.checked) set.add(col.key); else set.delete(col.key);
            // الحفاظ على ترتيب COLUMNS
            state.settings.visibleColumns = COLUMNS.filter(c => set.has(c.key)).map(c => c.key);
            saveSettings();
            renderHeader();
            renderTable();
        });
        label.appendChild(cb);
        const span = document.createElement('span');
        span.innerHTML = `<i class="fa-solid ${col.icon}"></i> ${col.label}`;
        label.appendChild(span);
        list.appendChild(label);
    });

    // مزامنة عناصر التحكم مع الحالة
    document.getElementById('setTheme').checked = state.settings.theme === 'dark';
    document.getElementById('setMotion').checked = state.settings.motion;
    document.getElementById('setDensity').value = state.settings.density;
    document.getElementById('setFontSize').value = state.settings.fontSize;
    document.getElementById('fontSizeVal').textContent = state.settings.fontSize + 'px';
    document.getElementById('setFavOnly').checked = state.settings.favoritesOnly;
}

function bindSettingsControls() {
    document.getElementById('setTheme').addEventListener('change', e => {
        setTheme(e.target.checked ? 'dark' : 'light');
    });
    document.getElementById('setMotion').addEventListener('change', e => {
        state.settings.motion = e.target.checked; applySettingsToDom(); saveSettings();
    });
    document.getElementById('setDensity').addEventListener('change', e => {
        state.settings.density = e.target.value; applySettingsToDom(); saveSettings();
    });
    document.getElementById('setFontSize').addEventListener('input', e => {
        state.settings.fontSize = +e.target.value;
        document.getElementById('fontSizeVal').textContent = e.target.value + 'px';
        applySettingsToDom(); saveSettings();
    });
    document.getElementById('setFavOnly').addEventListener('change', e => {
        state.settings.favoritesOnly = e.target.checked; saveSettings(); applyAll();
    });
    document.getElementById('colsShowAll').addEventListener('click', () => {
        state.settings.visibleColumns = COLUMNS.map(c => c.key);
        saveSettings(); buildSettingsPanel(); renderHeader(); renderTable();
    });
    document.getElementById('colsReset').addEventListener('click', () => {
        state.settings.visibleColumns = COLUMNS.filter(c => c.defaultVisible).map(c => c.key);
        saveSettings(); buildSettingsPanel(); renderHeader(); renderTable();
    });
    document.getElementById('resetAll').addEventListener('click', () => {
        if (confirm('استعادة جميع الإعدادات الافتراضية؟')) {
            state.settings = defaultSettings();
            state.columnFilters = {};
            saveSettings();
            applySettingsToDom();
            document.getElementById('searchBox').value = '';
            buildSettingsPanel(); renderHeader(); applyAll();
            toast('تمت استعادة الإعدادات الافتراضية');
        }
    });
    document.getElementById('clearFav').addEventListener('click', () => {
        state.favorites.clear(); saveFavorites(); applyAll();
        toast('تم مسح المفضلة');
    });
}

function openSettings() {
    buildSettingsPanel();
    document.getElementById('overlay').classList.add('open');
    document.getElementById('settingsDrawer').classList.add('open');
}
function closeSettings() {
    document.getElementById('settingsDrawer').classList.remove('open');
    if (!document.getElementById('detailModal').classList.contains('open')) {
        document.getElementById('overlay').classList.remove('open');
    }
}

/* ---------------------------------------------------------------------
   14) التصدير (Excel / CSV) — يعتمد على كل الأعمدة بغض النظر عن الظهور
   --------------------------------------------------------------------- */
function rowForExport(surah) {
    const obj = { 'م': surah.id };
    COLUMNS.forEach(col => { obj[col.label] = cellText(surah, col); });
    return obj;
}

function exportToExcel() {
    if (typeof XLSX === 'undefined') { toast('مكتبة التصدير غير متاحة'); return; }
    const ws = XLSX.utils.json_to_sheet(state.surahs.map(rowForExport));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قاعدة بيانات القرآن');
    XLSX.writeFile(wb, 'قاعدة_بيانات_القرآن_الكريم.xlsx');
    toast('تم تصدير ملف Excel');
}

function exportToCSV() {
    const headers = ['م', ...COLUMNS.map(c => c.label)];
    const rows = state.surahs.map(s => [s.id, ...COLUMNS.map(c => `"${String(cellText(s, c)).replace(/"/g, '""')}"`)].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'قاعدة_بيانات_القرآن_الكريم.csv';
    link.click();
    toast('تم تصدير ملف CSV');
}

/* ---------------------------------------------------------------------
   15) صفحة البداية التعليمية (Onboarding)
   --------------------------------------------------------------------- */
const TUTORIAL_KEY = 'quranTutorialSeen';
const TUTORIAL_STEPS = [
    { icon: 'fa-book-quran', title: 'مرحبًا بك 👋', body: 'هذه قاعدة بيانات تفاعلية لجميع سور القرآن الكريم الـ114، مع 27 حقلًا من المعلومات لكل سورة.' },
    { icon: 'fa-magnifying-glass', title: 'ابحث بسهولة', body: 'اكتب في صندوق البحث للوصول إلى سورة باسمها أو رقمها، أو ابحث عن نبيٍّ أو اسمٍ من أسماء الله الحسنى.' },
    { icon: 'fa-sort', title: 'رتّب وصفِّ', body: 'انقر على عنوان أي عمود لترتيبه تصاعديًا/تنازليًا، واضغط أيقونة ▼ بجانب العنوان لتصفية القيم.' },
    { icon: 'fa-gear', title: 'خصّص كل شيء', body: 'من زر الإعدادات: غيّر الوضع الليلي، حجم الخط، الأعمدة الظاهرة، والمزيد. وزر القمر/الشمس يبدّل الثيم بسرعة.' },
    { icon: 'fa-star', title: 'المفضلة والإحصائيات', body: 'أضف السور إلى المفضلة بالنجمة ⭐، وتفقّد صفحة الإحصائيات للرسوم البيانية. استمتع! 🌙' },
];
let tutStep = 0;

function renderTutorial() {
    const s = TUTORIAL_STEPS[tutStep];
    document.querySelector('#onboarding .onboarding-icon').innerHTML = `<i class="fa-solid ${s.icon}"></i>`;
    document.getElementById('tutTitle').textContent = s.title;
    document.getElementById('tutBody').textContent = s.body;
    const dots = document.getElementById('tutDots');
    dots.innerHTML = TUTORIAL_STEPS.map((_, i) => `<span class="${i === tutStep ? 'active' : ''}"></span>`).join('');
    document.getElementById('tutPrev').style.visibility = tutStep === 0 ? 'hidden' : 'visible';
    document.getElementById('tutNext').textContent = tutStep === TUTORIAL_STEPS.length - 1 ? 'ابدأ الآن' : 'التالي';
}

function openTutorial() { tutStep = 0; renderTutorial(); document.getElementById('onboarding').classList.add('open'); }
function closeTutorial() {
    document.getElementById('onboarding').classList.remove('open');
    localStorage.setItem(TUTORIAL_KEY, '1');
}

function bindTutorial() {
    document.getElementById('btnTutorial').addEventListener('click', e => { e.preventDefault(); openTutorial(); });
    document.getElementById('tutorialSkip').addEventListener('click', closeTutorial);
    document.getElementById('tutPrev').addEventListener('click', () => { if (tutStep > 0) { tutStep--; renderTutorial(); } });
    document.getElementById('tutNext').addEventListener('click', () => {
        if (tutStep < TUTORIAL_STEPS.length - 1) { tutStep++; renderTutorial(); }
        else closeTutorial();
    });
}

/* ---------------------------------------------------------------------
   16) ربط الأحداث والتشغيل
   --------------------------------------------------------------------- */
function bindGlobalEvents() {
    document.getElementById('searchBox').addEventListener('input', applyAll);
    document.getElementById('btnTheme').addEventListener('click', () => setTheme(state.settings.theme === 'dark' ? 'light' : 'dark'));
    document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);
    document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);
    document.getElementById('btnSettings').addEventListener('click', openSettings);
    document.getElementById('drawerClose').addEventListener('click', closeSettings);
    document.getElementById('detailClose').addEventListener('click', closeDetail);
    document.getElementById('overlay').addEventListener('click', () => { closeSettings(); closeDetail(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeSettings(); closeDetail(); closeFilterMenu(); closeTutorial(); }
    });
    bindSettingsControls();
    bindTutorial();
}

async function init() {
    loadSettings();
    loadFavorites();
    applySettingsToDom();
    bindGlobalEvents();

    // استرجاع آخر بحث
    document.getElementById('searchBox').value = state.settings.lastSearch || '';

    try {
        const data = await fetchData();
        state.surahs = normalizeData(data);
        state.meta = data.meta || {};
        renderHeader();
        runProgress(() => {
            applyAll();
            // عرض الجولة التعليمية في أول زيارة فقط
            if (!localStorage.getItem(TUTORIAL_KEY)) openTutorial();
        });
    } catch (err) {
        document.getElementById('tableBody').innerHTML =
            `<tr class="empty-row"><td colspan="30">⚠️ ${err.message}<br><small>افتح الصفحة عبر خادم محلي (Live Server) لتفعيل تحميل JSON.</small></td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', init);

// تسجيل الـ Service Worker (PWA) إن توفّر
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
