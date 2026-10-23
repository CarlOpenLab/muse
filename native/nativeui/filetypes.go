package nativeui

import (
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// editableExtensions is the allowlist for files Muse opens in the editor.
// Binary media (png/jpg/pdf/zip/…) and office documents are deliberately not
// listed, so they never appear in the file tree or the Open dialog.
var editableExtensions = []string{
	"md", "markdown", "mdx", "txt", "text",
	"json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "conf", "cfg",
	"csv", "tsv", "log",
	"go", "rs", "py", "rb", "php", "java", "kt", "kts",
	"c", "h", "cc", "cpp", "cxx", "hpp", "m", "mm", "swift",
	"js", "jsx", "ts", "tsx", "css", "scss", "sass", "less",
	"html", "htm", "xml", "svg", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
	"sql", "graphql", "gql", "proto", "vue", "svelte", "astro",
	"tex", "bib", "org", "rst", "adoc", "properties", "env",
	"mod", "sum", "gradle", "mk", "cmake", "plist", "diff", "patch",
}

var editableExtSet = func() map[string]bool {
	m := make(map[string]bool, len(editableExtensions))
	for _, e := range editableExtensions {
		m[e] = true
	}
	return m
}()

var editableNames = map[string]bool{
	"readme": true, "license": true, "licence": true, "changelog": true,
	"authors": true, "notice": true, "makefile": true, "dockerfile": true,
	"procfile": true, "gemfile": true, "rakefile": true,
}

func isEditableFile(path string) bool {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
	if ext != "" {
		return editableExtSet[ext]
	}
	return editableNames[strings.ToLower(filepath.Base(path))]
}

// isTextData rejects binaries that happen to use a text extension (or a
// renamed image) by checking for NUL bytes and invalid UTF-8.
func isTextData(data []byte) bool {
	if len(data) == 0 {
		return true
	}
	sample := data
	if len(sample) > 8192 {
		sample = sample[:8192]
	}
	for _, b := range sample {
		if b == 0 {
			return false
		}
	}
	return utf8.Valid(data)
}

// textFilter is shared by Open/Save dialogs.
func textFileFilter() []string {
	return append([]string(nil), editableExtensions...)
}
