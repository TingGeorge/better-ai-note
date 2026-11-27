# 交接筆記

更新：2026-11-27。這份是給「接手這個對話的人（或壓縮後的 Claude）」看的，目的是接著同樣的進度繼續，不用重新討論。

完整的設計在 [architecture.html](architecture.html) 和 [AI筆記App_技術架構.md](AI筆記App_技術架構.md)。這份只記「現在做到哪、接下來做什麼、文件裡還沒有的東西」。

## 現在在做什麼

**實作中。第 1 部分做完（1a 原樣搬入 `80e9ce5`、1b 改名 Invic `eaad45d`）。CI 的 workflow 寫好並 push 了（還沒審查）。第 2 部分（後端 `/generate`）只裝了 SDK，還沒寫任何程式；第 3 部分（外殼啟動伺服器）還沒開始。2026-11-27 使用者決定把開發交給雲端的 agent 接手，並用 GitHub 的 CI/CD 做自動化測試。**

## 第一個雲端對話做到哪（2026-11-27，先讀這一節）

使用者要求：把整個產品做出來、自動化測試，並照 `CLAUDE.md` 的方式用子代理。這個對話因為讀不到 Figma 而交接給新的雲端對話。分支：`claude/wonderful-ritchie-9g02hh`（只 push 到這個分支，不開 PR、不碰 `main`）。

### 使用者今天的決定

- `/generate` 的模型：`opus`。程式裡仍要從設定明確傳入（例如外殼設 `CLAUDE_MODEL=opus`），程式碼不寫預設值。
- 記憶檔裡的截圖：**照存圖片**，不換成一行字。這解掉了下面「和已定的設計衝突」那一條；`backend-architecture.html` 還寫著「換成一行字」，**還沒改**。
- 每一部分審查完就 commit + push 到上面的分支。
- repo 已改成公開，GitHub 的 runner（含 macOS）可以用：CI 的結果由 agent 自己看、自己修到通過。

### 已做

- **CI**：`.github/workflows/ci.yml`（commit `0578c40`，已 push）。三個 job：`server`、`web`、`mac`。
  - `server` 和 `web` 兩個 job 的指令在雲端容器裡實際跑過都通過（`bun test` 5 個、`npm test` 42 個、`THIRD_PARTY_NOTICES.md` 檢查通過）。
  - `mac` job 從來沒跑過。第一次 CI：<https://github.com/TingGeorge/better-ai-note/actions/runs/45977508841>，寫這一行時還在跑，**結果沒看**。接手後先看它，紅的就修。
  - **還沒經過 Opus xhigh 審查。**
  - 改名後程式實際用的名字：環境變數仍是 `EXCALIDRAW_MAC_HOME` 和 `EXCALIDRAW_APP_PATH`，MCP 程式仍叫 `excalidraw-mcp`；App 是 `build/Invic.app`，程序名 `Invic`。
  - 沒驗證：`npx playwright-core install --with-deps chromium-headless-shell`（容器的 proxy 擋住下載）；`setup-bun@v2` 裝的是最新的 Bun，lockfile 是 1.4.4 產生的。
- **後端**：只在 `server/package.json` 加了 `@anthropic-ai/claude-agent-sdk`，固定在 `0.3.332`（和實測的版本相同）。`bun test` 和 typecheck 通過。`agent.ts`、`prompt.ts`、`log.ts`、`prompts/` **都還沒寫**。

### 寫 2a／2b 前要知道的（子代理對照 SDK 的 `sdk.d.ts` 和 `sdk.mjs` 查到的）

- 下面「實測到的 SDK 行為」裡提到的選項和型別名稱，在 0.3.332 的型別裡都存在。
- **輸入的 generator 送完訊息後不能馬上結束**：SDK 在 generator 結束時就關掉 Claude Code 的 stdin，而 `interrupt()` 走的是 stdin，所以取消會失敗。generator 要開著，等第一個 result 來了（或我們自己停掉）才結束。這是讀程式得到的，沒實測。
- 額度用完可能還有別的表現方式：型別裡有 `USAGE_LIMIT_ERROR_PREFIXES`、`ORG_POLICY_LIMIT_PREFIXES`。實際是哪一種仍然沒測。
- `sessionStore` 不能和 `persistSession: false` 一起用（和之前查到的一致）。
- 設計和工作說明不一致的地方，還沒決定：
  - 設計寫 `runAgent({ prompt, noteFolder, signal })`、`buildPrompt({ request, selectedIds, screenshot })`；「我替使用者做的決定」寫輸入分成 `rules` 和 `content`。
  - 設計沒有「MCP 沒連上」和「啟動設定缺少」的錯誤種類。子代理打算用 `unexpected_tools` 和 `agent_failed`（訊息裡寫出缺哪個變數）。
  - 提示詞檔案的位置讀成 `server/prompts/`。
