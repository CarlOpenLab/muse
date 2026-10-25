const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-zGWR2mwU.js","assets/rolldown-runtime-XKyaHtl9.js","assets/main-IkVgQZOC.css","assets/main-Dl2kKx-e.js","assets/main-ClLTcuEP.css"])))=>i.map(i=>d[i]);
import{t as e}from"./shell-DMxEAf2L.js";var t=(e,t,n,r=[])=>({id:e,name:t,markdown:n,checks:r.map(([e,t])=>({desc:e,re:t}))}),n=[t(`headings`,`标题层级`,`# 一级标题

## 二级标题

### 三级标题 with english

#### 四级标题`,[[`h1 keeps #`,/^#\s/gm],[`h4 keeps ####`,/^####\s四级标题$/m]]),t(`emphasis`,`强调组合`,"**bold** and *italic* and ~~strike~~ and `code` and ***all three***",[[`bold`,/\*\*bold\*\*/],[`italic`,/\*italic\*/],[`strike`,/~~strike~~/],[`inline code`,/`code`/]]),t(`links`,`链接`,`[Muse](https://github.com/CarlOpenLab/muse) and <https://milkdown.dev> and an autolink`,[[`link target`,/CarlOpenLab\/muse/]]),t(`lists-tight`,`紧凑列表`,`- one
- two
  - nested
- three`,[[`three items`,/^[-*] /gm],[`nested item`,/^[ \t]+[-*] nested$/m]]),t(`ordered`,`有序列表`,`1. first
2. second
   1. inner`,[[`numbered`,/^\d+\. /gm]]),t(`tasks`,`任务列表`,`- [x] done item
- [ ] open item
- [ ] another`,[[`checked task`,/[-*] \[[xX]\] done item/],[`unchecked task`,/[-*] \[ \] open item/]]),t(`quote`,`引用`,`> 一条引用
>
> > 嵌套引用`,[[`quote marker`,/^>\s/gm]]),t(`table-align`,`表格与对齐`,`| 左 | 中 | 右 |
| --- | :---: | ---: |
| a | b | c |
| 灵感 | Muse | 成书 |`,[[`three columns`,/\|/g],[`center align marker`,/:-+:/],[`right align marker`,/-+:\s*\|/]]),t(`code-lang`,`代码围栏`,'```go\nfunc main() {\n	fmt.Println("你好，缪斯")\n}\n```',[[`go fence`,/```go/],[`closing fence`,/```/]]),t(`math`,`公式`,`行内 $E = mc^2$ 与块级：

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$`,[[`inline math`,/\$E = mc\^2\$/],[`display math`,/\$\$[\s\S]+?\\int[\s\S]+?\$\$/]]),t(`images`,`图片`,`![Muse 图标](assets/icon.png)

![远程图](https://example.com/muse.png "远程图片")`,[[`local image`,/!\[[^\]]*\]\(assets\/icon\.png\)/],[`image title`,/"远程图片"/]]),t(`hr`,`分隔线`,`上面

---

下面`,[[`hr`,/^(---|\*\*\*|___)$/m]]),t(`html-block`,`HTML 块`,`<div align="center">
  HTML 块按原样保留
</div>`,[[`html kept`,/<div[^>]*>/]]),t(`cjk`,`中英混排`,`Muse 是一款**完全原生**的 Markdown 编辑器。

- 中文 IME 组合输入
- 「引号」与全角标点。`,[[`bold cjk`,/\*\*完全原生\*\*/]]),t(`long-line`,`超长段落`,Array.from({length:12},(e,t)=>`长段落第 ${t+1} 段，用来观察光标在长行内的定位表现，`).join(``)+`以及序列化稳定性。`,[[`content kept`,/长段落第 12 段/]]),t(`mixed`,`综合文档`,`# 缪斯周报

## 本周进展

- **内核**：原地编辑覆盖列表与引用
- [x] 公式排版
- [ ] 图片拖拽缩放

> 所写，即所见。

\`\`\`ts
const muse = 'native';
\`\`\`

| 项 | 状态 |
| --- | --- |
| 桥接 | ✅ |`,[[`heading`,/^# 缪斯周报$/m],[`task done`,/[-*] \[[xX]\] 公式排版/],[`quote`,/^> 所写，即所见。$/m],[`fence ts`,/```ts/],[`table row`,/\|\s*桥接\s*\|\s*✅\s*\|/]])],r=0,i=class{log=[];markdown=``;revision=7;theme=`dark`;saves=0;lastSaved=null;pastedCount=0;lastPath;pendingSelectionGet=null;ui;constructor(e){this.ui=e,window.__museSim=this}deliver(e){let t;try{t=JSON.parse(e)}catch{this.push(`in`,{error:`unparseable`});return}switch(this.push(`in`,t),t.type){case`ready`:this.send({type:`document.set`,path:`~/Documents/缪斯笔记.md`,markdown:n.find(e=>e.id===`mixed`).markdown,revision:this.revision,theme:this.theme});break;case`document.changed`:this.markdown=t.markdown,this.revision=t.revision;break;case`selection.changed`:break;case`document.saveRequested`:this.saves+=1,this.lastSaved=t.markdown,this.revision+=1;break;case`image.paste`:{this.pastedCount+=1;let e=`pasted-${this.pastedCount}.png`;this.send({type:`command`,name:`insertMarkdown`,id:100+this.pastedCount,args:{markdown:`![${e}](assets/${e})`}});break}}t.replyTo===`selection.get`&&(this.pendingSelectionGet?.(t),this.pendingSelectionGet=null),this.renderState()}send(e){e.type===`document.set`&&(this.lastPath=e.path),this.push(`out`,e),window.dispatchEvent(new CustomEvent(`muse:inbox`,{detail:{msg:e}}))}reloadDocument(){let e=n[r=(r+1)%n.length];this.revision+=1,this.send({type:`document.set`,path:`~/Documents/${e.id}.md`,markdown:e.markdown,revision:this.revision,theme:this.theme})}toggleTheme(){this.theme=this.theme===`dark`?`light`:`dark`,this.send({type:`theme.set`,theme:this.theme})}save(){this.send({type:`selection.get`,id:900}),setTimeout(()=>this.send({type:`command`,name:`requestSave`,id:901}),30)}insertHostText(){this.send({type:`command`,name:`insertMarkdown`,id:200,args:{markdown:`\n> 来自宿主的一行 · rev ${this.revision}\n`}})}async requestSelection(){let e=new Promise(e=>this.pendingSelectionGet=e);return this.send({type:`selection.get`,id:300}),e}externalChange(){this.revision+=1,this.send({type:`document.set`,path:this.lastPath??`~/Documents/缪斯笔记.md`,markdown:this.markdown+`

<!-- 外部修改：mtime 变化后由 native 重新载入 -->
`,revision:this.revision,theme:this.theme})}push(e,t){this.log.push({dir:e,msg:t,t:performance.now()}),this.log.length>400&&this.log.shift();let n=document.createElement(`div`);n.className=`sim-log__row sim-log__row--${e}`;let r=document.createElement(`span`);r.className=`sim-log__dir`,r.textContent=e===`in`?`web →`:`← native`;let i=document.createElement(`code`);i.textContent=JSON.stringify(t,null,0).slice(0,220),n.append(r,i),this.ui.logEl.appendChild(n),this.ui.logEl.scrollTop=this.ui.logEl.scrollHeight}renderState(){this.ui.stateEl.textContent=`rev ${this.revision} · 内存 ${this.markdown.length} 字 · 已保存 ${this.saves} 次`+(this.lastSaved?` · 最近保存 ${this.lastSaved.length} 字`:``)}},a={dark:{window:`#1a1a1a`,background:`#232328`,surface:`#2a2a30`,text:`#ececf0`,muted:`#a9a9b4`,accent:`#6b93ff`,border:`rgba(255,255,255,0.07)`,selection:`rgba(107,147,255,0.28)`},light:{window:`#f5f5f5`,background:`#ffffff`,surface:`#f3f3f6`,text:`#1d1d1f`,muted:`#6e6e78`,accent:`#3b6cf6`,border:`rgba(0,0,0,0.07)`,selection:`rgba(59,108,246,0.25)`}};function o(e,t){let n=a[e],r=document.documentElement;r.dataset.theme=e;let i={"--muse-window":n.window,"--muse-bg":n.background,"--muse-surface":n.surface,"--muse-text":n.text,"--muse-muted":n.muted,"--muse-accent":n.accent,"--muse-border":n.border,"--muse-selection":n.selection,...t};for(let[e,t]of Object.entries(i))r.style.setProperty(e,t)}var s=`modulepreload`,c=function(e){return`/`+e},l={},u=function(e){return e.pathname.endsWith(`.css`)},d=function(e,t,n){if(t in e)return e[t];let r=n();if(!r){e[t]=void 0;return}let i=r.then(()=>{e[t]=void 0},n=>{throw e[t]=void 0,n});return e[t]=i,i},f=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e,i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}function f(e){return import.meta.resolve?new URL(import.meta.resolve(e)):new URL(e,import.meta.url)}r=o(t.map(t=>{t=c(t,n);let r=f(t),i=u(r);return d(l,r.href,()=>{if(e===void 0){e={all:new Set,styles:new Set};let t=document.getElementsByTagName(`link`);for(let n=t.length-1;n>=0;n--){let r=t[n];e.all.add(r.href),r.rel===`stylesheet`&&e.styles.add(r.href)}}if((i?e.styles:e.all).has(r.href))return;let t=document.createElement(`link`);if(t.rel=i?`stylesheet`:s,i||(t.as=`script`),t.crossOrigin=``,t.href=r.href,a&&t.setAttribute(`nonce`,a),document.head.appendChild(t),i)return new Promise((e,n)=>{t.addEventListener(`load`,e),t.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${r}`)))})})}).filter(e=>e!==void 0))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},p=new URLSearchParams(location.search),m=p.get(`editor`)===`vditor`?`vditor`:`milkdown`,h=p.get(`harness`)===`1`,g=document.getElementById(`canvas`),_=document.getElementById(`statusbar`),v=document.getElementById(`simLog`),y=document.getElementById(`simState`),b=document.getElementById(`simActions`),x,S,C=null,w=`dark`;function T(){let e=x.getSelection();_.textContent=`${x.name} ${x.version} · rev ${S.currentRevision} · ${x.getMarkdown().length} 字 · 选区 ${e.from}–${e.to}`+(C?` · 模拟保存 ${C.saves} 次`:``)}async function E(){return(m===`vditor`?await f(()=>import(`./main-zGWR2mwU.js`),__vite__mapDeps([0,1,2])):await f(()=>import(`./main-Dl2kKx-e.js`).then(e=>e.n),__vite__mapDeps([3,1,4]))).create(g)}function D(e){e.onContentChanged(()=>{S.contentChanged(e.getMarkdown()),T()}),e.onSelectionChanged(()=>{S.selectionChanged(e.getSelection()),T()}),e.onLinkOpen(e=>S.linkOpen(e)),e.onImagePaste((e,t)=>S.imagePaste(e,t))}function O(e,t){return e===`requestSave`?(S.requestSave(),!0):x.runCommand(e,t)}async function k(){if(document.getElementById(`brandEditor`).textContent=`${m} · RFC-001 M${m===`vditor`?`0`:`0.5`} PoC`,document.querySelectorAll(`.shell-nav a`).forEach(e=>{e.dataset.ed===m&&e.dataset.st===void 0&&e.classList.add(`is-current`)}),h){let e=document.getElementById(`simPanel`);e.hidden=!1}o(w),x=await E(),D(x),window.__canvas=x,S=new e({editorName:x.name,editorVersion:x.version,getMarkdown:()=>x.getMarkdown(),runCommand:O,setDocument:e=>x.setMarkdown(e),setTheme:(e,t)=>{w=e,o(e,t),x.setTheme(e)},getSelection:()=>x.getSelection(),onTrace:(e,t)=>{}}),h&&v&&y&&b&&(C=new i({logEl:v,stateEl:y}),window.addEventListener(`muse:inbox`,e=>{let t=e.detail.msg;S.receive(t)}),A()),S.start(),o(w),x.setTheme(w),S.on(e=>{e.type===`document.set`&&(document.getElementById(`chromeTitle`).textContent=e.path)}),T(),setInterval(T,1200),p.get(`selftest`)===`1`&&(await M(400),await j())}function A(){let e=[[`换文档`,()=>C.reloadDocument()],[`切主题`,()=>C.toggleTheme()],[`模拟保存`,()=>C.save()],[`宿主插入`,()=>C.insertHostText()],[`读选区`,()=>void C.requestSelection()],[`外部修改`,()=>C.externalChange()],[`自测往返`,()=>void j()]];for(let[t,n]of e){let e=document.createElement(`button`);e.className=`sim-btn`,e.textContent=t,e.addEventListener(`click`,n),b.appendChild(e)}}async function j(){let e=[];for(let t of n){x.setMarkdown(t.markdown),await M(60);let n=x.getMarkdown();await M(30),x.setMarkdown(n),await M(60);let r=x.getMarkdown(),i=e=>e.replace(/[ \t]+$/gm,``).replace(/\n{3,}/g,`

`).trim(),a=i(n),o=a===i(r),s=t.checks.filter(e=>!e.re.test(a));e.push({id:t.id,name:t.name,pass:o&&s.length===0,note:s.length?`语义丢失: ${s.map(e=>e.desc).join(`、`)}`:o?`往返稳定`:`两次导出不一致（规范化未收敛）`})}let t=document.createElement(`div`);t.className=`rt-table`,t.innerHTML=`<div class="rt-table__head">ROUND-TRIP ${x.name} — ${e.filter(e=>e.pass).length}/${e.length} PASS</div>`+e.map(e=>`<div class="rt-row ${e.pass?`is-pass`:`is-fail`}"><code>${e.id}</code><span>${e.name}</span><em>${e.note}</em></div>`).join(``),document.getElementById(`selftest`).replaceChildren(t)}function M(e){return new Promise(t=>setTimeout(t,e))}k();