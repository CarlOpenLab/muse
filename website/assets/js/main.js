/* ============================================================
   MUSE — main.js
   preloader · aurora shader · editor demo · ai demo · keys
   theme · cursor · reveals · parallax · magnetic · counters
   ============================================================ */

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

/* ------------------------------------------------------------
   preloader — counter to 100, curtains lift, then hand over
   ------------------------------------------------------------ */
const preloader = (() => {
  const el = $('#preloader');
  const count = $('#preCount');

  function done() {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const DUR = reduced ? 250 : 1500;
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      (function tick(now) {
        const p = clamp((now - t0) / DUR, 0, 1);
        count.textContent = String(Math.round(ease(p) * 100)).padStart(2, '0');
        if (p < 1) return requestAnimationFrame(tick);
        el.classList.add('is-done');
        document.body.classList.add('is-loaded');
        setTimeout(() => {
          el.classList.add('is-gone');
          resolve();
        }, 950);
      })(t0);
    });
  }
  return { done };
})();

/* ------------------------------------------------------------
   theme — persisted, syncs both switches + shader
   ------------------------------------------------------------ */
const theme = (() => {
  const saved = localStorage.getItem('muse-theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
  let target = document.documentElement.dataset.theme === 'light' ? 1 : 0;
  let current = target;

  const apply = (mode) => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem('muse-theme', mode);
    target = mode === 'light' ? 1 : 0;
    const t = $('#themeToggle');
    t.setAttribute('aria-checked', String(target === 0));
    $$('.theme-toggle, .themes-switch').forEach((b) => {});
  };

  $('#themeToggle').addEventListener('click', () => {
    apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  $('#themesSwitch').addEventListener('click', () => {
    apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  return {
    tick() { current = lerp(current, target, 0.06); return current; },
    get value() { return current; },
  };
})();

/* ------------------------------------------------------------
   aurora — WebGL ribbons echoing the logo gradient
   ------------------------------------------------------------ */
(() => {
  const canvas = $('#aurora');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { canvas.classList.add('is-dead'); return; }

  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uTheme;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.,a=.5;
  for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(11.7,7.3);a*=.5;}
  return v;
}
void main(){
  vec2 uv=vUv;
  vec2 p=(uv-.5)*vec2(uRes.x/uRes.y,1.);
  float t=uTime*.07;
  vec3 col=vec3(0.);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float y=fbm(vec2(p.x*1.35+fi*7.31,t+fi*3.17))-.5;
    float d=abs(p.y*1.12-y*1.75+(fi-1.)*.15);
    float g=exp(-d*7.0)*(.58+.42*sin(t*2.2+fi*2.1));
    vec3 c=i==0?vec3(.949,.769,.925):i==1?vec3(.725,.651,.961):vec3(.486,.549,.973);
    col+=c*g*(.8-fi*.12);
  }
  col+=vec3(.5,.52,.72)*exp(-length(p*vec2(1.,1.45)))*.22;
  float vig=smoothstep(1.3,.3,length(p));
  col*=vig;
  col+=(hash(uv*uRes+uTime)-.5)*.032;
  vec3 base=mix(vec3(.043,.043,.059),vec3(.965,.962,.972),uTheme);
  gl_FragColor=vec4(base+col*(1.-uTheme*.3),1.);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }

  let prog, uRes, uTime, uTheme, buf;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
    gl.useProgram(prog);
    uRes = gl.getUniformLocation(prog, 'uRes');
    uTime = gl.getUniformLocation(prog, 'uTime');
    uTheme = gl.getUniformLocation(prog, 'uTheme');
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  } catch (e) {
    canvas.classList.add('is-dead');
    return;
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(canvas);

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  addEventListener('resize', resize, { passive: true });

  const t0 = performance.now();
  let tf = theme.value;
  (function frame(now) {
    requestAnimationFrame(frame);
    if (!visible && Math.abs(tf - theme.value) < 0.002) return;
    resize();
    tf = theme.tick();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reduced ? 40 : (now - t0) / 1000);
    gl.uniform1f(uTheme, tf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  })(t0);
})();

/* ------------------------------------------------------------
   cursor — dot + lerped ring, grows on links
   ------------------------------------------------------------ */
(() => {
  if (!finePointer || reduced) return;
  const root = $('#cursor');
  const dot = $('.cursor__dot', root);
  const ring = $('.cursor__ring', root);
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;

  addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    const hit = e.target.closest('a, button, [data-cursor]');
    root.classList.toggle('is-link', !!hit);
  }, { passive: true });

  (function loop() {
    rx = lerp(rx, mx, 0.16);
    ry = lerp(ry, my, 0.16);
    dot.style.transform = `translate(${mx - 3}px, ${my - 3}px)`;
    const half = ring.offsetWidth / 2;
    ring.style.transform = `translate(${rx - half}px, ${ry - half}px)`;
    requestAnimationFrame(loop);
  })();
})();

