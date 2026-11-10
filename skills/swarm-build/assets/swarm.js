/* swarm.js（swarm-build）：网页往下滚，下面先是空白，一群彩色光标飞过去把它「搭」出来。
 * https://github.com/xiaopu-ai/swarm-build
 * 用法：在网页 </body> 前加一行
 *   <script src="swarm.js"></script>
 * 可选：data-agents="24"（同时最多几个光标）、data-text="这个页面由 {n} 个 AI Agent 一起搭成"（{n} 是一共派出的光标数）
 * 临时关掉：网址后面加 ?noswarm
 *
 * 做法：把页面按上下切成几段，每段先盖一层和它底色一样的空白（带蓝图格子）。
 * 打开时约 20 个光标在中间围成一圈；某一段滚进屏幕，光标从屏幕边上飞进来，给这段里的主要区块拉框、标尺寸，
 * 再沿框把空白「剪开」露出真内容，最后把这段剩下的空白收掉。这段搭完，光标就淡出离开；
 * 再往下滚到空白，才有新的一批光标进来。全部搭完，右下角出一句话。
 * 不改网页本身的任何元素：页面自己的动画、3D、脚本后来生成的内容都照常；固定在顶部的导航不盖。
 * 系统开了「减少动态效果」就不播；任何一段卡住超过 12 秒自动露出来。不依赖任何库。MIT。
 */
