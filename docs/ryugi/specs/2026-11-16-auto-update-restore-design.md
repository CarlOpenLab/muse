# Muse 自动更新恢复 — 实现规格

- 日期：2026-11-16
- 状态：第 1 轮 6 项均按建议通过；独立审查完成；重启流程按用户选择改为“保存后继续重启”
- 目标版本：0.6.0
- 讨论记录：`.ryugi/artifacts/document/auto-update-restore/document.html`

## 1. 为什么做

0.2.1 有完整的签名自动更新：每天后台检查、更新窗口、下载进度、安装重启，设置里可以调自动检查和自动下载。原生重写提交 `6ed97a3` 删掉了 Vue 前端、`mygo.Use(updater…)`、更新菜单和 `UpdateSettings.vue`，只留下 `internal/services/updates.go` 和 `resources/update-public-key.txt`。

当前 0.5.0 的状态：

- `mygo.json` 没有 `updates`，构建时 `updateFlags` 返回空，`mygo.Updater.Enabled()` 为 false；
- 发布流水线只挂安装包，不生成、不上传 `update-<target>.json`、签名归档和 delta；
- 设置页只有主题 / 排版 / 模型，菜单没有更新入口；
- `services/updates.go` 的偏好方法没有任何 UI 调用。

所以不是“检查更新按钮藏起来了”，而是整条链路都断了。要让 0.6.0 之后的版本能在应用内升级，UI、插件、配置、发布四块都要接回来。

## 2. 目标与非目标

### 目标

- 恢复 0.2.x 的用户体验：启动后不久检查一次、之后每天一次；发现新版显示更新窗口（更新说明、安装、跳过此版本、稍后提醒）；下载带进度；安装后重启进入新版。
- 设置页新增「应用更新」：当前版本、上次检查时间、「检查更新」按钮、「自动检查更新」开关、「自动下载并安装」开关、不可自更新时的说明、更新来源与签名说明。
- 菜单新增「更新 → 检查更新…」。
- 发布流水线生成并发布签名更新归档与 manifest，复用现有公钥和 GitHub secret。
- 0.5.0 及更早版本手动安装 0.6.0 一次后，后续版本可在应用内更新。

### 非目标

- 不做自定义更新 UI，不用网页版 `updater.Plugin`。
- 不改 mygo 更新窗口的文案和交互，直接用原生插件的。
- 不引入 NSIS 安装器，不改变 macOS 签名与公证流程。
- 不为包管理器安装的构建做额外更新通道；mygo 自己会禁用这类构建的自动更新。

### 反目标

- 发布空 release，或发布没有 manifest、导致应用永远查不到更新的 release。
- 设置页或单元测试在插件未注册时 panic。
- 0.6.0 用户仍然收不到 0.6.1。

## 3. 已定决策

| # | 决策 | 来源 |
|---|---|---|
| 1 | 发布改用 `go tool mygo build -upload`：三个平台各自签名并上传到同一个草稿 release，最后 `gh release edit --draft=false`；Windows 裸 `Muse.exe` 另用 `gh release upload` 补挂。 | 用户（第 1 轮建议通过） |
| 2 | 版本发 0.6.0；发布说明写明 0.5.0 及更早版本需手动安装一次。 | 用户 |
| 3 | 顶级「更新」菜单，里面只有「检查更新…」；macOS 应用菜单不重复放。 | 用户 |
| 4 | 设置页左侧新开「应用」分组，里面一项「应用更新」；右侧内容照 0.2.x。 | 用户 |
| 5 | Windows 继续只发裸 `Muse.exe`，不引入 NSIS。 | 用户 |
| 6 | 发布说明取 `CHANGELOG.md` 对应版本段落。 | 用户 |
| 7 | 默认自动检查开、自动下载关、更新窗口中文。 | 我的决定 |
| 8 | 使用 `github.com/egoist/mygo/plugins/updater/native`，不是网页版插件。 | 我的决定 |
| 9 | 复用 `resources/update-public-key.txt` 与 GitHub secret `MYGO_UPDATER_PRIVATE_KEY`（已确认 secret 存在）。 | 我的决定 |
| 10 | 设置页测试注入假的更新控制器，单元测试不启动插件、不发网络请求。 | 我的决定 |
| 11 | `internal/services/updates.go` 继续作为偏好读写桥，原生 UI 只负责显示和点击。 | 我的决定 |
| 12 | 更新窗口的「重新启动」遇到未保存文档时，保存或放弃后继续自动重启进入新版本，而不是只关闭窗口。 | 用户 |