/* ------------------------------------------------------------
   scroll chrome — progress bar, nav state, parallax
   ------------------------------------------------------------ */
(() => {
  const bar = $('#progressBar');
  const nav = $('#nav');
  const pEls = $$('[data-parallax]');
  let ticking = false;

  function update() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    nav.classList.toggle('is-scrolled', scrollY > 40);
    if (!reduced) {
      for (const el of pEls) {
        const r = el.getBoundingClientRect();
        const c = r.top + r.height / 2 - innerHeight / 2;
        const p = clamp(c / innerHeight, -0.6, 0.6);
        el.style.transform = `translateY(${p * parseFloat(el.dataset.parallax)}px)`;
      }
    }
  }
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

/* ------------------------------------------------------------
   reveals — IO, staggered by sibling order
   ------------------------------------------------------------ */
async function initReveals() {
  await preloader.done();
  $$('[data-reveal]').forEach((el) => {
    const siblings = $$('[data-reveal]', el.parentElement);
    el.style.setProperty('--i', Math.max(0, siblings.indexOf(el)));
  });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal]').forEach((el) => io.observe(el));
}
initReveals();

/* ------------------------------------------------------------
   magnetic buttons
   ------------------------------------------------------------ */
if (finePointer && !reduced) {
  $$('.magnetic').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * 0.18}px, ${dy * 0.3}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
}

/* ------------------------------------------------------------
   marquee — duplicate track for a seamless loop
   ------------------------------------------------------------ */
(() => {
  const track = $('#marqueeTrack');
  track.innerHTML += track.innerHTML;
})();

/* ------------------------------------------------------------
   editor demo — type raw markdown, dissolve into rich text
   ------------------------------------------------------------ */