(function () {
  "use strict";
  var me = document.currentScript;
  var MAX = Math.max(6, Math.min(60, parseInt((me && me.dataset.agents) || "24", 10) || 24));
  var RING = Math.min(20, MAX);
  var TEXT = (me && me.dataset.text) || "这个页面由 {n} 个 AI Agent 一起搭成";
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (/[?&]noswarm\b/.test(location.search)) return;

  var COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];
  var Z = 2147483000, W = innerWidth, H = innerHeight;
  var SKIP = /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|BR|SOURCE|TRACK|PATH|G|DEFS|LINEARGRADIENT|RADIALGRADIENT|STOP|CLIPPATH|MASK|USE)$/i;

  var css = document.createElement("style");
  css.textContent =
    ".sw-cover{position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:" + Z + ";transition:opacity .3s}" +
    ".sw-ov{position:absolute;left:0;top:0;z-index:" + Z + ";transition:opacity .45s}" +
    ".sw-layer{position:absolute;left:0;top:0;width:0;height:0;z-index:" + (Z + 1) + ";pointer-events:none}" +
    ".sw-cur{position:absolute;left:0;top:0;width:18px;height:18px;transition:transform .5s cubic-bezier(.3,.7,.2,1),opacity .5s;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}" +
    ".sw-box{position:absolute;border:1.5px solid;border-radius:2px;transition:width .42s ease-out,height .42s ease-out,opacity .4s}" +
    ".sw-tag{position:absolute;left:50%;bottom:-19px;transform:translateX(-50%);font:600 10px/1 ui-monospace,Menlo,monospace;color:#fff;padding:3px 5px;border-radius:3px;white-space:nowrap}" +
    ".sw-line{position:absolute;opacity:.6;transition:opacity 1s}" +
    ".sw-toast{position:fixed;right:20px;bottom:20px;z-index:" + (Z + 2) + ";font:500 13px/1.5 system-ui,-apple-system,'PingFang SC',sans-serif;color:#111;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;box-shadow:0 6px 24px rgba(0,0,0,.14);opacity:0;transform:translateY(8px);transition:opacity .4s,transform .4s}" +
    ".sw-toast.on{opacity:1;transform:none}";
  document.head.appendChild(css);

  function isDark(c) {
    var m = String(c).match(/\d+(\.\d+)?/g); if (!m || m.length < 3) return false;
    return (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000 < 128;
  }
  function opaque(c) { return c && c !== "transparent" && !/rgba\([^)]*,\s*0(\.0+)?\)$/.test(c); }
  function bgOf(el) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      var c = getComputedStyle(el).backgroundColor;
      if (opaque(c)) return c;
    }
    var h = getComputedStyle(document.documentElement).backgroundColor;
    return opaque(h) ? h : "#ffffff";
  }
  function paper(bg) {
    var ink = isDark(bg) ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.06)";
    return "background-color:" + bg + ";background-image:linear-gradient(" + ink + " 1px,transparent 1px),linear-gradient(90deg," + ink + " 1px,transparent 1px);background-size:40px 40px";
  }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // 1. 先整屏盖住，等页面画好再切段
  var cover = document.createElement("div");
  cover.className = "sw-cover";
  cover.style.cssText += ";" + paper(bgOf(document.body));
  var layer = document.createElement("div");
  layer.className = "sw-layer";
  document.documentElement.appendChild(cover);
  document.documentElement.appendChild(layer);

  // 2. 光标：要用时从屏幕边上飞进来，闲下来就淡出离开
  var cursors = [], spawned = 0;
  function moveTo(cur, x, y, ms) {
    cur.x = x; cur.y = y;
    cur.el.style.transitionDuration = (ms || 500) + "ms";
    cur.el.style.transform = "translate(" + x + "px," + y + "px)";
  }
  function spawn(x, y) {
    var c = COLORS[spawned % COLORS.length];
    var d = document.createElement("div");
    d.className = "sw-cur";
    d.style.opacity = "0";
    d.innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M2 1.5 L15.5 8 L9.2 9.6 L6.6 15.8 Z" fill="' + c + '" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    layer.appendChild(d);
    var cur = { el: d, color: c, busy: false, x: 0, y: 0, a: (spawned % RING) / RING * Math.PI * 2, freeAt: Date.now() };
    spawned++;
    moveTo(cur, x, y, 0);
    d.offsetWidth;
    d.style.opacity = "1";
    cursors.push(cur);
    return cur;
  }
  function despawn(cur) {
    cursors.splice(cursors.indexOf(cur), 1);
    var a = Math.random() * Math.PI * 2;
    cur.el.style.opacity = "0";
    moveTo(cur, cur.x + Math.cos(a) * 120, cur.y + Math.sin(a) * 120, 500);
    setTimeout(function () { cur.el.remove(); }, 520);
  }
  // 从离目标最近的屏幕边外面进场
  function entry(b) {
    var cx = b.x + b.w / 2 - scrollX, cy = b.y + b.h / 2 - scrollY;
    var d = [cx, W - cx, H - cy, cy], m = d.indexOf(Math.min.apply(null, d));
    var jx = Math.random() * 80 - 40, jy = Math.random() * 80 - 40;
    if (m === 0) return [scrollX - 30, scrollY + cy + jy];
    if (m === 1) return [scrollX + W + 30, scrollY + cy + jy];
    if (m === 2) return [scrollX + cx + jx, scrollY + H + 30];
    return [scrollX + cx + jx, scrollY - 30];
  }
  for (var i = 0; i < RING; i++) spawn(scrollX + W / 2, scrollY + H / 2);
  var spin = 0, ready = false;
  function idle() {
    if (!ready) {   // 等页面画好的时候，在屏幕中间围成一圈转
      spin += 0.22;
      cursors.forEach(function (cur) {
        var r = 90 + (cur.a * 7 % 30);
        moveTo(cur, scrollX + W / 2 + Math.cos(cur.a + spin) * r, scrollY + H / 2 + Math.sin(cur.a + spin) * r, 260);
      });
      return;
    }
    // 闲了 0.6 秒以上的光标淡出离开；屏幕里没有要搭的东西时，一个都不留
    var now = Date.now();
    cursors.slice().forEach(function (cur) { if (!cur.busy && now - cur.freeAt > 600) despawn(cur); });
  }
  idle();
  var idleTimer = setInterval(idle, 240);

  // 3. 切段：从 body 往下找一块块上下排开的区域；太高的就往里再切一层
  var segs = [], fixedEls = [], done = false;
  function hasSticky(el) {
    var all = el.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) if (getComputedStyle(all[i]).position === "sticky") return true;
    return getComputedStyle(el).position === "sticky";
  }
  function collect(root) {
    [].forEach.call(root.children, function (el) {
      if (el === cover || el === layer || SKIP.test(el.tagName)) return;
      var cs = getComputedStyle(el);
      if (cs.position === "fixed") { fixedEls.push(el); return; }
      if (cs.display === "none" || cs.visibility === "hidden") return;
      var r = el.getBoundingClientRect();
      if (r.height < 4 || r.width < 4) return;
      var kids = [].filter.call(el.children, function (k) { return !SKIP.test(k.tagName) && k.getBoundingClientRect().height > 4; });
      // 太高的往里再切一层（只有一层外壳的也穿过去）；钉住的元素自己成一段，空白每帧跟着它走
      if (r.height > 1.4 * H && kids.length >= 1 && cs.position !== "sticky") return collect(el);
      segs.push({ el: el, sticky: cs.position === "sticky" || (r.height > 1.2 * H && hasSticky(el)), holes: [], state: "wait", clip: "" });
    });
  }
  // 固定在页面上的导航这类，切段时就记下来，空白上给它们留洞
  function findFixed() {
    var all = document.body.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP.test(el.tagName) || fixedEls.indexOf(el) >= 0) continue;
      if (getComputedStyle(el).position !== "fixed") continue;
      if (fixedEls.some(function (f) { return f.contains(el); })) continue;
      fixedEls.push(el);
    }
  }

  function setup() {
    collect(document.body);
    findFixed();
    if (!segs.length) segs.push({ el: document.body, sticky: false, holes: [], state: "wait", clip: "" });
    segs.forEach(function (s) {
      s.ov = document.createElement("div");
      s.ov.className = "sw-ov";
      s.ov.style.cssText += ";" + paper(bgOf(s.el));
      document.documentElement.insertBefore(s.ov, layer);
    });
    sync();
    ready = true;
    cover.style.opacity = "0";
    setTimeout(function () { cover.remove(); }, 350);
    loop();
  }

  // 4. 每一帧：空白跟着各段的位置走，剪开的洞跟着段走；先统一读位置，再统一写，避免来回重排
  function rectPath(x, y, w, h) {
    if (w <= 0.5 || h <= 0.5) return "";
    return "M" + x.toFixed(1) + " " + y.toFixed(1) + "h" + w.toFixed(1) + "v" + h.toFixed(1) + "h" + (-w).toFixed(1) + "Z";
  }
  function sync() {
    var sx = scrollX, sy = scrollY;
    var fr = fixedEls.map(function (f) { return f.getBoundingClientRect(); });
    var live = segs.filter(function (s) { return s.state !== "done"; });
    live.forEach(function (s) { s.r = s.el.getBoundingClientRect(); });
    live.forEach(function (s) {
      var r = s.r;
      s.x = r.left + sx; s.y = r.top + sy; s.w = r.width; s.h = r.height;
      var o = s.ov.style;
      o.transform = "translate(" + s.x + "px," + s.y + "px)";
      o.width = s.w + "px"; o.height = s.h + "px";
      if (r.bottom < -60 || r.top > H + 60) return;
      var p = "M0 0H" + s.w.toFixed(1) + "V" + s.h.toFixed(1) + "H0Z";
      s.holes.forEach(function (h) { p += rectPath(h.x, h.y, h.w * h.p, h.h); });
      fr.forEach(function (f) {
        if (f.width < 2 || f.height < 2) return;
        var hy = f.top - r.top;
        if (hy + f.height > 0 && hy < s.h) p += rectPath(f.left - r.left, hy, f.width, f.height);
      });
      if (p !== s.clip) { s.clip = p; o.clipPath = 'path(evenodd, "' + p + '")'; }
    });
  }
  function check() {
    var now = Date.now();
    segs.forEach(function (s) {
      if (s.state === "done") return;
      var top = s.y - scrollY, bottom = top + s.h;
      if (s.state === "wait") {
        if (bottom < 0) return reveal(s, true);           // 一下滚过去了：直接露出来，不在看不见的地方搭
        if (top < H * 0.85) { s.state = "build"; buildSeg(s).catch(function () { reveal(s); }); }
      } else if (now - s.t0 > 12000 || (s.sticky && Math.abs(scrollY - s.lockY) > 30)) {
        reveal(s);                                         // 卡住了，或者钉住的大区块里一滚动，洞就对不齐：直接收掉
      }
    });
  }
  function loop() {
    if (done) return;
    sync(); check();
    requestAnimationFrame(loop);
  }

  // 5. 在一段里挑主要区块：中等大小优先，互不重叠，最多 14 个
  function pick(s) {
    var VA = W * H;
    var R = { x: s.x, y: s.y, w: s.w, h: s.h };
    if (s.sticky) { // 钉住的大区块只搭现在屏幕里看得到的部分
      var y0 = Math.max(s.y, scrollY), y1 = Math.min(s.y + s.h, scrollY + H);
      R = { x: s.x, y: y0, w: s.w, h: Math.max(0, y1 - y0) };
    }
    var els = [s.el].concat([].slice.call(s.el.querySelectorAll("*")));
    var cands = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (SKIP.test(el.tagName)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 14) continue;
      var b = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
      var ix = Math.max(0, Math.min(b.x + b.w, R.x + R.w) - Math.max(b.x, R.x));
      var iy = Math.max(0, Math.min(b.y + b.h, R.y + R.h) - Math.max(b.y, R.y));
      if (ix * iy < b.w * b.h * 0.6) continue;
      b.a = b.w * b.h / VA;
      if (b.a > 0.3 || b.a < 0.0015) continue;
      var cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
      cands.push(b);
    }
    var out = [];
    function apart(p, q) {
      return p.x + p.w <= q.x + 1 || q.x + q.w <= p.x + 1 || p.y + p.h <= q.y + 1 || q.y + q.h <= p.y + 1;
    }
    function take(lo, hi) {
      cands.filter(function (b) { return b.a >= lo && b.a < hi; })
        .sort(function (p, q) { return q.a - p.a; })
        .forEach(function (b) { if (out.length < 14 && out.every(function (o) { return apart(o, b); })) out.push(b); });
    }
    take(0.01, 0.31); take(0.0015, 0.01);
    return out.sort(function (p, q) { return Math.abs(p.y - q.y) > 24 ? p.y - q.y : p.x - q.x; });
  }

  // 要人手：先用附近闲着的，不够再从屏幕边上叫新的进来（同时最多 MAX 个）
  function grab(n, b) {
    var team = cursors.filter(function (c) { return !c.busy; })
      .sort(function (p, q) { return (Math.abs(p.x - b.x) + Math.abs(p.y - b.y)) - (Math.abs(q.x - b.x) + Math.abs(q.y - b.y)); })
      .slice(0, n);
    while (team.length < n && cursors.length < MAX) {
      var e = entry(b);
      team.push(spawn(e[0], e[1]));
    }
    team.forEach(function (c) { c.busy = true; });
    return team;
  }
  function release(cs) { var now = Date.now(); cs.forEach(function (c) { c.busy = false; c.freeAt = now; }); }
  function guide(b, color) {
    var l = document.createElement("div");
    l.className = "sw-line";
    l.style.background = color;
    if (Math.random() < 0.5) l.style.cssText += ";left:0;top:" + b.y + "px;width:" + document.documentElement.scrollWidth + "px;height:1px";
    else l.style.cssText += ";top:" + (b.y - H) + "px;left:" + b.x + "px;height:" + 3 * H + "px;width:1px";
    layer.appendChild(l);
    setTimeout(function () { l.style.opacity = "0"; }, 900);
    setTimeout(function () { l.remove(); }, 1900);
  }
  function frameBox(b, color) {
    var box = document.createElement("div");
    box.className = "sw-box";
    box.style.cssText = "left:" + b.x + "px;top:" + b.y + "px;width:0;height:0;border-color:" + color;
    layer.appendChild(box);
    box.offsetWidth;
    box.style.width = b.w + "px"; box.style.height = b.h + "px";
    return box;
  }
  function label(box, b, color) {
    var tag = document.createElement("span");
    tag.className = "sw-tag"; tag.style.background = color;
    tag.textContent = Math.round(b.w) + " × " + Math.round(b.h);
    box.appendChild(tag);
  }

  async function job(s, b) {
    var team = grab(2, b);
    while (!team.length && s.state === "build") { await wait(120); team = grab(2, b); }
    if (s.state !== "build") return release(team);
    var lead = team[0], helpers = team.slice(1);
    moveTo(lead, b.x, b.y, 420);
    helpers.forEach(function (h, k) { moveTo(h, b.x + b.w * (0.25 + 0.25 * k), b.y + b.h + 4 + k * 3, 480); });
    await wait(430);
    if (s.state !== "build") return release(team);
    if (Math.random() < 0.55) guide(b, lead.color);
    var box = frameBox(b, lead.color);
    moveTo(lead, b.x + b.w, b.y + b.h, 420);
    await wait(440);
    label(box, b, lead.color);
    // 沿框从左往右剪开，领头的光标跟着走
    var hole = { x: b.x - s.x, y: b.y - s.y, w: b.w, h: b.h, p: 0 };
    s.holes.push(hole);
    moveTo(lead, b.x, b.y + b.h / 2, 160);
    await wait(170);
    var t0 = performance.now(), dur = 380;
    moveTo(lead, b.x + b.w, b.y + b.h / 2, dur);
    await new Promise(function (ok) {
      (function step(t) {
        hole.p = Math.min(1, (t - t0) / dur);
        if (hole.p < 1 && s.state === "build") requestAnimationFrame(step); else { hole.p = 1; ok(); }
      })(t0);
    });
    box.style.opacity = "0";
    setTimeout(function () { box.remove(); }, 450);
    release(team);
  }

  // 没挑出区块的段：整段拉一个框，几只光标从上往下扫一遍
  async function sweep(s) {
    var top = Math.max(s.y, scrollY), bot = Math.min(s.y + s.h, scrollY + H);
    var b = { x: s.x, y: top, w: s.w, h: Math.max(20, bot - top) };
    var team = grab(5, b);
    team.forEach(function (c, k) { moveTo(c, b.x + b.w * (k + 0.5) / team.length, b.y, 400); });
    await wait(420);
    var box = frameBox(b, (team[0] || { color: COLORS[5] }).color);
    team.forEach(function (c, k) { moveTo(c, b.x + b.w * (k + 0.5) / team.length, b.y + b.h, 600); });
    await wait(620);
    label(box, b, (team[0] || { color: COLORS[5] }).color);
    await wait(200);
    box.style.opacity = "0";
    setTimeout(function () { box.remove(); }, 450);
    release(team);
  }

  async function buildSeg(s) {
    s.t0 = Date.now(); s.lockY = scrollY;
    var blocks = pick(s);
    if (!blocks.length) { await sweep(s); return reveal(s); }
    var jobs = [];
    for (var i = 0; i < blocks.length && s.state === "build"; i++) {
      jobs.push(job(s, blocks[i]));
      await wait(130);
    }
    await Promise.all(jobs);
    reveal(s);
  }

  // 一段搭完：剩下的空白淡掉
  function reveal(s, instant) {
    if (s.state === "done") return;
    s.state = "done";
    var ov = s.ov;
    if (instant) ov.style.transition = "none";
    ov.style.opacity = "0";
    setTimeout(function () { ov.remove(); }, instant ? 0 : 480);
    if (segs.every(function (x) { return x.state === "done"; })) setTimeout(finish, 500);
  }

  function finish() {
    if (done) return; done = true;
    clearInterval(idleTimer);
    cursors.slice().forEach(despawn);
    setTimeout(function () { layer.remove(); }, 700);
    var t = document.createElement("div");
    t.className = "sw-toast"; t.textContent = TEXT.replace("{n}", spawned);
    document.documentElement.appendChild(t);
    t.offsetWidth; t.classList.add("on");
    setTimeout(function () { t.classList.remove("on"); }, 4500);
    setTimeout(function () { t.remove(); }, 5000);
  }
  function bail() {
    done = true; clearInterval(idleTimer);
    [cover, layer].concat(segs.map(function (s) { return s.ov; })).forEach(function (el) { if (el && el.parentNode) el.remove(); });
  }

  addEventListener("resize", function () { W = innerWidth; H = innerHeight; });

  // 等页面画好（load 之后再等一会儿，最多 2.5 秒）再切段开搭
  var started = false;
  function go() {
    if (started) return; started = true;
    setTimeout(function () { try { setup(); } catch (e) { bail(); } }, 350);
  }
  if (document.readyState === "complete") go(); else addEventListener("load", go);
  setTimeout(go, 2500);
})();
