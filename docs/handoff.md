# 交接筆記

更新：2026-11-28。給接手的人（或壓縮後的 Claude）看：現在做到哪、接下來做什麼、設計文件裡沒有的東西。

設計在這幾份，這份筆記不重複細節：

- [architecture.html](architecture.html)：整體、畫面、已經決定和還沒決定的、實測過的。
- [backend-architecture.html](backend-architecture.html)：後端的模組、`/generate` 和 `/transcribe` 的格式、錯誤種類、記憶、啟動設定、log。標 `未驗證` 的要在實作那一塊時先試。
- [AI筆記App_技術架構.md](AI筆記App_技術架構.md)、[AI筆記App_概念文件.md](AI筆記App_概念文件.md)。
- 兩個 HTML 頁面原本是用不在 repo 裡的腳本產生的：要改就直接改 HTML，圖的原始檔在 `docs/excalidraw/`。
- Figma（畫面的唯一來源）：<https://www.figma.com/design/5DfsHafSo4iqhnIUUlmVWN/Untitled?node-id=0-1>，file key `5DfsHafSo4iqhnIUUlmVWN`，`App` 頁，22 個畫面：Home 2、Canvas 側邊欄關 10、Canvas 側邊欄開 2、Settings 3、Setup check 5，加元件和設計變數。兩個 Archive 頁是舊版，不要照它們做。

## 現在做到哪

- **第 1 部分做完**：excalidraw-mac 的程式搬進 `mac/`、`web/`（1a `80e9ce5`，上游 commit `d332730`）並改名 Invic（1b `eaad45d`），都審查過。
- **第 2–8 部分還沒寫任何程式。** `server/` 只有骨架（`/generate`、`/transcribe` 兩個空的路由和 token 檢查）。
- 2026-11-28 和使用者把設計上還開著的問題幾乎都定了（見下一節），`web/` 的安裝工具換成 Bun（`88f47b4`），換上定案的 icon（`e1bc035`）。
- CI 還沒有。
- git 的狀態看 `git log` 和 `git status`，這裡不記。使用者說 push 才 push。

## 已經定案的設計（摘要）

### 架構

- Mac 桌面 App，名字 **Invic**（bundle id `io.github.tinggeorge.invic`，資料夾 `~/Library/Application Support/Invic/`）。只支援 Apple 晶片。
- 三塊：Swift AppKit 外殼（`mac/`）、WKWebView 裡的 React 網頁（`web/`）、Bun 伺服器（`server/`，編成單一程式包在 App 裡，由外殼啟動）。
- **外殼留 Swift，而且只留薄薄一層**：視窗、選單、開檔存檔、啟動伺服器、錄音。2026-11-28 查過「fork 官方 Excalidraw 加 Electrobun、全部用 TS」，決定不換：Electrobun v2.0.7 缺存檔對話框、系統的最近檔案、網頁當掉的偵測、`alert`/`confirm`、全螢幕事件和深淺色 API、資料夾型文件；麥克風、簽章後叫起 Claude Code、Agent SDK 跑在它的工作執行緒這三項從文件無法確定；只有一個維護者，v2 才三個月。只讀了文件和原始碼，沒有實際跑。
- **不 fork Excalidraw**，繼續用 `@excalidraw/excalidraw` 套件。只有套件的 API 做不到 Figma 的畫布設計時才重新考慮。
- **畫布外面的畫面全部用 React 做在 `web/` 裡**（首頁、側邊欄、標題列、狀態列、設定、Setup check），和畫布在同一個 WKWebView。不要再用 AppKit 做新畫面。原因：一套 CSS 風格統一；雲端的 agent 能用 headless Chromium 自己截圖比對。
- **畫面要的資料全部經過外殼**（最近的筆記、設定、Claude Code 狀態），用已經有的管道（`web/src/native.ts`：網頁 → 外殼用 `postMessage`，外殼 → 網頁用 `excalidrawBridge.handle`，啟動資料用 `__native__/session`）。網頁不直接連伺服器，token 只有外殼知道。要加哪些訊息，做第 6 部分時再定。
- **畫布 MCP 用 TypeScript 寫在 `server/` 裡**，和伺服器同一個程序，用 Agent SDK 的內建 MCP 交給 Claude。使用者要看得懂這一段，雲端也才能測。
- **AI 用哪個模型由使用者在設定裡選**（2026-11-28）：Settings 的「Claude Code」那一組有一列「Model」，Haiku／Sonnet／Opus 三段切換，預設 Sonnet。設定值由外殼保管，每次 `/generate` 的請求帶著它（用短名 `haiku`、`sonnet`、`opus`）；伺服器只接受這三個值，並明確傳給 SDK，不用 SDK 的預設；換模型不用重啟伺服器。伺服器要自己檢查，因為模型名字錯時 SDK 不會早早失敗（見下面的實測）。換模型後那份筆記的快取要重新建一次（快取是分模型的）。
- Claude Code 用使用者已裝好、已用訂閱登入的那一份，不載入使用者的設定，不需 API 金鑰。
- 兩個端點：`/generate`、`/transcribe`。不逐字串流，等待時顯示載入動畫。
- 語音一開始就做：OpenAI 相容的 STT API，使用者自己的金鑰；錄音由外殼做。
- 整個專案只用 Bun 安裝套件。`web/` 的 build 和測試還是用 Node 跑（由 `bun run` 啟動）。