## 4. 实现

### 4.1 `mygo.json`

在顶层加入：

```json
"updates": {
  "publicKey": "FG0Hg7hGBVq3w+Cin+CDYOH/tqOiXF+jOd+V3e0kAa0=",
  "github": "CarlOpenLab/muse",
  "tagPrefix": "v"
}
```

- `deltas` 省略，使用 mygo 默认的 3 个版本。第一版 0.6.0 没有可用的旧 manifest，mygo 会记录 “No delta updates” 后继续，不会失败。
- `version` 从 `0.5.0` 改为 `0.6.0`。
- 配好后 `go tool mygo build` 会把 feed 和公钥写进 ldflags；带 `MYGO_UPDATER_PRIVATE_KEY` 时每个平台额外生成签名归档 `muse-<version>-<target>.tar.gz`、`update-<target>.json`、可能的 delta 和 `SHA256SUMS`。

### 4.2 应用启动（`internal/nativeui/run.go`）

新增导入：

```go
"github.com/egoist/mygo/plugins/updater"
updaternative "github.com/egoist/mygo/plugins/updater/native"
```

在 `Run()` 里，`mygo.App.SetName("Muse")` 之后、`mygo.App.Run()` 之前：

```go
mygo.Use(updaternative.New(updater.Options{Language: "zh-Hans"}))
app.updates = liveUpdates{}
updater.OnChange(app.invalidate)
```

- 不要同时使用 `updater.Plugin` / `updater.New`；`native.New` 与它们互斥。
- `OnChange` 用于在设置页打开时刷新“上次检查”；设置页不显示可用版本，可用版本只在更新窗口里出现。`app.invalidate` 在窗口未创建时是安全的。
- 开发构建和测试不会因为自动检查触网：mygo 的 `Enabled()` 对 dev 构建返回 false，插件不会在后台检查。

### 4.2.1 未保存文档下的重新启动

mygo 的 `Relaunch()` 走正常退出流程；当前窗口的 `OnClose` 在文档脏时 `PreventDefault`，而 mygo 会丢弃一个被取消的 relaunch。结果是用户点「重新启动」、在保存对话框里选了保存/放弃后，窗口关了但不会重启。这里要补上“保存后继续重启”。

`App` 增加两个只在主线程读写的字段：

```go
updateInstalled bool // updater.OnInstalled 之后为 true，直到下一次成功重启
quitCanceled    bool // OnQuitCanceled 置 true，保存对话框取消时清掉
```

在 `Run()` 里、`mygo.Use(...)` 之后注册：

```go
updater.OnInstalled(func() { app.updateInstalled = true })
mygo.App.OnQuitCanceled(func() { app.quitCanceled = true })
```

`OnQuitCanceled` 对普通退出也会触发，所以只有和 `updateInstalled` 同时为真时才走重启恢复。

`openWindow` 现有的 `win.OnClose` 异步收尾改成：

```go
if ok {
    if a.shouldRelaunchAfterSave() {
        a.updateInstalled = false
        a.quitCanceled = false
        mygo.App.Relaunch()
        return
    }
    a.win.Close()
    return
}
a.quitCanceled = false
a.win.Invalidate()
```

`shouldRelaunchAfterSave()` 是一个纯函数或小方法，返回 `updateInstalled && quitCanceled`；单独写出来是为了在测试里覆盖真值表，不必启动真实窗口循环。

行为边界：

- 用户在保存对话框选“取消”：清 `quitCanceled`，保留 `updateInstalled`，留在当前版本；之后再退出且文档脏时，会重新触发同一条恢复路径。
- 用户在更新窗口选“稍后”：`OnInstalled` 已经置位，但 `quitCanceled` 不会置位；之后正常退出只退出，不强制重启，更新在下次启动生效。
- 自动下载在后台装好更新：`updateInstalled` 为 true；之后用户退出时若文档脏，保存后重启进入新版本。这和“下次启动生效”一致，不打断写作，但确实会重启一次。
- 正常退出（与更新无关）：`updateInstalled` 为 false，走原来的 `a.win.Close()`，行为不变。

