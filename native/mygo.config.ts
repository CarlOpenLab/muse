import { defineConfig } from "mygo-cli";

// MyGo 应用配置。当前 Go 端用 go:embed 自管前端（见 main.go），
// 本文件供 `mygo build` 打包分发（dmg / 签名 / 公证 / 自动更新）时使用。
// devCommand / buildCommand 委托根目录分包脚本（根 → app/）。
export default defineConfig({
  name: "Muse",
  identifier: "com.muse.app",
  version: "0.2.2",
  devUrl: "http://localhost:5173",
  devCommand: "pnpm --dir .. run dev:web",
  buildCommand: "pnpm --dir .. run build:web",
  frontendDist: "embed/dist",
  out: "build",
  updates: { publicKey: "FG0Hg7hGBVq3w+Cin+CDYOH/tqOiXF+jOd+V3e0kAa0=", github: "CarlOpenLab/muse", changelog: "../CHANGELOG.md" },
});
