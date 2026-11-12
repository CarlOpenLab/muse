package release_test

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
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

// artifactFiles is the exact set of files the three per-platform build
// artifacts contained in the v0.4.0 run, relative to the artifact root. The
// publish job downloads all three into one directory with
// merge-multiple: true, so this is the tree it globs over — the fixture the
// pattern is asserted against is the real thing, not a guess at it.
var artifactFiles = []string{
	// darwin-arm64: the DMG is the installer; the rest is the .app bundle
	// the DMG was built from.
	"darwin-arm64/muse-0.4.0-arm64.dmg",
	"darwin-arm64/Muse.app/Contents/Info.plist",
	"darwin-arm64/Muse.app/Contents/MacOS/Muse",
	"darwin-arm64/Muse.app/Contents/PkgInfo",
	"darwin-arm64/Muse.app/Contents/Resources/AppIcon.icns",
	"darwin-arm64/Muse.app/Contents/Resources/icon.icns",
	"darwin-arm64/Muse.app/Contents/Resources/icon.png",
	"darwin-arm64/Muse.app/Contents/Resources/update-public-key.txt",
	"darwin-arm64/Muse.app/Contents/_CodeSignature/CodeResources",
	// windows-amd64: the exe is the installer.
	"windows-amd64/Muse.exe",
	"windows-amd64/icon.icns",
	"windows-amd64/icon.png",
	"windows-amd64/update-public-key.txt",
	// linux-amd64: deb, rpm and tarball are the installers.
	"linux-amd64/muse_0.4.0_amd64.deb",
	"linux-amd64/muse-0.4.0-1.x86_64.rpm",
	"linux-amd64/muse-0.4.0-linux-amd64.tar.gz",
	"linux-amd64/PKGBUILD",
	"linux-amd64/install.sh",
	"linux-amd64/muse",
	"linux-amd64/muse.desktop",
	"linux-amd64/muse-256x256.png",
	"linux-amd64/muse-512x512.png",
	"linux-amd64/muse.png",
	"linux-amd64/icon.icns",
	"linux-amd64/icon.png",
	"linux-amd64/update-public-key.txt",
}

// platforms are the per-platform directories the artifacts carry, one each.
var platforms = []string{"darwin-arm64", "windows-amd64", "linux-amd64"}

// wanted is the installer each platform ships: what a user downloads from the
// release page. Everything else in the artifacts is build output — the .app
// bundle the DMG was packed from, icons, a PKGBUILD — and attaching it would
// only make the release harder to read.
var wanted = map[string]string{
	"darwin-arm64":  "muse-0.4.0-arm64.dmg",
	"windows-amd64": "Muse.exe",
	"linux-amd64":   "muse_0.4.0_amd64.deb",
}

// installerExts are the extensions of an installer, as opposed to build
// output. A release asset is something a user installs.
var installerExts = []string{".dmg", ".exe", ".msi", ".pkg", ".deb", ".rpm", ".tar.gz", ".zip"}

// isInstaller reports whether name is an installer a user downloads.
func isInstaller(name string) bool {
	for _, e := range installerExts {
		if strings.HasSuffix(name, e) {
			return true
		}
	}
	return false
}

