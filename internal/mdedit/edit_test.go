package mdedit

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"
)

// shows reports whether the leaf at the caret displays text holding s.
func (h *harness) shows(s string) bool {
	h.e.layoutIfNeeded()
	u := h.e.unitAt(h.e.caret)
	if u == nil || u.view == nil {
		return false
	}
	return strings.Contains(u.view.disp.text, s)
}

func TestInlineMathRevealsAtCaret(t *testing.T) {
	h := newHarness(t, "公式 $x^2$ 结束")
	h.caretAt(0)
	if h.shows("$") {
		t.Fatal("TeX shows away from the caret")
	}
	h.caretAt(strings.Index(h.e.Source(), "$") + 1)
	if !h.shows("$x^2$") {
		t.Fatalf("TeX hidden at the caret: %q", h.e.leaves[0].view.disp.text)
	}
}

func TestImageRevealsSource(t *testing.T) {
	h := newHarness(t, "前文\n\n![图](missing.png)\n\n后文")
	h.caretAt(0)
	img := h.e.leaves[1]
	if strings.Contains(img.view.disp.text, "![") {
		t.Fatalf("image source shows away from the caret: %q", img.view.disp.text)
	}
	h.caretAt(strings.Index(h.e.Source(), "图"))
	if !h.shows("![图](missing.png)") {
		t.Fatalf("image source hidden at the caret")
	}
}

func TestCodeInfoString(t *testing.T) {
	h := newHarness(t, "```\nx\n```")
	h.caretAt(strings.Index(h.e.Source(), "x"))
	h.key(0, ui.KeyLeft)
	if h.e.caret != 3 {
		t.Fatalf("left from the code went to %d, want the info string at 3", h.e.caret)
	}
	h.typ("go")
	h.want("```go\nx\n```")
	h.key(0, ui.KeyEnter)
	if h.e.caret != strings.Index(h.e.Source(), "x") {
		t.Fatalf("enter in the info string went to %d", h.e.caret)
	}
}

func TestCodeEnterKeepsIndent(t *testing.T) {
	h := newHarness(t, "```go\nfunc f() {\n\tx := 1\n}\n```")
	h.caretAt(strings.Index(h.e.Source(), "1") + 1)
	h.key(0, ui.KeyEnter)
	h.typ("y")
	h.want("```go\nfunc f() {\n\tx := 1\n\ty\n}\n```")
}

func TestBackspaceEmptyCodeBlockRemovesIt(t *testing.T) {
	h := newHarness(t, "前文\n\n```\n\n```\n\n后文")
	h.caretAt(strings.Index(h.e.Source(), "```\n") + 4)
	h.key(0, ui.KeyBackspace)
	if strings.Contains(h.e.Source(), "```") {
		t.Fatalf("the empty block stayed: %q", h.e.Source())
	}
}

func TestBackspaceListItemBecomesParagraph(t *testing.T) {
	h := newHarness(t, "- one\n- two")
	h.caretAt(strings.Index(h.e.Source(), "two"))
	h.key(0, ui.KeyBackspace)
	h.want("- one\n\ntwo")
}

func TestBackspaceInsideQuoteLiftsParagraph(t *testing.T) {
	h := newHarness(t, "> quoted")
	h.caretAt(2)
	h.key(0, ui.KeyBackspace)
	h.want("quoted")
}

// TestBackspaceKeepsThePlaceholderParagraph 空文档里那一行是为了显示占位符
// 而存在的，它不是任何结构的一部分：Backspace 扔掉它，文档就一行都不剩，
// 光标和占位符一起消失。带上下文的 phantom 照样扔掉——那是在删一个块，删完
// 光标得有个地方去。
func TestBackspaceKeepsThePlaceholderParagraph(t *testing.T) {
	h := newHarness(t, "")
	h.key(0, ui.KeyBackspace)
	if len(h.e.leaves) == 0 {
		t.Fatal("Backspace left the document with no paragraph at all")
	}
	if h.e.phantom == nil {
		t.Fatal("Backspace took the placeholder paragraph away; the document is empty")
	}
	// 占位符画在唯一的 phantom 上，条件在 paint.go：它得还是那唯一的一行。
	if len(h.e.leaves) != 1 || h.e.leaves[0].kind != kPhantom {
		t.Fatalf("leaves = %d, want the single placeholder paragraph", len(h.e.leaves))
	}
	// 删完之后还能接着写。
	h.typ("正文")
	h.want("正文")
}

