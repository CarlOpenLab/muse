# Scripts

- `dev.sh` — run Muse from source, signed with a stable identity so macOS keeps permission grants across rebuilds.
- `build.sh` — build `out/Muse`, signed with the same identity.
- `build-macos-app.sh` — package a native Muse binary into a `.app` bundle and DMG for macOS releases. Set `MACOS_SIGNING_IDENTITY` to sign with a real certificate; without it the bundle falls back to ad-hoc signing.
- `signing.sh` — shared helper that resolves `MACOS_SIGNING_IDENTITY` or the first `Apple Development` identity in the keychain.

The old WebView/vite/e2e scripts were removed together with the frontend and WebView shell.
