package release_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// The release pipeline moved from action-gh-release globs to `mygo build
// -upload`: each platform's build creates or reuses a draft release, uploads
// its installers and the signed update feed, and a final job promotes the
// draft. These tests assert that configuration, since only a real tag run can
// exercise it.
const (
	workflowPath   = "../../.github/workflows/release.yml"
	mygoPath       = "../../mygo.json"
	packagePath    = "../../package.json"
	changelogPath  = "../../CHANGELOG.md"
	publicKeyPath  = "../../resources/update-public-key.txt"
	releaseRepo    = "CarlOpenLab/muse"
	releaseVersion = "0.6.0"
)

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(b)
}

type mygoConfig struct {
	Version string `json:"version"`
	Updates struct {
		PublicKey string `json:"publicKey"`
		GitHub    string `json:"github"`
		TagPrefix string `json:"tagPrefix"`
	} `json:"updates"`
}

func readMygoConfig(t *testing.T) mygoConfig {
	t.Helper()
	var cfg mygoConfig
	if err := json.Unmarshal([]byte(readFile(t, mygoPath)), &cfg); err != nil {
		t.Fatalf("parse mygo.json: %v", err)
	}
	return cfg
}

// stepSource returns the source of the step named name, from its "- name:"
// line to the next step. Step names are unique in this workflow.
func stepSource(t *testing.T, src, name string) string {
	t.Helper()
	marker := "- name: " + name
	i := strings.Index(src, marker)
	if i < 0 {
		t.Fatalf("the workflow has no %q step", name)
	}
	rest := src[i:]
	if j := strings.Index(rest[len(marker):], "\n      - name: "); j >= 0 {
		rest = rest[:len(marker)+j]
	}
	return rest
}

// jobSource returns the source of the job named name, to the next top-level
// job.
func jobSource(t *testing.T, src, name string) string {
	t.Helper()
	marker := "\n  " + name + ":\n"
	i := strings.Index(src, marker)
	if i < 0 {
		t.Fatalf("the workflow has no %q job", name)
	}
	rest := src[i+len(marker):]
	// A job starts at a two-space-indented key. Find the next one.
	offset := 0
	for _, line := range strings.SplitAfter(rest, "\n") {
		if len(line) > 2 && line[0] == ' ' && line[1] == ' ' && line[2] != ' ' &&
			strings.HasSuffix(strings.TrimRight(line, "\n"), ":") {
			return rest[:offset]
		}
		offset += len(line)
	}
	return rest
}

// TestUpdateFeedIsConfigured: without updates.publicKey mygo cannot sign the
// feed, and without github/tagPrefix the app cannot find it. The key must be
// the same one resources/update-public-key.txt ships, byte for byte, or
// every update it signs fails verification.
func TestUpdateFeedIsConfigured(t *testing.T) {
	cfg := readMygoConfig(t)
	key := strings.TrimSpace(readFile(t, publicKeyPath))
	if cfg.Updates.PublicKey == "" {
		t.Fatal("mygo.json has no updates.publicKey; builds cannot sign the update feed")
	}
	if cfg.Updates.PublicKey != key {
		t.Fatalf("mygo.json publicKey does not match resources/update-public-key.txt\nmygo.json: %q\nfile:      %q",
			cfg.Updates.PublicKey, key)
	}
	if cfg.Updates.GitHub != releaseRepo {
		t.Fatalf("updates.github = %q, want %q", cfg.Updates.GitHub, releaseRepo)
	}
	if cfg.Updates.TagPrefix != "v" {
		t.Fatalf("updates.tagPrefix = %q, want %q", cfg.Updates.TagPrefix, "v")
	}
}

// TestBuildUploadsTheSignedUpdateFeed: the build must pass -upload and have
// both secrets in its environment. Without them it only produces installers,
// and no installed Muse can ever find an update.
func TestBuildUploadsTheSignedUpdateFeed(t *testing.T) {
	step := stepSource(t, readFile(t, workflowPath), "Build and package")
	for _, want := range []string{
		"-upload",
		"MYGO_UPDATER_PRIVATE_KEY: ${{ secrets.MYGO_UPDATER_PRIVATE_KEY }}",
		"GH_TOKEN: ${{ github.token }}",
	} {
		if !strings.Contains(step, want) {
			t.Fatalf("the build step is missing %q", want)
		}
	}
}

// TestTagMatchesTheManifestVersion: a tag that disagrees with mygo.json would
// publish installers and update feeds under different versions.
func TestTagMatchesTheManifestVersion(t *testing.T) {
	src := readFile(t, workflowPath)
	if !strings.Contains(src, "Check the tag matches mygo.json") {
		t.Fatal("the workflow does not check the tag against mygo.json")
	}
	if !strings.Contains(src, `test "v$(jq -r .version mygo.json)" = "$TAG"`) {
		t.Fatal("the version check does not compare v$(jq -r .version mygo.json) with the tag")
	}
}