// TestBackspaceStillRemovesAnEmptyBlock 删完一个块的 phantom 有上下文要合
// 成，那个仍然要扔掉：这一条守着上一条的边界，别把该删的也留下了。
func TestBackspaceStillRemovesAnEmptyBlock(t *testing.T) {
	h := newHarness(t, "前文")
	h.caretAt(len(h.e.Source()))
	h.key(0, ui.KeyEnter)
	h.key(0, ui.KeyEnter)
	h.key(0, ui.KeyBackspace)
	if strings.Contains(h.e.Source(), "\n\n\n") {
		t.Fatalf("the blank paragraphs stayed: %q", h.e.Source())
	}
}

func TestDeleteJoinsNextParagraph(t *testing.T) {
	h := newHarness(t, "one\n\ntwo")
	h.caretAt(3)
	h.key(0, ui.KeyDelete)
	h.want("onetwo")
}

func TestTabNestsAndShiftTabLifts(t *testing.T) {
	h := newHarness(t, "- a\n- b")
	h.caretAt(strings.Index(h.e.Source(), "b"))
	h.key(0, ui.KeyTab)
	h.want("- a\n  - b")
	h.key(ui.Shift, ui.KeyTab)
	h.want("- a\n- b")
}

func TestLinkShortcut(t *testing.T) {
	h := newHarness(t, "see docs here")
	h.e.Select(4, 8)
	h.frame()
	h.key(ui.Cmd, ui.KeyK)
	h.want("see [docs]() here")
	h.typ("https://x.io")
	h.want("see [docs](https://x.io) here")
}

func TestPasteInQuoteContinuesIt(t *testing.T) {
	h := newHarness(t, "> start")
	h.caretAt(len("> start"))
	h.clip = transfer.TextData(" one\ntwo")
	h.key(ui.Cmd, ui.KeyV)
	h.want("> start one\n> two")
}

func TestComposeInEmptyDocument(t *testing.T) {
	h := newHarness(t, "")
	h.tt.Compose("zhong", 5)
	h.frame()
	h.want("")
	if h.e.compose != "zhong" {
		t.Fatalf("compose = %q", h.e.compose)
	}
	h.tt.Compose("", 0)
	h.tt.Type("中文")
	h.frame()
	h.want("中文")
}

func TestUndoTypingByWords(t *testing.T) {
	h := newHarness(t, "")
	for _, s := range []string{"a", "b", " ", "c", "d"} {
		h.typ(s)
	}
	h.want("ab cd")
	h.key(ui.Cmd, ui.KeyZ)
	h.want("ab ")
	h.key(ui.Cmd, ui.KeyZ)
	h.want("")
}

func TestClickBelowCodeAtEndMakesParagraph(t *testing.T) {
	h := newHarness(t, "```\ncode\n```")
	last := h.e.leaves[len(h.e.leaves)-1]
	h.tt.ClickAt(h.e.colX+20, last.y+last.h+60)
	h.frame()
	h.typ("after")
	h.want("```\ncode\n```\n\nafter")
}

func TestSelectionAcrossBlocksDeletes(t *testing.T) {
	h := newHarness(t, "# Head\n\npara one\n\n- item")
	a := strings.Index(h.e.Source(), "ad")
	z := strings.Index(h.e.Source(), "item") + 2
	h.e.Select(a, z)
	h.frame()
	h.key(0, ui.KeyBackspace)
	h.want("# Heem")
}

func TestHeadingEnterAtStartInsertsAbove(t *testing.T) {
	h := newHarness(t, "# Title")
	h.caretAt(2)
	h.key(0, ui.KeyEnter)
	h.typ("intro")
	h.want("intro\n\n# Title")
}

func TestEnterAtEndPutsCaretOnTheNewLine(t *testing.T) {
	for _, tc := range []struct {
		name string
		src  string
		off  int
	}{
		{"paragraph", "Hello world", 11},
		{"quote", "> Quoted line", 13},
		{"heading", "# A Heading", 11},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t, tc.src)
			before, ok := h.e.caretRect(tc.off)
			if !ok {
				t.Fatal("no caret before Enter")
			}
			h.caretAt(tc.off)
			h.key(0, ui.KeyEnter)
			if h.e.phantom == nil {
				t.Fatal("no phantom after Enter at the end")
			}
			r, ok := h.e.caretRect(h.e.caret)
			if !ok {
				t.Fatal("no caret in the phantom")
			}
			if r.Y <= before.Y {
				t.Fatalf("caret at %.2f did not move below the line at %.2f", r.Y, before.Y)
			}
		})
	}
}

