# 交接筆記

更新：2026-11-28。這份是給「接手這個對話的人（或壓縮後的 Claude）」看的，目的是接著同樣的進度繼續，不用重新討論。

完整的設計在 [architecture.html](architecture.html) 和 [AI筆記App_技術架構.md](AI筆記App_技術架構.md)。這份只記「現在做到哪、接下來做什麼、文件裡還沒有的東西」。

## 現在在做什麼

**實作中。第 1 部分做完（1a 原樣搬入 `80e9ce5`、1b 改名 Invic `eaad45d`）。第 2 部分（後端 `/generate`）和第 3 部分（外殼啟動伺服器）還沒寫任何程式。2026-11-27 使用者決定把開發交給雲端的 agent 接手，並用 GitHub 的 CI/CD 做自動化測試。**

## 2026-11-28 的決定：外殼留 Swift，畫面改用 React

使用者問過「改成 fork 官方 Excalidraw 加 Electrobun、全部用 TS」。查證後決定不換：

- **外殼留 Swift。** Electrobun v2.0.7 缺存檔對話框、系統的最近檔案、網頁當掉的偵測、`alert`/`confirm`、全螢幕事件和深淺色 API、資料夾型文件；麥克風、簽章後叫起 Claude Code、Agent SDK 跑在它的工作執行緒這三項從文件無法確定；只有一個維護者，v2 才三個月。只讀了文件和原始碼，沒有實際跑。
- **不 fork 官方 Excalidraw。** 繼續用 `@excalidraw/excalidraw` 套件；只有在套件的 API 做不到 Figma 的畫布設計時才重新考慮。
- **畫布外面的畫面全部用 React 做在 `web/` 裡**（首頁、側邊欄、標題列、狀態列、設定、Setup check），取代 AppKit 寫的 `StartWindowController` 和 `SettingsWindowController`。原因：一套 CSS 風格統一；雲端 agent 能用 headless Chromium 自己截圖比對。Swift 只剩薄外殼：視窗、選單、開檔存檔、啟動伺服器、錄音。
- **畫布 MCP 改寫成 TS 放進 `server/`**（使用者選「實驗過了就改」，實驗過了）。使用者想看得懂這一段，雲端也才能測。Swift 的 `excalidraw-mcp` 不留給外面的 agent（使用者 2026-11-28 決定：這是單獨的 App）；TS 版做好、測過後從 `mac/` 和打包腳本拿掉，設定裡給外面 agent 用的「agent setup」也一起拿掉。
- **`web/` 的安裝工具從 npm 換成 Bun**，整個專案只用 Bun。只換安裝工具，build 和測試繼續用 Node 跑（已做完、審查過）。

### 畫布 MCP 用 TS 的實驗結果（[`experiments/mcp-in-server.ts`](experiments/mcp-in-server.ts)，macOS 上實測）

Bun 直接連 Invic 的 socket，用 SDK 的 `createSdkMcpServer`（`type: "sdk"`）把工具交給 Claude，不經過 Swift 的 MCP。Haiku 在真的 Invic 上畫了圖並讀回來；回傳圖片也可以。工具名字是 `mcp__canvas__<tool>`，`tools: []`、`allowedTools`、`disallowedTools` 的行為和 stdio 版量到的一樣。

改寫時要照做的：

- **每個工具都要把 `extra.signal` 傳給連線那一層。** 工具跑在伺服器自己的程序裡，查詢取消後不會自動停；不檢查的話，取消 3 秒後還是畫上去了。
- **每次查詢建一個新的 `createSdkMcpServer()`，共用一條 socket 連線。** 同一個物件給兩個查詢用，第二個會悄悄沒有畫布工具（不報錯），所以「自己檢查工具清單」一定要做。
- **Bun 的 `socket.write()` 不會排隊**：回傳的是寫進去的位元組數，剩下的要等 `drain`。
- 沒有自動啟動 App（外殼啟動伺服器，所以不需要）；App 重開後連線會自己重連。
- `bun build --compile` 後 `import.meta.dir` 是 `/$bunfs/root`，拿來當 `cwd` 會讓 `claude` 啟動失敗，要用 `process.cwd()`。
- 跟著要改的：`backend-architecture.html`（MCP 由 Claude Code 啟動的說法、兩張流程圖、`CANVAS_MCP_PATH`）、下面第 3 部分的 `CANVAS_MCP_PATH`、`mcp.test.mjs`（它測的是 Swift 版）；`server/package.json` 要加 `@anthropic-ai/claude-agent-sdk` 和 `zod`。
- 規模：六個工具，約 250–350 行加一個對假 App 的測試。
- `web/test/fake-app.mjs` 有 bug：用 `buf += chunk` 接 Buffer，多位元組的字被切在兩段中間會變亂碼。要用它測中文前先修。
- 沒驗證：Linux、只 `abort()` 不先 `interrupt()`、App 在呼叫中途關掉、大於 96 kB 的圖、每次呼叫的逾時、編成單一程式後真的叫模型。