- 子代理打算的做法（還沒實作，可以照用）：
  - 測試：`runAgent` 多一個參數注入 `query`，預設是 SDK 的；測試用假的。做假的 Claude Code 執行檔要模擬整套控制協定，太費工。
  - 一次執行的順序：讀設定 → `initializationResult()` → 每 100 毫秒輪詢 `mcpServerStatus()` 最多 10 秒，`canvas` 是 `connected` 才送訊息 → init 的 `tools` 不是剛好六個就停 → 取消時 `interrupt()`（最多等 1 秒）再 `abort()` → 以第一個 result 為準，但讀到結束，讓記憶寫完。
  - 沒驗證：找不到 Claude Code 時 `initializationResult()` 是丟錯還是卡住。

### Figma：這個對話讀不到

- Figma 連接器顯示已連線，但這個對話只有 `create_branch` 和 Weave 的工具；`create_session`、`get_design_context`、`get_screenshot`、`get_metadata` 叫不到。使用者說已經調過權限，這個對話裡還是沒有（推測工具清單在對話開始時就固定了，沒查證）。
- 接手的對話先試這四個工具。可以的話，用 Fable（low 或 medium）的子代理把 `App` 頁 22 個畫面的截圖和設計變數存進 repo（例如 `docs/figma/`），之後的畫面工作都從那裡讀。
- 還是不行就請使用者匯出 PNG。第 4–8 部分的畫面不要自己設計。

### 接手後的順序

1. 看第一次 CI 的結果，修到通過；把 `ci.yml` 交 Opus xhigh 審查。
2. 試 Figma（上面）。
3. 第 2 部分：2a＋2b（Opus high 寫、Opus xhigh 審），再 2c（記憶，截圖照存）、2d（`/generate` 接線）。把 `backend-architecture.html` 改成和今天的決定一致。
4. 第 3 部分起照最下面的順序。CI 和後端、Figma 匯出互不相干，可以同時開子代理。

## 給接手的雲端 agent（先讀這一節）

### 你的環境和本機不一樣的地方

| 事情 | 本機（之前） | 雲端（你） |
|---|---|---|
| build Mac App（`mac/`、`scripts/build-app.sh`） | 可以 | Linux 上不行：AppKit、WKWebView、`codesign`、`sips`、`iconutil` 都只有 macOS 有。只能靠 GitHub 的 macOS runner |
| `web/`（build、typecheck、`npm test`） | 可以 | 可以。`npm test` 需要 Chromium：`npx playwright-core install chromium-headless-shell`，或用 `PW_CHROMIUM` 指到現成的 Chrome |
| `server/`（`bun test`、typecheck） | 可以 | 可以 |
| 真的叫 Claude（Agent SDK） | 用使用者已登入訂閱的 Claude Code | 沒有登入。測試不能依賴真的模型：用假的 Claude Code 執行檔或把 SDK 那一層隔開來測。要在 CI 跑真的模型得由使用者提供 `CLAUDE_CODE_OAUTH_TOKEN`（`claude setup-token`）當 secret，這要他決定，不要自己加 |
| 畫布 MCP（`excalidraw-mcp`）＋ Invic App | 可以啟動 | 只有 macOS runner 上可以。`web/test/fake-app.mjs` 是假的 App，`mcp.test.mjs` 用它可以在沒有 App 的情況下測 MCP 程式（MCP 程式是 Swift，也要 macOS 才能編） |
| Figma | 有 MCP 可以讀 | 多半沒有。**畫面一定要照 Figma 做**（使用者 2026-11-27 特別確認）。打不開就用 `docs/images/` 的 5 張截圖和 `architecture.html` 的「畫面」，但它們只涵蓋 22 個畫面的一部分；看不到的畫面不要自己設計，停下來向使用者要 |
| 暫存資料夾、我的記憶檔、使用者的全域規則 | 有 | 沒有。需要的都已寫進這份筆記和 repo 根目錄的 `CLAUDE.md` |