func TestArrowsLeavePhantom(t *testing.T) {
	h := newHarness(t, "Hello world")
	h.caretAt(11)
	h.key(0, ui.KeyEnter)
	h.key(0, ui.KeyLeft)
	if h.e.phantom != nil {
		t.Fatal("Left kept the phantom")
	}
	if h.e.caret != 11 {
		t.Fatalf("caret = %d, want 11", h.e.caret)
	}
	if r, _ := h.e.caretRect(h.e.caret); r.Y > h.e.leaves[0].y+h.e.leaves[0].h {
		t.Fatalf("caret at %.2f is not on the line above", r.Y)
	}

	// Right at the end of the document stays in the phantom.
	h = newHarness(t, "Hello world")
	h.caretAt(11)
	h.key(0, ui.KeyEnter)
	h.key(0, ui.KeyRight)
	if h.e.phantom == nil {
		t.Fatal("Right dropped the phantom at the end")
	}

	// Up enters the line above.
	h = newHarness(t, "Hello world")
	h.caretAt(11)
	h.key(0, ui.KeyEnter)
	h.key(0, ui.KeyUp)
	if h.e.phantom != nil {
		t.Fatal("Up kept the phantom")
	}
	if r, _ := h.e.caretRect(h.e.caret); r.Y > h.e.leaves[0].y+h.e.leaves[0].h {
		t.Fatalf("caret at %.2f is not on the line above", r.Y)
	}
}

func TestClickKeepsThePhantomOnlyOnItsLine(t *testing.T) {
	h := newHarness(t, "Hello world")
	h.caretAt(11)
	h.key(0, ui.KeyEnter)
	para := h.e.leaves[0]
	h.e.setCaretAtPoint(11, para.y+para.h/2, false)
	if h.e.phantom != nil {
		t.Fatal("a click at the line's end kept the phantom")
	}
	h = newHarness(t, "Hello world")
	h.caretAt(11)
	h.key(0, ui.KeyEnter)
	ph := h.e.leaves[1]
	h.e.setCaretAtPoint(11, ph.y+1, false)
	if h.e.phantom == nil {
		t.Fatal("a click on the phantom's line dropped it")
	}
}

func TestTaskEnterContinuesTasks(t *testing.T) {
	h := newHarness(t, "- [ ] one")
	h.caretAt(len("- [ ] one"))
	h.key(0, ui.KeyEnter)
	h.typ("two")
	h.want("- [ ] one\n- [ ] two")
}

func TestAutoPairAndSkip(t *testing.T) {
	h := newHarness(t, "")
	h.typ("(")
	h.want("()")
	h.typ("a")
	h.typ(")")
	h.want("(a)")
	if h.e.caret != 3 {
		t.Fatalf("caret = %d after typing the closer", h.e.caret)
	}
}

func TestPipeInCellIsEscaped(t *testing.T) {
	h := newHarness(t, "| a | b |\n| --- | --- |\n| 1 | 2 |")
	h.caretAt(strings.Index(h.e.Source(), "1") + 1)
	h.typ("|")
	if !strings.Contains(h.e.Source(), `1\|`) {
		t.Fatalf("pipe not escaped: %q", h.e.Source())
	}
}

func TestReplaceAllKeepsUndo(t *testing.T) {
	h := newHarness(t, "one two")
	h.e.ReplaceAll("one 2 two")
	h.frame()
	h.want("one 2 two")
	h.e.Undo()
	h.frame()
	h.want("one two")
}

// titleHarness opens an empty Markdown document with a title placeholder,
// as the app opens a new one.
func titleHarness(t *testing.T) *harness {
	t.Helper()
	h := newHarness(t, "")
	opts := h.e.Options()
	opts.TitlePlaceholder = "标题"
	h.e.SetOptions(opts)
	h.e.SetSource("")
	h.frame()
	h.focus()
	return h
}

// TestEmptyDocumentOpensOnATitle 新文档的第一行是标题：它在空的时候就以一级
// 标题的样子出现，灰字写着「标题」，而不是一行普通正文。
func TestEmptyDocumentOpensOnATitle(t *testing.T) {
	h := titleHarness(t)
	if len(h.e.leaves) != 1 || h.e.leaves[0].kind != kPhantom {
		t.Fatalf("leaves = %d, want the one empty line", len(h.e.leaves))
	}
	if got := h.e.hint(); got != "标题" {
		t.Fatalf("the empty line shows %q, want 标题", got)
	}
	l := h.e.leaves[0]
	if l.view == nil {
		t.Fatal("the empty line was not laid out")
	}
	if got, want := l.view.font.Size, h.e.lk.headingSize(1); got != want {
		t.Fatalf("the empty title is %vpx tall text, want the %vpx of a level-one heading", got, want)
	}
}

