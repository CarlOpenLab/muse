# Muse WYSIWYG Migration

## The current gap

Muse currently renders Markdown in read mode, but entering a block replaces it with a
raw `TextArea` over the block source. That means editing shows `#`, `**`, `- `, `>`,
link syntax and code fences, and the caret lives in source offsets rather than in the
rendered text. This is source editing with a styled preview, not WYSIWYG.

The fix is an editor-kernel replacement, not more shortcuts.

## Architecture

1. **Visible-run model (`mdoc.InlineRun`)**
   - Parse one inline source line into runs of visible text plus style
     (bold/italic/code/strike/link/math).
   - Each run carries the source byte range of its visible text, while the Markdown
     markers are hidden.
   - Plain runs carry the source range directly.
   - This is the mapping layer between rendered text and stored Markdown.

2. **Rich inline editor**
   - Build a focusable native control from `ui.TextLayout` + `ui.Painter`.
   - It owns: visible text, run styles, caret/anchor (UTF-16 as TextLayout expects),
     selection rects, input-to-source mapping.
   - Keyboard: text input, IME, Backspace/Delete, arrows/Home/End, Shift selection,
     Enter split, Cmd+A/C/X/V/Z, Cmd+B/I/U/E/K, plus the block-level shortcuts already
     present.
   - Clipboard and undo history live in the editor state.
   - The caret and selection are drawn over the styled runs, never over marker text.

3. **Block chrome**
   - Heading levels style the inline editor; `#` markers never enter the editor.
   - List bullets/numbers are drawn outside the editor; indentation lives in the block
     model, not in the visible text.
   - Quote bars are block chrome; `> ` markers are hidden.
   - Task checkboxes are chrome; the editor sees only the task text.

4. **Special blocks**
   - Code blocks: a code editor that preserves raw code and shows the language/fence as
     chrome.
   - Tables: per-cell rich editors; source pipes are chrome.
   - Math: a math editor with live rendered preview; `$`/`$$` are chrome.
   - Images: image block with caption/alt editing, no raw Markdown syntax.

5. **Remove the source path**
   - Delete the per-block `TextArea` source switch once the rich editor covers the block
     kinds, and keep the document source only as persistence.

## Phases and acceptance

- **Phase 0 — mapping foundation**
  - `InlineRun` parser + source ranges + tests for bold/italic/code/strike/link/math.
  - Acceptance: visible text and run ranges round-trip for plain and nested inline text.

- **Phase 1 — paragraph/heading rich editing (done, first pass)**
  - Rich inline editor for Paragraph and Heading.
  - Markers hidden while editing; caret/selection drawn in rendered text.
  - Implemented: typing, arrows/Home/End/Up/Down, Shift selection, Backspace/Delete,
    undo, paste/copy/cut, Enter split, Cmd+B/I/U/E, Cmd+0–6 headings.
  - Implemented (closeout): Cmd+K opens the link URL popover when the caret is
    inside a link run, or turns the selection into a link; the URL edits in a
    modal and commits through the run model (r.markdown() re-serializes).
  - Implemented (closeout): rich auto-pair for ()[]{}""''`` (selection wraps,
    collapsed inserts a pair with the caret inside, typing a closer before its
    twin skips over; markdown markers stay literal), and Up/Down crossing into
    the adjacent block at a block's first/last edge (same semantics as the
    source editor: only at the absolute text boundary).
  - Framework note: inline math in the rich editor is a Unicode typeset atom
    (run.Display); MyGo's TextLayout has no inline-image runs, so true bitmap
    typesetting inside rich text is blocked on the framework.

- **Phase 2 — list/quote chrome (done, first pass)**
  - Bullets/numbers/quotes outside the editor; Enter continues/starts blocks.
  - Implemented: hide `- `/`1.`/`> `, draw bullets/numbers/quote bars/task boxes,
    Enter creates the next item/quote line, Tab/Shift+Tab nest and outdent.
  - Verified (closeout): the task checkbox is clickable while the item is in
    rich editing (toggles the run model, commit serializes [x]/[ ]), and
    Enter on an ordered item increments its marker (nextListPrefix).
  - Implemented (closeout): a list item with nested children no longer opens
    the rich editor (its run model cannot round-trip the nested lines) — it
    edits as multi-line source with Tab/Shift+Tab indent/outdent, and the
    nested markers round-trip byte-exactly.

- **Phase 3 — tables/code/math/images (done, first pass)**
  - Tables edit per cell without pipes; code hides fences and shows a language
    badge; math hides `$$` and shows a live typeset preview above the TeX source;
    images edit through alt/src/title fields while the image stays rendered.
  - Inline math is now an atomic visible run (`x² + α`) while its TeX source is
    preserved; partial deletion expands to the whole atom.
  - Implemented (closeout): table row/column add/remove — right-click menu on
    a rendered table (anchored to the edited cell) plus Cmd+Enter inserting a
    row below the edited cell; the alignment row's colon style is mirrored for
    new columns and the last column cannot be deleted.
  - Implemented (closeout): HTML blocks edit as raw source (the click path no
    longer skips them); image blocks gained a display-width stepper in the
    image editor that persists an equivalent HTML img width attribute (mdoc
    parses it back into ImgWidth; 重置 returns to the markdown form).
  - Still pending: true image/TeX inline atoms (not Unicode — blocked on
    TextLayout inline-image support). Canvas edge-drag for image resize would
    additionally need hit-testing inside mdoc's view; the stepper covers the
    capability.

- **Phase 4 — cleanup (done, first pass)**
  - Markdown source surfaces are gone for paragraphs, headings, lists, quotes,
    tables, images, code and math; code/math keep their content text, not Markdown
    markers. Table cells edit individually and the old whole-table source path is
    disabled; Rule/HTML blocks no longer open a source surface.
  - IME composition is previewed at the caret and commits through the normal text
    input path; the editor no longer drops composed Chinese/Japanese text.
  - Optional next steps: true inline-math image atoms (blocked on framework),
    canvas edge-drag image resize (stepper delivered),
    very long paragraph caret tuning.

## Risks

- IME composition, bidi and multi-line selection need explicit tests.
- Undo/redo across a rendered/source mapping is the hardest correctness area; keep the
  mapping immutable per edit and rebuild only the affected runs.
- Tables and code blocks are separate editors; they should share caret/selection
  primitives but not force one generic control.
- This is a multi-round rewrite. It will not be claimed done until the acceptance tests
  for each phase pass.