### CI 還沒有，要你建

- 上游 excalidraw-mac 有一份現成的 workflow 沒搬進來：<https://github.com/TingGeorge/excalidraw-mac/blob/d332730/.github/workflows/excalidraw-mac.yml>。它在 macOS runner 上 build App，用 `EXCALIDRAW_MAC_HOME=/tmp/exm-ci` 隔離，再跑真 App 的測試。拿它當起點，名字改成 Invic。
- 建議分三個 job：`server`（ubuntu：`bun test`、typecheck）、`web`（ubuntu：build、typecheck、`npm test`）、`mac`（macos：`scripts/build-app.sh`、`mcp.test.mjs`、真 App 的 `*-mac` 測試）。
- `*-mac` 測試會把按鍵和滑鼠送給「最前面的 App」。在 CI 的乾淨機器上可以跑；**在使用者的 Mac 上不可以跑**。
- `web/scripts/third-party.mjs` 的註解說「CI 會檢查 `THIRD_PARTY_NOTICES.md` 是不是最新」：CI 建好後補上這個檢查（build 後 `git diff --exit-code THIRD_PARTY_NOTICES.md`）。
- macOS runner 多半是 Apple 晶片（`macos-latest`）；設計是只支援 Apple 晶片，但 `build-app.sh` 目前還是編 universal，做第 3 部分時改成只編 arm64。

### 接下來要做的（順序見最下面「實作的順序和流程」）

1. 建 CI（上面）。
2. 第 2 部分：`server/src/generate/` 的 `agent.ts`、`prompt.ts`、`memory.ts`、`index.ts`，加 `log.ts` 和 `prompts/`。設計在 `backend-architecture.html`；查到的 SDK 事實在下面「為第 2 部分查到的 SDK 事實」；以前的實驗程式在 `docs/experiments/`。
3. 第 3 部分：Swift 外殼啟動伺服器。我寫好的完整工作說明在下面「第 3 部分的工作說明」。
4. 第 4–8 部分和收尾。

### 只有使用者的 Mac 能驗證的（雲端做不到，要留給他或留到最後）

- 真的用訂閱叫 Claude 在畫布上畫東西；中止後子程序有沒有停；額度用完和沒登入實際長什麼樣。
- 畫面對照 Figma、實際操作 App。
- 這些請在 PR 或這份筆記裡明白列出「沒驗證」，不要寫成已完成。

- Figma 定案：<https://www.figma.com/design/5DfsHafSo4iqhnIUUlmVWN/Untitled?node-id=0-1>（file key `5DfsHafSo4iqhnIUUlmVWN`），`App` 頁，22 個畫面：Home 2、Canvas 側邊欄關 10、Canvas 側邊欄開 2、Settings 3、Setup check 5，加元件和設計變數。舊版在兩個 Archive 頁。
- 畫面的決定都寫進了 `architecture.html` 的「畫面」、技術架構文件、概念文件、README；截圖在 `docs/images/`。
- 後端的設計另外寫成一頁 [backend-architecture.html](backend-architecture.html)（2026-11-27）：模組、`/generate` 和 `/transcribe` 的格式、錯誤種類、記憶、啟動時的設定、log。頁面最上面的 11 件事使用者在 2026-11-27 都確認了（只剩「用哪個模型」還沒決定）；標 `未驗證` 的要在實作那一塊時先試。使用者已經決定的一項：`/generate` 的請求要附截圖（他的理由：多花的 token 不多，準確率比較好）。截圖用 PNG、放在 JSON 裡的 base64、長寬設上限；記憶轉接器寫檔時把圖片換成一行字，不存進記憶檔（要先驗證 SDK 接續對話不會出問題）。
- 這一頁原本是用本機暫存資料夾裡的腳本產生的，腳本不在 repo 裡：要改就直接改 HTML（圖的原始檔在 `docs/excalidraw/`）。
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