// mergedTree builds the tree the publish job globs over — every platform's
// artifact contents in one release-assets/ directory — and returns the
// directory to glob from, the way the action does: its working directory,
// which holds release-assets/ at its top.
func mergedTree(t *testing.T) string {
	t.Helper()
	base := filepath.Join(t.TempDir(), "release-assets")
	for _, f := range artifactFiles {
		p := filepath.Join(base, filepath.FromSlash(f))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return filepath.Dir(base)
}

// TestEveryPlatformsInstallerReachesTheRelease 每个平台都要把自己的安装包
// 挂上 release：macOS 的 dmg、Windows 的 exe、Linux 的 deb/rpm/tar.gz。
//
// v0.4.0 三个都挂了，但一个文件都没上去：publish 的 files:
// release-assets/* 只匹配到三个平台各自的目录——merge-multiple 把每个
// artifact 下到同一个 release-assets/，而 glob 的单个 `*` 不跨 `/`；
// action 再用 isFile() 把 glob 结果过滤一遍，目录全部落空，于是只有一句
// 「does not match any files」，release 照发不误。用户下载到的是空壳。
func TestEveryPlatformsInstallerReachesTheRelease(t *testing.T) {
	base := mergedTree(t)
	got := matchAll(t, base, releaseFilesPatterns(t, readWorkflow(t)))

	for _, plat := range platforms {
		found := false
		for _, g := range got {
			if rel := strings.TrimPrefix(g, "release-assets/"); strings.HasPrefix(rel, plat+"/") {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("no file from %s/ reaches the release; that platform's users would get nothing", plat)
		}
		if w := wanted[plat]; w != "" {
			ok := false
			for _, g := range got {
				if filepath.Base(g) == w {
					ok = true
					break
				}
			}
			if !ok {
				t.Fatalf("%s's installer %s does not reach the release; %d file(s) matched instead", plat, w, len(got))
			}
		}
	}
}

// TestTheReleaseAttachesOnlyInstallers release 上挂的只能是安装包。
//
// 把模式改成 release-assets/**/* 之后 glob 是对的，但它把三个平台的
// artifact 里全部 26 个文件都挂了上去：.app bundle 的内部文件、图标、
// PKGBUILD、install.sh。这不是「多发了一些」——三个平台各自都带一份
// icon.png、icon.icns 和 update-public-key.txt，而 action 默认
// overwrite_files: true，同名文件互相覆盖，发布直接以
// Not Found 失败（那次 run 就是这样红的）。
//
// 只挂安装包既让 release 干净，也让同名冲突根本不发生：安装包的名字
// 每个平台都不一样。
func TestTheReleaseAttachesOnlyInstallers(t *testing.T) {
	base := mergedTree(t)
	got := matchAll(t, base, releaseFilesPatterns(t, readWorkflow(t)))
	if len(got) == 0 {
		t.Fatal("no files match; the release would publish empty")
	}
	for _, g := range got {
		if !isInstaller(filepath.Base(g)) {
			t.Fatalf("%s reaches the release; it is build output, not an installer a user downloads", g)
		}
	}
	// 同名文件会互相覆盖：每个平台都带一份 icon.png，overwrite_files
	// 之下后上传的赢，发布还可能因此失败。
	seen := map[string]string{}
	for _, g := range got {
		b := filepath.Base(g)
		if prev, dup := seen[b]; dup {
			t.Fatalf("%s and %s are both attached under the name %s; the second upload overwrites the first", prev, g, b)
		}
		seen[b] = g
	}
}

// TestTheReleaseFailsRatherThanShippingEmpty 匹配不到文件必须让构建红，
// 而不是只 warn 一句然后发一个空 release 出去。
func TestTheReleaseFailsRatherThanShippingEmpty(t *testing.T) {
	src := readWorkflow(t)
	if !strings.Contains(src, "fail_on_unmatched_files: true") {
		t.Fatal("the publish job does not set fail_on_unmatched_files: true; an unmatched pattern only warns, and the release ships empty")
	}
}

// TestTheReleaseDownloadMergesTheArtifactsIntoOneDirectory publish 把三个
// 平台的 artifact 下到同一个目录，是「一个平台一个子目录」这个目录结构
// 存在的原因。少了 merge-multiple: true，三个平台就各自占
// release-assets/<artifact-name>/，又要对不上了——两个设置必须一起对。
func TestTheReleaseDownloadMergesTheArtifactsIntoOneDirectory(t *testing.T) {
	src := readWorkflow(t)
	if !strings.Contains(src, "merge-multiple: true") {
		t.Fatal("the publish job downloads the artifacts without merge-multiple: true; each platform would land in its own directory under release-assets/")
	}
	if !strings.Contains(src, "path: release-assets") {
		t.Fatal("the publish job downloads to somewhere other than release-assets; the files pattern must follow")
	}
}

// releaseFilesPatterns pulls every files: pattern out of the publish job's
// "Create GitHub Release" step. action-gh-release takes a newline-separated
// list of patterns, which in YAML is either one inline value or a block
// scalar (`|`) with one pattern per line.
func releaseFilesPatterns(t *testing.T, src string) []string {
	t.Helper()
	step := publishStep(t, src)
	re := regexp.MustCompile(`(?m)^\s+files:\s*(.*)$`)
	m := re.FindStringSubmatch(step)
	if m == nil {
		t.Fatal("the publish step has no files: input")
	}
	inline := strings.TrimSpace(m[1])
	if inline != "" && !strings.HasPrefix(inline, "|") && !strings.HasPrefix(inline, ">") {
		return []string{inline}
	}
	// A block scalar: the patterns are the lines indented past `files:`,
	// skipping comments and blank lines, until the indentation ends.
	const indent = "            "
	var pats []string
	for _, ln := range strings.Split(step, "\n") {
		if !strings.HasPrefix(ln, indent) {
			continue
		}
		body := strings.TrimRight(strings.TrimPrefix(ln, indent), " \t")
		if body == "" || strings.HasPrefix(body, "#") {
			continue
		}
		if strings.HasPrefix(body, "|") || strings.HasPrefix(body, ">") {
			continue
		}
		// Stop at the next input of the step (fail_on_unmatched_files: &c).
		if strings.Contains(body, ": ") || strings.HasSuffix(body, ":") {
			break
		}
		pats = append(pats, body)
	}
	if len(pats) == 0 {
		t.Fatalf("the publish step's files: input carries no pattern: %q", step)
	}
	return pats
}

// publishStep returns the source of the "Create GitHub Release" step.
func publishStep(t *testing.T, src string) string {
	t.Helper()
	i := strings.Index(src, "Create GitHub Release")
	if i < 0 {
		t.Fatal("the release workflow has no Create GitHub Release step")
	}
	return src[i:]
}

// matchAll expands every pattern under root the way action-gh-release does:
// glob semantics where `*` does not cross `/` and `**` does, then keep only
// files. The result is sorted and deduplicated.
func matchAll(t *testing.T, root string, pats []string) []string {
	t.Helper()
	var out []string
	for _, pat := range pats {
		out = append(out, matchFiles(t, root, pat)...)
	}
	sort.Strings(out)
	return out
}

// matchFiles expands a single pattern under root, keeping only files. The
// pattern's segments are matched one at a time against the tree, and the
// result is the path of each file, relative to root and separated by "/".
//
// The rules are the glob engine's: `*` and `?` stay inside one path segment,
// `**` spans any number of directories (including none), and a pattern
// without a trailing `**` must reach a file, not stop at a directory.
func matchFiles(t *testing.T, root, pat string) []string {
	t.Helper()
	segs := strings.Split(pat, "/")
	var out []string
	// walk matches segs[i:] against the directory dir, where elems is the
	// path of dir relative to root.
	var walk func(dir string, i int, elems []string)
	walk = func(dir string, i int, elems []string) {
		if i == len(segs) {
			if st, err := os.Stat(dir); err == nil && !st.IsDir() {
				out = append(out, strings.Join(elems, "/"))
			}
			return
		}
		ents, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		if segs[i] == "**" {
			// `**` matches zero directories, then any number of them.
			walk(dir, i+1, elems)
			for _, e := range ents {
				if e.IsDir() {
					walk(filepath.Join(dir, e.Name()), i, append(elems, e.Name()))
				}
			}
			return
		}
		for _, e := range ents {
			if ok, _ := filepath.Match(segs[i], e.Name()); !ok {
				continue
			}
			walk(filepath.Join(dir, e.Name()), i+1, append(elems, e.Name()))
		}
	}
	walk(root, 0, nil)
	return out
}