### 畫面

- 一定照 Figma 做：版面、間距、顏色、文字、狀態。看不到的畫面不要自己設計，停下來向使用者要。
- 一個視窗，一次開一份筆記。上面細的標題列（側邊欄開關、標題、設定齒輪），下面細的狀態列（Claude Code 狀態），底色和中間一樣白，只用很淡的線隔開。
- 側邊欄預設收起，只放最近的筆記。首頁是置中的窄欄。
- 設定和 Setup check 是跳出的面板：同一個大小（800×584）、置中、四邊留白一樣、放不下就上下捲。
- 介面文字用英文。使用者很在意風格統一、不要大色塊、要簡約。
- 先不做深色模式的設計。（從上游繼承來的淺色／深色／跟隨系統的程式還在，沒有因此拿掉。）
- **主色是藍色，不是 Excalidraw 的紫色。** Figma 的 `App` 頁 2026-11-28 已改：

  | 原本 | 現在 | 用在哪 |
  |---|---|---|
  | `#6965DB`（含各種透明度） | `#3C69FD` | 主色：選中的工具、主要按鈕、選取框、AI 圖示（變數 `color/accent`） |
  | `#4A47B1` | `#2246CC` | 較深：選中色塊的外圈 |
  | `#030064` | `#001352` | 很深：選取標籤的字、選中選項的圖示 |
  | `#E0DFFF` | `#D6E3FF` | 淡：選取標籤、選中選項的底 |
  | `#CECAF9` | `#BBD0FF` | 淡：不透明度滑桿 |
  | `#EFEEFB` | `#E9F0FF` | 很淡：側邊欄選中的列（變數 `color/bg/selected`） |
  | `#F1F0FF` | `#ECF2FF` | 很淡：AI 按鈕 hover |

  - 主色是 `#3C69FD`，不是 icon 的 `#3D6BFF`：白字放在 `#3D6BFF` 上對比 4.43，不到 AA 的 4.5；`#3C69FD` 是 4.53。
  - 程式那邊：Excalidraw 自己的介面是紫色，`web/src/mac.css` 的 `--mac-accent` 也還是 `#6965db`。做畫面時要用 CSS 把主色蓋成上面這組藍（Excalidraw 的主色蓋不蓋得掉沒查證）。
- icon 定案（B · Corner：紙白圓角方塊、黑色轉角線、藍點），在 `mac/Resources/AppIcon-1024.png` 和 `AppIcon.svg`，打包腳本從那張 PNG 產生 icns。還沒重新 build App 看實際樣子。在 Figma 首頁 22px 的大小、白底上，它的外框很淡；使用者還沒說要不要加細框。

### AI 和畫布

- 叫 AI 的方式：固定的 AI 按鈕，按下去打字或語音。先選了東西 AI 就知道指的是哪些。
- 請求會附畫布的截圖（PNG、base64、長寬設上限）。使用者的理由：多花的 token 不多，準確率比較好。
- AI 用畫布工具放、改、刪；結果是一般圖形和文字。六個工具，不提供 `clear_canvas` 和 `zoom_to_fit`，不加「畫表格」的工具。範圍靠提示詞，不加程式限制。
- AI 處理時不鎖畫布，只暫時鎖住並淡化交給 AI 的那幾個東西。
- **AI 的修改全部做完才一次放上畫布。** 處理中只有載入動畫；失敗或取消就整份丟掉，畫布不變；成功的話整次修改是一個 ⌘Z。使用者的理由：這樣才能一鍵退回。
  - 現在的程式不是這樣：`web/src/bridge.ts` 的每個工具都直接 `commit` 到畫布（每次一個 undo 步驟）。
  - 想的做法（還沒實驗）：草稿放在網頁那一邊，不放伺服器，因為 `add_elements` 的轉換（`convertToExcalidrawElements`）和畫圖（`exportToBlob`，本來就吃一份 elements）都在網頁裡。請求開始時開一份草稿；讀、加、改、刪、畫圖都對草稿做；結束時把差異一次套到畫布（一次 `updateScene`），取消就丟掉。
  - 實驗排在第 5 部分（可以在 headless Chromium 裡跑，不用 App 也不用模型）。要試：套用時使用者同時改的別的東西不會被蓋掉（只套差異）；一次 `updateScene` 真的只算一個 undo；草稿畫出來的圖和真的畫布一樣。
  - 第 4 部分可以先照現在「每一步直接放上畫布」做，第 5 部分再換成草稿。`backend-architecture.html` 第 3 節的流程圖等實驗後一起改。