### `web/` 換 Bun 後要知道的

- PATH 上沒有 Node 時，`bun run` 會悄悄改用 Bun 跑：測試會失敗，build 會過但產出不一樣。CI 要同時裝 Node 和 Bun。
- 沒有 `bun.lock` 時 `bun install --frozen-lockfile` 不會失敗，會直接裝最新版。`bun.lock` 一定要進 git。
- `bun install` 不會像 `npm ci` 先清掉 `node_modules`，所以 `scripts/build-app.sh` 現在會先刪掉 `web/node_modules` 再裝（使用者同意）。
- 版本完全一樣，但 Bun 的資料夾排法讓幾個 `@radix-ui` 的小套件多打包了一份（主要的檔案多約 4 KB）。審查沒找到會出問題的地方，42 個測試都過。

## 給接手的雲端 agent（先讀這一節）

### 你的環境和本機不一樣的地方

| 事情 | 本機（之前） | 雲端（你） |
|---|---|---|
| build Mac App（`mac/`、`scripts/build-app.sh`） | 可以 | Linux 上不行：AppKit、WKWebView、`codesign`、`sips`、`iconutil` 都只有 macOS 有。只能靠 GitHub 的 macOS runner |
| `web/`（build、typecheck、`bun run test`） | 可以 | 可以。PATH 上要有 Node（^20.19 或 ≥22.12）；`bun run test` 需要 Chromium：`bunx playwright-core install chromium-headless-shell`，或用 `PW_CHROMIUM` 指到現成的 Chrome |
| `server/`（`bun test`、typecheck） | 可以 | 可以 |
| 真的叫 Claude（Agent SDK） | 用使用者已登入訂閱的 Claude Code | 沒有登入。測試不能依賴真的模型：用假的 Claude Code 執行檔或把 SDK 那一層隔開來測。要在 CI 跑真的模型得由使用者提供 `CLAUDE_CODE_OAUTH_TOKEN`（`claude setup-token`）當 secret，這要他決定，不要自己加 |
| 畫布 MCP（`excalidraw-mcp`）＋ Invic App | 可以啟動 | 只有 macOS runner 上可以。`web/test/fake-app.mjs` 是假的 App，`mcp.test.mjs` 用它可以在沒有 App 的情況下測 MCP 程式（MCP 程式是 Swift，也要 macOS 才能編）。畫布 MCP 改寫成 TS 放進 `server/` 之後，TS 版可以在 Linux 上對著假 App 測（要先修 `fake-app.mjs` 的中文亂碼 bug，見上面） |
| Figma | 有 MCP 可以讀 | 多半沒有。**畫面一定要照 Figma 做**（使用者 2026-11-27 特別確認）。打不開就用 `docs/images/` 的 5 張截圖和 `architecture.html` 的「畫面」，但它們只涵蓋 22 個畫面的一部分；看不到的畫面不要自己設計，停下來向使用者要 |
| 暫存資料夾、我的記憶檔、使用者的全域規則 | 有 | 沒有。需要的都已寫進這份筆記和 repo 根目錄的 `CLAUDE.md` |

### CI 還沒有，要你建

- 上游 excalidraw-mac 有一份現成的 workflow 沒搬進來：<https://github.com/TingGeorge/excalidraw-mac/blob/d332730/.github/workflows/excalidraw-mac.yml>。它在 macOS runner 上 build App，用 `EXCALIDRAW_MAC_HOME=/tmp/exm-ci` 隔離，再跑真 App 的測試。拿它當起點，名字改成 Invic。
- 建議分三個 job：`server`（ubuntu：`bun test`、typecheck）、`web`（ubuntu：build、typecheck、`bun run test`；要同時裝 Bun 和 Node，並固定 Bun 的版本）、`mac`（macos：`scripts/build-app.sh`、`mcp.test.mjs`、真 App 的 `*-mac` 測試）。
- `*-mac` 測試會把按鍵和滑鼠送給「最前面的 App」。在 CI 的乾淨機器上可以跑；**在使用者的 Mac 上不可以跑**。
- `web/scripts/third-party.mjs` 的註解說「CI 會檢查 `THIRD_PARTY_NOTICES.md` 是不是最新」：CI 建好後補上這個檢查（build 後 `git diff --exit-code THIRD_PARTY_NOTICES.md`）。
- macOS runner 多半是 Apple 晶片（`macos-latest`）；設計是只支援 Apple 晶片，但 `build-app.sh` 目前還是編 universal，做第 3 部分時改成只編 arm64。

### 接下來要做的（順序見最下面「實作的順序和流程」）

