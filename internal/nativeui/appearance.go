package nativeui

// appearance.go — 编辑器卡片的外观：卡片的不透明度、卡片背后桌面材料的
// 强度、卡片左边缘的位置。三者都立即生效并落盘，与 beacon 的
// backgroundOpacity / backgroundBlur 是同一套做法：卡片色由明暗主题的
// 色板定死，能调的是它透多少。

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

const (
	// minCardOpacity 是卡片最透能到哪。再低正文与桌面材料的对比度就不够
	// 了，编辑器是要长时间阅读的表面，beacon 用的也是 0.30 这个下限。
	minCardOpacity = 0.30
	// defaultCardOpacity 是首次启动的值：最透的一张卡片，材料直接透出来。
	defaultCardOpacity = minCardOpacity

	// defaultCardBlur 是首次启动的材料强度：亚克力。
	defaultCardBlur = "deep"

	// cardMinWidth 是卡片拖窄的下限：再窄一行文字放不了几个字，写作就没有
	// 意义了。窗口放不下这个下限时以窗口为准（见 clampCardLeft）。
	cardMinWidth = 320

	// cardResizeGrab 是卡片左边缘手柄的宽度：卡片最窄时也能握住。
	cardResizeGrab = 8
)

// cardBlurChoices 是材料强度的四档，和设置里分段控件的顺序一致。id 直接
// 是 mygo.Vibrancy 的值，存盘的就是它。
var cardBlurChoices = []struct {
	id    string
	label string
}{
	{"none", "无"},
	{"subtle", "弱"},
	{"medium", "中"},
	{"deep", "强"},
}

// cardBlurIndex 是 id 在 cardBlurChoices 里的位置，分段控件用它。一个不在
// 表里的 id 落到首次启动的那一档：查表而不是写死位置，调换顺序也不会选错。
func cardBlurIndex(id string) int {
	fallback := 0
	for i, choice := range cardBlurChoices {
		if choice.id == id {
			return i
		}
		if choice.id == defaultCardBlur {
			fallback = i
		}
	}
	return fallback
}

// appearanceSettings 是落盘的外观设置。cardWidth 为 0 表示还没拖过，卡片
// 跟着面板走（见 cardWidth）。
type appearancePrefs struct {
	CardOpacity float64 `json:"cardOpacity,omitempty"`
	CardBlur    string  `json:"cardBlur,omitempty"`
	CardWidth   float32 `json:"cardWidth,omitempty"`
}

func appearancePath() string {
	if dir := os.Getenv("MUSE_CONFIG_DIR"); dir != "" {
		return filepath.Join(dir, "appearance.json")
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = os.TempDir()
	}
	return filepath.Join(dir, "Muse", "appearance.json")
}

func loadAppearance() appearancePrefs {
	var p appearancePrefs
	data, err := os.ReadFile(appearancePath())
	if err != nil {
		return p
	}
	_ = json.Unmarshal(data, &p)
	return p
}

func saveAppearance(p appearancePrefs) error {
	path := appearancePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// cardOpacity 是卡片当前的不透明度，钳在 [minCardOpacity, 1]。0 与缺失都
// 是首次启动，取 defaultCardOpacity。
func (a *App) cardOpacity() float64 {
	v := a.cardOpacityPref
	if v <= 0 {
		return defaultCardOpacity
	}
	return min(max(v, minCardOpacity), 1)
}

// cardBlur 是当前的材料强度 id。一个没有材料与之匹配的 id 回到默认档。
func (a *App) cardBlur() string {
	id := a.cardBlurPref
	for _, choice := range cardBlurChoices {
		if choice.id == id {
			return id
		}
	}
	return defaultCardBlur
}

// cardWidth 是卡片左边缘被拖到过的宽度，0 表示没拖过。
func (a *App) cardWidth() float32 { return a.cardWidthPref }

// setCardOpacity 记下不透明度并落盘。窗口不需要重画：卡片底色每帧都从
// 这里取，AnimateColor 会自己补上过渡。
func (a *App) setCardOpacity(v float64) {
	a.cardOpacityPref = v
	if err := saveAppearance(a.appearancePrefs()); err != nil {
		a.notice("保存外观失败：" + err.Error())
	}
	a.invalidate()
}

// setCardBlur 换材料强度。材料是窗口级的，要 SetVibrancy 才会变。
func (a *App) setCardBlur(id string) {
	a.cardBlurPref = id
	if err := saveAppearance(a.appearancePrefs()); err != nil {
		a.notice("保存外观失败：" + err.Error())
	}
	a.applyCardBlur()
	a.invalidate()
}

// setCardWidth 记下卡片左边缘的位置并落盘。0 是「没拖过」，卡片跟着面板走
// ——所以只有双击复位会传 0 进来，拖动永远不会：拖动的边界由 clampCardLeft
// 在拖的时候就把着，一个拖到头的值记下来就是它停的地方，弹回去反而破坏了
// 手感。
func (a *App) setCardWidth(v float32) {
	a.cardWidthPref = v
	if err := saveAppearance(a.appearancePrefs()); err != nil {
		a.notice("保存外观失败：" + err.Error())
	}
	a.invalidate()
}

// appearancePrefs 是当前三个值的快照，给落盘用。
func (a *App) appearancePrefs() appearancePrefs {
	return appearancePrefs{
		CardOpacity: a.cardOpacityPref,
		CardBlur:    a.cardBlurPref,
		CardWidth:   a.cardWidthPref,
	}
}

// applyCardBlur 把材料强度交给窗口。窗口不在（测试、首帧之前）时什么都不
// 做，下一个窗口创建时按同一个值设好。
func (a *App) applyCardBlur() {
	if a.win == nil {
		return
	}
	a.win.SetVibrancy(cardVibrancy(a.cardBlur()))
}

// cardColor 是卡片底色：主题色板里的卡片色，乘上当前不透明度。颜色本身跟
// 主题走，不开放选择——编辑器是要长时间阅读的表面，对比度不能靠用户自己
// 调对。不透明度满档时是完全不透明的主题色，和这次改动前一样。
func (a *App) cardColor(dark bool) ui.Color {
	base := ui.Hex("#ffffff")
	if dark {
		base = ui.Hex("#232328")
	}
	op := a.cardOpacity()
	if op >= 1 {
		return base
	}
	return base.Alpha(float32(op))
}

// cardVibrancy 是材料强度 id 对应的 mygo 材料。none 是不要材料，卡片背后
// 就是窗口底色——等于回到不透明的效果。
func cardVibrancy(id string) mygo.Vibrancy {
	switch id {
	case "none":
		return mygo.VibrancyNone
	case "subtle":
		return mygo.VibrancySidebar
	case "medium":
		return mygo.VibrancyPopover
	}
	// deep 是亚克力，也是 id 不认识时的落点。
	return mygo.VibrancyAcrylic
}