- 不做「撤回這次 AI 的修改」的按鈕：用 ⌘Z，或叫 AI 把東西還回來。
- 畫布右下角的「AI agent connected」要拿掉。
- 不開放給 App 外面的 agent 操作畫布。

### 記憶和快取

- 一份筆記是一個一般資料夾，裡面只有一個畫布檔（標準 `.excalidraw`）和一個記憶檔。打開時缺畫布檔就補一個空白的；缺記憶檔就從空白的記憶開始。
- 記憶是 Agent SDK 的對話紀錄，透過 `SessionStore` 轉接器存在筆記的資料夾裡。
- **記憶檔只放 AI 下次會讀到的內容，不是流水紀錄。** 不設保留期限。SDK 壓縮對話後，記憶轉接器把摘要之前的舊內容從檔案拿掉，所以大小有上限。
- **圖片照原樣存進記憶檔**（請求附的截圖和 `render_image` 的結果），不換成文字。原因是快取：快取從頭比對，截圖在每次請求的最開頭，換成字之後，下一次讀回來的「上一次請求」會從那張圖開始整段對不上，包括所有工具呼叫，要用原價重算。
- 快取有效期是 1 小時（使用者說的，沒有另外查證）。
- **寫提示詞要守的規則**：系統提示只放固定的規則文字；這次請求才有的東西（使用者的話、選了哪些東西、截圖、時間）放在對話訊息裡。不然每次都從最前面整個重算。
- 每次回應的 `cache_read_input_tokens` 要寫進 log，用來確認真的有命中。
- 畫面上不放「清掉這份筆記的記憶」的動作。想重來的人自己刪掉記憶檔。
- 授權簡單處理：把 Agent SDK 列進第三方授權清單，不另外查證。

### 從上游繼承來的東西

- **介面只用英文。** App 自己的中文字串和照系統語言切換的邏輯 2026-11-28 已拿掉（`L10n.swift` 刪了，Excalidraw 的介面語言固定 `en`）。筆記的內容、中文字型的處理不受影響。Excalidraw 自己的各國語言檔還會被打包（約 1.1 MB，不會被載入），沒有處理。沒驗證的：沒有開 App 看過選單和開始畫面；系統第一語言是中文或日文時，畫布上非手寫字型的中文字會不會被挑到不同的備用字型（`<html lang>` 現在固定 `en`）；開始畫面的日期用「英文加使用者的地區」組出來，使用者在系統設定裡另外改過的 12／24 小時制可能不會被採用。
- **一個視窗、一次一份筆記，照我們的設計。** 現在的程式是「每份畫布一個視窗」加一個預先載入的備用視窗（`AppDelegate.swift` 的 `canvases`、`spare`；`web/test/windows-mac.test.mjs`）。第 6 部分做視窗外框時改掉，連同那個測試。
- **程式裡的舊名字**（使用者說照我的建議）：環境變數 `EXCALIDRAW_MAC_HOME` 2026-11-28 已改成 `INVIC_HOME`（沒有留舊名字的相容），因為它要變成伺服器啟動設定的一部分。其他的不改：Swift 的 package 和 target 名字（`ExcalidrawMac`、`ExcalidrawApp`、`ExcalidrawMCP`）、`excalidraw://`、`.excalidraw` 檔案類型。它們在裡面看不到，改了沒有好處；`ExcalidrawMCP` 之後整個會拿掉。
- Figma 的 Settings 裡給外部 agent 用的「AI agent／Connect…」那一區：2026-11-28 已從三個 Settings 畫面拿掉。同一天在「Claude Code」那一組加了「Model」那一列（Settings 1、2；「找不到 Claude Code」的 Settings 3 沒有這一列，因為那個狀態下 AI 功能是關的，Location 那一列也本來就不顯示）。面板大小沒變（800×584），內容不用捲，捲軸拿掉了，最後一組下面留白約 38px。

## 還沒決定的（要問使用者）

- 主色要不要改回和 icon 完全一樣的 `#3D6BFF`。沒說就維持 `#3C69FD`。

## 實作的順序

