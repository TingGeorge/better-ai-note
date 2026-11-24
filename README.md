# AI 筆記 App

在 iPad 上手寫筆記，用「AI 筆」把內容圈起來，AI 就在旁邊整理成表格、圖表、逐步解釋或重點摘要。

開源、自行架設：每個人跑自己的伺服器，用自己的 AI API 金鑰。

## 文件

- [概念文件](docs/AI筆記App_概念文件.md)：這個 App 要做什麼
- [技術架構](docs/AI筆記App_技術架構.md)：技術選擇
- [後端架構圖](docs/backend-architecture.html)：後端的元件與流程（用瀏覽器開）

## 資料夾

標「計畫」的還沒建，等寫到那部分時才會出現。

```text
ai-note-app/
├── docs/                          文件和圖
│   ├── AI筆記App_概念文件.md
│   ├── AI筆記App_技術架構.md
│   ├── backend-architecture.html
│   └── excalidraw/                架構圖的原始檔
├── server/                        Bun 後端
│   ├── src/
│   │   ├── index.ts               入口：檢查 token、把請求分派給模組
│   │   ├── index.test.ts          token 檢查的測試
│   │   ├── generate/              模組：/generate 和 /revise
│   │   │   ├── index.ts           主檔（目前是佔位，回 501）
│   │   │   ├── prompt.ts          計畫：Prompt builder
│   │   │   ├── tools.ts           計畫：Agent 的工具（calc、check block）
│   │   │   └── types.ts           計畫：typed block 的型別
│   │   ├── transcribe/            模組：/transcribe
│   │   │   └── index.ts           主檔（目前是佔位，回 501）
│   │   └── log.ts                 計畫：Response log
│   ├── prompts/                   計畫：給模型的提示詞文字檔
│   ├── Dockerfile
│   ├── package.json
│   ├── bun.lock
│   ├── tsconfig.json
│   └── .env.example               設定範本（複製成 .env）
├── ios/                           計畫：iPad App 的 Xcode 專案
├── docker-compose.yml
├── .gitignore
├── LICENSE
└── README.md
```

規則：每個模組資料夾只有一個主檔 `index.ts`，其他檔案是它的小幫手；別的模組只能引用主檔。

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
