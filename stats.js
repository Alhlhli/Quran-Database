/* =====================================================================
   صفحة الإحصائيات — حساب البيانات ورسمها باستخدام Chart.js
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

/* تقسيم خانة نصية متعددة القيم مفصولة بفواصل عربية إلى مفردات */
function splitItems(text) {
    if (!text || text === PLACEHOLDER) return [];
    return text.split(/[،,]/).map(t => t.trim()).filter(t => t && t !== PLACEHOLDER);
}

/* عدّ تكرارات القيم عبر كل السور وإرجاع الأكثر شيوعًا */
function topCounts(surahs, key, limit) {
    const counts = {};
    surahs.forEach(s => splitItems(s[key]).forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildSummary(surahs, meta) {
    const totalVerses = surahs.reduce((a, s) => a + (s.verses || 0), 0);
    const totalWords = surahs.reduce((a, s) => a + (typeof s.words === 'number' ? s.words : 0), 0);
    const totalSajdahs = surahs.reduce((a, s) => a + (s.sajdahs || 0), 0);
    const cards = [
        ['fa-book-quran', surahs.length, 'إجمالي السور'],
        ['fa-kaaba', meta.makkiSurahs ?? surahs.filter(s => s.type === 'مكية').length, 'المكية'],
        ['fa-moon', meta.madaniSurahs ?? surahs.filter(s => s.type === 'مدنية').length, 'المدنية'],
        ['fa-list-ol', totalVerses.toLocaleString('en-US'), 'الآيات'],
        ['fa-font', totalWords.toLocaleString('en-US'), 'الكلمات'],
        ['fa-person-praying', totalSajdahs, 'السجدات'],
    ];
    document.getElementById('summaryCards').innerHTML = cards.map(([icon, num, label]) =>
        `<div class="stat-card"><div class="stat-icon"><i class="fa-solid ${icon}"></i></div>
         <div class="stat-number">${num}</div><div class="stat-label">${label}</div></div>`
    ).join('');
}

function makeChart(id, type, labels, data, label, colors) {
    const textColor = cssVar('--text-main') || '#2c3e50';
    Chart.defaults.font.family = "'Segoe UI', Tahoma, sans-serif";
    Chart.defaults.color = textColor;
    new Chart(document.getElementById(id), {
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
            plugins: {
                legend: { display: type === 'doughnut', position: 'bottom' },
            },
            scales: type === 'bar' ? { x: { beginAtZero: true } } : {},
        },
    });
}

async function init() {
    const palette = ['#3498db', '#27ae60', '#e67e22', '#9b59b6', '#e74c3c', '#1abc9c', '#f1c40f', '#34495e', '#16a085', '#d35400'];
    try {
        const res = await fetch('quran-data.json');
        const data = await res.json();
        const surahs = Array.isArray(data.surahs)
            ? data.surahs
            : data.data.map(row => {
                const o = {};
                data.columns.forEach((c, i) => { o[c] = row[i]; });
                return o;
            });

        buildSummary(surahs, data.meta || {});

        const makki = surahs.filter(s => s.type === 'مكية').length;
        const madani = surahs.length - makki;
        makeChart('chartType', 'doughnut', ['مكية', 'مدنية'], [makki, madani], 'السور', ['#3498db', '#27ae60']);

        const prophets = topCounts(surahs, 'prophets', 10);
        makeChart('chartProphets', 'bar', prophets.map(p => p[0]), prophets.map(p => p[1]), 'عدد السور', palette);

        const colors = topCounts(surahs, 'colors', 8);
        makeChart('chartColors', 'bar', colors.map(c => c[0]), colors.map(c => c[1]), 'عدد السور', palette);

        const longest = [...surahs].sort((a, b) => b.verses - a.verses).slice(0, 10);
        makeChart('chartLongest', 'bar', longest.map(s => s.name), longest.map(s => s.verses), 'عدد الآيات', palette);
    } catch (err) {
        document.querySelector('.charts-grid').innerHTML =
            `<p style="padding:20px;color:var(--text-muted)">⚠️ تعذّر تحميل البيانات. افتح الصفحة عبر خادم محلي.</p>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