// TestBuildsRunSerially: all three platforms create or reuse one draft
// release; running them at once would race on its creation.
func TestBuildsRunSerially(t *testing.T) {
	if !strings.Contains(readFile(t, workflowPath), "max-parallel: 1") {
		t.Fatal("the build matrix is not serial (max-parallel: 1); parallel builds race on the draft release")
	}
}

// TestPublishPromotesTheDraft: the last job turns the draft into the release
// and makes it latest, so the next version's manifest lookup finds it. It
// must wait for every build.
func TestPublishPromotesTheDraft(t *testing.T) {
	src := readFile(t, workflowPath)
	pub := jobSource(t, src, "publish")
	if !strings.Contains(pub, "needs: build") {
		t.Fatal("the publish job does not need: build")
	}
	if !strings.Contains(pub, "gh release edit") {
		t.Fatal("the publish job does not run gh release edit")
	}
	if !strings.Contains(pub, "--draft=false") {
		t.Fatal("the publish job does not undraft the release")
	}
	if strings.Contains(src, "softprops/action-gh-release") {
		t.Fatal("the workflow still uses softprops/action-gh-release; mygo -upload owns the release now")
	}
}

// TestWindowsShipsThePortableExe: CI has no NSIS, so the Windows installer is
// skipped; the bare Muse.exe is what those users download and what the update
// feed replaces.
func TestWindowsShipsThePortableExe(t *testing.T) {
	step := stepSource(t, readFile(t, workflowPath), "Upload the portable Windows build")
	if !strings.Contains(step, "gh release upload") {
		t.Fatal("the portable Windows step does not upload anything")
	}
	if !strings.Contains(step, "dist/windows-amd64/Muse.exe") {
		t.Fatal("the portable Windows step does not upload the bare Muse.exe")
	}
}

// TestUploadsDoNotSwallowFailures: a failed upload must turn the build red,
// not leave a draft missing a platform.
func TestUploadsDoNotSwallowFailures(t *testing.T) {
	if strings.Contains(readFile(t, workflowPath), "continue-on-error: true") {
		t.Fatal("the workflow uses continue-on-error: true; a failed upload would leave the release incomplete")
	}
}

// TestReleaseNotesCoverTheCurrentVersion runs mygo's ReleaseNotes rule over
// the changelog: `mygo build -upload` fails when the current version's
// section is empty, and a "## " subheading would end it early.
func TestReleaseNotesCoverTheCurrentVersion(t *testing.T) {
	cfg := readMygoConfig(t)
	notes := releaseNotes(readFile(t, changelogPath), cfg.Version)
	if notes == "" {
		t.Fatalf("CHANGELOG.md has no notes for %s; mygo build -upload fails on an empty section", cfg.Version)
	}
	for _, line := range strings.Split(notes, "\n") {
		if strings.HasPrefix(line, "## ") {
			t.Fatalf("the %s section contains a level-2 heading %q; mygo stops the notes there", cfg.Version, line)
		}
	}
	for _, want := range []string{"自动更新", "手动安装"} {
		if !strings.Contains(notes, want) {
			t.Fatalf("the %s release notes do not mention %q", cfg.Version, want)
		}
	}
}

// TestVersionIsBumpedForThisRelease: the manifest, package.json and changelog
// must agree on the version the tag will carry.
func TestVersionIsBumpedForThisRelease(t *testing.T) {
	cfg := readMygoConfig(t)
	if cfg.Version != releaseVersion {
		t.Fatalf("mygo.json version = %q, want %q", cfg.Version, releaseVersion)
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal([]byte(readFile(t, packagePath)), &pkg); err != nil {
		t.Fatalf("parse package.json: %v", err)
	}
	if pkg.Version != releaseVersion {
		t.Fatalf("package.json version = %q, want %q", pkg.Version, releaseVersion)
	}
	if !strings.Contains(readFile(t, changelogPath), "## "+releaseVersion) {
		t.Fatalf("CHANGELOG.md has no ## %s section", releaseVersion)
	}
}

// releaseNotes mirrors mygo's internal/update.ReleaseNotes: the text under
// the "## <version>" heading, up to the next "## " heading.
func releaseNotes(changelog, version string) string {
	var notes []string
	in := false
	version = strings.TrimPrefix(version, "v")
	for _, line := range strings.Split(strings.ReplaceAll(changelog, "\r\n", "\n"), "\n") {
		if rest, ok := strings.CutPrefix(line, "## "); ok {
			if in {
				break
			}
			fields := strings.Fields(rest)
			in = len(fields) > 0 && strings.TrimPrefix(headingVersion(fields[0]), "v") == version
			continue
		}
		if in {
			notes = append(notes, line)
		}
	}
	return strings.TrimSpace(strings.Join(notes, "\n"))
}

func headingVersion(s string) string {
	if rest, ok := strings.CutPrefix(s, "["); ok {
		s, _, _ = strings.Cut(rest, "]")
	}
	return s
}
