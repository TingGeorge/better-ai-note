# 交接筆記

更新：2026-11-27。這份是給「接手這個對話的人（或壓縮後的 Claude）」看的，目的是接著同樣的進度繼續，不用重新討論。

完整的設計在 [architecture.html](architecture.html) 和 [AI筆記App_技術架構.md](AI筆記App_技術架構.md)。這份只記「現在做到哪、接下來做什麼、文件裡還沒有的東西」。

## 現在在做什麼

**設計全部定案（整體、畫面、後端），文件都已 commit 並 push（2026-11-27）。還沒開始實作，一行程式都沒寫；等使用者說「開始」，從第 1 部分做。**

- Figma 定案：<https://www.figma.com/design/5DfsHafSo4iqhnIUUlmVWN/Untitled?node-id=0-1>（file key `5DfsHafSo4iqhnIUUlmVWN`），`App` 頁，22 個畫面：Home 2、Canvas 側邊欄關 10、Canvas 側邊欄開 2、Settings 3、Setup check 5，加元件和設計變數。舊版在兩個 Archive 頁。
- 畫面的決定都寫進了 `architecture.html` 的「畫面」、技術架構文件、概念文件、README；截圖在 `docs/images/`。
- 後端的設計另外寫成一頁 [backend-architecture.html](backend-architecture.html)（2026-11-27）：模組、`/generate` 和 `/transcribe` 的格式、錯誤種類、記憶、啟動時的設定、log。頁面最上面的 11 件事使用者在 2026-11-27 都確認了（只剩「用哪個模型」還沒決定）；標 `未驗證` 的要在實作那一塊時先試。使用者已經決定的一項：`/generate` 的請求要附截圖（他的理由：多花的 token 不多，準確率比較好）。截圖用 PNG、放在 JSON 裡的 base64、長寬設上限；記憶轉接器寫檔時把圖片換成一行字，不存進記憶檔（要先驗證 SDK 接續對話不會出問題）。
- 這一頁是用暫存資料夾裡的 `backend_diagrams.py` 和 `backend-architecture.template.html` 產生的（改模板再重跑）。暫存資料夾被清掉的話，直接改 HTML 就好。
- 原因：最早（11/24）和使用者討論過的後端模組切分，在改成 Mac App 時跟著舊頁面一起進了 archive，現行文件裡沒有。使用者發現找不到。以後封存時，還有效的內容要留在現行文件裡。

## 畫面設計的重點（細節在 architecture.html）

- 一個視窗；一次開一份筆記。上面細的標題列（側邊欄開關、標題、設定齒輪），下面細的狀態列（Claude Code 狀態），底色和中間一樣白，只用很淡的線隔開。
- 側邊欄預設收起，只放最近的筆記。首頁是置中的窄欄（Cursor 開始視窗的風格）。
- 設定和 Setup check 是跳出的面板：全部同一個大小（800×584）、寬大於高、置中；四邊留白一樣；不擠；放不下就上下捲。
- AI 模式打開後選取框上的小 AI 圖示消失；Test 按鈕靠右；畫布右下角的「AI agent connected」拿掉（實作時也要從程式拿掉）。
- 外觀設定套用整個 App；整個 App 一套風格。使用者很在意風格統一、不要大色塊、要簡約。

## 還沒決定的

- App 的名字：使用者 2026-11-27 說用「Invic」，取自拉丁文 invicem（輪流、互相：人和 AI 在同一張畫布上輪流寫、互相改）；同名產品和商標還沒查（1b 用：顯示名 Invic、bundle id `io.github.tinggeorge.invic`、資料夾 `~/Library/Application Support/Invic/`）。設計稿和文件裡還寫 Excalidraw，還沒改。
- 要不要補一整套深色版本的畫面。
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

實驗用的最小程式在暫存資料夾（可能被清掉）：
`/private/tmp/claude-501/-Users-apple-Desktop-personal-projects-ai-note-app/b4c8a5c4-0695-4d4b-9c67-0d212ad03e9f/scratchpad/sdktest/new/` 裡的 `canvas.ts`（接畫布 MCP）和 `memory.ts`（記憶轉接器）。實作 `/generate` 時可以拿來改。