1. 建 CI（上面）。
2. 第 2 部分：`server/src/generate/` 的 `agent.ts`、`prompt.ts`、`memory.ts`、`index.ts`，加 `log.ts` 和 `prompts/`。設計在 `backend-architecture.html`；查到的 SDK 事實在下面「為第 2 部分查到的 SDK 事實」；以前的實驗程式在 `docs/experiments/`。第 2 部分現在多一塊：畫布 MCP 的 TS 版（`server/src/` 裡一個模組資料夾，主檔 `index.ts`），`agent.ts` 用內建的 MCP 接它，不再啟動 Swift 的 `excalidraw-mcp`；規則見上面「畫布 MCP 用 TS 的實驗結果」。
3. 第 3 部分：Swift 外殼啟動伺服器。我寫好的完整工作說明在下面「第 3 部分的工作說明」。
4. 第 4–8 部分和收尾。

### 只有使用者的 Mac 能驗證的（雲端做不到，要留給他或留到最後）

- 真的用訂閱叫 Claude 在畫布上畫東西；中止後子程序有沒有停；額度用完和沒登入實際長什麼樣。
- 畫面對照 Figma、實際操作 App。
- 這些請在 PR 或這份筆記裡明白列出「沒驗證」，不要寫成已完成。

- Figma 定案：<https://www.figma.com/design/5DfsHafSo4iqhnIUUlmVWN/Untitled?node-id=0-1>（file key `5DfsHafSo4iqhnIUUlmVWN`），`App` 頁，22 個畫面：Home 2、Canvas 側邊欄關 10、Canvas 側邊欄開 2、Settings 3、Setup check 5，加元件和設計變數。舊版在兩個 Archive 頁。
- 畫面的決定都寫進了 `architecture.html` 的「畫面」、技術架構文件、概念文件、README；截圖在 `docs/images/`。
- 後端的設計另外寫成一頁 [backend-architecture.html](backend-architecture.html)（2026-11-27）：模組、`/generate` 和 `/transcribe` 的格式、錯誤種類、記憶、啟動時的設定、log。頁面最上面的 11 件事使用者在 2026-11-27 都確認了（只剩「用哪個模型」還沒決定）；標 `未驗證` 的要在實作那一塊時先試。使用者已經決定的一項：`/generate` 的請求要附截圖（他的理由：多花的 token 不多，準確率比較好）。截圖用 PNG、放在 JSON 裡的 base64、長寬設上限；~~記憶轉接器寫檔時把圖片換成一行字~~ 2026-11-28 改成圖片照原樣存進記憶檔（見下面「截圖照存進記憶檔」）。
- 這一頁原本是用本機暫存資料夾裡的腳本產生的，腳本不在 repo 裡：要改就直接改 HTML（圖的原始檔在 `docs/excalidraw/`）。
- 原因：最早（11/24）和使用者討論過的後端模組切分，在改成 Mac App 時跟著舊頁面一起進了 archive，現行文件裡沒有。使用者發現找不到。以後封存時，還有效的內容要留在現行文件裡。

## 畫面設計的重點（細節在 architecture.html）

- 一個視窗；一次開一份筆記。上面細的標題列（側邊欄開關、標題、設定齒輪），下面細的狀態列（Claude Code 狀態），底色和中間一樣白，只用很淡的線隔開。
- 側邊欄預設收起，只放最近的筆記。首頁是置中的窄欄（Cursor 開始視窗的風格）。
- 設定和 Setup check 是跳出的面板：全部同一個大小（800×584）、寬大於高、置中；四邊留白一樣；不擠；放不下就上下捲。
- AI 模式打開後選取框上的小 AI 圖示消失；Test 按鈕靠右；畫布右下角的「AI agent connected」拿掉（實作時也要從程式拿掉）。
- 外觀設定套用整個 App；整個 App 一套風格。使用者很在意風格統一、不要大色塊、要簡約。

## 2026-11-28 使用者另外決定的

- 先不做深色模式。
- 一份筆記的資料夾裡只有一個畫布檔和一個記憶檔。打開時缺畫布檔就補一個空白的；缺記憶檔就從空白的記憶開始。
- 不做「撤回這次 AI 的修改」的按鈕；用 ⌘Z 和叫 AI 還回來。第 5 部分的「Undo」就是畫板本來的 ⌘Z，不另外做。
- 不加「畫表格」的工具。
- 授權簡單處理：把 Agent SDK 列進第三方授權清單，不另外查證。
- **AI 的修改全部做完才一次放上畫布**（使用者選的，不要「邊做邊放、失敗再退回」）。處理中只有載入動畫；失敗或取消就整份丟掉；成功的話整次修改是一個 ⌘Z。使用者的理由：這樣才能一鍵退回。
  - 現在的程式不是這樣：`web/src/bridge.ts` 的每個工具都直接 `commit` 到畫布（每次一個 undo 步驟）。
  - 我想的做法（還沒實驗）：草稿放在網頁那一邊，不放伺服器，因為 `add_elements` 的轉換（`convertToExcalidrawElements`）和畫圖（`exportToBlob`，本來就吃一份 elements）都在網頁裡。請求開始時開一份草稿；讀、加、改、刪、畫圖都對草稿做；結束時把差異一次套到畫布（一次 `updateScene`），取消就丟掉。
  - 使用者決定實驗等做到第 5 部分再做（可以在 headless Chromium 裡跑，不用 App 也不用模型）。第 4 部分先照現在「每一步直接放上畫布」的方式做也可以，第 5 部分再換成草稿。
  - 要先實驗的：套用時使用者同時改了別的東西會不會被蓋掉（只套差異）；一次 `updateScene` 是不是真的只算一個 undo；草稿畫出來的圖和真的畫布一樣。
  - `backend-architecture.html` 第 3 節「每一步直接出現在畫布上」的說法和流程圖還沒改，等實驗後一起改。

