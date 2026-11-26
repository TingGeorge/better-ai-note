# AI 筆記 App

在 Mac 的畫布上寫筆記，把內容選取起來按 AI 按鈕，AI 直接在畫布上幫你改，或在旁邊加上表格、圖表、心智圖。

開源：後端包在 App 裡，用量算在你自己的 Claude 訂閱上（要先裝好並登入 Claude Code）。

## 文件

- [概念文件](docs/AI筆記App_概念文件.md)：這個 App 要做什麼
- [技術架構](docs/AI筆記App_技術架構.md)：技術選擇
- [架構圖](docs/architecture.html)：App 的元件與流程（用瀏覽器開）
- [archive](docs/archive/)：放棄的 iPad 與獨立伺服器方向，留作紀錄

## 資料夾

標「計畫」的還沒建，等寫到那部分時才會出現。

`server/` 的骨架是照先前的方向寫的（獨立伺服器、Docker），還沒照新方向調整。

```text
ai-note-app/
├── docs/                          文件和圖
│   ├── AI筆記App_概念文件.md
│   ├── AI筆記App_技術架構.md
│   ├── architecture.html
│   ├── archive/                   過時的文件，留作紀錄
│   └── excalidraw/                架構圖的原始檔
├── server/                        Bun 後端
│   ├── src/
│   │   ├── index.ts               入口：檢查 token、把請求分派給模組
│   │   ├── index.test.ts          token 檢查的測試
│   │   ├── generate/              模組：/generate
│   │   │   ├── index.ts           主檔（目前是佔位，回 501）
│   │   │   ├── prompt.ts          計畫：組提示詞（規則 + 使用者的話）
│   │   │   └── agent.ts           計畫：啟動 Agent、接上畫布的 MCP、檢查工具清單
│   │   ├── transcribe/            模組：/transcribe
│   │   │   └── index.ts           主檔（目前是佔位，回 501）
│   │   └── log.ts                 計畫：Response log
│   ├── prompts/                   計畫：給模型的提示詞文字檔
│   ├── Dockerfile                 先前方向留下的，之後不用 Docker
│   ├── package.json
│   ├── bun.lock
│   ├── tsconfig.json
│   └── .env.example               設定範本（複製成 .env）
├── mac/、web/                     計畫：Mac App 外殼和畫布頁面（從 excalidraw-mac 搬進來改）
├── docker-compose.yml             先前方向留下的
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

用 Docker 跑（先前方向留下的做法，之後不用；在 repo 根目錄，一樣要先有 `server/.env`）：

```bash
docker compose up -d
```

伺服器只在本機的 3000 埠上聽。之後它會被編成單一程式包進 Mac App，由 App 啟動。