每一部分：先寫明「怎樣算完成」→ 子代理寫 → Opus xhigh 的子代理審查 → 問題修完 → **commit 一次**（使用者 2026-11-28 同意，方便最後 review）→ 才做下一部分。

### 後端照設計做；遇到做不到的時候

使用者 2026-11-28 說的：

- **後端的實作要照他的設計做**（`backend-architecture.html` 和這份筆記）。他最重視後端的設計。
- 標成「還沒實驗」「未驗證」的做法（一次放上畫布、壓縮後拿掉舊記憶等）試出來不行時，**先自己想辦法**：上網查有沒有人解決過、試別的做法。
- 解法只需要改前端的程式：可以，直接做，記在「替使用者做的決定」。
- 解法會和後端的設計衝突，或真的做不到：停下來問他。整體不要和架構文件有太大的出入。

1. ~~把 excalidraw-mac 搬進來並改名 Invic。~~ 做完。
2. 後端 `/generate`：`server/src/generate/` 的 `agent.ts`、`prompt.ts`、`memory.ts`、`index.ts`，加 `log.ts` 和 `prompts/`；再加**畫布工具的 TS 模組**（`server/src/` 裡一個模組資料夾，主檔 `index.ts`，資料夾名字還沒定）。`server/package.json` 要加 `@anthropic-ai/claude-agent-sdk` 和 `zod`。要用的事實在下面三節。
3. Swift 外殼啟動伺服器（隨機 token），關 App 時一起關。工作說明在下面。
4. AI 主流程：AI 按鈕、輸入框、處理中／完成／失敗；拿掉「AI agent connected」。
5. 鎖住並淡化交給 AI 的東西、Cancel、草稿和一次放上畫布（先做上面說的實驗）。
6. 視窗外框：標題列、狀態列、首頁、側邊欄、筆記資料夾。用 React；做好後拿掉 Swift 的 `StartWindowController`。
7. Setup check 和設定的面板。用 React；做好後拿掉 Swift 的 `SettingsWindowController`。
8. 語音：`/transcribe`、錄音、麥克風按鈕。

收尾：把伺服器編成單一程式包進 App、重新簽章、量大小。

雲端的 agent 先建 CI（見「環境」）。

## 之後要拿掉的東西（條件到了才拿，現在拿會壞）

| 東西 | 什麼時候拿 | 要一起動的 |
|---|---|---|
| Swift 的 `excalidraw-mcp` | 畫布工具的 TS 版寫好、測過 | `mac/Sources/ExcalidrawMCP/`（4 個檔）；`mac/Sources/BridgeCore/BridgeClient.swift`（只有它在用）；`mac/Package.swift` 的 target；`scripts/build-app.sh` 裡包它的部分；`web/test/mcp.test.mjs`；`web/package.json` 的 `@modelcontextprotocol/sdk`（只有那個測試在用）；`AppBridge.swift` 的註解；`CLAUDE.md` 和 `README.md` 提到它的地方。**要留**：`AppBridge`、`LineServer`、`AppPaths`（TS 版連的就是那個 socket）、`web/test/fake-app.mjs`（TS 版的測試要用，先修它的中文亂碼 bug）。**陷阱**：`ui-mac.test.mjs`、`windows-mac.test.mjs`、`energy-mac.mjs` 開頭說它們接在 `mcp.test.mjs` 之後跑，靠它留下一份開著的畫布；刪掉 `mcp.test.mjs` 後要另外想辦法開畫布。在那之前它也是改寫的範本：六個工具的說明文字和格式在 `ToolDefinitions.swift`。 |
| 給外部 agent 的「agent setup」 | 跟著 Swift MCP 一起 | `AppDelegate.swift`（`onAgentSetup`、`showAgentSetup`、Invic 選單和 Help 選單各一個項目）；`SettingsWindowController.swift`；`StartWindowController.swift`；`architecture.html` 裡 Settings 的說明。 |
| 「AI agent connected」指示 | 第 4 部分；最晚要在 TS 版的畫布工具和 App 保持常駐連線之前，不然它會一直亮著 | `web/src/App.tsx`、`bridge.ts` 的 `set_agent_status`、`i18n.ts`、`mac.css` 的 `.agent-status*`、`web/test/web.test.mjs` 裡檢查它的斷言；`AppBridge.swift`、`AppDelegate.swift`、`CanvasController.swift` 的 `setAgentConnected`。拿掉後看 `LineSocket.swift` 的 `onConnectionsChanged` 還有沒有人用。 |
| `StartWindowController`、`SettingsWindowController` | React 的首頁和設定做好（第 6、7 部分） | 兩個檔和 `AppDelegate` 裡接它們的地方。 |
| universal build | 第 3 部分改成只編 arm64 | `build-app.sh` 的 `--arch x86_64`、`lipo -info`、開頭的說明。 |
| 每個工具直接 commit 到畫布 | 第 5 部分的草稿實驗之後 | `web/src/bridge.ts`；`architecture.html` 的流程第 5 步和 `request-flow.excalidraw`；`backend-architecture.html` 第 3 節。 |
| 「Invic Help」連到 excalidraw-mac 的 README | 第 6、7 部分 | `AppDelegate.swift`。`build-app.sh` 裡對上游的致謝要留著。 |