### Figma 的主色從紫改成藍（2026-11-28）

使用者要整個 App 的紫色系換成 icon 的藍色系。`App` 頁已改完（Opus 子代理做的）：

| 原本 | 現在 | 用在哪 |
|---|---|---|
| `#6965DB`（含各種透明度） | `#3C69FD` | 主色：選中的工具、主要按鈕、選取框、AI 圖示（變數 `color/accent`） |
| `#4A47B1` | `#2246CC` | 較深：選中色塊的外圈 |
| `#030064` | `#001352` | 很深：選取標籤的字、選中選項的圖示 |
| `#E0DFFF` | `#D6E3FF` | 淡：選取標籤、選中選項的底 |
| `#CECAF9` | `#BBD0FF` | 淡：不透明度滑桿 |
| `#EFEEFB` | `#E9F0FF` | 很淡：側邊欄選中的列（變數 `color/bg/selected`） |
| `#F1F0FF` | `#ECF2FF` | 很淡：AI 按鈕 hover |

- 主色是 `#3C69FD` 不是 icon 的 `#3D6BFF`：白字放在 `#3D6BFF` 上對比 4.43，差一點不到 AA 的 4.5；`#3C69FD` 是 4.53。icon 本身還是 `#3D6BFF`。使用者還沒說要不要改回完全一樣的藍。
- 兩個 Archive 頁因為共用元件和變數，變成紫藍混在一起；沒有另外處理。
- 程式那邊：Excalidraw 自己的介面是紫色，做畫面時要用 CSS 把它的主色蓋成上面這組藍（蓋不蓋得掉沒查證）。
- 首頁「Version 0.2.0 · Works offline」那行字使用者說拿掉（文字節點 `40:148`、`40:206`）；已拿掉；那一欄的上緣位置不變（y=300），下面的按鈕和清單往上移 22px。

### 記憶檔只放 AI 會讀到的內容（2026-11-28）

使用者的想法：記憶檔是「agent 下次會收到的 context」，不是 log。所以不設保留期限，而是讓檔案跟著壓縮變小。

- 我的理解（沒在這版 SDK 實測）：紀錄是只往後加的；SDK 壓縮時在後面加一段摘要，接續對話時只讀最後一段摘要之後的內容，但摘要之前的舊內容還留在檔案裡。
- 所以要做的：記憶轉接器（`memory.ts`）看到壓縮的摘要後，把摘要之前的內容從檔案拿掉。
- 做 2c 前要先試：(1) 接續時是不是真的只讀最後一段摘要之後的；(2) 拿掉舊內容後接續對話會不會出錯（文件說 `load` 要回傳和 `append` 完全相同的內容）；(3) 490 KB 裡到底是什麼。
- 不行的話回來問使用者，不要自己改成別的記憶做法。
- 畫面上不放「清掉這份筆記的記憶」的動作（使用者決定）。想重來的人自己去資料夾刪掉記憶檔，缺檔就從空白開始。

### 截圖照存進記憶檔，為了快取（2026-11-28）

- **推翻之前的決定**：不再「寫檔時把圖片換成一行字」。圖片（請求附的截圖和 `render_image` 的結果）照原樣存。
- 原因：快取是從頭比對。截圖在每次請求的最開頭，換成字之後，下一次請求讀回來的「上一次請求」從那張圖開始整段對不上快取，包括所有工具呼叫，要用原價重算。照存就全部命中。
- 快取有效期是 1 小時（使用者說的，我沒有另外查證）。
- 代價：記憶檔變大；靠「壓縮後拿掉摘要之前的舊內容」讓它有上限。
- 寫提示詞時要守的規則：系統提示只放固定的規則文字；這次請求才有的東西（使用者的話、選了哪些東西、截圖、時間）放在對話訊息裡。不然每次都從最前面整個重算。
- 沒驗證：實際的命中率。做後端時把每次回應的 `cache_read_input_tokens` 寫進 log 來確認。

## 還沒決定的