(() => {
  const page = $('#editorPage');
  const caretHtml = $('#edCaret');
  const status = $('#edStatus');
  if (caretHtml) caretHtml.remove();

  const S = (t, cls) => ({ t, ...(cls ? { cls } : {}), ...(cls === 'mk' ? { mk: 1 } : {}) });
  const MK = (t) => S(t, 'mk');

  const RICH = {
    heading: `<div class="ed-rich"><span class="ed-h1">缪斯</span></div>`,
    h2: `<div class="ed-rich"><span class="ed-h2">把缪斯带回家</span></div>`,
    emph: `<div class="ed-rich"><p>写作应该像<strong>思考</strong>一样流畅，像<em class="serif">谈话</em>一样自然。</p></div>`,
    list: `<div class="ed-rich"><ul class="ed-ul"><li>所见即所得</li><li>键盘优先</li><li>一切原生</li></ul></div>`,
    code: `<div class="ed-rich"><div class="ed-code"><span class="ed-code__badge">GO</span><span class="k">fmt</span><span class="p">.</span><span class="k">Println</span><span class="p">(</span><span class="s">"你好，缪斯"</span><span class="p">)</span></div></div>`,
    math: `<div class="ed-rich"><div class="ed-math">E = mc<sup>2</sup></div></div>`,
  };

  const SCENARIOS = {
    all: [
      { label: '标题', rich: RICH.heading, lines: [[MK('# '), S('缪斯')]] },
      { label: '强调', rich: RICH.emph, lines: [[S('写作应该像'), MK('**'), S('思考'), MK('**'), S('一样流畅，像')], [MK('*'), S('谈话'), MK('*'), S('一样自然。')]] },
      { label: '列表', rich: RICH.list, lines: [[MK('- '), S('所见即所得')], [MK('- '), S('键盘优先')], [MK('- '), S('一切原生')]] },
      { label: '代码', rich: RICH.code, lines: [[MK('```'), S('go')], [S('fmt.'), S('Println'), S('('), S('"你好，缪斯"', 's'), S(')')], [MK('```')]] },
      { label: '公式', rich: RICH.math, lines: [[MK('$$'), S('E = mc^2'), MK('$$')]] },
    ],
    heading: [{ label: '标题', rich: RICH.heading, lines: [[MK('# '), S('缪斯')]] }],
    emph: [{ label: '强调', rich: RICH.emph, lines: [[S('写作应该像'), MK('**'), S('思考'), MK('**'), S('一样流畅。')]] }],
    list: [{ label: '列表', rich: RICH.list, lines: [[MK('- '), S('所见即所得')], [MK('- '), S('键盘优先')]] }],
    code: [{ label: '代码', rich: RICH.code, lines: [[MK('```'), S('go')], [S('fmt.'), S('Println'), S('('), S('"你好"', 's'), S(')')], [MK('```')]] }],
    math: [{ label: '公式', rich: RICH.math, lines: [[MK('$$'), S('E = mc^2'), MK('$$')]] }],
  };

  let runId = 0;
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 }).observe(page);

  function makeBlock() {
    const b = document.createElement('div');
    b.className = 'ed-block';
    const src = document.createElement('div');
    src.className = 'ed-src';
    b.appendChild(src);
    b.insertAdjacentHTML('beforeend', '<div class="ed-rich" aria-hidden="true"></div>');
    return b;
  }

  async function typeBlock(b, block, rid) {
    const src = $('.ed-src', b);
    const caret = document.createElement('span');
    caret.className = 'ed-caret';
    let line = null;
    for (const segments of block.lines) {
      line = document.createElement('span');
      line.style.display = 'block';
      src.appendChild(line);
      line.appendChild(caret);
      for (const seg of segments) {
        const span = document.createElement('span');
        if (seg.mk) span.className = 'mk';
        else if (seg.cls) span.className = seg.cls;
        line.insertBefore(span, caret);
        for (const ch of seg.t) {
          if (rid !== runId || !visible) { span.textContent += ch; continue; }
          span.textContent += ch;
          await wait(34 + Math.random() * 46);
        }
      }
      await wait(160);
    }
  }

  async function play(scenarioKey) {
    const rid = ++runId;
    const blocks = SCENARIOS[scenarioKey] || SCENARIOS.all;
    page.innerHTML = '';

    while (rid === runId) {
      for (const block of blocks) {
        if (rid !== runId) return;
        const b = makeBlock();
        page.appendChild(b);
        status.textContent = `正在输入 — ${block.label}`;
        await typeBlock(b, block, rid);
        if (rid !== runId) return;
        await wait(560);
        $('.ed-rich', b).innerHTML = block.rich;
        $('.ed-rich', b).removeAttribute('aria-hidden');
        b.classList.add('is-dissolved');
        status.textContent = `已渲染 — ${block.label} · 标记已隐去`;
        await wait(scenarioKey === 'all' ? 1050 : 1500);
      }
      if (rid !== runId) return;
      status.textContent = '整页即排版 · 重新开始';
      await wait(2200);
      if (rid !== runId) return;
      page.innerHTML = '';
    }
  }

  $$('.editor-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.editor-tab').forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-pressed', String(t === tab));
      });
      play(tab.dataset.scenario);
    });
  });

  new IntersectionObserver(([e], io) => {
    if (e.isIntersecting) { play('all'); io.disconnect(); }
  }, { threshold: 0.2 }).observe(page);
})();

/* ------------------------------------------------------------
   ai demo — user asks, muse streams a rendered answer
   ------------------------------------------------------------ */
