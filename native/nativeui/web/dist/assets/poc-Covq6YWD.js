const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-zGWR2mwU.js","assets/rolldown-runtime-XKyaHtl9.js","assets/main-IkVgQZOC.css","assets/main-OvrmTOS-.js","assets/main-ClLTcuEP.css"])))=>i.map(i=>d[i]);
import{n as e,t}from"./shell-vflWAxXK.js";var n=(e,t,n,r=[])=>({id:e,name:t,markdown:n,checks:r.map(([e,t])=>({desc:e,re:t}))}),r=[n(`headings`,`标题层级`,`# 一级标题

## 二级标题

### 三级标题 with english

#### 四级标题`,[[`h1 keeps #`,/^#\s/gm],[`h4 keeps ####`,/^####\s四级标题$/m]]),n(`emphasis`,`强调组合`,"**bold** and *italic* and ~~strike~~ and `code` and ***all three***",[[`bold`,/\*\*bold\*\*/],[`italic`,/\*italic\*/],[`strike`,/~~strike~~/],[`inline code`,/`code`/]]),n(`links`,`链接`,`[Muse](https://github.com/CarlOpenLab/muse) and <https://milkdown.dev> and an autolink`,[[`link target`,/CarlOpenLab\/muse/]]),n(`lists-tight`,`紧凑列表`,`- one
- two
  - nested
- three`,[[`three items`,/^[-*] /gm],[`nested item`,/^[ \t]+[-*] nested$/m]]),n(`ordered`,`有序列表`,`1. first
2. second
   1. inner`,[[`numbered`,/^\d+\. /gm]]),n(`tasks`,`任务列表`,`- [x] done item
- [ ] open item
- [ ] another`,[[`checked task`,/[-*] \[[xX]\] done item/],[`unchecked task`,/[-*] \[ \] open item/]]),n(`quote`,`引用`,`> 一条引用
>
> > 嵌套引用`,[[`quote marker`,/^>\s/gm]]),n(`table-align`,`表格与对齐`,`| 左 | 中 | 右 |
| --- | :---: | ---: |
| a | b | c |
| 灵感 | Muse | 成书 |`,[[`three columns`,/\|/g],[`center align marker`,/:-+:/],[`right align marker`,/-+:\s*\|/]]),n(`code-lang`,`代码围栏`,'```go\nfunc main() {\n	fmt.Println("你好，缪斯")\n}\n```',[[`go fence`,/```go/],[`closing fence`,/```/]]),n(`math`,`公式`,`行内 $E = mc^2$ 与块级：

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$`,[[`inline math`,/\$E = mc\^2\$/],[`display math`,/\$\$[\s\S]+?\\int[\s\S]+?\$\$/]]),n(`images`,`图片`,`![Muse 图标](assets/icon.png)

![远程图](https://example.com/muse.png "远程图片")`,[[`local image`,/!\[[^\]]*\]\(assets\/icon\.png\)/],[`image title`,/"远程图片"/]]),n(`hr`,`分隔线`,`上面

---

下面`,[[`hr`,/^(---|\*\*\*|___)$/m]]),n(`html-block`,`HTML 块`,`<div align="center">
  HTML 块按原样保留
</div>`,[[`html kept`,/<div[^>]*>/]]),n(`cjk`,`中英混排`,`Muse 是一款**完全原生**的 Markdown 编辑器。

- 中文 IME 组合输入
- 「引号」与全角标点。`,[[`bold cjk`,/\*\*完全原生\*\*/]]),n(`long-line`,`超长段落`,Array.from({length:12},(e,t)=>`长段落第 ${t+1} 段，用来观察光标在长行内的定位表现，`).join(``)+`以及序列化稳定性。`,[[`content kept`,/长段落第 12 段/]]),n(`mixed`,`综合文档`,`# 缪斯周报

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
| 桥接 | ✅ |`,[[`heading`,/^# 缪斯周报$/m],[`task done`,/[-*] \[[xX]\] 公式排版/],[`quote`,/^> 所写，即所见。$/m],[`fence ts`,/```ts/],[`table row`,/\|\s*桥接\s*\|\s*✅\s*\|/]])],i=0,a=class{log=[];markdown=``;revision=7;theme=`dark`;saves=0;lastSaved=null;pastedCount=0;lastPath;pendingSelectionGet=null;ui;constructor(e){this.ui=e,window.__museSim=this}deliver(e){let t;try{t=JSON.parse(e)}catch{this.push(`in`,{error:`unparseable`});return}switch(this.push(`in`,t),t.type){case`ready`:this.send({type:`document.set`,path:`~/Documents/缪斯笔记.md`,markdown:r.find(e=>e.id===`mixed`).markdown,revision:this.revision,theme:this.theme});break;case`document.changed`:this.markdown=t.markdown,this.revision=t.revision;break;case`selection.changed`:break;case`document.saveRequested`:this.saves+=1,this.lastSaved=t.markdown,this.revision+=1;break;case`image.paste`:{this.pastedCount+=1;let e=`pasted-${this.pastedCount}.png`;this.send({type:`command`,name:`insertMarkdown`,id:100+this.pastedCount,args:{markdown:`![${e}](assets/${e})`}});break}}t.replyTo===`selection.get`&&(this.pendingSelectionGet?.(t),this.pendingSelectionGet=null),this.renderState()}send(e){e.type===`document.set`&&(this.lastPath=e.path),this.push(`out`,e),window.dispatchEvent(new CustomEvent(`muse:inbox`,{detail:{msg:e}}))}reloadDocument(){let e=r[i=(i+1)%r.length];this.revision+=1,this.send({type:`document.set`,path:`~/Documents/${e.id}.md`,markdown:e.markdown,revision:this.revision,theme:this.theme})}toggleTheme(){this.theme=this.theme===`dark`?`light`:`dark`,this.send({type:`theme.set`,theme:this.theme})}save(){this.send({type:`selection.get`,id:900}),setTimeout(()=>this.send({type:`command`,name:`requestSave`,id:901}),30)}insertHostText(){this.send({type:`command`,name:`insertMarkdown`,id:200,args:{markdown:`\n> 来自宿主的一行 · rev ${this.revision}\n`}})}async requestSelection(){let e=new Promise(e=>this.pendingSelectionGet=e);return this.send({type:`selection.get`,id:300}),e}externalChange(){this.revision+=1,this.send({type:`document.set`,path:this.lastPath??`~/Documents/缪斯笔记.md`,markdown:this.markdown+`

<!-- 外部修改：mtime 变化后由 native 重新载入 -->
`,revision:this.revision,theme:this.theme})}push(e,t){this.log.push({dir:e,msg:t,t:performance.now()}),this.log.length>400&&this.log.shift();let n=document.createElement(`div`);n.className=`sim-log__row sim-log__row--${e}`;let r=document.createElement(`span`);r.className=`sim-log__dir`,r.textContent=e===`in`?`web →`:`← native`;let i=document.createElement(`code`);i.textContent=JSON.stringify(t,null,0).slice(0,220),n.append(r,i),this.ui.logEl.appendChild(n),this.ui.logEl.scrollTop=this.ui.logEl.scrollHeight}renderState(){this.ui.stateEl.textContent=`rev ${this.revision} · 内存 ${this.markdown.length} 字 · 已保存 ${this.saves} 次`+(this.lastSaved?` · 最近保存 ${this.lastSaved.length} 字`:``)}},o=`modulepreload`,s=function(e){return`/`+e},c={},l=function(e){return e.pathname.endsWith(`.css`)},u=function(e,t,n){if(t in e)return e[t];let r=n();if(!r){e[t]=void 0;return}let i=r.then(()=>{e[t]=void 0},n=>{throw e[t]=void 0,n});return e[t]=i,i},d=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e,i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function d(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}function f(e){return import.meta.resolve?new URL(import.meta.resolve(e)):new URL(e,import.meta.url)}r=d(t.map(t=>{t=s(t,n);let r=f(t),i=l(r);return u(c,r.href,()=>{if(e===void 0){e={all:new Set,styles:new Set};let t=document.getElementsByTagName(`link`);for(let n=t.length-1;n>=0;n--){let r=t[n];e.all.add(r.href),r.rel===`stylesheet`&&e.styles.add(r.href)}}if((i?e.styles:e.all).has(r.href))return;let t=document.createElement(`link`);if(t.rel=i?`stylesheet`:o,i||(t.as=`script`),t.crossOrigin=``,t.href=r.href,a&&t.setAttribute(`nonce`,a),document.head.appendChild(t),i)return new Promise((e,n)=>{t.addEventListener(`load`,e),t.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${r}`)))})})}).filter(e=>e!==void 0))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},f=new URLSearchParams(location.search),p=f.get(`editor`)===`vditor`?`vditor`:`milkdown`,m=f.get(`harness`)===`1`,h=document.getElementById(`canvas`),g=document.getElementById(`statusbar`),_=document.getElementById(`simLog`),v=document.getElementById(`simState`),y=document.getElementById(`simActions`),b,x,S=null,C=`dark`;function w(){let e=b.getSelection();g.textContent=`${b.name} ${b.version} · rev ${x.currentRevision} · ${b.getMarkdown().length} 字 · 选区 ${e.from}–${e.to}`+(S?` · 模拟保存 ${S.saves} 次`:``)}async function T(){return(p===`vditor`?await d(()=>import(`./main-zGWR2mwU.js`),__vite__mapDeps([0,1,2])):await d(()=>import(`./main-OvrmTOS-.js`).then(e=>e.n),__vite__mapDeps([3,1,4]))).create(h)}function E(e){e.onContentChanged(()=>{x.contentChanged(e.getMarkdown()),w()}),e.onSelectionChanged(()=>{x.selectionChanged(e.getSelection()),w()}),e.onLinkOpen(e=>x.linkOpen(e)),e.onImagePaste((e,t)=>x.imagePaste(e,t))}function D(e,t){return e===`requestSave`?(x.requestSave(),!0):b.runCommand(e,t)}async function O(){if(document.getElementById(`brandEditor`).textContent=`${p} · RFC-001 M${p===`vditor`?`0`:`0.5`} PoC`,document.querySelectorAll(`.shell-nav a`).forEach(e=>{e.dataset.ed===p&&e.dataset.st===void 0&&e.classList.add(`is-current`)}),m){let e=document.getElementById(`simPanel`);e.hidden=!1}e(C),b=await T(),E(b),window.__canvas=b,x=new t({editorName:b.name,editorVersion:b.version,getMarkdown:()=>b.getMarkdown(),runCommand:D,setDocument:e=>b.setMarkdown(e),setTheme:(t,n)=>{C=t,e(t,n),b.setTheme(t)},getSelection:()=>b.getSelection(),onTrace:(e,t)=>{}}),m&&_&&v&&y&&(S=new a({logEl:_,stateEl:v}),window.addEventListener(`muse:inbox`,e=>{let t=e.detail.msg;x.receive(t)}),k()),x.start(),e(C),b.setTheme(C),x.on(e=>{e.type===`document.set`&&(document.getElementById(`chromeTitle`).textContent=e.path)}),w(),setInterval(w,1200),f.get(`selftest`)===`1`&&(await j(400),await A())}function k(){let e=[[`换文档`,()=>S.reloadDocument()],[`切主题`,()=>S.toggleTheme()],[`模拟保存`,()=>S.save()],[`宿主插入`,()=>S.insertHostText()],[`读选区`,()=>void S.requestSelection()],[`外部修改`,()=>S.externalChange()],[`自测往返`,()=>void A()]];for(let[t,n]of e){let e=document.createElement(`button`);e.className=`sim-btn`,e.textContent=t,e.addEventListener(`click`,n),y.appendChild(e)}}async function A(){let e=[];for(let t of r){b.setMarkdown(t.markdown),await j(60);let n=b.getMarkdown();await j(30),b.setMarkdown(n),await j(60);let r=b.getMarkdown(),i=e=>e.replace(/[ \t]+$/gm,``).replace(/\n{3,}/g,`

`).trim(),a=i(n),o=a===i(r),s=t.checks.filter(e=>!e.re.test(a));e.push({id:t.id,name:t.name,pass:o&&s.length===0,note:s.length?`语义丢失: ${s.map(e=>e.desc).join(`、`)}`:o?`往返稳定`:`两次导出不一致（规范化未收敛）`})}let t=document.createElement(`div`);t.className=`rt-table`,t.innerHTML=`<div class="rt-table__head">ROUND-TRIP ${b.name} — ${e.filter(e=>e.pass).length}/${e.length} PASS</div>`+e.map(e=>`<div class="rt-row ${e.pass?`is-pass`:`is-fail`}"><code>${e.id}</code><span>${e.name}</span><em>${e.note}</em></div>`).join(``),document.getElementById(`selftest`).replaceChildren(t)}function j(e){return new Promise(t=>setTimeout(t,e))}O();