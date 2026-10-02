import { defineConfig } from "mygo-cli";

// MyGo 应用配置。当前 Go 端用 go:embed 自管前端（见 main.go），
// 本文件供 `mygo build` 打包分发（dmg / 签名 / 公证 / 自动更新）时使用。
export default defineConfig({
  name: "Muse",
  identifier: "dev.muse.editor",
  version: "0.1.2",
  devUrl: "http://localhost:5173",
  devCommand: "pnpm --dir .. run dev:web",
  buildCommand: "pnpm --dir .. run build:web",
  frontendDist: "frontend/dist",
  out: "build",
});
