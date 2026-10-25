/* ============================================================
   MUSE 官网 — main.js
   主题切换 · 滚动显现 · hero 原地编辑打字演示 · Agent 审批流状态机
   零依赖；prefers-reduced-motion 下全部动效退化为静态。
   ============================================================ */

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 主题（默认暗色，与 app 的双主题一致） ---------- */
(function theme() {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const saved = localStorage.getItem('muse-site-theme');
  if (saved === 'light' || saved === 'dark') {
    root.dataset.theme = saved;
  }
  const sync = () => {
    toggle.setAttribute('aria-checked', String(root.dataset.theme === 'dark'));
  };
  toggle.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('muse-site-theme', root.dataset.theme);
    sync();
  });
  sync();
})();

/* ---------- 导航滚动态 ---------- */
(function navScroll() {
  const nav = document.getElementById('nav');
  const update = () => nav.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', update, { passive: true });
  update();
})();

/* ---------- 滚动显现 ---------- */
(function reveals() {
  const els = document.querySelectorAll('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px' }
  );
  els.forEach((el) => io.observe(el));
})();

/* ---------- hero 原地编辑打字演示 ----------
   先逐字打出 Markdown 源码，再「溶解」成排版后的文字，循环。 */
(function heroTyping() {
  const src = document.getElementById('typeSrc');
  const doc = document.getElementById('typeDoc');
  const caret = document.getElementById('typeCaret');
  if (!src || !doc || reducedMotion) {
    if (doc) doc.classList.add('is-live');
    if (caret) caret.style.display = 'none';
    return;
  }

  const text = '# 灵感手记\n\n把**标记**隐去，*想法*直接成段。';
  let pos = 0;
  let phase = 'typing';

  function placeCaret() {
    // 用测量行高近似定位：简单起见，让光标跟在源码块末尾
    const lines = src.textContent.split('\n').length;
    caret.style.top = 34 + (lines - 1) * 14 * 1.8 + 'px';
    caret.style.left = 30 + (src.textContent.split('\n').slice(-1)[0].length * 8.4) + 'px';
  }

  function step() {
    if (phase === 'typing') {
      pos += 1;
      src.textContent = text.slice(0, pos);
      placeCaret();
      if (pos >= text.length) {
        phase = 'dissolve';
        setTimeout(() => {
          doc.classList.add('is-live');
          src.style.opacity = '0';
          caret.style.display = 'none';
          phase = 'hold';
          setTimeout(step, 3400);
        }, 420);
        return;
      }
      setTimeout(step, 34 + Math.random() * 46);
      return;
    }
    if (phase === 'hold') {
      // 擦除重来
      phase = 'erasing';
      doc.classList.remove('is-live');
      let n = src.textContent.length;
      const erase = () => {
        n = Math.max(0, n - 2);
        src.textContent = text.slice(0, n);
        pos = n;
        placeCaret();
        if (n > 0) {
          setTimeout(erase, 12);
        } else {
          src.style.opacity = '1';
          caret.style.display = '';
          phase = 'typing';
          setTimeout(step, 600);
        }
      };
      erase();
    }
  }
  setTimeout(step, 800);
})();

/* ---------- Agent 审批流演示 ----------
   把真实的交互脚本走一遍：用户消息 → 思考 → 读文档 → 审批卡暂停 →
   按用户的选择（同意 / 总是允许 / 拒绝）走不同分支。
   权限预设影响流程：完全访问跳过审批卡，只读直接被拒。 */