### 4.3 更新控制器与设置页（新文件 `internal/nativeui/updates.go`）

定义接口，避免测试依赖插件：

```go
type updateController interface {
	Preferences() services.UpdatePreferences
	SetAutomaticChecks(bool)
	SetAutomaticDownloads(bool)
	Check()
}
```

- `liveUpdates`：四个方法都委托给 `services.App`。
- `unavailableUpdates`：返回 `services.UpdatePreferences{Version: mygo.App.Version(), Enabled: false, AutomaticChecks: true}`，setter 和 Check 都是 no-op。`New()` 默认用它，`Run()` 在 `mygo.Use` 之后换成 `liveUpdates{}`。这样单元测试打开设置页不会 panic。
- `App` 结构体新增字段 `updates updateController`，放在 `ai` 附近。

`updateSettings(c *ui.Context)` 用现有的 `settingsGroup`、`settingsRow`、`settingsDivider`，内容照 0.2.x：

1. 第一行：label `Muse <version>`，detail `上次检查：<本地时间>` 或 `上次检查：尚未检查`，右侧按钮「检查更新」，点击调用 `a.updates.Check()`。
2. 「自动检查更新」开关，说明：`每天在后台检查一次，有新版时提醒。`
3. 「自动下载并安装」开关，说明：`发现新版后自动安装，下次启动生效，不中断当前写作。`
4. `!prefs.Enabled` 时显示提示：`当前运行位置无法自动安装更新。开发模式或只读位置无法自更新。macOS 请先把 Muse 拖入 Applications 后运行；其他平台请放在有写入权限的目录。`
5. 脚注：`更新来自 CarlOpenLab/muse 的 GitHub Releases，安装前验证发布签名。重启前仍会检查未保存的文档。`

开关处理：读入当前值到局部 `bool`，`ui.Switch(c, &value).Label(...)`；`Changed()` 时调用对应 setter，再 `a.invalidate()`，下一次渲染会重新读偏好。

时间格式：`formatLastCheck(string) string`，空串返回 `尚未检查`，`time.Parse(time.RFC3339, s)` 成功后按本地时区 `2006-01-02 15:04` 输出，解析失败原样返回。

### 4.4 设置导航（`internal/nativeui/app.go`）

- `settingsTab` 增加第 4 个值 `3`。
- 左侧导航：在 `模型` 之后加分组标题 `应用`，再调用 `a.settingsNavItem(c, "应用更新", 3)`。
- 内容标题 switch 增加 `case 3: title = "应用更新"`。
- 内容 switch 增加 `case 3: a.updateSettings(c)`。
- 底部说明保持 `设置会立即生效`。

### 4.5 菜单（`internal/nativeui/run.go`）

在 `installMenu` 里，`{Role: mygo.RoleAppMenu}` 之后加入：

```go
{Label: "更新", Submenu: []*mygo.MenuItem{updater.MenuItem()}},
```

`updater.MenuItem()` 会调用 `used()`，必须在 `mygo.Use` 之后调用；`installMenu` 发生在窗口创建时，满足条件。

### 4.6 服务层（`internal/services/updates.go`）

- 保留 `UpdatePreferences()` 和 `CheckForUpdates()`。
- 删除旧的合并 setter `SetUpdatePreferences(req struct{...})`，改为：

```go
func (a *App) SetAutomaticChecks(on bool) UpdatePreferences
func (a *App) SetAutomaticDownloads(on bool) UpdatePreferences
```

各自设置后返回 `a.UpdatePreferences()`。目前没有其它调用方，旧 RPC 形状不需要保留。

- `LastCheck` 继续返回 RFC3339 字符串，格式化交给 UI。

### 4.7 发布流水线（`.github/workflows/release.yml`）

构建任务：

- `strategy` 增加 `max-parallel: 1`。三个平台不能同时创建同一个草稿 release；串行后第一个创建，后两个复用。
- 在 `Format check` / `Vet` / `Test` 之后加版本一致性检查：

  ```yaml
  - name: Check the tag matches mygo.json
    shell: bash
    env:
      TAG: ${{ github.ref_type == 'tag' && github.ref_name || inputs.tag }}
    run: test "v$(jq -r .version mygo.json)" = "$TAG"
  ```

  `jq` 在三个 runner 上都有。