// TestTypingInTheTitleWritesAHeading 在标题行打的字存成一级标题：文件里就是
// `# 周报`，换哪个编辑器打开标题都还在。
func TestTypingInTheTitleWritesAHeading(t *testing.T) {
	h := titleHarness(t)
	h.typ("周报")
	h.want("# 周报")
}

// TestTitlePlaceholderOnlyWithMarkdown 代码文件没有标题：设了标题占位也一
// 样，第一行打什么就是什么，不会在 .go 文件里冒出一个「# 」。
func TestTitlePlaceholderOnlyWithMarkdown(t *testing.T) {
	h := newHarness(t, "")
	opts := h.e.Options()
	opts.TitlePlaceholder = "标题"
	opts.Code = "go"
	h.e.SetOptions(opts)
	h.e.SetSource("")
	h.frame()
	h.typ("package main")
	h.want("package main")
}

// TestEnterOnTheEmptyTitleStartsTheBody 不想要标题的人在空标题上按回车：
// 标题让位给正文，光标进入正文行，提示变成「开始写作…」，文件里什么都没写。
func TestEnterOnTheEmptyTitleStartsTheBody(t *testing.T) {
	h := titleHarness(t)
	h.key(0, ui.KeyEnter)
	h.want("")
	if got := h.e.hint(); got != "开始写作…" {
		t.Fatalf("after Enter the empty line shows %q, want 开始写作…", got)
	}
	h.typ("正文")
	h.want("正文")
}

// TestEnterAfterTheTitleShowsTheBodyPlaceholder 标题写完按回车，标题下面那行
// 空正文显示「开始写作…」：标题和正文各有各的提示。
func TestEnterAfterTheTitleShowsTheBodyPlaceholder(t *testing.T) {
	h := titleHarness(t)
	h.typ("周报")
	h.key(0, ui.KeyEnter)
	if got := h.e.hint(); got != "开始写作…" {
		t.Fatalf("the empty line under the title shows %q, want 开始写作…", got)
	}
	h.typ("正文")
	h.want("# 周报\n\n正文")
}

// TestDeletingTheTitleBringsItsPlaceholderBack 把标题的字删光，「标题」灰字
// 回来，接着打字仍然是标题。
func TestDeletingTheTitleBringsItsPlaceholderBack(t *testing.T) {
	h := titleHarness(t)
	h.typ("周")
	h.key(0, ui.KeyBackspace)
	if got := h.e.hint(); got != "标题" {
		t.Fatalf("an emptied title shows %q, want 标题", got)
	}
	h.typ("月报")
	h.want("# 月报")
}

// TestPasteIntoTheTitleKeepsTheHeading 往空标题里粘一行字，也是标题。
func TestPasteIntoTheTitleKeepsTheHeading(t *testing.T) {
	h := titleHarness(t)
	h.clip = transfer.TextData("周报")
	h.key(ui.Cmd, ui.KeyV)
	h.want("# 周报")
}

// TestComposingInTheTitleWritesAHeading 中文输入法上屏到空标题里，也是标题。
func TestComposingInTheTitleWritesAHeading(t *testing.T) {
	h := titleHarness(t)
	h.tt.Compose("zhou", 4)
	h.frame()
	h.tt.Type("周报")
	h.frame()
	h.want("# 周报")
}

// TestMarkdownTypedInTheTitleStartsItsBlock 在空标题里敲 Markdown 的块标记，
// 写的就是那个块：标题让位，列表、引用、自选级别的标题、代码块照常起头。
func TestMarkdownTypedInTheTitleStartsItsBlock(t *testing.T) {
	cases := []struct {
		typed []string
		want  string
	}{
		{[]string{"-", " ", "事项"}, "- 事项"},
		{[]string{">", " ", "引文"}, "> 引文"},
		{[]string{"#", "#", " ", "小节"}, "## 小节"},
		{[]string{"```"}, "```\n\n```"},
	}
	for _, c := range cases {
		h := titleHarness(t)
		for _, s := range c.typed {
			h.typ(s)
		}
		h.want(c.want)
	}
}