## 第 2 部分要用的事實

### Agent SDK 實測到的行為（2026-11-27，使用者的 Mac）

SDK `@anthropic-ai/claude-agent-sdk` 0.3.332，Claude Code 2.1.332，用 Bun 跑，`settingSources: []`，一個叫 `canvas` 的 MCP。實驗程式：[`experiments/sdk-options.ts`](experiments/sdk-options.ts)。當時 Invic 沒開文件，畫布工具都回「No drawing is open」，所以這一組只證明了管線通。

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
- MCP 沒接上：init 的 `tools` 是空的、status 是 `failed`，但這次執行照樣「成功」，所以一定要自己檢查。

**檢查工具清單的時機**

- 串流輸入模式下，init 要等第一則使用者訊息送出後才來。在 init 時 `abort()` 擋不住第一次模型呼叫。
- 不花模型回合的檢查方式：送訊息前 `await q.initializationResult()` 和輪詢 `q.mcpServerStatus()`（一開始是 `pending`，約 0.3 秒變 `connected`）。注意 `mcpServerStatus()` 列的是沒過濾的八個工具；過濾後的清單只在 init 訊息裡。

**中止**

- `abortController.abort()` 不是立刻生效：呼叫後約 2 秒 `for await` 才丟出錯誤（`instanceof AbortError`，訊息 `Claude Code process aborted by user`），這段時間裡**已經送出的工具呼叫還是會執行**。
- `await q.interrupt()` 才是快的：約 40 毫秒，還沒執行的工具呼叫會被拒絕、不會跑；之後來一個 `error_during_execution`（`terminal_reason: "aborted_tools"`）的結果，再丟出一般的 `Error`。`interrupt()` 只在串流輸入模式可用。
- 取消時先 `interrupt()` 再 `abort()`。`claude` 子程序約 1 秒內消失。

**圖片和系統提示**

- 帶圖片一定要用串流輸入：`{type:"user", parent_tool_use_id:null, message:{role:"user", content:[{type:"text",…}, {type:"image", source:{type:"base64", media_type:"image/png", data}}]}}`。generator 給一則就結束，查詢會正常結束。
- `systemPrompt` 給一般字串可以用。不給的話看起來是空的（不是 Claude Code 的預設提示），這點是推論。

**結果和錯誤**

- 每一種出錯的結果之後，iterator 都會再丟出 `Error("Claude Code returned an error result: …")`。要用 try/catch 包住，並以先收到的 result 訊息為準。
- 超過回合數：`subtype: "error_max_turns"`。
- 找不到 Claude Code：一開始就丟出 `Claude Code native binary not found at …`。
- 模型名字錯：assistant 訊息 `error: "model_not_found"`，結果是 `subtype: "success"` 但 `is_error: true`。**所以不能只看 `subtype`，要看 `is_error`。**
- 沒登入、額度用完沒有實測（不能為了測試登出）。型別裡有：assistant 訊息的 `error`（`authentication_failed`、`rate_limit`、`billing_error` 等），和 `rate_limit_event`（`status: "allowed" | "allowed_warning" | "rejected"`、`rateLimitType`、`resetsAt`）。訂閱額度用完實際是哪個值沒驗證。

**模型和速度**（「say ok」，各一次，從開始到結束）

| `model` | 實際模型 | 第一個回應 | 全部 |
|---|---|---|---|
| 不給 | claude-opus-5-5 | 3.6 秒 | 6.4 秒 |
| `sonnet` | claude-sonnet-5-5 | 1.6 秒 | 5.0 秒 |
| `opus` | claude-opus-5-5 | 2.1 秒 | 5.0 秒 |
| `haiku` | claude-haiku-5-5 | 1.6 秒 | 4.2 秒 |

- 啟動到 init 約 0.2–0.3 秒。最後一句話之後還要等 1.6–2.4 秒結果才來，再 0.6–0.9 秒 iterator 才結束。

**其他**

- `persistSession` 預設是 true，每次執行都會在 `~/.claude/projects/` 留一份紀錄。`sessionStore` 和 `persistSession: false` 不能同時設；接上 `sessionStore` 後要確認還會不會留那份紀錄。
- 一次 Opus 的測試回報了不合理的費用（`total_cost_usd` 約 1.03）；2026-11-28 的 Haiku 實驗也有幾次這樣。原因沒查。