- `Build and package` 步骤增加环境变量：

  ```yaml
  MYGO_UPDATER_PRIVATE_KEY: ${{ secrets.MYGO_UPDATER_PRIVATE_KEY }}
  GH_TOKEN: ${{ github.token }}
  ```

- 构建命令增加 `-upload`：

  ```bash
  go tool mygo build "${args[@]}" -upload
  ```

  保留 `-skip-notarize`、Windows 的 `-skip-installer` 和 macOS 的 `-sign`。
- Windows 专属步骤，在构建后补挂裸 exe：

  ```yaml
  - name: Upload the portable Windows build
    if: matrix.os == 'windows-latest'
    shell: bash
    env:
      GH_TOKEN: ${{ github.token }}
      TAG: ${{ github.ref_type == 'tag' && github.ref_name || inputs.tag }}
    run: gh release upload "$TAG" dist/windows-amd64/Muse.exe --repo CarlOpenLab/muse --clobber
  ```

- 删除构建任务的 `Upload artifacts` 步骤；草稿 release 就是平台之间的交接点，不再需要跨 job 下载 artifact。

发布任务替换为：

```yaml
publish:
  name: Publish GitHub Release
  needs: build
  runs-on: ubuntu-latest
  steps:
    - name: Publish the draft release
      env:
        GH_TOKEN: ${{ github.token }}
        TAG: ${{ github.ref_type == 'tag' && github.ref_name || inputs.tag }}
      run: gh release edit "$TAG" --repo CarlOpenLab/muse --draft=false --title "Muse $TAG" --latest
```

- 删除 `actions/download-artifact`、`actions/upload-artifact` 和 `softprops/action-gh-release`。
- mygo 创建草稿时用 `CHANGELOG.md` 对应版本作为 notes；最后只改标题、取消草稿、设为 latest，不再生成 GitHub 的提交列表。
- `permissions: contents: write` 保持，`GH_TOKEN` 用 `github.token`。
- 若某个平台的构建失败，草稿会留在原处；修复后重跑同一 tag，mygo 和 `gh release upload` 都带 `--clobber`，可以覆盖旧文件。最后一个 publish job 只在 build 全部成功后运行。

### 4.8 版本与 CHANGELOG

- `mygo.json` 和 `package.json` 的 `version` 都改为 `0.6.0`。
- mygo 的 `update.ReleaseNotes` 在遇到下一个以 `## ` 开头的行时结束当前版本段落。因此 0.6.0 段落内部只能用 `###` 子标题或扁平列表，不能再用 `## Features / 新功能` 这种二级标题，否则 notes 为空、`mygo build -upload` 直接失败。旧的 0.5.0 段落保持不动，新规则从 0.6.0 开始。
- 在 `CHANGELOG.md` 的 `## Unreleased` 之后加入 `## 0.6.0 — 2026-11-16`，内容至少覆盖：
  - 自动更新恢复：每日后台检查、更新窗口、跳过/稍后、下载进度、安装重启；设置「应用更新」页与菜单入口。
  - 发布流水线改为签名更新归档 + manifest，由 `mygo build -upload` 上传；Windows 仍提供裸 `Muse.exe`。
  - 迁移说明：0.5.0 及更早版本请手动安装 0.6.0 一次，之后可在应用内更新。
- 按仓库惯例用 `chore(release): 0.6.0` 提交版本与 changelog。

### 4.9 测试

新增 `internal/nativeui/updates_test.go`：

- 打开设置 → 点「应用更新」，页面出现版本号、「检查更新」、两个开关、上次检查文案。
- 点「自动检查更新」开关，假控制器收到 `false`；点「自动下载并安装」，收到 `true`。
- 点「检查更新」，假控制器的 `Check` 被调用一次。
- 假控制器 `Enabled: false` 时显示“当前运行位置无法自动安装更新”。
- `formatLastCheck`：空串、合法 RFC3339、非法字符串三种情况。

重写 `internal/release/release_test.go`。旧测试断言的是 softprops 的 glob、`merge-multiple`、`fail_on_unmatched_files`，新流程不再使用这些机制，继续保留会测错对象。新测试断言：