- App 的名字已定案是「Invic」（2026-11-28 使用者再次確認），這裡只剩商標還沒查：使用者 2026-11-27 說用「Invic」，取自拉丁文 invicem（輪流、互相：人和 AI 在同一張畫布上輪流寫、互相改）；同名產品和商標還沒查（1b 用：顯示名 Invic、bundle id `io.github.tinggeorge.invic`、資料夾 `~/Library/Application Support/Invic/`）。Figma 設計稿 2026-11-28 已改成 Invic（`App` 頁 12 個文字：標題列元件、首頁的名字、Setup check 的標題列）。
- 其他開放問題見 architecture.html 的「暫定和還沒決定」。

## 已經定案並寫在文件裡的（摘要）

- Mac 桌面 App，以使用者自己的 [excalidraw-mac](https://github.com/TingGeorge/excalidraw-mac) 為基礎，程式之後搬進這個 repo 改。只支援 Apple 晶片。
- 畫布用 Excalidraw。叫 AI 的方式：固定的 AI 按鈕，先選了東西 AI 就知道指的是哪些。
- AI 透過 excalidraw-mac 已有的畫布 MCP 工具直接在畫布上放、改、刪；結果是一般圖形和文字。不提供 `clear_canvas`。範圍靠提示詞，不加程式限制。
- 後端：Bun 伺服器 + Claude Agent SDK，編成單一程式包在 App 裡，由 Swift 外殼啟動。Claude Code 用使用者已裝好的那一份，不載入使用者的設定。
- 記憶：Agent SDK 的對話紀錄（session），透過 `SessionStore` 轉接器存在筆記的資料夾裡。一份筆記是一個一般資料夾：畫布檔（標準 `.excalidraw`）加記憶檔。
- AI 處理時不鎖畫布，只暫時鎖住交給 AI 的那幾個東西。
- 語音一開始就做：OpenAI 相容的 STT API，使用者自己的金鑰；錄音由 Swift 外殼做。
- 不逐字串流，等待時顯示載入動畫。兩個端點：`/generate`、`/transcribe`。
- 過時的東西移到 `docs/archive/`，不刪。

## 實測過的（細節在 architecture.html 的「實測過的」）

- Agent SDK + 使用者已裝的 Claude Code，用訂閱登入，不需 API 金鑰。
- Agent SDK 接上畫布 MCP，在畫布上畫出長條圖、表格、原地整理文字。
- 記憶：換一個新程式接續對話，AI 記得刪了什麼並重畫回來。
- 伺服器編成單一程式（要重新簽章）、斷線偵測、版本不一致、圖片輸入、從 App 環境找 Claude Code。

實驗用的最小程式已存進 repo 的 [`docs/experiments/`](experiments/)：`canvas.ts`（接畫布 MCP）、`memory.ts`（記憶轉接器）、`image.ts`（圖片輸入）。當時用的是 `@anthropic-ai/claude-agent-sdk` `^0.3.332` 和原本的 Excalidraw App；路徑是示意的，不能直接跑。實作 `/generate` 時拿來改。

## Git 狀態

- 分支 `main`，remote `TingGeorge/better-ai-note`。`568998e`（後端架構頁）之前的已 push。
- 1a `80e9ce5`（原樣搬入，上游 `d332730`）和 1b `eaad45d`（改名 Invic）已 commit，都經 Opus xhigh 審查過。
- 交接用的修改（這份筆記、`CLAUDE.md`、`docs/experiments/`）：看 `git log` 確認有沒有 commit 和 push；寫這一行時還在等使用者說可以。
- `build/Invic.app` 可以啟動：它用自己的 bundle id、資料夾（`~/Library/Application Support/Invic/`）和 socket。實測啟動過一次，原本 Excalidraw 的資料沒被動到。
- `web/test/` 裡的 `*-mac` 測試還是不要跑：它們把按鍵和滑鼠點擊送給「最前面的 App」，焦點跑掉就會打到別的 App。`mcp.test.mjs` 的真 App 模式會 `pkill -x Invic`。
- 1b 已 commit（`eaad45d`，沒 push）。改名前留下的兩個舊程式（`mac/.build/out/Products/{Debug,Release}/Excalidraw`）使用者同意後已用 `trash` 丟掉。
- 圖示：2026-11-28 使用者給了定案的 icon（B · Corner：紙白圓角方塊、黑色轉角線、藍點），已放進 `mac/Resources/AppIcon-1024.png` 和 `AppIcon.svg`（打包腳本從這張 PNG 產生 icns）。還沒重新 build App 看實際樣子。「Invic Help」的連結等第 6、7 部分一起處理（使用者同意）。

## 第 2 部分：在使用者的 Mac 上實測到的 SDK 行為（2026-11-27）

SDK `@anthropic-ai/claude-agent-sdk` 0.3.332，Claude Code 2.1.332，用 Bun 跑，`settingSources: []`，一個叫 `canvas` 的 MCP。實驗程式：[`experiments/sdk-options.ts`](experiments/sdk-options.ts)。當時 Invic 沒開文件，畫布工具都回「No drawing is open」，所以只證明了管線通，沒證明真的畫得出來。

**工具限制（照這一組寫）**

```ts
tools: [],                         // 沒有內建工具
allowedTools: SIX,                 // 六個 mcp__canvas__* ；少了它每次呼叫都被拒絕
disallowedTools: ["mcp__canvas__clear_canvas", "mcp__canvas__zoom_to_fit"], // 從清單拿掉
permissionMode: "dontAsk",         // 沒預先允許的一律拒絕，不會問
mcpServersDelivery: "initialize",  // 不加會印 deprecation 警告
```

- 這樣 init 訊息的 `tools` 剛好是那六個，`mcp_servers` 是 `[{name:"canvas", status:"connected"}]`。
- 只寫 `allowedTools`（沒有 `tools: []`）會多出 28 個內建工具。`tools` 裡寫 MCP 的名字不會過濾 MCP 工具。
- MCP 路徑錯：init 的 `tools` 是空的、status 是 `failed`，但這次執行照樣「成功」，所以一定要自己檢查。

**檢查工具清單的時機**

- 串流輸入模式下，init 要等第一則使用者訊息送出後才來。在 init 時 `abort()` 擋不住第一次模型呼叫。
- 不花模型回合的檢查方式：送訊息前 `await q.initializationResult()` 和輪詢 `q.mcpServerStatus()`（一開始是 `pending`，約 0.3 秒變 `connected`）。注意 `mcpServerStatus()` 列的是沒過濾的八個工具；過濾後的清單只在 init 訊息裡。

**中止**

- `abortController.abort()` 不是立刻生效：呼叫後約 2 秒 `for await` 才丟出錯誤（`instanceof AbortError`，訊息 `Claude Code process aborted by user`），這段時間裡**已經送出的工具呼叫還是會執行**。
- `await q.interrupt()` 才是快的：約 40 毫秒，還沒執行的工具呼叫會被拒絕、不會跑；之後來一個 `error_during_execution`（`terminal_reason: "aborted_tools"`）的結果，再丟出一般的 `Error`。
- 建議：取消時先 `interrupt()` 再 `abort()`。子程序（claude、excalidraw-mcp）約 1 秒內都會消失。

**圖片和系統提示**

- 串流輸入加圖片可以用：`{type:"user", parent_tool_use_id:null, message:{role:"user", content:[{type:"text",…}, {type:"image", source:{type:"base64", media_type:"image/png", data}}]}}`。generator 給一則就結束，查詢會正常結束。
- `systemPrompt` 給一般字串可以用。不給的話看起來是空的（不是 Claude Code 的預設提示），這點是推論。

**結果和錯誤**

- 每一種出錯的結果之後，iterator 都會再丟出 `Error("Claude Code returned an error result: …")`。要用 try/catch 包住，並以先收到的 result 訊息為準。
- 超過回合數：`subtype: "error_max_turns"`。
- 找不到 Claude Code：一開始就丟出 `Claude Code native binary not found at …`。
- 模型名字錯：assistant 訊息 `error: "model_not_found"`，結果是 `subtype: "success"` 但 `is_error: true`。**所以不能只看 `subtype`，要看 `is_error`。**
- 沒登入、額度用完沒有實測（不能為了測試登出）。型別裡有：assistant 訊息的 `error`（`authentication_failed`、`rate_limit`、`billing_error` 等），和 `rate_limit_event`（`status: "allowed" | "allowed_warning" | "rejected"`、`rateLimitType`、`resetsAt`）。

**模型和速度**（「say ok」，各一次，從開始到結束）

| `model` | 實際模型 | 第一個回應 | 全部 |
|---|---|---|---|
| 不給 | claude-opus-5-5 | 3.6 秒 | 6.4 秒 |
| `sonnet` | claude-sonnet-5-5 | 1.6 秒 | 5.0 秒 |
| `opus` | claude-opus-5-5 | 2.1 秒 | 5.0 秒 |
| `haiku` | claude-haiku-5-5 | 1.6 秒 | 4.2 秒 |

- 啟動到 init 約 0.2–0.3 秒。最後一句話之後還要等 1.6–2.4 秒結果才來，再 0.6–0.9 秒 iterator 才結束。
- 用哪個模型**還沒決定**，要問使用者。程式裡一定要明確寫出來，不要用預設。

**其他**

- `persistSession` 預設是 true，每次執行都會在 `~/.claude/projects/` 留一份紀錄。接上 `sessionStore` 後要確認這件事。
- 一次 Opus 的測試回報了不合理的費用（`total_cost_usd` 約 1.03），原因沒查。

## 先前只從官方文件查到的（部分已被上面的實測取代）

- 中止用 `options.abortController`；`interrupt()` 只在串流輸入模式可用。中止時 `for await` 會丟出錯誤（訊息 `Operation aborted` 之類）。畫布 MCP 的子程序會不會跟著停，文件沒寫，要實測。
- 帶圖片一定要用串流輸入（`prompt` 給 async generator，圖片放 `message.content`）。
- 分辨錯誤：assistant 訊息的 `error` 欄位，`authentication_failed`（沒登入）對 `rate_limit`（額度）。訂閱額度用完實際是哪個值沒驗證。
- 結果訊息的 `subtype`：`success`、`error_max_turns`、`error_during_execution` 等；出錯的結果之後 `query()` 還會丟出例外。
- `allowedTools` 只是「不用問就可以用」，不是限制；要限制用 `tools` 或 `disallowedTools`。`tools: []` 的效果文件沒寫，要實測（之前的實驗用過，要再確認）。沒有人可以問時用 `permissionMode: "dontAsk"`。
- **和已定的設計衝突**：文件說 `SessionStore.load` 要回傳和 `append` 進去「完全相同」的內容。「記憶檔裡把截圖換成一行字」違反這個約定。**2026-11-28 已解決：使用者決定圖片照原樣存，不替換。** 剩下「壓縮後拿掉舊內容」還會碰到這條，做 2c 前要先試。
- `sessionStore` 和 `persistSession: false` 不能同時設。

## 第 3 部分的工作說明（還沒做）

Swift 外殼在啟動時把包在 App 裡的伺服器跑起來，關 App 時一起關。

- **`server/src/index.ts`**：只聽 `127.0.0.1`；埠從 `PORT` 讀，手動跑時預設 3000；stdin 關掉時自己結束（外殼握著 pipe 的寫入端，外殼不管怎麼死掉伺服器都不會變孤兒），但從終端機 `bun run dev` 或 `bun test` 時不能因此誤結束。
- **`scripts/build-app.sh`**：用 `bun build --compile`（`bun-darwin-arm64`）把伺服器編成 `Invic.app/Contents/MacOS/invic-server`，放在簽章之前；編出來的 Bun 程式要重新簽章，`codesign --verify --deep --strict` 要過。Swift 改成只編 arm64。
- **`mac/`**：一個檔案的小型別（例如 `ServerProcess.swift`），由 AppDelegate 持有：
  - 每次啟動產生隨機 token（只在記憶體，不寫檔、不進 log）、挑一個空的本機埠。
  - 啟動伺服器時給環境變數：`ACCESS_TOKEN`、`PORT`、`CLAUDE_CODE_PATH`、`EXCALIDRAW_MAC_HOME`（`AppPaths` 的資料夾；伺服器自己用它找到「這個」App 的 socket。2026-11-28 起畫布 MCP 在伺服器裡，不再需要 `CANVAS_MCP_PATH`）、`LOG_DIR`（資料夾裡的 `Logs`）。`STT_*` 留到第 8 部分。
  - 找 `claude`：圖形 App 拿不到 shell 的 PATH，要查常見位置（`~/.local/bin`、`~/.claude/local`、`/opt/homebrew/bin`、`/usr/local/bin`），再退到問登入 shell `command -v claude`。找不到也照樣啟動伺服器（第 7 部分會顯示 Setup check）。
  - 伺服器意外結束時重啟一次（不要無限重試）；提供 `restart()` 給設定改變時用；提供 base URL 和 token 給之後送請求的程式。
  - 找不到包好的伺服器（例如直接 `swift build` 跑）時記一行 log 就繼續；開發時可用 `INVIC_SERVER_PATH` 指定。
- **完成的檢查**：伺服器是 App 的子程序、只聽 127.0.0.1、沒帶 token 回 401；正常關 App 和 `kill -9` App 兩種情況下伺服器都在幾秒內消失。

## 等「全部結束後」再討論的

使用者說測試留下的東西先不處理，等全部結束再說。刪除一律用 `trash`，而且要先列出確切路徑、得到同意：

- `~/Desktop/ai-note-test.excalidraw`（開在 Excalidraw App 裡，AI 畫的東西沒存檔）
- `~/Desktop/ai-note-test/`（實驗的記憶檔）
- `~/.claude/projects/-Users-apple-Desktop-ai-note-test/`（SDK 留的副本）

## 實作的順序和流程（實作中）

**流程（使用者 2026-11-27 改的）**：整個 App 照我的順序一路做完，不用每一部分停下來等他審查，後端每一塊也不用先給圖確認。全部做完、測試過、確定沒問題之後，他才做最後一次 code review。

所以由我把關：每一部分寫明「怎樣算完成」，寫完交 Opus xhigh 審查，問題修完才做下一部分。替使用者做的決定都記在下面的「我替使用者做的決定」，`backend-architecture.html` 要跟著實際做出來的改，最後的 review 會看這些。

沒有變的：刪檔案要先問（本機只用 `trash`）；不碰原本的 Excalidraw；他說 push 才 push。commit 的方式使用者還沒回答（我的建議：每一部分審查完就 commit 一次，方便最後 review）；雲端用 PR 的話照他對 PR 的指示。

### 我替使用者做的決定（最後 review 時給他看）

- 2a：`runAgent` 的輸入分成 `rules` 和 `content`（帶截圖一定要用串流輸入，不能是一個字串）；多一個錯誤種類 `cancelled`。

1. 把 excalidraw-mac 的程式搬進這個 repo（`mac/`、`web/`）。分兩塊：
   - 1a 原樣搬（直接複製，上游 commit `d332730`），不改任何程式。2026-11-27 使用者說開始，進行中。
   - 1b 和原本裝好的 Excalidraw App 分開：自己的 bundle id、資料夾、socket、檔案類型。名字用 Invic（使用者已確認）。1a 審查完、使用者同意後才動手。
   - 不管什麼時候都**不要關掉或操作原本的 Excalidraw**（裡面有沒存檔的東西）。
2. 後端 `/generate`，切成小塊：`agent.ts`、`prompt.ts`、`memory.ts`、`index.ts`，加上畫布 MCP 的 TS 版（2026-11-28 加的）。
3. Swift 外殼啟動伺服器（隨機 token），關 App 時一起關。
4. AI 主流程：AI 按鈕、輸入框、處理中／完成／失敗；拿掉「AI agent connected」。
5. 鎖住並淡化交給 AI 的東西、Cancel、Undo。
6. 視窗外框：標題列、狀態列、首頁、側邊欄、筆記資料夾。畫面用 React 做在 `web/` 裡（2026-11-28 改的）；做好後拿掉 Swift 的 `StartWindowController`。React 的畫面要的資料（最近的筆記、設定、Claude Code 狀態）全部經過 Swift 外殼，用已經有的管道（`web/src/native.ts`：網頁 → 外殼用 `postMessage`，外殼 → 網頁用 `excalidrawBridge.handle`，啟動資料用 `__native__/session`）；網頁不直接連伺服器，token 只有外殼知道（使用者 2026-11-28 決定：保持單純）。要加哪些訊息做這一部分時再定。
7. Setup check 和設定的面板。也用 React；做好後拿掉 Swift 的 `SettingsWindowController`。
8. 語音：`/transcribe`、錄音、麥克風按鈕。

收尾：把伺服器編成單一程式包進 App、重新簽章、量大小。

誰做什麼（使用者 2026-11-27 指定）：寫程式由 Opus high 的子代理做，審查由 Opus xhigh 的子代理做，其他工作我自己選子代理；主對話只和使用者討論和計畫。性質不同、互相獨立的工作可以同時開幾個子代理並行（兩個寫程式的不能動同一批檔案）。這些也寫在 `CLAUDE.md`。

最後 review 的重點：使用者細看後端和「各部分怎麼接起來」；前端和 Mac App 他只用用看，所以我要自己對照 Figma 檢查仔細、留截圖。

測試的方法：`*-mac` 測試不能跑（會把輸入送給最前面的 App）。畫面用只針對 Invic 的 computer-use 工具檢查；畫布用 `web/test/bridge-call.mjs` 連 Invic 的 socket。

## 和這位使用者工作的方式

- 用繁體中文回覆。他用語音輸入，字常常辨識錯（例如「Cloud Code」是 Claude Code、「Excalibur／Xcode」是 Excalidraw、「A 群／A 人」是 agent），照意思理解。
- 寫程式的規則（他的全域規則，雲端看不到，摘要在 repo 根目錄的 `CLAUDE.md`）：能不寫就不寫、最少的程式、不加沒要求的抽象和依賴；每個模組資料夾一個主檔 `index.ts`，其他是只給它用的小幫手；函式由上往下排；一定加大括號；Bun 的原生 API 和 `bun:test`；只改必要的地方；刻意的簡化用 `ponytail:` 註解標出來。
- 刪檔案：本機只能用 `trash`，而且要先列出確切路徑、得到同意。雲端沒有 `trash`：用 `git rm` 刪 repo 裡被追蹤的檔案可以（留在 git 歷史裡），其他一律先問。
- 他先看圖，文字多了會迷路。討論時在對話裡直接畫圖，**用 Excalidraw 的內嵌工具**，不要用內建的畫圖模組。
- 每個不確定的地方要說清楚「沒查證」；他會要求去查證。
- 頁面（HTML）由 Opus effort medium 的子代理建；Figma 的工作他指定用 Fable（low 或 medium）的子代理。
- 做完要在瀏覽器檢查整頁，並說明沒檢查到的地方。
- 他要 commit 時才 commit，要 push 時才 push。
