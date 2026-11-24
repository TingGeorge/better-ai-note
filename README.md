# AI 筆記 App

在 iPad 上手寫筆記，用「AI 筆」把內容圈起來，AI 就在旁邊整理成表格、圖表、逐步解釋或重點摘要。

開源、自行架設：每個人跑自己的伺服器，用自己的 AI API 金鑰。

## 文件

- [概念文件](docs/AI筆記App_概念文件.md)：這個 App 要做什麼
- [技術架構](docs/AI筆記App_技術架構.md)：技術選擇
- [後端架構圖](docs/backend-architecture.html)：後端的元件與流程（用瀏覽器開）

## 資料夾

```text
docs/                 文件和圖
server/               Bun 後端
  src/
    index.ts          入口：檢查 token、把請求分派給模組
    generate/         /generate 和 /revise（還沒實作）
    transcribe/       /transcribe（還沒實作）
docker-compose.yml
```

iPad App（`ios/`）還沒開始。

## 跑伺服器

需要 [Bun](https://bun.sh)。

```bash
cd server
cp .env.example .env    # 然後填入 ACCESS_TOKEN
bun install
bun run dev
```

檢查：

```bash
bun test
bun run typecheck
```

用 Docker 跑（在 repo 根目錄，一樣要先有 `server/.env`）：

```bash
docker compose up -d
```

伺服器只在本機的 3000 埠上聽。iPad 透過 Tailscale 連進來，設定步驟還沒寫。
