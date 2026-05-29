/* =====================================================================
   مسابقة قاعدة بيانات القرآن الكريم — محرّك توليد الأسئلة
   جميع الأسئلة تُولَّد ديناميكيًا من quran-data.json + قوالب quiz/questions.json
   ===================================================================== */
'use strict';

// مشاركة سمة الوضع الليلي
(function () {
    try {
        const s = JSON.parse(localStorage.getItem('quranSettings') || '{}');
        document.documentElement.setAttribute('data-theme', s.theme || 'light');
    } catch (e) {}
})();

const PLACEHOLDER = 'ـــ';
const BEST_KEY = 'quranQuizBest';

const Q = {
    surahs: [],
    config: null,
    quiz: [],        // الأسئلة المُولّدة للجولة الحالية
    index: 0,
    score: 0,
    correct: 0,
    level: 'مبتدئ',
    answered: false,
};

/* ---------- أدوات عشوائية ---------- */
const rand = n => Math.floor(Math.random() * n);
const pick = arr => arr[rand(arr.length)];
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
// اختيار n عناصر فريدة عشوائيًا
function sampleN(arr, n) { return shuffle(arr).slice(0, n); }
const num = n => (typeof n === 'number' ? n.toLocaleString('en-US') : n);

function splitProphets(s) {
    if (!s || s === PLACEHOLDER) return [];
    return s.split(/[،,]/).map(t => t.trim()).filter(t => t && t !== PLACEHOLDER);
}

/* ---------- بيانات مشتقّة ---------- */
let ALL_PROPHETS = [];          // كل أسماء الأنبياء الفريدة
let PROPHET_SURahs = {};        // اسم النبي -> [سور تذكره]

function buildDerived() {
    const set = new Set();
    PROPHET_SURahs = {};
    Q.surahs.forEach(s => splitProphets(s.prophets).forEach(p => {
        set.add(p);
        (PROPHET_SURahs[p] = PROPHET_SURahs[p] || []).push(s);
    }));
    ALL_PROPHETS = [...set];
}

/* ---------- مولّدات الأسئلة ----------
   كل مولّد يُعيد: { text, options:[..], answer, explanation }  أو null عند التعذّر */
