# 交接筆記

更新：2026-11-27。這份是給「接手這個對話的人（或壓縮後的 Claude）」看的，目的是接著同樣的進度繼續，不用重新討論。

完整的設計在 [architecture.html](architecture.html) 和 [AI筆記App_技術架構.md](AI筆記App_技術架構.md)。這份只記「現在做到哪、接下來做什麼、文件裡還沒有的東西」。

## 現在在做什麼

**設計全部定案，文件已更新，等使用者說下一步（2026-11-27）。還沒開始實作；使用者說過不要直接開始做。**

- Figma 定案：<https://www.figma.com/design/5DfsHafSo4iqhnIUUlmVWN/Untitled?node-id=0-1>（file key `5DfsHafSo4iqhnIUUlmVWN`），`App` 頁，22 個畫面：Home 2、Canvas 側邊欄關 10、Canvas 側邊欄開 2、Settings 3、Setup check 5，加元件和設計變數。舊版在兩個 Archive 頁。
- 畫面的決定都寫進了 `architecture.html` 的「畫面」、技術架構文件、概念文件、README；截圖在 `docs/images/`。
- 這些修改和這份交接筆記都**還沒 commit**。

## 畫面設計的重點（細節在 architecture.html）

- 一個視窗；一次開一份筆記。上面細的標題列（側邊欄開關、標題、設定齒輪），下面細的狀態列（Claude Code 狀態），底色和中間一樣白，只用很淡的線隔開。
- 側邊欄預設收起，只放最近的筆記。首頁是置中的窄欄（Cursor 開始視窗的風格）。
- 設定和 Setup check 是跳出的面板：全部同一個大小（800×584）、寬大於高、置中；四邊留白一樣；不擠；放不下就上下捲。
- AI 模式打開後選取框上的小 AI 圖示消失；Test 按鈕靠右；畫布右下角的「AI agent connected」拿掉（實作時也要從程式拿掉）。
- 外觀設定套用整個 App；整個 App 一套風格。使用者很在意風格統一、不要大色塊、要簡約。

## 還沒決定的

- App 叫什麼名字（不能用「Claude Code」或 Anthropic 的名稱；設計稿暫時寫 Excalidraw）。
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

- 分支 `main`。最近的 commit：`e4f1da8`（AI 用工具動畫布、記憶、實驗結果）、`00cd25c`（方向改成 Mac App）。
- **這兩個 commit 都還沒 push。** 使用者沒說要 push。
- 畫面定案後的文件修改、`docs/images/`、這份 `docs/handoff.md` 都還沒 commit。

## 等「全部結束後」再討論的

使用者說測試留下的東西先不處理，等全部結束再說。刪除一律用 `trash`，而且要先列出確切路徑、得到同意：

- `~/Desktop/ai-note-test.excalidraw`（開在 Excalidraw App 裡，AI 畫的東西沒存檔）
- `~/Desktop/ai-note-test/`（實驗的記憶檔）
- `~/.claude/projects/-Users-apple-Desktop-ai-note-test/`（SDK 留的副本）

## 進入實作時的建議順序（使用者還沒同意開始）

1. 把 excalidraw-mac 的程式搬進這個 repo。
2. 後端 `/generate`：Agent SDK 接畫布 MCP，加記憶轉接器。
3. Swift 外殼啟動伺服器、送請求。
4. 一個視窗的介面：標題列、狀態列、首頁、側邊欄、AI 按鈕和輸入框（照 Figma）。
5. Setup check 和設定的面板。
6. 語音。

## 和這位使用者工作的方式

- 用繁體中文回覆。他用語音輸入，字常常辨識錯（例如「Cloud Code」是 Claude Code、「Excalibur／Xcode」是 Excalidraw、「A 群／A 人」是 agent），照意思理解。
- 他先看圖，文字多了會迷路。討論時在對話裡直接畫圖，**用 Excalidraw 的內嵌工具**，不要用內建的畫圖模組。
- 每個不確定的地方要說清楚「沒查證」；他會要求去查證。
- 頁面（HTML）由 Opus effort medium 的子代理建；Figma 的工作他指定用 Fable（low 或 medium）的子代理。
- 做完要在瀏覽器檢查整頁，並說明沒檢查到的地方。
- 他要 commit 時才 commit，要 push 時才 push。
