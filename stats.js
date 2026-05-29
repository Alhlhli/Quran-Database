/* =====================================================================
   صفحة الإحصائيات — حساب البيانات ورسمها باستخدام Chart.js
   تغطّي معظم الأعمدة برسوم بيانية متنوعة
   ===================================================================== */
'use strict';

// مشاركة سمة الوضع الليلي مع الصفحة الرئيسية
(function applyTheme() {
    try {
        const s = JSON.parse(localStorage.getItem('quranSettings') || '{}');
        document.documentElement.setAttribute('data-theme', s.theme || 'light');
    } catch (e) {}
})();

const PLACEHOLDER = 'ـــ';
const PALETTE = ['#3498db', '#27ae60', '#e67e22', '#9b59b6', '#e74c3c', '#1abc9c',
                 '#f1c40f', '#34495e', '#16a085', '#d35400', '#2980b9', '#8e44ad'];

/* ---------- أدوات حساب ---------- */
function splitItems(text) {
    if (!text || text === PLACEHOLDER) return [];
    return text.split(/[،,]/).map(t => t.trim()).filter(t => t && t !== PLACEHOLDER);
}

// تكرار القيم في عمود نصّي متعدد القيم (الأنبياء، الألوان...)
function topMulti(surahs, key, limit) {
    const counts = {};
    surahs.forEach(s => splitItems(s[key]).forEach(it => counts[it] = (counts[it] || 0) + 1));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// توزيع القيم المفردة في عمود نصّي (الحروف المقطعة، أكثر نهاية...)
function distribution(surahs, key, limit) {
    const counts = {};
    surahs.forEach(s => {
        let v = s[key];
        if (v === undefined || v === null || v === '' || v === PLACEHOLDER || v === 'لا') return;
        counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// أعلى السور وفق عمود رقمي
function topNumeric(surahs, key, limit) {
    return [...surahs]
        .filter(s => typeof s[key] === 'number')
        .sort((a, b) => b[key] - a[key])
        .slice(0, limit)
        .map(s => [s.name, s[key]]);
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- بناء البطاقات ---------- */
function buildSummary(surahs) {
    const sum = k => surahs.reduce((a, s) => a + (typeof s[k] === 'number' ? s[k] : 0), 0);
    const cards = [
        ['fa-book-quran', surahs.length, 'إجمالي السور'],
        ['fa-kaaba', surahs.filter(s => s.type === 'مكية').length, 'المكية'],
        ['fa-moon', surahs.filter(s => s.type === 'مدنية').length, 'المدنية'],
        ['fa-list-ol', sum('verses').toLocaleString('en-US'), 'الآيات'],
        ['fa-font', sum('words').toLocaleString('en-US'), 'الكلمات'],
        ['fa-mosque', sum('allah').toLocaleString('en-US'), 'ذكر «الله»'],
        ['fa-person-praying', sum('sajdahs'), 'السجدات'],
    ];
    document.getElementById('summaryCards').innerHTML = cards.map(([i, n, l]) =>
        `<div class="stat-card"><div class="stat-icon"><i class="fa-solid ${i}"></i></div>
         <div class="stat-number">${n}</div><div class="stat-label">${l}</div></div>`).join('');
}

/* إنشاء بطاقة رسم بياني وإرجاع عنصر canvas جاهز */
function addChartCard(title, icon) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    const h = document.createElement('h3');
    h.innerHTML = `<i class="fa-solid ${icon}"></i> ${title}`;
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(h);
    card.appendChild(wrap);
    document.getElementById('chartsGrid').appendChild(card);
    return canvas;
}

function drawChart(canvas, type, labels, data, label, colors) {
    Chart.defaults.font.family = "'Segoe UI', Tahoma, sans-serif";
    Chart.defaults.color = cssVar('--text-main') || '#2c3e50';
    new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: [{
                label,
                data,
                backgroundColor: colors,
                borderRadius: type === 'bar' ? 6 : 0,
                borderWidth: type === 'doughnut' ? 2 : 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: type === 'bar' ? 'y' : 'x',
            plugins: { legend: { display: type === 'doughnut', position: 'bottom' } },
            scales: type === 'bar' ? { x: { beginAtZero: true, ticks: { precision: 0 } } } : {},
        },
    });
}

// اختصارات
function bar(title, icon, entries, label) {
    drawChart(addChartCard(title, icon), 'bar', entries.map(e => e[0]), entries.map(e => e[1]), label, PALETTE);
}
function doughnut(title, icon, entries, colors) {
    drawChart(addChartCard(title, icon), 'doughnut', entries.map(e => e[0]), entries.map(e => e[1]), '', colors || PALETTE);
}

/* ---------- التشغيل ---------- */
async function init() {
    try {
        const res = await fetch('quran-data.json');
        const data = await res.json();
        const surahs = Array.isArray(data.surahs) ? data.surahs
            : data.data.map(r => Object.fromEntries(data.columns.map((c, i) => [c, r[i]])));

        buildSummary(surahs);

        // 1) توزيع مكي/مدني
        const makki = surahs.filter(s => s.type === 'مكية').length;
        doughnut('توزيع السور (مكية / مدنية)', 'fa-kaaba',
            [['مكية', makki], ['مدنية', surahs.length - makki]], ['#3498db', '#27ae60']);

        // 2) توزيع السجدات
        const saj = {};
        surahs.forEach(s => { const k = (s.sajdahs || 0) + ' سجدة'; saj[k] = (saj[k] || 0) + 1; });
        doughnut('توزيع السجدات على السور', 'fa-person-praying', Object.entries(saj));

        // 3-6) أعمدة رقمية: أعلى 10 سور
        bar('أطول 10 سور (بعدد الآيات)', 'fa-list-ol', topNumeric(surahs, 'verses', 10), 'آية');
        bar('أكثر 10 سور (بعدد الكلمات)', 'fa-font', topNumeric(surahs, 'words', 10), 'كلمة');
        bar('أكثر 10 سور (بعدد الحروف)', 'fa-spell-check', topNumeric(surahs, 'letters', 10), 'حرف');
        bar('أكثر 10 سور ذكرًا للفظ «الله»', 'fa-mosque', topNumeric(surahs, 'allah', 10), 'مرة');

        // 7-11) أعمدة نصّية متعددة القيم
        bar('أكثر الأنبياء ذكرًا', 'fa-users', topMulti(surahs, 'prophets', 10), 'عدد السور');
        bar('أكثر الأسماء الحسنى ذكرًا', 'fa-star-and-crescent', topMulti(surahs, 'allahNames', 10), 'عدد السور');
        bar('أكثر الألوان ذكرًا', 'fa-palette', topMulti(surahs, 'colors', 8), 'عدد السور');
        bar('أكثر الحيوانات ذكرًا', 'fa-dove', topMulti(surahs, 'animals', 10), 'عدد السور');
        bar('أكثر الأرقام ذكرًا', 'fa-calculator', topMulti(surahs, 'numbers', 10), 'عدد السور');

        // 12-13) توزيع قيم مفردة
        bar('أكثر الحروف المقطعة (فواتح السور)', 'fa-puzzle-piece', distribution(surahs, 'disconnectedLetters', 12), 'عدد السور');
        bar('أكثر حروف نهايات الآيات شيوعًا', 'fa-flag-checkered', distribution(surahs, 'mostCommonEndLetter', 10), 'عدد السور');
    } catch (err) {
        document.getElementById('chartsGrid').innerHTML =
            `<p style="padding:20px;color:var(--text-muted)">⚠️ تعذّر تحميل البيانات. افتح الصفحة عبر خادم محلي.</p>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
