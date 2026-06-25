/* ============================================================
   물리학 II 학습 노트 — 인터랙티브 물리 시뮬레이션
   각 주제(topic.id)마다 하나의 캔버스 시뮬레이션을 제공한다.
   순수 Canvas 2D · 외부 라이브러리 없음.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- palette ---------- */
  const C = {
    blue: "#1f5fd6", deep: "#0f2c5c", ink: "#161a21", soft: "#586071",
    faint: "#8b93a3", line: "#dde3ec", teal: "#0d9488", orange: "#d97a06",
    purple: "#6d4ad4", red: "#d6452f", pos: "#d6452f", neg: "#1f5fd6"
  };

  /* ---------- dom helpers ---------- */
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  let CURP = {}; // 현재 시뮬레이션 프리셋(슬라이더 key → 초기값)
  function slider(parent, o) {
    const row = el("label", "sim-row");
    const top = el("div", "sim-row-top");
    top.appendChild(el("span", "sim-row-label", o.label));
    const val = el("span", "sim-row-val");
    top.appendChild(val);
    row.appendChild(top);
    const input = el("input", "sim-range");
    input.type = "range";
    input.min = o.min; input.max = o.max;
    input.step = o.step == null ? "any" : o.step;
    input.value = (o.key != null && CURP[o.key] != null) ? CURP[o.key] : o.value;
    row.appendChild(input);
    parent.appendChild(row);
    const fmt = o.fmt || ((v) => v);
    function upd() { val.textContent = fmt(parseFloat(input.value)) + (o.unit ? " " + o.unit : ""); }
    input.addEventListener("input", upd); upd();
    return { get() { return parseFloat(input.value); }, input };
  }

  function stats(host) {
    const box = el("div", "sim-stats");
    host.appendChild(box);
    return {
      set(items) {
        box.innerHTML = items
          .map(([k, v]) => '<span class="sim-stat"><b>' + k + "</b>" + v + "</span>")
          .join("");
      }
    };
  }

  function setupCanvas(host, height) {
    const canvas = el("canvas", "sim-canvas");
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    let w = 600;
    const h = height;
    function resize() {
      // host has 16px padding on each side
      w = Math.max(260, (host.clientWidth || 600) - 32);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    return { ctx, get w() { return w; }, get h() { return h; }, resize };
  }

  // Starts a RAF loop + resize handling, returns a cleanup fn.
  function run(c, draw) {
    const onR = () => c.resize();
    window.addEventListener("resize", onR);
    let raf, start = performance.now();
    function frame(now) { draw((now - start) / 1000); raf = requestAnimationFrame(frame); }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }

  /* ---------- draw helpers ---------- */
  function dot(ctx, x, y, r, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  function arrow(ctx, x1, y1, x2, y2, color, w) {
    w = w || 2;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (Math.hypot(x2 - x1, y2 - y1) < 1) return;
    const a = Math.atan2(y2 - y1, x2 - x1), hl = 7 + w;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(a - 0.4), y2 - hl * Math.sin(a - 0.4));
    ctx.lineTo(x2 - hl * Math.cos(a + 0.4), y2 - hl * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }
  function wire(ctx, a, b, color) {
    ctx.strokeStyle = color || C.deep; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  function segDots(ctx, a, b, cur, t, color) {
    const n = 7, dx = b[0] - a[0], dy = b[1] - a[1];
    const speed = cur <= 0.001 ? 0 : 0.12 + Math.min(cur, 12) * 0.05;
    for (let k = 0; k < n; k++) {
      const s = (((t * speed + k / n) % 1) + 1) % 1;
      dot(ctx, a[0] + dx * s, a[1] + dy * s, 3, color);
    }
  }
  function resistorBox(ctx, cx, cy, label) {
    ctx.fillStyle = "#fff"; ctx.strokeStyle = C.orange; ctx.lineWidth = 2;
    ctx.fillRect(cx - 30, cy - 12, 60, 24); ctx.strokeRect(cx - 30, cy - 12, 60, 24);
    ctx.fillStyle = C.deep; ctx.font = "600 11px JetBrains Mono, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
  }
  function text(ctx, str, x, y, color, font, align) {
    ctx.fillStyle = color || C.soft;
    ctx.font = font || "600 12px JetBrains Mono, monospace";
    ctx.textAlign = align || "left"; ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
  }
  function dtClamp(t, ref) {
    const dt = ref.last == null ? 0 : Math.min(0.05, t - ref.last);
    ref.last = t; return dt;
  }

  /* ============================================================
     SIMULATIONS — keyed by topic id
     ============================================================ */
  const REG = {

    /* 1. 돌림힘 — 지레/시소 평형 */
    torque(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const wL = slider(ctrl, { label: "왼쪽 무게", min: 1, max: 10, step: 1, value: 6, unit: "N" });
      const dL = slider(ctrl, { label: "왼쪽 거리", min: 0.5, max: 3, step: 0.1, value: 2, unit: "m", fmt: (v) => v.toFixed(1) });
      const wR = slider(ctrl, { label: "오른쪽 무게", min: 1, max: 10, step: 1, value: 4, unit: "N" });
      const dR = slider(ctrl, { label: "오른쪽 거리", min: 0.5, max: 3, step: 0.1, value: 2, unit: "m", fmt: (v) => v.toFixed(1) });
      const c = setupCanvas(host, 240); const st = stats(host);
      let ang = 0;
      function draw() {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const tL = wL.get() * dL.get(), tR = wR.get() * dR.get(), net = tR - tL;
        ang += (Math.max(-0.32, Math.min(0.32, net * 0.03)) - ang) * 0.08;
        const cx = w / 2, cy = h - 70, scale = (w / 2 - 50) / 3;
        ctx.fillStyle = C.deep;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 22, cy + 46); ctx.lineTo(cx + 22, cy + 46); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.translate(cx, cy - 6); ctx.rotate(ang);
        ctx.fillStyle = C.blue; ctx.fillRect(-(w / 2 - 40), -7, (w - 80), 14);
        function box(dist, wt, side, col) {
          const x = side * dist * scale, bs = 14 + wt * 2.2;
          ctx.fillStyle = col; ctx.fillRect(x - bs / 2, 7, bs, bs);
          text(ctx, wt + "N", x, 7 + bs / 2, "#fff", "700 10px JetBrains Mono, monospace", "center");
        }
        box(dL.get(), wL.get(), -1, C.orange);
        box(dR.get(), wR.get(), 1, C.teal);
        ctx.restore();
        st.set([
          ["τ왼", tL.toFixed(1) + " N·m"],
          ["τ오", tR.toFixed(1) + " N·m"],
          ["상태", Math.abs(net) < 0.05 ? "평형 ⚖" : (net > 0 ? "오른쪽으로 회전" : "왼쪽으로 회전")]
        ]);
      }
      return run(c, draw);
    },

    /* 2. 평형 — 무게중심과 안정성(쓰러짐) */
    equilibrium(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const th = slider(ctrl, { label: "기울기", min: 0, max: 45, step: 1, value: 12, unit: "°" });
      const base = slider(ctrl, { label: "받침면 너비", min: 0.4, max: 2.2, step: 0.1, value: 1.2, unit: "m", fmt: (v) => v.toFixed(1) });
      const ch = slider(ctrl, { label: "물체 높이", min: 0.4, max: 2.6, step: 0.1, value: 1.4, unit: "m", fmt: (v) => v.toFixed(1) });
      const c = setupCanvas(host, 260); const st = stats(host);
      function draw() {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const sc = 58, gy = h - 28, cx = w / 2;
        const B = base.get() * sc, H = ch.get() * sc;       // 박스 너비/높이(px)
        const a = th.get() * Math.PI / 180;                 // 오른쪽(시계방향)으로 기울임
        // 무게중심은 박스 중심(높이 H/2). 임계각 θc = atan((B/2)/(H/2)) = atan(B/H)
        const crit = Math.atan(B / H);
        // 회전축(피벗) = 기울어지는 쪽(오른쪽) 바닥 모서리
        const Px = cx + B / 2, Py = gy;
        // 바닥
        ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
        // 무게중심 월드 좌표 (로컬 (-B/2,-H/2)를 피벗 기준 시계방향 a 회전)
        const cosA = Math.cos(a), sinA = Math.sin(a);
        const cogx = Px + (-B / 2) * cosA - (-H / 2) * sinA;
        const cogy = Py + (-B / 2) * sinA + (-H / 2) * cosA;
        // 수선의 발이 피벗 모서리를 넘어가면 쓰러짐
        const tipping = cogx > Px + 0.5;
        // 박스(피벗을 중심으로 시계방향 회전)
        ctx.save(); ctx.translate(Px, Py); ctx.rotate(a);
        ctx.fillStyle = tipping ? "rgba(214,69,47,0.14)" : "rgba(31,95,214,0.12)";
        ctx.strokeStyle = tipping ? C.red : C.blue; ctx.lineWidth = 2.5;
        ctx.fillRect(-B, -H, B, H); ctx.strokeRect(-B, -H, B, H); // 로컬: 피벗이 우하단 (0,0)
        ctx.restore();
        // 수선(연직선): 무게중심에서 바닥까지 수직으로
        ctx.setLineDash([5, 5]); ctx.strokeStyle = tipping ? C.red : C.soft; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cogx, cogy); ctx.lineTo(cogx, gy); ctx.stroke(); ctx.setLineDash([]);
        // 무게중심 점 · 수선의 발 · 피벗 모서리 표시
        dot(ctx, cogx, cogy, 5, tipping ? C.red : C.deep);
        dot(ctx, cogx, gy, 3.5, tipping ? C.red : C.soft);
        dot(ctx, Px, gy, 4, C.deep);
        text(ctx, "회전축", Px + 6, gy - 10, C.soft, "600 10px JetBrains Mono, monospace");
        st.set([
          ["임계각 θc", "≈ " + (crit * 180 / Math.PI).toFixed(0) + "°"],
          ["상태", tipping ? "쓰러짐 ✗ (수선이 받침면 밖)" : "안정 ✓ (수선이 받침면 안)"],
          ["", "받침면 넓고·물체 낮을수록 안정"]
        ]);
      }
      return run(c, draw);
    },

    /* 3. 일과 운동에너지 — F·d = ΔKE */
    "work-energy"(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const F = slider(ctrl, { key: "F", label: "힘", min: 0, max: 40, step: 1, value: 12, unit: "N" });
      const m = slider(ctrl, { key: "m", label: "질량", min: 1, max: 10, step: 0.5, value: 2, unit: "kg", fmt: (v) => v.toFixed(1) });
      const mu = slider(ctrl, { key: "mu", label: "마찰계수", min: 0, max: 0.5, step: 0.05, value: 0.1, fmt: (v) => v.toFixed(2) });
      const c = setupCanvas(host, 230); const st = stats(host); const ref = {};
      let x = 0, v = 0;
      function draw(t) {
        const dt = dtClamp(t, ref);
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const g = 9.8, f = mu.get() * m.get() * g;
        // 움직이는 중에는 마찰이 운동을 방해(감속 가능), 정지 상태에서는 정지마찰을 이겨야 출발
        let acc;
        if (v > 0.001) acc = (F.get() - f) / m.get();
        else acc = F.get() > f ? (F.get() - f) / m.get() : 0;
        v += acc * dt; if (v < 0) v = 0;
        x += v * dt * 40; // 40 px/m
        const gy = h - 50, x0 = 50;
        if (x0 + x > w - 60 || (v < 0.001 && x > 5)) { x = 0; v = 0; }
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(0, gy + 22); ctx.lineTo(w, gy + 22); ctx.stroke();
        const bx = x0 + x, bs = 30 + m.get() * 4;
        ctx.fillStyle = C.blue; ctx.fillRect(bx, gy - bs + 22, bs, bs);
        arrow(ctx, bx + bs, gy - bs / 2 + 22, bx + bs + 12 + F.get() * 3, gy - bs / 2 + 22, C.orange, 3);
        if (f > 0) arrow(ctx, bx, gy + 22, bx - 12 - f * 3, gy + 22, C.red, 2);
        const d = x / 40, Wf = F.get() * d, KE = 0.5 * m.get() * v * v;
        st.set([
          ["일 W=F·d", Wf.toFixed(1) + " J"],
          ["운동E ½mv²", KE.toFixed(1) + " J"],
          ["속력 v", v.toFixed(1) + " m/s"],
          ["가속도", acc.toFixed(1) + " m/s²"]
        ]);
      }
      return run(c, draw);
    },

    /* 4. 역학적 에너지 보존 — 골짜기 궤도 위 공 */
    "energy-conservation"(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const h0 = slider(ctrl, { key: "h0", label: "시작 높이", min: 1, max: 4, step: 0.1, value: 3, unit: "m", fmt: (v) => v.toFixed(1) });
      const c = setupCanvas(host, 250); const st = stats(host);
      function draw(t) {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const g = 9.8, mpx = 46, cx = w / 2, gy = h - 40;
        const k = 1 / 2.4; // track curvature (height = k*(x_m)^2)
        const H = h0.get();
        const X = Math.sqrt(H / k); // turning amplitude in meters
        const omega = Math.sqrt(2 * g * k);
        const xm = X * Math.cos(omega * t); // SHM on parabola
        const ym = k * xm * xm;
        // track
        ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.beginPath();
        for (let xs = -3.2; xs <= 3.2; xs += 0.1) {
          const px = cx + xs * mpx, py = gy - k * xs * xs * mpx;
          xs === -3.2 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        const bx = cx + xm * mpx, by = gy - ym * mpx;
        dot(ctx, bx, by, 9, C.blue);
        const v = Math.sqrt(Math.max(0, 2 * g * (H - ym)));
        const PE = g * ym, KE = 0.5 * v * v, E = g * H; // per unit mass
        // energy bars
        const bx0 = 16, bw = 90, by0 = 18;
        function bar(label, val, frac, col, row) {
          const y = by0 + row * 24;
          ctx.fillStyle = C.line; ctx.fillRect(bx0 + 38, y, bw, 12);
          ctx.fillStyle = col; ctx.fillRect(bx0 + 38, y, bw * Math.max(0, Math.min(1, frac)), 12);
          text(ctx, label, bx0, y + 6, C.soft, "600 11px JetBrains Mono, monospace");
        }
        bar("위치E", PE, PE / E, C.teal, 0);
        bar("운동E", KE, KE / E, C.orange, 1);
        bar("합 E", E, 1, C.deep, 2);
        st.set([["위치E", PE.toFixed(1)], ["운동E", KE.toFixed(1)], ["역학적E(보존)", E.toFixed(1)], ["v", v.toFixed(1) + " m/s"]]);
      }
      return run(c, draw);
    },

    /* 5. 포물선운동 */
    projectile(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const v0 = slider(ctrl, { key: "v0", label: "속력", min: 5, max: 30, step: 1, value: 18, unit: "m/s" });
      const th = slider(ctrl, { key: "th", label: "발사각", min: 10, max: 80, step: 1, value: 45, unit: "°" });
      const c = setupCanvas(host, 260); const st = stats(host); const ref = {};
      let tt = 0;
      function draw(t) {
        tt += dtClamp(t, ref);
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const g = 9.8, rad = th.get() * Math.PI / 180, V = v0.get();
        const vx = V * Math.cos(rad), vy = V * Math.sin(rad);
        const flight = 2 * vy / g, range = vx * flight, maxh = vy * vy / (2 * g);
        if (tt > flight + 0.5) tt = 0;
        const m = 40, gy = h - 28;
        // 슬라이더 최댓값(v=30) 기준으로 스케일을 고정한다.
        // (매 프레임 사거리에 맞춰 다시 맞추면 속력을 올릴수록 화면에서 더 느리게 보이는 착시가 생긴다)
        const sc = Math.min((w - 2 * m) / 92, (gy - 24) / 46);
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
        ctx.strokeStyle = "rgba(31,95,214,0.25)"; ctx.lineWidth = 2; ctx.beginPath();
        for (let tau = 0; tau <= flight; tau += flight / 60) {
          const x = m + vx * tau * sc, y = gy - (vy * tau - 0.5 * g * tau * tau) * sc;
          tau === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        const ct = Math.min(tt, flight), px = m + vx * ct * sc, py = gy - (vy * ct - 0.5 * g * ct * ct) * sc;
        arrow(ctx, px, py, px + vx * sc * 0.25, py - (vy - g * ct) * sc * 0.25, C.orange, 2);
        dot(ctx, px, py, 7, C.blue);
        st.set([["수평거리 R", range.toFixed(1) + " m"], ["최고높이 H", maxh.toFixed(1) + " m"], ["체공시간", flight.toFixed(2) + " s"]]);
      }
      return run(c, draw);
    },

    /* 6. 등속 원운동 — 속도(접선)·구심가속도(중심) */
    circular(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const r = slider(ctrl, { key: "r", label: "반지름", min: 0.5, max: 8, step: 0.1, value: 1.5, unit: "m", fmt: (v) => v.toFixed(1) });
      const v = slider(ctrl, { key: "v", label: "속력", min: 1, max: 12, step: 0.1, value: 3, unit: "m/s", fmt: (v) => v.toFixed(1) });
      const c = setupCanvas(host, 250); const st = stats(host); const ref = {};
      let ang = 0;
      function draw(t) {
        ang += (v.get() / r.get()) * dtClamp(t, ref);
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2, R = (Math.min(w, h) / 2 - 50) * (r.get() / 3) + 20;
        ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
        dot(ctx, cx, cy, 4, C.deep);
        const ox = cx + R * Math.cos(ang), oy = cy + R * Math.sin(ang);
        ctx.setLineDash([4, 4]); ctx.strokeStyle = C.soft; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ox, oy); ctx.stroke(); ctx.setLineDash([]);
        const sp = v.get() * 14;
        arrow(ctx, ox, oy, ox - sp * Math.sin(ang), oy + sp * Math.cos(ang), C.orange, 2.5); // tangent v
        const ac = (v.get() * v.get() / r.get()) * 10;
        arrow(ctx, ox, oy, ox - ac * Math.cos(ang), oy - ac * Math.sin(ang), C.red, 2.5); // centripetal a
        dot(ctx, ox, oy, 8, C.blue);
        st.set([
          ["구심가속도 v²/r", (v.get() * v.get() / r.get()).toFixed(1) + " m/s²"],
          ["주기 T=2πr/v", (2 * Math.PI * r.get() / v.get()).toFixed(2) + " s"]
        ]);
      }
      return run(c, draw);
    },

    /* 7. 진자운동 */
    pendulum(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const L = slider(ctrl, { key: "L", label: "줄 길이", min: 0.5, max: 4, step: 0.1, value: 1.5, unit: "m", fmt: (v) => v.toFixed(1) });
      const a0 = slider(ctrl, { key: "a0", label: "초기 각", min: 5, max: 60, step: 1, value: 30, unit: "°" });
      const c = setupCanvas(host, 250); const st = stats(host);
      function draw(t) {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const g = 9.8, omega = Math.sqrt(g / L.get());
        const th = (a0.get() * Math.PI / 180) * Math.cos(omega * t);
        const px = w / 2, py = 24, len = L.get() / 3 * (h - 80) + 30;
        const bx = px + len * Math.sin(th), by = py + len * Math.cos(th);
        ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + len); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = C.deep; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
        dot(ctx, px, py, 4, C.deep); dot(ctx, bx, by, 12, C.blue);
        const T = 2 * Math.PI * Math.sqrt(L.get() / g);
        st.set([["주기 T=2π√(L/g)", T.toFixed(2) + " s"], ["", "주기는 진폭과 무관 (등시성)"]]);
      }
      return run(c, draw);
    },

    /* 8. 케플러 법칙 — 타원궤도·면적속도 일정 */
    kepler(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const e = slider(ctrl, { key: "e", label: "이심률 e", min: 0, max: 0.8, step: 0.02, value: 0.5, fmt: (v) => v.toFixed(2) });
      const a = slider(ctrl, { key: "a", label: "긴반지름 a", min: 1, max: 1.8, step: 0.05, value: 1.4, fmt: (v) => v.toFixed(2) });
      const c = setupCanvas(host, 270); const st = stats(host); const ref = {};
      let M = 0;
      function draw(t) {
        const ecc = e.get(), av = a.get();
        const T = 3 * Math.pow(av, 1.5); // T² ∝ a³ (시연용)
        M += (2 * Math.PI / T) * dtClamp(t, ref);
        // solve Kepler: E - e sinE = M
        let E = M; for (let i = 0; i < 6; i++) E -= (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E));
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const sc = (Math.min(w, h) / 2 - 36) / 1.8, cx = w / 2, cy = h / 2;
        const A = av * sc, B = av * Math.sqrt(1 - ecc * ecc) * sc, cFoc = av * ecc * sc;
        ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, A, B, 0, 0, 7); ctx.stroke();
        const sunx = cx + cFoc; // sun at focus
        dot(ctx, sunx, cy, 9, C.orange);
        const px = cx + A * (Math.cos(E) - ecc), py = cy + B * Math.sin(E);
        ctx.strokeStyle = C.soft; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sunx, cy); ctx.lineTo(px, py); ctx.stroke();
        dot(ctx, px, py, 7, C.blue);
        st.set([["주기 T (T²∝a³)", T.toFixed(2)], ["", "태양에 가까울수록 빠름 (면적속도 일정)"]]);
      }
      return run(c, draw);
    },

    /* 9. 등가원리 — 가속하는 승강기 */
    equivalence(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const acc = slider(ctrl, { key: "acc", label: "승강기 가속도(위 +)", min: -9.8, max: 9.8, step: 0.2, value: 0, unit: "m/s²", fmt: (v) => v.toFixed(1) });
      const c = setupCanvas(host, 250); const st = stats(host);
      function draw() {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const g = 9.8, mmass = 1, N = mmass * (g + acc.get()); // apparent weight
        const cx = w / 2, top = 24, bw = 130, bh = h - 70;
        ctx.strokeStyle = C.deep; ctx.lineWidth = 2.5; ctx.strokeRect(cx - bw / 2, top, bw, bh);
        // spring scale: length grows with apparent weight
        const sx = cx, sTop = top + 10, sLen = 22 + Math.max(0, N) * 5;
        ctx.strokeStyle = C.soft; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i <= 16; i++) { const yy = sTop + sLen * i / 16; ctx.lineTo(sx + (i % 2 ? 7 : -7), yy); } ctx.stroke();
        ctx.fillStyle = C.blue; ctx.beginPath(); ctx.arc(sx, sTop + sLen + 14, 16, 0, 7); ctx.fill();
        arrow(ctx, cx + bw / 2 + 14, top + bh / 2, cx + bw / 2 + 14, top + bh / 2 - acc.get() * 6, C.orange, 3);
        text(ctx, "a", cx + bw / 2 + 24, top + bh / 2 - acc.get() * 6, C.orange, "700 13px JetBrains Mono, monospace");
        let note = "정지/등속과 같음";
        if (Math.abs(g + acc.get()) < 0.3) note = "무중력처럼 느낌 (자유낙하)";
        else if (acc.get() > 0.3) note = "더 무겁게 느낌";
        else if (acc.get() < -0.3) note = "더 가볍게 느낌";
        st.set([["겉보기 무게", N.toFixed(1) + " N"], ["느낌", note], ["", "가속과 중력은 구별할 수 없다"]]);
      }
      return run(c, draw);
    },

    /* 10. 중력렌즈와 블랙홀 — 빛의 휘어짐 */
    blackhole(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const Mass = slider(ctrl, { key: "M", label: "질량 M", min: 1, max: 10, step: 0.5, value: 5, fmt: (v) => v.toFixed(1) });
      const bImp = slider(ctrl, { key: "b", label: "충돌 거리 b", min: 6, max: 120, step: 1, value: 55, unit: "px" });
      const c = setupCanvas(host, 250); const st = stats(host);
      let photons = [];
      let lastOutcome = "휘어져 지나감 (중력렌즈)";
      function launch() { photons = [{ x: 0, y: 0, vx: 1, vy: 0, trail: [], dead: false, captured: false }]; }
      launch();
      function draw() {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2, M = Mass.get(), rh = 5 + M * 1.8;
        // event horizon
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rh * 3);
        grd.addColorStop(0, "#000"); grd.addColorStop(0.5, "rgba(15,28,50,0.5)"); grd.addColorStop(1, "rgba(15,28,50,0)");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, rh * 3, 0, 7); ctx.fill();
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx, cy, rh, 0, 7); ctx.fill();
        const p = photons[0];
        if (!p.started) { p.x = 0; p.y = cy - bImp.get(); p.vx = 1; p.vy = 0; p.trail = []; p.dead = false; p.captured = false; p.started = true; }
        for (let s = 0; s < 4 && !p.dead; s++) {
          const dx = cx - p.x, dy = cy - p.y, r = Math.hypot(dx, dy);
          if (r < rh) { p.dead = true; p.captured = true; break; }   // 사건의 지평선 안 → 포획
          const aMag = (M * 9) / (r * r);
          p.vx += aMag * dx / r; p.vy += aMag * dy / r;
          const sp = Math.hypot(p.vx, p.vy); p.vx = p.vx / sp * 2.2; p.vy = p.vy / sp * 2.2;
          p.x += p.vx; p.y += p.vy; p.trail.push([p.x, p.y]);
          if (p.x > w + 20 || p.y < -20 || p.y > h + 20) p.dead = true; // 화면 밖 → 통과
        }
        ctx.strokeStyle = C.orange; ctx.lineWidth = 2; ctx.beginPath();
        p.trail.forEach((pt, i) => i === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1])); ctx.stroke();
        if (p.trail.length) { const last = p.trail[p.trail.length - 1]; dot(ctx, last[0], last[1], 4, "#ffcf5a"); }
        if (p.dead) { lastOutcome = p.captured ? "포획됨 (블랙홀)" : "휘어져 지나감 (중력렌즈)"; p.started = false; }
        st.set([["사건의 지평선", "r ≈ " + rh.toFixed(0) + "px"], ["빛", lastOutcome]]);
      }
      return run(c, draw);
    },

    /* 11. 쿨롱 법칙 — 두 전하 사이의 힘 */
    coulomb(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const q1 = slider(ctrl, { key: "q1", label: "전하 q₁", min: -5, max: 5, step: 1, value: 3 });
      const q2 = slider(ctrl, { key: "q2", label: "전하 q₂", min: -5, max: 5, step: 1, value: -2 });
      const d = slider(ctrl, { key: "d", label: "거리 r", min: 1, max: 5, step: 0.2, value: 3, unit: "m", fmt: (v) => v.toFixed(1) });
      const c = setupCanvas(host, 220); const st = stats(host);
      function draw() {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const cy = h / 2, sep = Math.min(w - 160, d.get() * 60);
        const x1 = w / 2 - sep / 2, x2 = w / 2 + sep / 2;
        const k = 9, F = k * Math.abs(q1.get() * q2.get()) / (d.get() * d.get());
        const repel = q1.get() * q2.get() > 0;
        const same = q1.get() * q2.get();
        function charge(x, q) {
          const col = q > 0 ? C.pos : (q < 0 ? C.neg : C.faint);
          dot(ctx, x, cy, 17 + Math.abs(q) * 2, col);
          text(ctx, q > 0 ? "+" + q : "" + q, x, cy, "#fff", "700 14px JetBrains Mono, monospace", "center");
        }
        charge(x1, q1.get()); charge(x2, q2.get());
        if (same !== 0) {
          const al = Math.min(70, 12 + F * 1.2);
          const s1 = repel ? -1 : 1, s2 = repel ? 1 : -1;
          arrow(ctx, x1, cy - 34, x1 + s1 * al, cy - 34, C.orange, 3);
          arrow(ctx, x2, cy - 34, x2 + s2 * al, cy - 34, C.orange, 3);
        }
        st.set([
          ["힘 F=kq₁q₂/r²", same === 0 ? "0" : F.toFixed(1) + " (상댓값)"],
          ["종류", same === 0 ? "—" : (repel ? "척력(밀어냄)" : "인력(끌어당김)")]
        ]);
      }
      return run(c, draw);
    },

    /* 12. 전위 — 점전하 주위의 전위/등전위선 */
    potential(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const Q = slider(ctrl, { key: "Q", label: "전하 Q", min: -5, max: 5, step: 1, value: 3 });
      const r = slider(ctrl, { key: "r", label: "측정 거리 r", min: 0.5, max: 4, step: 0.1, value: 2, unit: "m", fmt: (v) => v.toFixed(1) });
      const c = setupCanvas(host, 240); const st = stats(host);
      function draw() {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2, k = 9, sc = 42;
        // equipotential rings
        for (let rr = 4; rr >= 1; rr--) {
          ctx.strokeStyle = Q.get() >= 0 ? "rgba(214,69,47,0.25)" : "rgba(31,95,214,0.25)";
          ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, rr * sc * 0.55, 0, 7); ctx.stroke();
        }
        dot(ctx, cx, cy, 16, Q.get() >= 0 ? C.pos : C.neg);
        text(ctx, Q.get() >= 0 ? "+" : "−", cx, cy, "#fff", "700 15px JetBrains Mono, monospace", "center");
        const tx = cx + r.get() * sc * 0.55, ty = cy;
        dot(ctx, tx, ty, 7, C.teal);
        text(ctx, "+1", tx, ty - 16, C.teal, "700 11px JetBrains Mono, monospace", "center");
        const V = k * Q.get() / r.get(), U = 1 * V;
        st.set([["전위 V=kQ/r", V.toFixed(1) + " (상댓값)"], ["위치E U=qV", U.toFixed(1)], ["", "가까울수록 |V| 커짐"]]);
      }
      return run(c, draw);
    },

    /* 13. 축전기 — 평행판 충전 */
    capacitor(host) {
      const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
      const V = slider(ctrl, { key: "V", label: "전압 V", min: 1, max: 10, step: 1, value: 6, unit: "V" });
      const dd = slider(ctrl, { key: "d", label: "극판 간격 d", min: 0.5, max: 3, step: 0.1, value: 1.5, unit: "mm", fmt: (v) => v.toFixed(1) });
      const A = slider(ctrl, { key: "A", label: "극판 넓이 A", min: 1, max: 3, step: 0.1, value: 2, fmt: (v) => v.toFixed(1) });
      const c = setupCanvas(host, 240); const st = stats(host);
      function draw() {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2, gap = dd.get() * 34, ph = A.get() * 52;
        const lx = cx - gap / 2, rx = cx + gap / 2;
        ctx.strokeStyle = C.pos; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(lx, cy - ph / 2); ctx.lineTo(lx, cy + ph / 2); ctx.stroke();
        ctx.strokeStyle = C.neg; ctx.beginPath(); ctx.moveTo(rx, cy - ph / 2); ctx.lineTo(rx, cy + ph / 2); ctx.stroke();
        const Cap = A.get() / dd.get(), Q = Cap * V.get(), Efield = V.get() / dd.get();
        const lines = Math.max(2, Math.min(9, Math.round(Efield * 1.2)));
        for (let i = 0; i < lines; i++) {
          const yy = cy - ph / 2 + ph * (i + 0.5) / lines;
          arrow(ctx, lx + 6, yy, rx - 6, yy, "rgba(31,95,214,0.5)", 1.5);
        }
        const charges = Math.max(2, Math.min(8, Math.round(Q)));
        for (let i = 0; i < charges; i++) {
          const yy = cy - ph / 2 + ph * (i + 0.5) / charges;
          text(ctx, "+", lx - 12, yy, C.pos, "700 13px JetBrains Mono, monospace", "center");
          text(ctx, "−", rx + 12, yy, C.neg, "700 13px JetBrains Mono, monospace", "center");
        }
        st.set([
          ["전기용량 C=εA/d", Cap.toFixed(2) + " (상댓값)"],
          ["전하량 Q=CV", Q.toFixed(1)],
          ["전기장 E=V/d", Efield.toFixed(1)]
        ]);
      }
      return run(c, draw);
    },

    /* 14. 옴의 법칙·직렬 — 전류 일정, 전압 분배 (N개 저항) */
    "ohm-series"(host, opts) {
      const cfg = opts && opts.config;
      const fr = (x) => Number.isInteger(x) ? ("" + x) : x.toFixed(1);
      let getV, getRs;
      if (cfg && cfg.resistors) {
        getV = () => cfg.V; getRs = () => cfg.resistors;
      } else {
        const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
        const V = slider(ctrl, { key: "V", label: "전압 V", min: 1, max: 100, step: 1, value: 9, unit: "V" });
        const R1 = slider(ctrl, { key: "R1", label: "저항 R₁", min: 1, max: 30, step: 1, value: 4, unit: "Ω" });
        const R2 = slider(ctrl, { key: "R2", label: "저항 R₂", min: 1, max: 30, step: 1, value: 2, unit: "Ω" });
        getV = () => V.get(); getRs = () => [R1.get(), R2.get()];
      }
      const c = setupCanvas(host, 235); const st = stats(host);
      function draw(t) {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const V = getV(), Rs = getRs(), sum = Rs.reduce((a, b) => a + b, 0), I = V / sum, P = V * I;
        const x0 = 46, x1 = w - 46, y0 = 42, y1 = h - 42;
        const TL = [x0, y0], TR = [x1, y0], BR = [x1, y1], BL = [x0, y1];
        wire(ctx, TL, TR); wire(ctx, TR, BR); wire(ctx, BR, BL); wire(ctx, BL, TL);
        const my = (y0 + y1) / 2;
        ctx.strokeStyle = C.deep; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0 - 9, my - 9); ctx.lineTo(x0 + 9, my - 9); ctx.stroke();
        ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x0 - 5, my + 9); ctx.lineTo(x0 + 5, my + 9); ctx.stroke();
        text(ctx, fr(V) + "V", x0 - 14, my, C.deep, "700 11px JetBrains Mono, monospace", "right");
        const n = Rs.length;
        for (let i = 0; i < n; i++) {
          const cxr = x0 + (x1 - x0) * (i + 1) / (n + 1);
          resistorBox(ctx, cxr, y0, "R" + (i + 1) + "=" + fr(Rs[i]) + "Ω");
        }
        segDots(ctx, TL, TR, I, t, C.orange); segDots(ctx, TR, BR, I, t, C.orange);
        segDots(ctx, BR, BL, I, t, C.orange); segDots(ctx, BL, TL, I, t, C.orange);
        st.set([
          ["합성저항 ΣR", fr(sum) + " Ω"],
          ["전류 I=V/ΣR", I.toFixed(2) + " A"],
          ["각 전압 IR", Rs.map((R) => (I * R).toFixed(1)).join(" / ") + " V"],
          ["전체전력 P=VI", P.toFixed(1) + " W"]
        ]);
      }
      return run(c, draw);
    },

    /* 15. 병렬 연결 — 전압 일정, 전류 분배 (N개 가지) */
    parallel(host, opts) {
      const cfg = opts && opts.config;
      const fr = (x) => Number.isInteger(x) ? ("" + x) : x.toFixed(1);
      const COLS = [C.orange, C.teal, C.purple, C.blue];
      let getV, getRs;
      if (cfg && cfg.resistors) {
        getV = () => cfg.V; getRs = () => cfg.resistors;
      } else {
        const ctrl = el("div", "sim-controls"); host.appendChild(ctrl);
        const V = slider(ctrl, { key: "V", label: "전압 V", min: 1, max: 100, step: 1, value: 12, unit: "V" });
        const R1 = slider(ctrl, { key: "R1", label: "저항 R₁", min: 1, max: 30, step: 1, value: 4, unit: "Ω" });
        const R2 = slider(ctrl, { key: "R2", label: "저항 R₂", min: 1, max: 30, step: 1, value: 6, unit: "Ω" });
        getV = () => V.get(); getRs = () => [R1.get(), R2.get()];
      }
      const c = setupCanvas(host, 250); const st = stats(host);
      function draw(t) {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const V = getV(), Rs = getRs();
        const Is = Rs.map((R) => V / R), It = Is.reduce((a, b) => a + b, 0);
        const Req = 1 / Rs.reduce((a, R) => a + 1 / R, 0);
        const lx = 70, rx = w - 56, ty = 46, by = h - 38, my = (ty + by) / 2, n = Rs.length;
        wire(ctx, [lx, ty], [lx, by]); wire(ctx, [rx, ty], [rx, by]);
        ctx.strokeStyle = C.deep; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx - 22, my - 9); ctx.lineTo(lx - 22, my + 9); ctx.stroke();
        wire(ctx, [lx - 22, ty + 6], [lx, ty + 6]); wire(ctx, [lx - 22, by - 6], [lx, by - 6]);
        wire(ctx, [lx - 22, my - 9], [lx - 22, ty + 6]); wire(ctx, [lx - 22, my + 9], [lx - 22, by - 6]);
        text(ctx, fr(V) + "V", lx - 28, my, C.deep, "700 11px JetBrains Mono, monospace", "right");
        for (let i = 0; i < n; i++) {
          const yk = n === 1 ? my : ty + (by - ty) * (i + 0.5) / n;
          wire(ctx, [lx, yk], [rx, yk]);
          resistorBox(ctx, (lx + rx) / 2, yk, "R" + (i + 1) + "=" + fr(Rs[i]) + "Ω");
          segDots(ctx, [lx, yk], [rx, yk], Is[i], t, COLS[i % COLS.length]);
        }
        segDots(ctx, [lx, by], [lx, ty], It, t, C.deep);
        segDots(ctx, [rx, ty], [rx, by], It, t, C.deep);
        st.set([
          ["가지전류 V/R", Is.map((x) => x.toFixed(1)).join(" / ") + " A"],
          ["전체전류 Iₜ", It.toFixed(1) + " A"],
          ["합성저항", fr(Math.round(Req * 100) / 100) + " Ω"]
        ]);
      }
      return run(c, draw);
    },

    /* 지레/평형 — 임의 개수의 하중을 가진 막대 (config 기반, 문제 전용) */
    lever(host, opts) {
      const cfg = (opts && opts.config) || {};
      const c = setupCanvas(host, 250); const st = stats(host);
      const L = cfg.length || 2;                 // 막대 길이(m)
      const loads = cfg.loads || [];             // [{x, f, label}]  f>0 아래로, f<0 위로
      const fulcrum = cfg.fulcrum;               // 단일 받침점 x (틸트 모드)
      const supports = cfg.supports;             // [x1, x2] (두 받침점 모드)
      const fr = (x) => Number.isInteger(x) ? ("" + x) : x.toFixed(1);
      let ang = 0;
      function draw() {
        const ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
        const m = 40, bx0 = m, bx1 = w - m, cy = h * 0.52;
        const sx = (x) => bx0 + (bx1 - bx0) * (x / L);   // m → px
        const sc = (bx1 - bx0) / L;
        const px = (typeof fulcrum === "number") ? sx(fulcrum) : (w / 2);
        // 두 받침점 모드: 반력 계산, 막대 수평
        if (supports && supports.length === 2) {
          const [a1, a2] = supports;
          // ΣF=0, Στ(about a1)=0 → R2
          let sumF = 0, torque1 = 0;
          loads.forEach((ld) => { sumF += ld.f; torque1 += ld.f * (ld.x - a1); });
          const R2 = torque1 / (a2 - a1), R1 = sumF - R2;
          const by = cy;
          // 막대
          ctx.strokeStyle = C.blue; ctx.lineWidth = 7; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.stroke(); ctx.lineCap = "butt";
          // 받침점(삼각형) + 반력(위로)
          [[a1, R1], [a2, R2]].forEach(([ax, R]) => {
            const X = sx(ax);
            ctx.fillStyle = C.deep; ctx.beginPath(); ctx.moveTo(X, by + 6); ctx.lineTo(X - 11, by + 26); ctx.lineTo(X + 11, by + 26); ctx.closePath(); ctx.fill();
            arrow(ctx, X, by + 4, X, by + 4 - Math.max(10, Math.min(70, Math.abs(R) * 2.2)) * Math.sign(R || 1), C.teal, 3);
            text(ctx, "R=" + fr(Math.round(R * 10) / 10), X, by + 38, C.teal, "700 11px JetBrains Mono, monospace", "center");
          });
          // 하중(아래/위 화살표)
          loads.forEach((ld) => {
            const X = sx(ld.x), len = Math.max(10, Math.min(64, Math.abs(ld.f) * 2.2));
            const dir = ld.f >= 0 ? 1 : -1;
            arrow(ctx, X, by, X, by + dir * len, ld.f >= 0 ? C.orange : C.purple, 2.5);
            text(ctx, (ld.label || (fr(Math.abs(ld.f)) + "N")), X, by + dir * (len + 11), C.soft, "600 10px JetBrains Mono, monospace", "center");
          });
          st.set([
            ["왼쪽 반력 R₁", fr(Math.round(R1 * 10) / 10) + " N"],
            ["오른쪽 반력 R₂", fr(Math.round(R2 * 10) / 10) + " N"],
            ["", "ΣF=0, Στ=0 (정지 평형)"]
          ]);
          return;
        }
        // 단일 받침점 모드: 알짜 돌림힘으로 살짝 기울임
        let tauL = 0, tauR = 0;
        loads.forEach((ld) => {
          const arm = ld.x - fulcrum, tau = ld.f * arm; // f아래로 +
          if (arm < 0) tauL += -tau; else tauR += tau;   // 양쪽 회전 효과 크기
        });
        const net = tauR - tauL;
        ang += (Math.max(-0.3, Math.min(0.3, net * 0.02)) - ang) * 0.08;
        // 받침점 삼각형
        ctx.fillStyle = C.deep; ctx.beginPath(); ctx.moveTo(px, cy + 6); ctx.lineTo(px - 16, cy + 34); ctx.lineTo(px + 16, cy + 34); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.translate(px, cy); ctx.rotate(ang);
        ctx.strokeStyle = C.blue; ctx.lineWidth = 7; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(bx0 - px, 0); ctx.lineTo(bx1 - px, 0); ctx.stroke(); ctx.lineCap = "butt";
        loads.forEach((ld) => {
          const lxp = (sx(ld.x) - px), len = Math.max(10, Math.min(60, Math.abs(ld.f) * 2));
          const dir = ld.f >= 0 ? 1 : -1;
          arrow(ctx, lxp, 0, lxp, dir * len, ld.f >= 0 ? C.orange : C.purple, 2.5);
          text(ctx, (ld.label || (fr(Math.abs(ld.f)) + "N")), lxp, dir * (len + 10), C.soft, "600 10px JetBrains Mono, monospace", "center");
        });
        ctx.restore();
        st.set([
          ["왼쪽 돌림힘 Στ", fr(Math.round(tauL * 10) / 10) + " N·m"],
          ["오른쪽 돌림힘 Στ", fr(Math.round(tauR * 10) / 10) + " N·m"],
          ["상태", Math.abs(net) < 0.05 ? "평형 ⚖" : (net > 0 ? "오른쪽으로 회전" : "왼쪽으로 회전")]
        ]);
      }
      return run(c, draw);
    }
  };

  /* ---------- public API ---------- */
  let active = null;
  window.SIMS = {
    has(id) { return typeof REG[id] === "function"; },
    render(id, host, opts) {
      this.stop();
      const build = REG[id];
      if (!build) return false;
      host.innerHTML = "";
      CURP = (opts && opts.presets) || {};
      try { active = build(host, opts) || null; } catch (e) { active = null; }
      CURP = {};
      return true;
    },
    stop() {
      if (active) { try { active(); } catch (e) {} active = null; }
    }
  };
})();