(function agentDemo() {
  const chat = document.getElementById('agentChat');
  const replayBtn = document.getElementById('agentReplay');
  const seg = document.getElementById('permSeg');
  if (!chat) return;

  let perm = 'ask';      // ask | full | readonly
  let always = false;    // 总是允许（会话内）
  let playing = false;
  let runId = 0;
  const timers = [];

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      const i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
  };
  const clearAll = () => {
    timers.forEach(clearTimeout);
    timers.length = 0;
  };

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const svgUse = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const scrollDown = () => { chat.scrollTop = chat.scrollHeight; };

  function addUser(text) {
    chat.appendChild(el('div', 'bubble', text));
    scrollDown();
  }

  function addAgentBlock() {
    const block = el('div', 'agent-block');
    chat.appendChild(block);
    return block;
  }

  function addThink(block, summary, body) {
    const head = el('div', 'think', `${svgUse('i-spark')}<span>${summary}</span>`);
    const chev = el('span', 'think__chev', svgUse('i-chevron'));
    head.appendChild(chev);
    const bodyEl = el('div', 'think__body', body);
    head.addEventListener('click', () => {
      head.classList.toggle('is-open');
      bodyEl.classList.toggle('is-open');
    });
    block.appendChild(head);
    block.appendChild(bodyEl);
    scrollDown();
  }

  function addToolRow(block, icon, label, target, okText, fail) {
    const row = el(
      'div',
      'tool' + (fail ? ' is-fail' : ''),
      `${svgUse(icon)}<span>${label}</span><span class="tool__target">${target}</span><span class="tool__ok">${okText}</span>`
    );
    block.appendChild(row);
    scrollDown();
    return row;
  }

  function addText(block, html) {
    block.appendChild(el('p', 'md', html));
    scrollDown();
  }

  // 审批卡：返回 Promise<boolean>（是否允许）
  function approval(cardHost, file, desc) {
    return new Promise((resolve) => {
      const card = el('div', 'approval');
      card.appendChild(el('div', 'approval__head',
        `${svgUse('i-shield')}<span>请求修改文档？</span><span class="approval__file">${file}</span>`));
      card.appendChild(el('p', 'approval__desc', desc));
      const actions = el('div', 'approval__actions');
      const allow = el('button', 'approval__btn', '同意修改');
      const alwaysBtn = el('button', 'approval__btn approval__btn--ghost', '总是允许');
      const deny = el('button', 'approval__btn approval__btn--ghost', '拒绝');
      actions.append(allow, alwaysBtn, deny, el('span', 'approval__toolname', 'edit_document'));
      card.appendChild(actions);
      cardHost.appendChild(card);
      scrollDown();

      const done = (ok, isAlways) => {
        allow.disabled = alwaysBtn.disabled = deny.disabled = true;
        card.remove();
        if (isAlways) always = true;
        resolve(ok);
      };
      allow.addEventListener('click', () => done(true, false));
      alwaysBtn.addEventListener('click', () => done(true, true));
      deny.addEventListener('click', () => done(false, false));
    });
  }

  // 把工具结果换成一行完成/失败的工具行
  function toolDone(block, icon, label, target, result, fail) {
    const row = el('div', 'tool' + (fail ? ' is-fail' : ''), `${svgUse(icon)}<span>${label}</span><span class="tool__target">${target}</span><span class="tool__ok">${result}</span>`);
    block.appendChild(row);
    scrollDown();
  }

  async function play(id) {
    playing = true;
    chat.innerHTML = '';
    const needsApproval = perm === 'ask' && !always;
    const readonly = perm === 'readonly';

    await wait(id, 500);
    if (id !== runId) return;
    addUser('帮我把开头的标题改得更有吸引力，别用「原型手记」这个词。');

    await wait(id, 800);
    if (id !== runId) return;
    const block = addAgentBlock();
    addThink(block, '深度思考中…', '先读一遍文档，看看现在的标题和正文结构；「原型手记」太工程味了，往「灵感」的方向靠。');

    await wait(id, 1200);
    if (id !== runId) return;
    addToolRow(block, 'i-eye', '读取文档', '灵感手记.md', '✓');

    await wait(id, 1100);
    if (id !== runId) return;

    let ok;
    if (readonly) {
      addToolRow(block, 'i-edit', '编辑文档', '灵感手记.md', '✕', true);
      block.appendChild(el('div', 'tool__detail', '{"error":"当前权限预设是只读，不能修改文档；请把想改的内容直接写给用户","ok":false}'));
      scrollDown();
      await wait(id, 900);
      if (id !== runId) return;
      addText(block, '现在的权限是<strong>只读</strong>，我不能动文件。建议的标题：<code>灵感手记</code>——要改的话，把权限切到「每次询问」或「完全访问」。');
      finish();
      return;
    }

    if (needsApproval) {
      ok = await approvalWithCard(block);
      if (id !== runId) return;
      if (!ok) {
        toolDone(block, 'i-edit', '编辑文档', '灵感手记.md', '✕', true);
        block.appendChild(el('div', 'tool__detail', '{"error":"用户拒绝了这次修改；不要原样重试，先问用户想怎么改","ok":false}'));
        scrollDown();
        await wait(id, 900);
        if (id !== runId) return;
        addText(block, '好的，先不动文件。备选方向：<code>灵感手记</code>、<code>手记 · 重启</code>——告诉我哪个方向，或者给点关键词。');
        finish();
        return;
      }
    } else {
      // 完全访问 / 总是允许：跳过卡片，显示一个静默的执行行
      await wait(id, 600);
      if (id !== runId) return;
    }

    toolDone(block, 'i-edit', '编辑文档', '灵感手记.md', '✓');
    block.appendChild(el('div', 'tool__detail', '{"path":"灵感手记.md","replaced":true,"new_chars":214}'));
    scrollDown();

    await wait(id, 900);
    if (id !== runId) return;
    addText(block, '改好了：开头标题换成<strong>「灵感手记」</strong>，正文里两次「原型」的指代也顺了一遍。<code>⌘S</code> 保存即可。');
    finish();

    function finish() {
      playing = false;
    }
  }

  function approvalWithCard(block) {
    return approval(block, '灵感手记.md', '把「原型手记」改成「灵感手记」，并同步正文里的两处指代。');
  }

  const wait = (id, ms) => new Promise((r) => later(r, ms));

  function start() {
    runId += 1;
    play(runId);
  }

  replayBtn.addEventListener('click', () => {
    clearAll();
    always = false;
    start();
  });

  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-perm]');
    if (!btn) return;
    perm = btn.dataset.perm;
    seg.querySelectorAll('.seg__btn').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    clearAll();
    start();
  });

  // 进入视口自动播放一次
  if (reducedMotion || !('IntersectionObserver' in window)) {
    play(runId);
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(chat.closest('.win'));
  }
})();