實驗用的最小程式已存進 repo 的 [`docs/experiments/`](experiments/)：`canvas.ts`（接畫布 MCP）、`memory.ts`（記憶轉接器）、`image.ts`（圖片輸入）。當時用的是 `@anthropic-ai/claude-agent-sdk` `^0.3.332` 和原本的 Excalidraw App；路徑是示意的，不能直接跑。實作 `/generate` 時拿來改。

## Git 狀態

- 分支 `main`，remote `TingGeorge/better-ai-note`。`568998e`（後端架構頁）之前的已 push。
- 1a `80e9ce5`（原樣搬入，上游 `d332730`）和 1b `eaad45d`（改名 Invic）已 commit，都經 Opus xhigh 審查過。
- 交接用的修改（這份筆記、`CLAUDE.md`、`docs/experiments/`）：看 `git log` 確認有沒有 commit 和 push；寫這一行時還在等使用者說可以。
- `build/Invic.app` 可以啟動：它用自己的 bundle id、資料夾（`~/Library/Application Support/Invic/`）和 socket。實測啟動過一次，原本 Excalidraw 的資料沒被動到。
- `web/test/` 裡的 `*-mac` 測試還是不要跑：它們把按鍵和滑鼠點擊送給「最前面的 App」，焦點跑掉就會打到別的 App。`mcp.test.mjs` 的真 App 模式會 `pkill -x Invic`。
- 1b 已 commit（`eaad45d`，沒 push）。改名前留下的兩個舊程式（`mac/.build/out/Products/{Debug,Release}/Excalidraw`）使用者同意後已用 `trash` 丟掉。
- 圖示：使用者之後會把設計好的 icon 傳來，到時候換。「Invic Help」的連結等第 6、7 部分一起處理（使用者同意）。

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
- **和已定的設計衝突**：文件說 `SessionStore.load` 要回傳和 `append` 進去「完全相同」的內容。「記憶檔裡把截圖換成一行字」違反這個約定。做 2c 前要和使用者重新討論（實測能不能用，或改成照存圖片）。
- `sessionStore` 和 `persistSession: false` 不能同時設。

## 第 3 部分的工作說明（還沒做）

Swift 外殼在啟動時把包在 App 裡的伺服器跑起來，關 App 時一起關。

- **`server/src/index.ts`**：只聽 `127.0.0.1`；埠從 `PORT` 讀，手動跑時預設 3000；stdin 關掉時自己結束（外殼握著 pipe 的寫入端，外殼不管怎麼死掉伺服器都不會變孤兒），但從終端機 `bun run dev` 或 `bun test` 時不能因此誤結束。
- **`scripts/build-app.sh`**：用 `bun build --compile`（`bun-darwin-arm64`）把伺服器編成 `Invic.app/Contents/MacOS/invic-server`，放在簽章之前；編出來的 Bun 程式要重新簽章，`codesign --verify --deep --strict` 要過。Swift 改成只編 arm64。
- **`mac/`**：一個檔案的小型別（例如 `ServerProcess.swift`），由 AppDelegate 持有：
  - 每次啟動產生隨機 token（只在記憶體，不寫檔、不進 log）、挑一個空的本機埠。
  - 啟動伺服器時給環境變數：`ACCESS_TOKEN`、`PORT`、`CLAUDE_CODE_PATH`、`CANVAS_MCP_PATH`（包在 App 裡的 `excalidraw-mcp`）、`EXCALIDRAW_MAC_HOME`（`AppPaths` 的資料夾，讓伺服器叫起來的 MCP 連到「這個」App）、`LOG_DIR`（資料夾裡的 `Logs`）。`STT_*` 留到第 8 部分。
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
2. 後端 `/generate`，切成小塊：`agent.ts`、`prompt.ts`、`memory.ts`、`index.ts`。
3. Swift 外殼啟動伺服器（隨機 token），關 App 時一起關。
4. AI 主流程：AI 按鈕、輸入框、處理中／完成／失敗；拿掉「AI agent connected」。
5. 鎖住並淡化交給 AI 的東西、Cancel、Undo。
6. 視窗外框：標題列、狀態列、首頁、側邊欄、筆記資料夾。
7. Setup check 和設定的面板。
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
