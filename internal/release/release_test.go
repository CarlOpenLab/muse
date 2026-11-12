package release_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// workflow is the release workflow's path from the repository root.
const workflow = "../../.github/workflows/release.yml"

// readWorkflow returns the release workflow's source.
func readWorkflow(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile(workflow)
	if err != nil {
		t.Fatalf("the release workflow is missing: %v", err)
	}
	return string(b)
}

// TestTheReleasePublishesTheFilesItDownloads 三个平台的构建各自把 dist/**
// 打包成一个 artifact，publish 用 merge-multiple: true 把它们下到同一个
// release-assets/ 目录下——于是每个平台占一个子目录（darwin-arm64/、
// windows-amd64/、linux-amd64/），dist 里那份目录结构原样出现在里面。
//
// 发版要真的把安装包挂上去，而 v0.4.0 的 release 是空的：
// action-gh-release 的 files: release-assets/* 只匹配到那三个子目录本身，
// glob 的结果再用 statSync().isFile() 过滤一遍，目录全部落空，于是
// 「Pattern 'release-assets/*' does not match any files」——发布成功但一个
// 二进制都没有。用户拿到的是一个空 release。
//
// 模式必须是能穿过这一层目录结构的那种：glob 引擎里 `*` 不跨 `/`。
func TestTheReleasePublishesTheFilesItDownloads(t *testing.T) {
	src := readWorkflow(t)
	pat := releaseFilesPattern(t, src)

	// 这个模式必须真的能从合并后的目录里匹配到文件。这里把 publish 实际
	// 拿到的目录结构原地造出来：三个平台各自的子目录，里面是 dist 里的
	// 文件名，一层不多一层不少。
	root := t.TempDir()
	base := filepath.Join(root, "release-assets")
	// v0.4.0 的 artifact 里实际出现的文件名（见那次 run 的 dist 内容）。
	files := map[string][]string{
		"darwin-arm64":  {"muse-0.4.0-arm64.dmg", "Muse.app/Contents/Info.plist", "Muse.app/Contents/MacOS/Muse"},
		"windows-amd64": {"Muse.exe", "icon.png"},
		"linux-amd64":   {"muse_0.4.0_amd64.deb", "muse-0.4.0-1.x86_64.rpm", "muse-0.4.0-linux-amd64.tar.gz"},
	}
	for dir, names := range files {
		for _, n := range names {
			p := filepath.Join(base, dir, n)
			if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}

	// 用 glob 引擎同一个语义去匹配：`*` 不跨 `/`，`**` 才跨。只留下文件，
	// 与 action-gh-release 的 paths() 一致。
	got := matchFiles(t, root, pat)
	if len(got) == 0 {
		t.Fatalf("files: %s matches nothing under release-assets/: the release would publish with no binaries", pat)
	}
	// 三个平台都要覆盖：只发一个平台的 release 同样是坏的。
	for _, want := range []string{"muse-0.4.0-arm64.dmg", "Muse.exe", "muse_0.4.0_amd64.deb"} {
		found := false
		for _, g := range got {
			if strings.HasSuffix(g, want) {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("files: %s matched %d files but not %s; every platform's installer must reach the release", pat, len(got), want)
		}
	}
}

// TestTheReleaseDownloadMergesTheArtifactsIntoOneDirectory publish 把三个
// 平台的 artifact 下到同一个目录，是上面那个目录结构存在的原因。少了
// merge-multiple: true，三个平台就各自占 release-assets/<artifact-name>/，
// 而 `*` 那一层目录又对不上了——两个设置必须一起对。
func TestTheReleaseDownloadMergesTheArtifactsIntoOneDirectory(t *testing.T) {
	src := readWorkflow(t)
	if !strings.Contains(src, "merge-multiple: true") {
		t.Fatal("the publish job downloads the artifacts without merge-multiple: true; each platform would land in its own directory under release-assets/")
	}
	if !strings.Contains(src, "path: release-assets") {
		t.Fatal("the publish job downloads to somewhere other than release-assets; the files pattern must follow")
	}
}

// releaseFilesPattern pulls the files: pattern out of the publish job's
// "Create GitHub Release" step.
func releaseFilesPattern(t *testing.T, src string) string {
	t.Helper()
	re := regexp.MustCompile(`(?m)^\s+files:\s*(\S+)\s*$`)
	m := re.FindAllStringSubmatch(src, -1)
	if len(m) != 1 {
		t.Fatalf("the release workflow has %d files: patterns, want exactly one", len(m))
	}
	return m[0][1]
}

// matchFiles expands pat under root the way action-gh-release does: glob
// semantics where `*` does not cross `/`, then keep only files.
func matchFiles(t *testing.T, root, pat string) []string {
	t.Helper()
	// A local implementation of the same two rules, so the test depends on
	// no npm module: `*` stays inside one path segment, `**` crosses them.
	segs := strings.Split(pat, "/")
	var out []string
	var walk func(dir string, i int, prefix string)
	walk = func(dir string, i int, prefix string) {
		if i == len(segs) {
			if st, err := os.Stat(dir); err == nil && !st.IsDir() {
				out = append(out, prefix)
			}
			return
		}
		switch segs[i] {
		case "**":
			// Zero or more directories: try matching the rest here, then
			// descend into every subdirectory and try again.
			walk(dir, i+1, prefix)
			ents, err := os.ReadDir(dir)
			if err != nil {
				return
			}
			for _, e := range ents {
				if e.IsDir() {
					walk(filepath.Join(dir, e.Name()), i, prefix+e.Name()+"/")
				}
			}
		default:
			ents, err := os.ReadDir(dir)
			if err != nil {
				return
			}
			for _, e := range ents {
				if ok, _ := filepath.Match(segs[i], e.Name()); !ok {
					continue
				}
				walk(filepath.Join(dir, e.Name()), i+1, prefix+e.Name())
			}
		}
	}
	walk(root, 0, "")
	return out
}