// TestDeleteKeepsTheEmptyLine Delete 和 Backspace 一样：空文档只剩这一行，
// 删掉它就没有落笔的地方了。
func TestDeleteKeepsTheEmptyLine(t *testing.T) {
	h := newHarness(t, "")
	h.key(0, ui.KeyDelete)
	if len(h.e.leaves) != 1 || h.e.leaves[0].kind != kPhantom {
		t.Fatalf("leaves = %d after Delete, want the empty line", len(h.e.leaves))
	}
	h.typ("正文")
	h.want("正文")
}

// TestBackspaceGivesTheEmptyLineBackToTheTitle 空标题上回车让给了正文；这一
// 行还空着时 Backspace 把它还给标题，是回车的反操作。
func TestBackspaceGivesTheEmptyLineBackToTheTitle(t *testing.T) {
	h := titleHarness(t)
	h.key(0, ui.KeyEnter)
	h.key(0, ui.KeyBackspace)
	if got := h.e.hint(); got != "标题" {
		t.Fatalf("after Enter and Backspace the empty line shows %q, want 标题", got)
	}
	h.typ("周报")
	h.want("# 周报")
}

// TestBackspaceTakesBackABlankLine 空文档里多敲的回车是源码里的空行：
// Backspace 一下收回一行，不会卡住不动。
func TestBackspaceTakesBackABlankLine(t *testing.T) {
	h := newHarness(t, "")
	h.key(0, ui.KeyEnter)
	h.key(0, ui.KeyEnter)
	h.want("\n\n")
	h.key(0, ui.KeyBackspace)
	h.want("\n")
	h.key(0, ui.KeyBackspace)
	h.want("")
	h.typ("正文")
	h.want("正文")
}

// TestEmptiedDocumentKeepsItsLine 不管怎么删空，空文档都留着它那一行：
// 敲出来的「## 」被 Backspace 拿掉之后，标题占位回来。
func TestEmptiedDocumentKeepsItsLine(t *testing.T) {
	h := titleHarness(t)
	for _, s := range []string{"#", "#", " "} {
		h.typ(s)
	}
	h.want("## ")
	h.key(0, ui.KeyBackspace)
	h.want("")
	if len(h.e.leaves) != 1 || h.e.leaves[0].kind != kPhantom {
		t.Fatalf("leaves = %d, want the document's one empty line", len(h.e.leaves))
	}
	if got := h.e.hint(); got != "标题" {
		t.Fatalf("the emptied document shows %q, want 标题", got)
	}
}

// TestSpaceInTheEmptyTitleIsIgnored 空标题前敲的空格不进文件：标题前面的空白
// 没有意义，只会把后面的标题写成「 # 周报」。
func TestSpaceInTheEmptyTitleIsIgnored(t *testing.T) {
	h := titleHarness(t)
	h.typ(" ")
	h.want("")
	if got := h.e.hint(); got != "标题" {
		t.Fatalf("after a space the empty title shows %q, want 标题", got)
	}
	h.typ("周报")
	h.want("# 周报")
}

// TestRangedCommitInTheTitleWritesAHeading 有的输入法上屏时带着替换范围，范围
// 就是它自己的组字：一样写进标题。
func TestRangedCommitInTheTitleWritesAHeading(t *testing.T) {
	h := titleHarness(t)
	h.e.SetMarkedText(nil, "zhou", ui.TextInputRange{Start: 4, End: 4})
	h.frame()
	h.e.ReplaceText(&ui.TextInputRange{Start: 0, End: 4}, "周报")
	h.frame()
	h.want("# 周报")
}

// TestRangedCommitUnderTheTitleStartsTheBody 标题写完回车，正文的第一行用带
// 替换范围的输入法上屏：字进正文那一行，不能接到标题行尾。
func TestRangedCommitUnderTheTitleStartsTheBody(t *testing.T) {
	h := newHarness(t, "# 标题")
	h.caretAt(len("# 标题"))
	h.key(0, ui.KeyEnter)
	h.e.SetMarkedText(nil, "zheng", ui.TextInputRange{Start: 5, End: 5})
	h.frame()
	at := h.e.unitsOf(h.e.caret)
	h.e.ReplaceText(&ui.TextInputRange{Start: at, End: at + 5}, "正文")
	h.frame()
	h.want("# 标题\n\n正文")
}

// TestImagePastedIntoTheTitleStaysAnImage 往空标题里粘一张图，图自己成一段，
// 不会变成一个只含图片的标题。
func TestImagePastedIntoTheTitleStaysAnImage(t *testing.T) {
	h := titleHarness(t)
	h.clip = transfer.TextData("![](a.png)")
	h.key(ui.Cmd, ui.KeyV)
	h.want("![](a.png)")
}