### 畫布工具放進伺服器的實驗（2026-11-28，macOS）

實驗程式：[`experiments/mcp-in-server.ts`](experiments/mcp-in-server.ts)。Bun 直接連 Invic 的 socket，用 SDK 的 `createSdkMcpServer`（`type: "sdk"`）把工具交給 Claude，不經過 Swift 的 MCP。Haiku 在真的 Invic 上畫了圖並讀回來；回傳圖片也可以。工具名字是 `mcp__canvas__<tool>`，上面那組工具限制的行為和 stdio 版一樣。

改寫時要照做的：

- **每個工具都要把 `extra.signal` 傳給連線那一層。** 工具跑在伺服器自己的程序裡，查詢取消後不會自動停；不檢查的話，取消 3 秒後還是畫上去了。
- **每次查詢建一個新的 `createSdkMcpServer()`，共用一條 socket 連線。** 同一個物件給兩個查詢用，第二個會悄悄沒有畫布工具（不報錯），所以「自己檢查工具清單」一定要做。畫布工具少了要回哪一種錯誤還沒定（錯誤表只有「多出別的工具」的 `unexpected_tools`）。
- **Bun 的 `socket.write()` 不會排隊**：回傳的是寫進去的位元組數，剩下的要等 `drain`。
- 伺服器用 `INVIC_HOME`（App 的資料夾）找到 socket。socket 的路徑不能超過 macOS 的 104 位元組上限。
- 沒有自動啟動 App（外殼啟動伺服器，所以不需要）；App 重開後連線會自己重連。
- `bun build --compile` 後 `import.meta.dir` 是 `/$bunfs/root`，拿來當 `cwd` 會讓 `claude` 啟動失敗，要用 `process.cwd()`。編出來的程式要重新簽章，不然一啟動就被系統殺掉。
- 規模：六個工具，約 250–350 行加一個對假 App 的測試。
- `web/test/fake-app.mjs` 有 bug：用 `buf += chunk` 接 Buffer，多位元組的字被切在兩段中間會變亂碼。要用它測中文前先修。
- 沒驗證：Linux、只 `abort()` 不先 `interrupt()`、App 在呼叫中途關掉、大於 96 kB 的圖、每次呼叫的逾時、編成單一程式後真的叫模型。

### 記憶：做之前要先試的

我對運作方式的理解（沒在這版 SDK 實測）：紀錄是只往後加的；SDK 壓縮時在後面加一段摘要，接續對話時只讀最後一段摘要之後的內容，但摘要之前的舊內容還留在檔案裡。

1. 接續時是不是真的只讀最後一段摘要之後的。
2. 轉接器把摘要之前的內容拿掉後，接續對話會不會出錯。官方文件說 `SessionStore.load` 要回傳和 `append` 進去「完全相同」的內容，這一步違反字面上的規定。
3. 之前的實驗裡兩次請求後記憶檔約 490 KB，裡面到底是什麼（猜是圖片）。
4. 能不能只用一個記憶檔（之前的實驗是兩個檔，一個記對話的編號）。

第 2 點不行的話，照「遇到做不到的時候」處理：先查、先試；記憶是後端的設計，要換做法就先問使用者。

記憶轉接器的起點是 [`experiments/memory.ts`](experiments/memory.ts)，選項和圖片輸入的起點是 `sdk-options.ts`。更早的兩個實驗（`canvas.ts`、`image.ts`）已被取代，在 `docs/archive/experiments/`。

### 替使用者做的決定（最後 review 時給他看）

- 2a：`runAgent` 的輸入分成 `rules`（固定的系統提示）和 `content`（這次請求的訊息）；多一個錯誤種類 `cancelled`。

## 第 3 部分的工作說明

Swift 外殼在啟動時把包在 App 裡的伺服器跑起來，關 App 時一起關。

