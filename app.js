/* ============================================================
   물리학 II 학습 노트 — app logic
   ============================================================ */
(function () {
  "use strict";

  const TABS = [
    { key: "concepts", label: "개념" },
    { key: "basic", label: "기본 문제" },
    { key: "advanced", label: "심화 문제" },
    { key: "essays", label: "논술형" },
  ];
  const STEP_LABELS = ["핵심 개념·힌트", "풀이 전략", "모범 답안"];

  const navEl = document.getElementById("nav");
  const contentEl = document.getElementById("content");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("scrim");
  const menuBtn = document.getElementById("menuBtn");

  let current = { chapter: 0, topic: 0, tab: "concepts" };

  /* ---------- helpers ---------- */
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ---------- short-answer grading ---------- */
  // 입력값과 정답을 비교하기 좋게 정규화한다.
  function gradeNormalize(s) {
    if (s == null) return "";
    s = String(s);
    s = s.replace(/\\text\{([^}]*)\}/g, "$1")
         .replace(/\\mathrm\{([^}]*)\}/g, "$1")
         .replace(/\\left|\\right/g, " ")
         .replace(/\\[a-zA-Z]+/g, " ")     // 남은 LaTeX 명령
         .replace(/[\${}^_\\]/g, " ");
    s = s.toLowerCase();
    // 단위·표기 통일
    s = s.replace(/약\s*/g, "").replace(/대략/g, "");
    // 공백·구두점 제거(한글·영문·숫자만 남김)
    s = s.replace(/[\s,.\-·×*=/()[\]'"`+~∼≈?!:;…]/g, "");
    return s;
  }

  // 정답 문자열에서 채점에 쓸 후보 정답들을 만든다.
  function answerKeys(a) {
    const keys = new Set();
    const push = (v) => { const n = gradeNormalize(v); if (n) keys.add(n); };
    push(a);
    push(a.replace(/\([^)]*\)/g, " "));   // 괄호 설명 제거
    let m; const re = /\(([^)]*)\)/g;     // 괄호 안 내용도 인정
    while ((m = re.exec(a))) push(m[1]);
    return keys;
  }

  // 문자열에서 숫자만 추출한다(LaTeX 첨자·명령·기호 제거 후).
  function gradeNumbers(s) {
    const clean = String(s)
      .replace(/[_^]\{?-?\d+(?:\.\d+)?\}?/g, " ") // 첨자/지수 (r_1, x^2 …)
      .replace(/\\[a-zA-Z]+/g, " ")               // \times, \text …
      .replace(/[{}$]/g, " ");
    const out = []; let m; const re = /-?\d+(?:\.\d+)?/g;
    while ((m = re.exec(clean))) out.push(parseFloat(m[0]));
    return out;
  }
  function numEq(a, b) { return Math.abs(a - b) <= 1e-9 + 1e-3 * Math.max(1, Math.abs(b)); }
  function lastEqNum(seg) {
    const i = seg.lastIndexOf("=");
    if (i < 0) return null;
    const ns = gradeNumbers(seg.slice(i + 1));
    return ns.length ? ns[0] : null;
  }
  // 풀이 과정에서 '최종 결괏값' 후보 숫자들을 뽑는다.
  // (=/⇒ 뒤의 값, 각 절의 마지막 숫자. 화살표가 있으면 화살표 앞 중간계산은 버린다)
  function resultNumbers(a) {
    if (!/[=⇒→]|\\Rightarrow/.test(a)) return [];
    const res = new Set();
    const add = (seg) => {
      const e = lastEqNum(seg); if (e != null) res.add(e);
      const all = gradeNumbers(seg); if (all.length) res.add(all[all.length - 1]);
    };
    const arrows = a.split(/\\Rightarrow|⇒|→/);
    const body = arrows.length > 1 ? arrows.slice(1).join(" . ") : a;
    body.split(/\(\d\)|\.\s|;|\n/).forEach(add);
    return [...res];
  }

  function gradeAnswer(input, a) {
    const u = gradeNormalize(input);
    if (u.length < 1) return false;
    // 1) 개념·단답형: 정규화 텍스트 비교
    for (const k of answerKeys(a)) {
      if (!k) continue;
      if (u === k) return true;
      if (k.length >= 3 && u.length >= 3 && (k.includes(u) || u.includes(k))) {
        const lo = Math.min(u.length, k.length), hi = Math.max(u.length, k.length);
        if (lo / hi >= 0.5) return true;
      }
    }
    // 2) 계산형: 입력 숫자가 풀이의 최종 결괏값과 일치하면 정답
    const rnums = resultNumbers(a);
    if (rnums.length) {
      const un = gradeNumbers(input);
      if (un.length && un.every((x) => rnums.some((r) => numEq(x, r)))) return true;
    }
    return false;
  }

  function renderMath(scope) {
    if (typeof renderMathInElement === "function") {
      try {
        renderMathInElement(scope, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch (e) { /* katex not ready yet */ }
    }
  }

  /* ---------- sidebar nav ---------- */
  function buildNav() {
    CURRICULUM.forEach((ch, ci) => {
      const wrap = el("div", "nav-chapter");
      if (ci !== 0) wrap.classList.add("collapsed");

      const btn = el("button", "chapter-btn");
      btn.innerHTML =
        '<span class="chapter-num">' + String(ci + 1).padStart(2, "0") + "</span>" +
        "<span>" + ch.title + "</span>" +
        '<span class="chapter-caret">▼</span>';
      btn.addEventListener("click", () => wrap.classList.toggle("collapsed"));

      const ul = el("ul", "topic-list");
      ch.topics.forEach((tp, ti) => {
        const li = el("li");
        const link = el("button", "topic-link", tp.title);
        link.dataset.ci = ci;
        link.dataset.ti = ti;
        link.addEventListener("click", () => {
          current = { chapter: ci, topic: ti, tab: "concepts" };
          renderTopic();
          closeSidebar();
        });
        li.appendChild(link);
        ul.appendChild(li);
      });

      wrap.appendChild(btn);
      wrap.appendChild(ul);
      navEl.appendChild(wrap);
    });
  }

  function highlightNav() {
    document.querySelectorAll(".topic-link").forEach((l) => {
      const on = +l.dataset.ci === current.chapter && +l.dataset.ti === current.topic;
      l.classList.toggle("active", on);
      if (on) {
        const chap = l.closest(".nav-chapter");
        if (chap) chap.classList.remove("collapsed");
      }
    });
  }

  /* ---------- main render ---------- */
  function renderTopic() {
    if (window.SIMS) SIMS.stop();
    const topic = CURRICULUM[current.chapter].topics[current.topic];
    const chapter = CURRICULUM[current.chapter];
    contentEl.innerHTML = "";

    // header
    const head = el("div", "topic-head");
    head.appendChild(el("div", "eyebrow", chapter.title + " · TOPIC " + String(current.topic + 1).padStart(2, "0")));
    head.appendChild(el("h1", "topic-title", topic.title));
    if (topic.tagline) head.appendChild(el("p", "topic-tagline", topic.tagline));
    contentEl.appendChild(head);

    // tabs
    const tabBar = el("div", "tabs");
    TABS.forEach((t) => {
      let count = 0;
      if (t.key === "concepts") count = (topic.concepts || []).length;
      else count = (topic[t.key] || []).length;
      const b = el("button", "tab" + (t.key === current.tab ? " active" : ""));
      b.innerHTML = t.label + '<span class="count">' + count + "</span>";
      b.addEventListener("click", () => {
        current.tab = t.key;
        renderTopic();
        if (contentEl.scrollIntoView) contentEl.scrollIntoView({ block: "start" });
      });
      tabBar.appendChild(b);
    });
    contentEl.appendChild(tabBar);

    // body
    const body = el("div", "tab-body");
    if (current.tab === "concepts") renderConcepts(body, topic);
    else if (current.tab === "essays") renderEssays(body, topic);
    else renderProblems(body, topic, current.tab);
    contentEl.appendChild(body);

    highlightNav();
    renderMath(contentEl);
    if (window.scrollTo) { try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (e) {} }
  }

  function renderConcepts(root, topic) {
    const list = topic.concepts || [];
    if (!list.length) return root.appendChild(emptyMsg("개념 정리가 준비 중입니다."));
    list.forEach((c) => {
      const block = el("div", "concept");
      block.appendChild(el("h2", "concept-name", c.name));
      if (c.body) block.appendChild(el("p", "concept-body", c.body));
      if (c.formulas && c.formulas.length) {
        const grid = el("div", "formula-grid");
        c.formulas.forEach((f, i) => {
          const card = el("div", "formula-card");
          card.appendChild(el("div", "formula-tag", "FORMULA " + String(i + 1).padStart(2, "0")));
          card.appendChild(el("div", "formula-math", "$$" + f.latex + "$$"));
          if (f.desc) card.appendChild(el("div", "formula-desc", f.desc));
          grid.appendChild(card);
        });
        block.appendChild(grid);
      }
      root.appendChild(block);
    });

    // 개념 학습용 인터랙티브 시뮬레이션
    if (window.SIMS && SIMS.has(topic.id)) {
      const section = el("div", "sim-section");
      const head = el("div", "sim-head");
      head.appendChild(el("span", "sim-tag", "SIMULATION"));
      head.appendChild(el("h2", "sim-title", "직접 조작하며 이해하기"));
      section.appendChild(head);
      section.appendChild(el("p", "sim-note", "슬라이더를 움직여 값을 바꾸면 결과가 실시간으로 달라집니다."));
      const host = el("div", "sim-host");
      section.appendChild(host);
      root.appendChild(section);
      SIMS.render(topic.id, host);
    }
  }

  function renderProblems(root, topic, key) {
    const list = topic[key] || [];
    if (!list.length) return root.appendChild(emptyMsg("문제가 준비 중입니다."));

    const note = el("p", "grade-help",
      "답을 입력하고 <b>채점하기</b>를 누르면 자동으로 맞는지 확인합니다. " +
      "(개념·단답형은 자동 채점이 정확하고, 계산형은 <b>정답 보기</b>로 직접 비교하세요.)");
    root.appendChild(note);

    list.forEach((p, i) => {
      const card = el("div", "problem " + key);
      const head = el("div", "problem-head");
      head.appendChild(el("span", "problem-num", "Q" + (i + 1)));
      head.appendChild(el("p", "problem-q", p.q));
      card.appendChild(head);

      // 단답형 채점 입력
      const gradeRow = el("div", "grade-row");
      const input = el("input", "grade-input");
      input.type = "text";
      input.placeholder = "정답을 입력하세요";
      input.setAttribute("aria-label", "정답 입력");
      const gradeBtn = el("button", "grade-btn", "채점하기");
      gradeRow.appendChild(input);
      gradeRow.appendChild(gradeBtn);
      card.appendChild(gradeRow);

      const result = el("div", "grade-result");
      card.appendChild(result);

      const ans = el("div", "answer");
      ans.innerHTML = '<span class="answer-label">ANSWER</span>' + p.a;

      const btn = el("button", "answer-btn");
      btn.innerHTML = '<span class="sym">⊕</span> 정답 보기';
      btn.addEventListener("click", () => {
        const open = ans.classList.toggle("show");
        btn.innerHTML = (open ? '<span class="sym">⊖</span> 정답 숨기기' : '<span class="sym">⊕</span> 정답 보기');
        if (open) renderMath(ans);
      });

      function doGrade() {
        if (!input.value.trim()) {
          result.className = "grade-result";
          result.textContent = "";
          return;
        }
        const ok = gradeAnswer(input.value, p.a);
        result.className = "grade-result show " + (ok ? "correct" : "wrong");
        result.innerHTML = ok
          ? '<span class="mark">✓</span> 정답입니다!'
          : '<span class="mark">✗</span> 다시 풀어보세요. 헷갈리면 <b>정답 보기</b>로 확인하세요.';
        input.classList.toggle("ok", ok);
        input.classList.toggle("no", !ok);
        if (ok && !ans.classList.contains("show")) btn.click(); // 정답이면 해설 자동 표시
      }
      gradeBtn.addEventListener("click", doGrade);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") doGrade(); });
      input.addEventListener("input", () => {
        if (!input.value) { result.className = "grade-result"; result.textContent = ""; input.classList.remove("ok", "no"); }
      });

      card.appendChild(btn);
      card.appendChild(ans);
      root.appendChild(card);
    });
  }

  function renderEssays(root, topic) {
    const list = topic.essays || [];
    if (!list.length) return root.appendChild(emptyMsg("논술형 문제가 준비 중입니다."));
    list.forEach((es, ei) => {
      const card = el("div", "essay");
      const q = el("p", "essay-q");
      q.innerHTML = '<span class="essay-num">논술 ' + (ei + 1) + "</span>" + es.q;
      card.appendChild(q);

      const steps = el("div", "steps");
      const stepEls = [];
      (es.steps || []).forEach((txt, si) => {
        const step = el("div", "step");
        if (si > 0) step.classList.add("locked");
        const btn = el("button", "step-btn");
        btn.innerHTML =
          '<span class="step-stage">' + (si + 1) + "</span>" +
          '<span class="step-label">' + (si + 1) + "단계 · " + STEP_LABELS[si] + "</span>" +
          '<span class="step-caret">▶</span>';
        const sbody = el("div", "step-body" + (si === 2 ? " final" : ""), txt);

        btn.addEventListener("click", () => {
          if (step.classList.contains("locked")) return;
          const open = step.classList.toggle("open");
          if (open) {
            renderMath(sbody);
            // unlock the next step once this one is opened
            if (stepEls[si + 1]) stepEls[si + 1].classList.remove("locked");
          }
        });
        step.appendChild(btn);
        step.appendChild(sbody);
        steps.appendChild(step);
        stepEls.push(step);
      });
      card.appendChild(steps);
      root.appendChild(card);
    });
  }

  function emptyMsg(t) {
    return el("p", "topic-tagline", t);
  }

  /* ---------- mobile sidebar ---------- */
  function openSidebar() {
    sidebar.classList.add("open");
    scrim.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    scrim.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", () =>
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar()
  );
  scrim.addEventListener("click", closeSidebar);

  /* ---------- init ---------- */
  function init() {
    if (typeof CURRICULUM === "undefined" || !CURRICULUM.length) {
      contentEl.innerHTML = "<p>데이터를 불러오지 못했습니다.</p>";
      return;
    }
    buildNav();
    renderTopic();
  }

  // KaTeX scripts are deferred; wait for full load so renderMathInElement exists.
  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();
