// Package web embeds the built WebView canvas (editor-web/, Vue 3 +
// Milkdown) so `go build` ships the frontend with the app, no Node needed
// at build time. `npm run build` in editor-web/ writes dist/ here.
package web

import "embed"

//go:embed all:dist
var Dist embed.FS