const GEN = {
    type(t) {
        const s = pick(Q.surahs);
        return {
            text: t.prompt.replace('{name}', s.name),
            options: ['مكية', 'مدنية'],
            answer: s.type,
            explanation: `سورة ${s.name} ${s.type}.`,
        };
    },

    field(t) {
        const pool = Q.surahs.filter(s => typeof s[t.field] === 'number');
        const s = pick(pool);
        const correct = s[t.field];
        const others = [...new Set(pool.map(x => x[t.field]).filter(v => v !== correct))];
        const distract = sampleN(others, 3);
        if (distract.length < 3) return null;
        const opts = shuffle([correct, ...distract]).map(num);
        return {
            text: t.prompt.replace('{name}', s.name),
            options: opts,
            answer: num(correct),
            explanation: `${t.prompt.replace('{name}', 'سورة ' + s.name).replace('؟', '')} = ${num(correct)} ${t.unit || ''}.`,
        };
    },

    extreme(t) {
        const pool = Q.surahs.filter(s => typeof s[t.field] === 'number');
        const best = pool.reduce((a, b) => (t.mode === 'min' ? (b[t.field] < a[t.field] ? b : a) : (b[t.field] > a[t.field] ? b : a)));
        const distract = sampleN(pool.filter(s => s.name !== best.name), 3);
        const opts = shuffle([best, ...distract]).map(s => s.name);
        return {
            text: t.prompt,
            options: opts,
            answer: best.name,
            explanation: `${best.name} (${num(best[t.field])}).`,
        };
    },

    whichByField(t) {
        // قيمة فريدة لضمان إجابة واحدة
        const counts = {};
        Q.surahs.forEach(s => { const v = s[t.field]; if (typeof v === 'number') counts[v] = (counts[v] || 0) + 1; });
        const uniquePool = Q.surahs.filter(s => typeof s[t.field] === 'number' && counts[s[t.field]] === 1);
        if (!uniquePool.length) return null;
        const s = pick(uniquePool);
        const distract = sampleN(Q.surahs.filter(x => x.name !== s.name), 3);
        const opts = shuffle([s, ...distract]).map(x => x.name);
        return {
            text: t.prompt.replace('{value}', num(s[t.field])),
            options: opts,
            answer: s.name,
            explanation: `${s.name}: ${num(s[t.field])}.`,
        };
    },

    prophetIn(t) {
        const pool = Q.surahs.filter(s => splitProphets(s.prophets).length);
        const s = pick(pool);
        const inSurah = splitProphets(s.prophets);
        const correct = pick(inSurah);
        const outside = ALL_PROPHETS.filter(p => !inSurah.includes(p));
        const distract = sampleN(outside, 3);
        if (distract.length < 3) return null;
        const opts = shuffle([correct, ...distract]);
        return {
            text: t.prompt.replace('{name}', s.name),
            options: opts,
            answer: correct,
            explanation: `ذُكِر ${correct} في سورة ${s.name}.`,
        };
    },

    prophetWhere(t) {
        // اختر نبيًّا ذُكِر في عددٍ محدود من السور لتكون المموّهات سهلة
        const candidates = ALL_PROPHETS.filter(p => PROPHET_SURahs[p].length >= 1 && PROPHET_SURahs[p].length <= Q.surahs.length - 4);
        const p = pick(candidates.length ? candidates : ALL_PROPHETS);
        const inSet = new Set(PROPHET_SURahs[p].map(s => s.name));
        const correct = pick(PROPHET_SURahs[p]);
        const outside = Q.surahs.filter(s => !inSet.has(s.name));
        const distract = sampleN(outside, 3);
        if (distract.length < 3) return null;
        const opts = shuffle([correct, ...distract]).map(s => s.name);
        return {
            text: t.prompt.replace('{prophet}', p),
            options: opts,
            answer: correct.name,
            explanation: `ذُكِر النبيُّ ${p} في سورة ${correct.name}.`,
        };
    },

    disconnected(t) {
        const pool = Q.surahs.filter(s => s.disconnectedLetters && s.disconnectedLetters !== 'لا' && s.disconnectedLetters !== PLACEHOLDER);
        const s = pick(pool);
        const others = [...new Set(pool.map(x => x.disconnectedLetters).filter(v => v !== s.disconnectedLetters))];
        const distract = sampleN(others, 3);
        if (distract.length < 3) return null;
        const opts = shuffle([s.disconnectedLetters, ...distract]);
        return {
            text: t.prompt.replace('{name}', s.name),
            options: opts,
            answer: s.disconnectedLetters,
            explanation: `تبدأ سورة ${s.name} بالحروف المقطَّعة: ${s.disconnectedLetters}.`,
        };
    },

    mostProphet(t) {
        const ranked = ALL_PROPHETS.map(p => [p, PROPHET_SURahs[p].length]).sort((a, b) => b[1] - a[1]);
        const correct = ranked[0];
        const distract = ranked.slice(1).map(r => r[0]);
        const opts = shuffle([correct[0], ...sampleN(distract, 3)]);
        return {
            text: t.prompt,
            options: opts,
            answer: correct[0],
            explanation: `${correct[0]} ذُكِر في ${correct[1]} سورة — الأكثر بين الأنبياء.`,
        };
    },
};

/* ---------- بناء جولة المسابقة ---------- */
function buildQuiz(level, count) {
    const templates = Q.config.questions.filter(q => q.level === level);
    const out = [];
    let guard = 0;
    const seen = new Set();
    while (out.length < count && guard < count * 40) {
        guard++;
        const t = pick(templates);
        const gen = GEN[t.gen];
        if (!gen) continue;
        const q = gen(t);
        if (!q || !q.options || q.options.length < 2) continue;
        const key = q.text + '|' + q.answer;
        if (seen.has(key)) continue;          // تجنّب التكرار الحرفي
        seen.add(key);
        out.push(q);
    }
    return out;
}

/* ---------- واجهة المستخدم ---------- */
const $ = id => document.getElementById(id);

function startQuiz() {
    const count = +$('amountSelect').value;
    Q.quiz = buildQuiz(Q.level, count);
    if (Q.quiz.length < count) {
        // في حال تعذّر بلوغ العدد المطلوب نكتفي بالمتاح
    }
    Q.index = 0; Q.score = 0; Q.correct = 0; Q.answered = false;
    $('startScreen').style.display = 'none';
    $('resultScreen').style.display = 'none';
    $('quizScreen').style.display = 'block';
    renderQuestion();
}

function renderQuestion() {
    const q = Q.quiz[Q.index];
    Q.answered = false;
    $('qProgress').textContent = `سؤال ${Q.index + 1} من ${Q.quiz.length}`;
    $('qScore').innerHTML = `<i class="fa-solid fa-star"></i> ${Q.score} نقطة`;
    $('qBar').style.width = ((Q.index) / Q.quiz.length * 100) + '%';
    $('qLevelTag').textContent = Q.level;
    $('qText').textContent = q.text;
    $('qFeedback').className = 'q-feedback';
    $('qFeedback').textContent = '';
    $('nextBtn').style.display = 'none';

    const box = $('qOptions');
    box.innerHTML = '';
    q.options.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'q-option';
        b.textContent = opt;
        b.addEventListener('click', () => answer(b, opt, q));
        box.appendChild(b);
    });
}

