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
  }

  function renderProblems(root, topic, key) {
    const list = topic[key] || [];
    if (!list.length) return root.appendChild(emptyMsg("문제가 준비 중입니다."));
    list.forEach((p, i) => {
      const card = el("div", "problem " + key);
      const head = el("div", "problem-head");
      head.appendChild(el("span", "problem-num", "Q" + (i + 1)));
      head.appendChild(el("p", "problem-q", p.q));
      card.appendChild(head);

      const btn = el("button", "answer-btn");
      btn.innerHTML = '<span class="sym">⊕</span> 정답 보기';
      const ans = el("div", "answer");
      ans.innerHTML = '<span class="answer-label">ANSWER</span>' + p.a;
      btn.addEventListener("click", () => {
        const open = ans.classList.toggle("show");
        btn.innerHTML = (open ? '<span class="sym">⊖</span> 정답 숨기기' : '<span class="sym">⊕</span> 정답 보기');
        if (open) renderMath(ans);
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