- **`server/src/index.ts`**：只聽 `127.0.0.1`（現在的骨架沒設，用的是 Bun 的預設）；埠從 `PORT` 讀，手動跑時預設 3000；stdin 關掉時自己結束（外殼握著 pipe 的寫入端，外殼不管怎麼死掉伺服器都不會變孤兒），但從終端機 `bun run dev` 或 `bun test` 時不能因此誤結束。
- **`scripts/build-app.sh`**：用 `bun build --compile`（`bun-darwin-arm64`）把伺服器編成 `Invic.app/Contents/MacOS/invic-server`，放在簽章之前；編出來的 Bun 程式要重新簽章，`codesign --verify --deep --strict` 要過。Swift 改成只編 arm64。
- **`mac/`**：一個檔案的小型別（例如 `ServerProcess.swift`），由 AppDelegate 持有：
  - 每次啟動產生隨機 token（只在記憶體，不寫檔、不進 log）、挑一個空的本機埠。
  - 啟動伺服器時給環境變數：`ACCESS_TOKEN`、`PORT`、`CLAUDE_CODE_PATH`、`INVIC_HOME`（`AppPaths` 的資料夾，伺服器用它找到這個 App 的 socket）、`LOG_DIR`（資料夾裡的 `Logs`）。`STT_*` 留到第 8 部分。
  - 找 `claude`：圖形 App 拿不到 shell 的 PATH，要查常見位置（`~/.local/bin`、`~/.claude/local`、`/opt/homebrew/bin`、`/usr/local/bin`），再退到問登入 shell `command -v claude`。找不到也照樣啟動伺服器（第 7 部分會顯示 Setup check）。
  - 伺服器意外結束時重啟一次（不要無限重試）；提供 `restart()` 給設定改變時用；提供 base URL 和 token 給之後送請求的程式。
  - 找不到包好的伺服器（例如直接 `swift build` 跑）時記一行 log 就繼續；開發時可用 `INVIC_SERVER_PATH` 指定。
- **完成的檢查**：伺服器是 App 的子程序、只聽 127.0.0.1、沒帶 token 回 401；正常關 App 和 `kill -9` App 兩種情況下伺服器都在幾秒內消失。

## 環境

### 雲端和使用者的 Mac 不一樣的地方

| 事情 | 使用者的 Mac | 雲端 |
|---|---|---|
| build Mac App（`mac/`、`scripts/build-app.sh`） | 可以 | Linux 上不行：AppKit、WKWebView、`codesign`、`sips`、`iconutil` 都只有 macOS 有。只能靠 GitHub 的 macOS runner |
| `web/`（build、typecheck、`bun run test`） | 可以 | 可以。PATH 上要有 Node（^20.19 或 ≥22.12）；`bun run test` 需要 Chromium：`bunx playwright-core install chromium-headless-shell`，或用 `PW_CHROMIUM` 指到現成的 Chrome |
| `server/`（`bun test`、typecheck） | 可以 | 可以 |
| 真的叫 Claude | 用使用者已登入訂閱的 Claude Code | 沒有登入。測試不能依賴真的模型：用假的 Claude Code 執行檔或把 SDK 那一層隔開來測。要在 CI 跑真的模型得由使用者提供 `CLAUDE_CODE_OAUTH_TOKEN`（`claude setup-token`）當 secret，這要他決定，不要自己加 |
| 畫布工具（TS 版）對著假 App | 可以 | 可以（`web/test/fake-app.mjs`，先修中文的 bug） |
| 真的 Invic App | 可以啟動 | 只有 macOS runner |
| Figma | 有 MCP 可以讀 | 多半沒有。打不開就用 `docs/images/` 的 5 張截圖（2026-11-28 從 Figma 重新匯出：Home 2、Canvas 2、側邊欄開 1、Settings 1、Setup check 2）和 `architecture.html` 的「畫面」，它們只涵蓋 22 個畫面的一部分 |
| 使用者的全域規則、暫存資料夾 | 有 | 沒有。需要的都寫在這份筆記和 `CLAUDE.md` |

### `web/` 用 Bun 要知道的

- PATH 上沒有 Node 時，`bun run` 會悄悄改用 Bun 跑：測試會失敗，build 會過但產出不一樣。CI 要同時裝 Node 和 Bun。
- 沒有 `bun.lock` 時 `bun install --frozen-lockfile` 不會失敗，會直接裝最新版。`bun.lock` 一定要在 git 裡。
- `bun install` 不會先清掉 `node_modules`，所以 `scripts/build-app.sh` 會先刪掉 `web/node_modules` 再裝。
- 和 npm 時版本完全一樣，但 Bun 的資料夾排法讓幾個 `@radix-ui` 的小套件多打包了一份（主要的檔案多約 4 KB）。審查沒找到會出問題的地方。

### CI 還沒有

- 上游有一份 workflow 沒搬進來：<https://github.com/TingGeorge/excalidraw-mac/blob/d332730/.github/workflows/excalidraw-mac.yml>。它在 macOS runner 上 build App，用 `EXCALIDRAW_MAC_HOME=/tmp/exm-ci` 隔離（我們這邊叫 `INVIC_HOME`），再跑真 App 的測試。拿它當起點，名字改成 Invic。
- 建議三個 job：`server`（ubuntu：`bun test`、typecheck）、`web`（ubuntu：build、typecheck、`bun run test`；同時裝 Bun 和 Node，固定 Bun 的版本）、`mac`（macos：`scripts/build-app.sh`、`mcp.test.mjs`、真 App 的 `*-mac` 測試）。
- `web/scripts/third-party.mjs` 的註解說 CI 會檢查 `THIRD_PARTY_NOTICES.md` 是不是最新：CI 建好後補上（build 後 `git diff --exit-code THIRD_PARTY_NOTICES.md`）。