function answer(btn, opt, q) {
    if (Q.answered) return;
    Q.answered = true;
    const pts = Q.config.points[Q.level];
    const buttons = [...document.querySelectorAll('.q-option')];
    buttons.forEach(b => {
        b.classList.add('disabled');
        if (b.textContent === q.answer) b.classList.add('correct');
    });
    const fb = $('qFeedback');
    if (opt === q.answer) {
        Q.score += pts; Q.correct++;
        fb.className = 'q-feedback ok';
        fb.innerHTML = `<i class="fa-solid fa-circle-check"></i> إجابة صحيحة! +${pts} نقطة — ${q.explanation}`;
    } else {
        btn.classList.add('wrong');
        fb.className = 'q-feedback bad';
        fb.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> الإجابة الصحيحة: <b>${q.answer}</b> — ${q.explanation}`;
    }
    $('qScore').innerHTML = `<i class="fa-solid fa-star"></i> ${Q.score} نقطة`;
    $('nextBtn').style.display = 'inline-flex';
    $('nextBtn').textContent = Q.index === Q.quiz.length - 1 ? 'عرض النتيجة' : 'السؤال التالي';
}

function nextQuestion() {
    Q.index++;
    if (Q.index < Q.quiz.length) renderQuestion();
    else showResult();
}

function showResult() {
    $('quizScreen').style.display = 'none';
    $('resultScreen').style.display = 'block';
    const total = Q.quiz.length;
    const pct = total ? Math.round(Q.correct / total * 100) : 0;
    const maxScore = total * Q.config.points[Q.level];

    // حفظ أفضل نتيجة لكل مستوى
    let best = {};
    try { best = JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (e) {}
    const prevBest = best[Q.level] || 0;
    const isRecord = Q.score > prevBest;
    if (isRecord) { best[Q.level] = Q.score; localStorage.setItem(BEST_KEY, JSON.stringify(best)); }

    const enc = Q.config.encouragement.find(e => pct >= e.min) || Q.config.encouragement[Q.config.encouragement.length - 1];
    $('resultIcon').innerHTML = `<i class="fa-solid ${enc.icon}"></i>`;
    $('resultMsg').textContent = enc.text;
    $('resultScore').innerHTML = `${Q.score} <small>/ ${maxScore} نقطة</small>`;
    $('resultDetail').textContent = `أجبتَ بشكلٍ صحيح عن ${Q.correct} من ${total} سؤالًا (${pct}%) — المستوى: ${Q.level}`;
    $('resultBest').innerHTML = isRecord
        ? `<i class="fa-solid fa-medal"></i> رقمٌ قياسيٌّ جديد! 🎉`
        : `<i class="fa-solid fa-medal"></i> أفضل نتيجة لك في هذا المستوى: ${prevBest} نقطة`;
}

function backToStart() {
    $('resultScreen').style.display = 'none';
    $('quizScreen').style.display = 'none';
    $('startScreen').style.display = 'block';
}

/* ---------- التهيئة ---------- */
function bindLevelButtons() {
    document.querySelectorAll('.level-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.level-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            Q.level = card.dataset.level;
        });
    });
}

async function init() {
    try {
        const [dataRes, cfgRes] = await Promise.all([
            fetch('quran-data.json'),
            fetch('quiz/questions.json'),
        ]);
        const data = await dataRes.json();
        Q.config = await cfgRes.json();
        Q.surahs = Array.isArray(data.surahs) ? data.surahs
            : data.data.map(r => Object.fromEntries(data.columns.map((c, i) => [c, r[i]])));
        buildDerived();

        // تعبئة عدد الأسئلة
        const sel = $('amountSelect');
        sel.innerHTML = Q.config.amounts.map(n => `<option value="${n}">${n} أسئلة</option>`).join('');
        sel.value = 10;

        // عرض أفضل النتائج المحفوظة
        let best = {};
        try { best = JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (e) {}
        $('bestScores').innerHTML = Q.config.levels.map(l =>
            `<span class="best-chip"><i class="fa-solid fa-medal"></i> ${l}: ${best[l] || 0}</span>`).join('');

        bindLevelButtons();
        $('startBtn').addEventListener('click', startQuiz);
        $('nextBtn').addEventListener('click', nextQuestion);
        $('retryBtn').addEventListener('click', backToStart);
    } catch (err) {
        $('startScreen').innerHTML = `<p style="padding:20px;color:var(--text-muted)">⚠️ تعذّر تحميل المسابقة. افتح الصفحة عبر خادم محلي.</p>`;
    }
}

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