(() => {
  const stream = $('#aiStream');
  const caret = $('#aiCaret');
  const actions = $('#aiActions');
  const badge = $('#aiBadge');
  const input = $('.chat__input');
  const echo = $('#aiInputEcho');
  const userRow = $('.chat__row--user');
  const aiRow = $('.chat__row--ai');
  const chat = $('#chat');

  userRow.style.opacity = '0';
  userRow.style.transform = 'translateY(12px)';
  userRow.style.transition = 'opacity .5s var(--ease-out), transform .5s var(--ease-out)';
  aiRow.style.opacity = '0';
  aiRow.style.transform = 'translateY(12px)';
  aiRow.style.transition = 'opacity .5s var(--ease-out) .15s, transform .5s var(--ease-out) .15s';

  const QUESTION = '帮我把这段周报开头改得更简洁…';
  const CHUNKS = [
    { h: '<strong>本周进展</strong>', d: 260 },
    { h: '<ul><li>内核：原地编辑覆盖列表、引用与表格单元格</li></ul>', d: 240 },
    { h: '<ul><li>公式：行内原子完成排版，删除时整块保留</li></ul>', d: 240 },
    { h: '<ul><li>AI：流式回答可一键插回文档</li></ul>', d: 300 },
    { h: '<p>一句话：<strong>写作的阻力，正在消失。</strong></p>', d: 320 },
  ];

  let runId = 0;
  let visible = false;
  new IntersectionObserver(([e], io) => {
    if (e.isIntersecting) { visible = true; io.disconnect(); }
  }, { threshold: 0.25 }).observe(chat);

  async function typeEcho(rid) {
    echo.textContent = '';
    for (const ch of QUESTION) {
      if (rid !== runId) return;
      echo.textContent += ch;
      await wait(38);
    }
  }

  async function play() {
    const rid = ++runId;
    while (rid === runId) {
      stream.innerHTML = '';
      actions.classList.remove('is-in');
      badge.textContent = 'STREAMING';
      badge.classList.add('is-streaming');
      input.classList.remove('is-typing');
      echo.textContent = '';
      userRow.style.opacity = '0';
      userRow.style.transform = 'translateY(12px)';
      aiRow.style.opacity = '0';
      aiRow.style.transform = 'translateY(12px)';
      caret.classList.remove('is-hidden');
      await wait(400);
      if (rid !== runId) return;

      input.classList.add('is-typing');
      await typeEcho(rid);
      if (rid !== runId) return;
      await wait(500);

      input.classList.remove('is-typing');
      echo.textContent = '';
      userRow.style.opacity = '1';
      userRow.style.transform = 'none';
      await wait(650);

      aiRow.style.opacity = '1';
      aiRow.style.transform = 'none';
      await wait(450);

      for (const c of CHUNKS) {
        if (rid !== runId) return;
        const span = document.createElement('span');
        span.className = 'fade-chunk';
        span.style.display = 'block';
        span.innerHTML = c.h;
        stream.appendChild(span);
        await wait(c.d + 240);
      }
      if (rid !== runId) return;
      caret.classList.add('is-hidden');
      badge.textContent = '已完成';
      badge.classList.remove('is-streaming');
      actions.classList.add('is-in');
      await wait(4200);
      if (rid !== runId) return;
      chat.style.transition = 'opacity .5s var(--ease-io)';
      chat.style.opacity = '0';
      await wait(550);
      chat.style.opacity = '';
      stream.innerHTML = '';
    }
  }

  new IntersectionObserver(([e], io) => {
    if (e.isIntersecting) { play(); io.disconnect(); }
  }, { threshold: 0.25 }).observe(chat);
})();

/* ------------------------------------------------------------
   keys — a choreography of shortcuts
   ------------------------------------------------------------ */
(() => {
  const doc = $('.keys-doc');
  const line = $('#keysLine');
  const sel = $('#keysSel');
  const rows = $$('.keys-row');
  if (!doc) return;

  const FX = {
    b: { cls: 'is-bold', flash: '**', label: '加粗' },
    k: { cls: 'is-link', flash: '[↗]', label: '链接' },
    2: { cls: 'is-h2', flash: '##', label: '二级标题' },
    tab: { cls: 'is-indent', flash: '⇥', label: '缩进' },
  };
  const SEQ = ['b', 'k', '2', 'tab'];
  let idx = 0;
  let visible = false;
  let timer = null;

  function step() {
    rows.forEach((r) => r.classList.remove('is-active'));
    doc.className = 'keys-doc';
    $$('.keys-flash', line).forEach((f) => f.remove());
    const key = SEQ[idx % SEQ.length];
    const fx = FX[key];
    doc.classList.add(fx.cls);
    $(`.keys-row[data-keys="${key}"]`).classList.add('is-active');
    const flash = document.createElement('span');
    flash.className = 'keys-flash';
    flash.textContent = fx.flash;
    line.appendChild(flash);
    idx += 1;
  }

  new IntersectionObserver(([e], io) => {
    if (e.isIntersecting) {
      visible = true;
      step();
      timer = setInterval(step, reduced ? 4000 : 2100);
      io.disconnect();
    }
  }, { threshold: 0.3 }).observe($('.keys-stage'));
})();

/* ------------------------------------------------------------
   counters
   ------------------------------------------------------------ */
(() => {
  const els = $$('[data-count]');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const target = parseInt(el.dataset.count, 10);
      if (reduced || target <= 1) { el.textContent = target; continue; }
      const t0 = performance.now();
      const DUR = 1400;
      (function tick(now) {
        const p = clamp((now - t0) / DUR, 0, 1);
        el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }
  }, { threshold: 0.5 });
  els.forEach((el) => io.observe(el));
})();

/* ------------------------------------------------------------
   mermaid draw-in
   ------------------------------------------------------------ */
new IntersectionObserver(([e], io) => {
  if (e.isIntersecting) {
    $('.mermaid').classList.add('is-drawn');
    io.disconnect();
  }
}, { threshold: 0.4 }).observe($('.panel--mermaid'));

/* ------------------------------------------------------------
   copy build command + toast
   ------------------------------------------------------------ */
(() => {
  const btn = $('#copyBuild');
  const toast = $('#toast');
  let timer;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      toast.textContent = '已复制 — git clone + go build，一步到缪斯';
    } catch {
      toast.textContent = btn.dataset.copy;
    }
    toast.classList.add('is-in');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('is-in'), 2400);
  });
})();