### 測試的限制

- `web/test/` 的 `*-mac` 測試和 `mouse.swift` 會把按鍵和滑鼠送給「最前面的 App」。在 CI 的乾淨機器上可以跑；**在人的 Mac 上不可以跑**。`mcp.test.mjs` 的真 App 模式會 `pkill -x Invic`。
- 在使用者的 Mac 上：畫面用只針對 Invic 的 computer-use 工具檢查；畫布用 `web/test/bridge-call.mjs` 連 Invic 的 socket。
- 不管什麼時候都**不要碰原本的 Excalidraw**（`/Applications/Excalidraw.app`、程序 `Excalidraw`、`~/Library/Application Support/Excalidraw/`）：裡面有沒存檔的東西。`build/Invic.app` 用自己的 bundle id、資料夾和 socket，啟動它不會動到原本的。

### 只有使用者的 Mac 能驗證的

- 真的用訂閱叫 Claude 在畫布上畫東西；中止後子程序有沒有停；額度用完和沒登入實際長什麼樣。
- 畫面對照 Figma、實際操作 App。
- 這些在 PR 或這份筆記裡明白列成「沒驗證」，不要寫成已完成。

## 留著沒清的東西

刪除一律先列出確切路徑、得到使用者同意；在使用者的 Mac 上只能用 `trash`。

使用者說等全部結束再處理的：

- `~/Desktop/ai-note-test.excalidraw`（開在 Excalidraw App 裡，AI 畫的東西沒存檔）
- `~/Desktop/ai-note-test/`（實驗的記憶檔）
- `~/.claude/projects/-Users-apple-Desktop-ai-note-test/`（SDK 留的副本）

`build/Invic.app`、`build/Invic-macOS.zip` 是換 icon 和換 Bun 之前 build 的舊版，不在 git 裡；下次跑 `scripts/build-app.sh` 會自動換掉，不用特別清。

## 和這位使用者工作的方式

- 用繁體中文回覆。他用語音輸入，字常常辨識錯（例如「Cloud Code」是 Claude Code、「Excalibur／Xcode」是 Excalidraw、「A 群／A 卷」是 agent、「INVSE」是 Invic），照意思理解。
- 他先看圖，文字多了會迷路。討論時在對話裡直接畫圖，用 Excalidraw 的內嵌工具。
- 每個不確定的地方要說清楚「沒查證」；他會要求去查證。沒跑過的不要說成通過。
- **流程**：整個 App 照順序一路做完，不用每一部分停下來等他審查。全部做完、測試過，他才做最後一次 code review。所以由接手的人把關（見「實作的順序」），替他做的決定記在上面「替使用者做的決定」，`backend-architecture.html` 要跟著實際做出來的改。
- **他細看的是後端**和「各部分怎麼接起來」，而且要看得懂（TypeScript、Bun）。前端和 Mac App 他只用用看，所以要自己對照 Figma 檢查仔細、留截圖。
- **誰做什麼**（照任務挑模型，不是全部都用 Opus）：主對話只和使用者討論和計畫。需要邏輯的程式由 Opus high 的子代理寫；簡單的任務用 Sonnet；寫測試用 Opus high 或 medium，很簡單的測試用 Sonnet；檢查程式對不對的審查由 Opus xhigh 的子代理做，給它程式，不給結論；頁面（HTML）由 Opus medium 的子代理建；Figma 是使用者叫改才改，用他指定的模型，沒指定就用 Opus 或 Sonnet。性質不同、互相獨立的工作可以同時開幾個子代理（兩個寫的不能動同一批檔案）。
- 寫程式的規則在 `CLAUDE.md`：最少的程式、不加沒要求的抽象和依賴；每個模組資料夾一個主檔 `index.ts`；函式由上往下排；一定加大括號；Bun 的原生 API 和 `bun:test`；只改必要的地方；刻意的簡化用 `ponytail:` 註解標出來。
- 頁面做完要在瀏覽器檢查整頁，並說明沒檢查到的地方。
- 過時的文件移到 `docs/archive/`，不刪；還有效的內容要留在現行文件裡。
- 刪檔案：用 `git rm` 刪被追蹤的檔案可以（留在歷史裡）；其他一律先問。
- 他要 commit 時才 commit，要 push 時才 push。
