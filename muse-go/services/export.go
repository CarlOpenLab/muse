// 导出 / 图片资产服务：对应 Electron 版 electron/services/export.ts。
//
//	Export.SaveImage          把 base64 图片写到文档同目录 assets/ -> 'assets/<name>' | ""
//	Export.PickAndSaveImage   弹文件框选图并拷入 assets/ -> 'assets/<name>' | ""
//	Export.ExportPDF          渲染进程先加导出样式类，再调本方法：存 PDF -> path | ""
//	Export.ExportHTML         保存独立 HTML 文件 -> path | ""
//	Export.ReadClipboard      读剪贴板文本（网页级剪贴板 paste 的兜底）
package services

import (
	"context"
	"encoding/base64"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/egoist/mygo"
)

var imgExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
	".svg": true, ".bmp": true, ".ico": true, ".avif": true,
}

var illegalNameChars = regexp.MustCompile(`[\\/:*?"<>|\s]+`)

// Export 是导出服务对象。
type Export struct{}

// sanitize 清理文件名里的非法字符。
func sanitize(name string) string {
	name = illegalNameChars.ReplaceAllString(name, "-")
	name = strings.Trim(name, "-")
	if name == "" {
		return "image"
	}
	return name
}

// uniqueName 在 assets 目录里找一个不重名的文件名。
func uniqueName(dir, name string) string {
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	candidate := name
	for i := 1; pathExists(filepath.Join(dir, candidate)); i++ {
		candidate = stem + "-" + strconv.Itoa(i) + ext
	}
	return candidate
}

// assetsDir 确保文档同目录 assets/ 存在并返回其路径。
func assetsDir(docPath string) (string, error) {
	dir := filepath.Join(filepath.Dir(docPath), "assets")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// markdownImagePath 生成可写进 markdown 的相对路径。
// sanitize 已去掉空格与特殊字符，中文按 Typora 习惯直书；仅转义 #%。
func markdownImagePath(name string) string {
	r := strings.NewReplacer("%", "%25", "#", "%23")
	return "assets/" + r.Replace(name)
}

// SaveImage 把 base64 图片写入 assets，返回可写进 markdown 的相对路径。
func (e *Export) SaveImage(docPath, fileName, base64Data string) string {
	if docPath == "" || base64Data == "" {
		return ""
	}
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return ""
	}
	dir, err := assetsDir(docPath)
	if err != nil {
		return ""
	}
	name := uniqueName(dir, sanitize(fileName))
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		return ""
	}
	return markdownImagePath(name)
}

// PickAndSaveImage 弹文件框选图并拷入 assets/。
func (e *Export) PickAndSaveImage(ctx context.Context, docPath string) string {
	if docPath == "" {
		return ""
	}
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
		Parent: mygo.CallerWindow(ctx),
		Title:  "插入图片",
		Filters: []mygo.FileFilter{{
			Name:       "图片",
			Extensions: []string{"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"},
		}},
	})
	if err != nil || len(paths) == 0 {
		return ""
	}
	src := paths[0]
	if !imgExts[strings.ToLower(filepath.Ext(src))] {
		return ""
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return ""
	}
	dir, err := assetsDir(docPath)
	if err != nil {
		return ""
	}
	name := uniqueName(dir, sanitize(filepath.Base(src)))
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		return ""
	}
	return markdownImagePath(name)
}

// ExportPDF 把当前页面渲染为 PDF 并存盘。
func (e *Export) ExportPDF(ctx context.Context, suggestedName string) string {
	win := mygo.CallerWindow(ctx)
	defaultName := regexp.MustCompile(`(?i)\.md$`).ReplaceAllString(suggestedName, "") + ".pdf"
	path, err := mygo.Dialog.Save(mygo.SaveDialogOptions{
		Parent:      win,
		Title:       "导出 PDF",
		DefaultPath: defaultName,
		Filters:     []mygo.FileFilter{{Name: "PDF", Extensions: []string{"pdf"}}},
	})
	if err != nil || path == "" {
		return ""
	}
	if win == nil {
		return ""
	}
	pdf, err := win.PrintToPDF(mygo.PDFOptions{
		PageSize:   mygo.PageA4,
		Background: true,
		Margins:    &mygo.Margins{Top: 0.6, Right: 0.6, Bottom: 0.6, Left: 0.6},
	})
	if err != nil {
		return ""
	}
	if err := os.WriteFile(path, pdf, 0o644); err != nil {
		return ""
	}
	return path
}

// ExportHTML 保存独立 HTML 文件。
func (e *Export) ExportHTML(ctx context.Context, html, suggestedName string) string {
	defaultName := regexp.MustCompile(`(?i)\.md$`).ReplaceAllString(suggestedName, "") + ".html"
	path, err := mygo.Dialog.Save(mygo.SaveDialogOptions{
		Parent:      mygo.CallerWindow(ctx),
		Title:       "导出 HTML",
		DefaultPath: defaultName,
		Filters:     []mygo.FileFilter{{Name: "HTML", Extensions: []string{"html"}}},
	})
	if err != nil || path == "" {
		return ""
	}
	if err := os.WriteFile(path, []byte(html), 0o644); err != nil {
		return ""
	}
	return path
}

// ReadClipboard 读剪贴板文本（前端 app:webctx paste 的兜底）。
func (e *Export) ReadClipboard() string {
	return mygo.Clipboard.ReadText()
}