## Git 狀態

- 分支 `main`，到 `568998e`（後端架構頁）為止都已 commit 並 push。
- 之後的都還沒 commit：1a 搬進來的 `mac/`、`web/`、`scripts/`、`THIRD_PARTY_NOTICES.md`，加上 `.gitignore`、`LICENSE`、`README.md` 和這份筆記的修改。1a 已由 Opus xhigh 審查（沒有擋住的問題），等使用者同意才 commit；commit 訊息要寫上游網址和 `d332730`。
- `build/Excalidraw.app` 是 1a 驗證時 build 出來的（已被忽略，不會 commit），和裝好的 Excalidraw 同一個 bundle id：不要啟動。
- `web/test/` 裡的 `*-mac` 測試和 `mcp.test.mjs` 會用程序名稱「Excalidraw」去關 App、送按鍵：1b 改名之前不要跑。

## 等「全部結束後」再討論的

使用者說測試留下的東西先不處理，等全部結束再說。刪除一律用 `trash`，而且要先列出確切路徑、得到同意：

- `~/Desktop/ai-note-test.excalidraw`（開在 Excalidraw App 裡，AI 畫的東西沒存檔）
- `~/Desktop/ai-note-test/`（實驗的記憶檔）
- `~/.claude/projects/-Users-apple-Desktop-ai-note-test/`（SDK 留的副本）

## 進入實作時的順序（使用者還沒同意開始）

一次做一部分；做完我自己審查，停下來等使用者審查，他同意才 commit 和做下一部分。

1. 把 excalidraw-mac 的程式搬進這個 repo（`mac/`、`web/`）。分兩塊：
   - 1a 原樣搬（直接複製，上游 commit `d332730`），不改任何程式。2026-11-27 使用者說開始，進行中。
   - 1b 和原本裝好的 Excalidraw App 分開：自己的 bundle id、資料夾、socket、檔案類型。名字用 Invic（使用者已確認）。1a 審查完、使用者同意後才動手。
   - 1b 做完前，新 build 的 App 和原本的 App 共用資料夾和 socket：**不要啟動它、不要關掉原本的 Excalidraw**（裡面有沒存檔的東西）。
2. 後端 `/generate`，切成小塊：`agent.ts`、`prompt.ts`、`memory.ts`、`index.ts`。
3. Swift 外殼啟動伺服器（隨機 token），關 App 時一起關。
4. AI 主流程：AI 按鈕、輸入框、處理中／完成／失敗；拿掉「AI agent connected」。
5. 鎖住並淡化交給 AI 的東西、Cancel、Undo。
6. 視窗外框：標題列、狀態列、首頁、側邊欄、筆記資料夾。
7. Setup check 和設定的面板。
8. 語音：`/transcribe`、錄音、麥克風按鈕。

收尾：把伺服器編成單一程式包進 App、重新簽章、量大小。

誰做什麼（使用者 2026-11-27 指定）：寫程式由 Opus high 的子代理做，審查由 Opus xhigh 的子代理做，其他工作我自己選子代理；主對話只和使用者討論和計畫。

審查的分工：使用者細看後端和「各部分怎麼接起來」（後端每一塊動手前先給圖和格式讓他確認）；前端和 Mac App 他只用用看，所以我要自己對照 Figma 檢查仔細、給截圖。

## 和這位使用者工作的方式

- 用繁體中文回覆。他用語音輸入，字常常辨識錯（例如「Cloud Code」是 Claude Code、「Excalibur／Xcode」是 Excalidraw、「A 群／A 人」是 agent），照意思理解。
- 他先看圖，文字多了會迷路。討論時在對話裡直接畫圖，**用 Excalidraw 的內嵌工具**，不要用內建的畫圖模組。
- 每個不確定的地方要說清楚「沒查證」；他會要求去查證。
- 頁面（HTML）由 Opus effort medium 的子代理建；Figma 的工作他指定用 Fable（low 或 medium）的子代理。
- 做完要在瀏覽器檢查整頁，並說明沒檢查到的地方。
- 他要 commit 時才 commit，要 push 時才 push。