1. `mygo.json` 的 `updates.publicKey` 与 `resources/update-public-key.txt` 完全一致，`github` 为 `CarlOpenLab/muse`，`tagPrefix` 为 `v`。
2. 构建步骤包含 `-upload`，并传入 `MYGO_UPDATER_PRIVATE_KEY` 与 `GH_TOKEN`。
3. 工作流包含 tag 与 `mygo.json` 版本一致性检查。
4. 矩阵设置 `max-parallel: 1`。
5. `publish` job `needs: build`，最后执行 `gh release edit` 且带 `--draft=false`；工作流不再引用 `softprops/action-gh-release`。
6. Windows 任务有 `gh release upload` 裸 `Muse.exe` 的步骤。
7. 上传/发布步骤没有 `continue-on-error: true`，失败必须让构建红。
8. 按 mygo 的 `ReleaseNotes` 规则提取 `mygo.json` 当前版本的 CHANGELOG 段落，断言非空，且段落内没有以 `## ` 开头的行。这条测试直接防住发布时 “has no notes” 的失败。
9. `shouldRelaunchAfterSave` 的真值表：只有 `updateInstalled && quitCanceled` 为 true 才返回 true；其余三种组合都返回 false。保存对话框取消后的状态由收尾方法负责，能抽成纯函数就一起测，抽不出来就至少测真值表和“取消清 `quitCanceled`、保留 `updateInstalled`”这条分支。

保留原有测试的精神：每个平台都要有产物、不能发空 release、不能有并发覆盖；只是断言对象从 glob 换成 mygo 的 `-upload` 配置。

### 4.10 验证

本地：

```sh
gofmt -l .
go vet ./...
go test ./...
```

`gofmt -l .` 必须无输出。`go tool mygo dev` 下打开设置 →「应用更新」：开发构建应显示“无法自动安装更新”，开关能保存，点「检查更新」弹出原生更新窗口并说明不能自更新。

重启恢复用单元测试覆盖：`shouldRelaunchAfterSave` 的真值表，以及保存对话框取消后的状态。不要为了测试真的调用 `mygo.App.Relaunch()`。

发布后（0.6.0 tag 触发）：

- 三个平台构建成功；草稿 release 里能看到各平台的 dmg / deb / rpm / tar.gz、`Muse.exe`、签名归档、`update-<target>.json`。
- 最后的 publish job 把草稿转为正式 release，标题为 `Muse v0.6.0`，notes 来自 CHANGELOG。
- 手动安装 0.6.0 后，应用能检查更新；再发一个 0.6.1 的 tag，确认更新窗口能发现、下载并安装。

## 5. 风险与回滚

- **插件未注册**：`updater` 的偏好函数在未 `mygo.Use` 时会 panic。`New()` 默认用 `unavailableUpdates`，`Run()` 在 `mygo.Use` 之后才换成 `liveUpdates`，测试也只用假控制器。
- **公私钥不匹配**：`mygo build` 会在签名前比对 `updates.publicKey` 与私钥，失败会红，不会静默发出装不上的更新。
- **草稿并发**：`max-parallel: 1` 串行构建；如果以后改成并行，需要先加一个创建草稿的 prepare job。
- **latest 解析**：`updates.github` + `tagPrefix: v` 让 manifest 从 `releases/latest/download/update-<target>.json` 读取。0.6.0 必须成为 latest 且带 manifest，0.6.1 才能被 0.6.0 发现。发布后检查 release 的 Latest 标记。
- **回滚**：移除 `mygo.json` 的 `updates`、撤销插件/菜单/设置页、发布流程退回 softprops。已升级到 0.6.x 的用户会失去更新能力，只在更新链路确认不可用时才这样做。

## 6. 这次讨论用到的 artifact

- 类型：`document`
- id：`auto-update-restore`
- 路径：`.ryugi/artifacts/document/auto-update-restore/document.html`
- 内容：背景、现状、6 条决策与建议。因当前会话使用 `ANTHROPIC_AUTH_TOKEN`，claude.ai Artifact 发布被拒绝，最终以终端里的同一轮内容完成决策；此文件仅作为记录。

## 7. 留给实现者的空间

以下不改变用户可见行为，由实现者决定：

- `updateController` 的假实现命名、测试辅助函数。
- 设置页脚注是否再拆行。
- `formatLastCheck` 放在 `updates.go` 还是 `app.go`。
- `services.App` 用临时值还是放在 `nativeui.App` 字段里。
- 发布测试的具体断言拆分。
