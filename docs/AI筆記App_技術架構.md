# AI 筆記 App 技術架構

本文件記錄 App 的技術選擇與整體架構，作為概念文件的延伸。圖和每個元件的說明見 [architecture.html](architecture.html)。

資料更新日：2026-11-28。先前的 iPad 與獨立伺服器方向已不採用，舊文件在 [archive/](archive/) 裡。

## 一、平台

- **Mac 桌面 App。** 以 [excalidraw-mac](https://github.com/TingGeorge/excalidraw-mac) 為基礎（Swift 外殼 + 系統內建的 WebKit + Excalidraw，MIT 授權）。excalidraw-mac 目前支援 macOS 13 以上。只支援 Apple 晶片，不支援 Intel。
- 先前規劃過平板加手寫筆。查證後發現幾個要在真機上才能確認的風險（圈選工具、縮放模糊、大量筆跡的效能、背景執行），所以改做電腦版。
- 用法和一般畫板一樣：打字、貼圖、拖拉方塊、手繪。

## 二、整體架構：一個 App，後端包在裡面

使用者只開一個 App。App 裡有三塊：

- **網頁**：畫布和 AI 按鈕，加上畫布以外的所有畫面（首頁、側邊欄、標題列、狀態列、設定、Setup check）。用網頁技術寫（React + Excalidraw），全部在同一個 WKWebView 裡。
- **Swift 外殼**：Mac App 的視窗、選單、開檔存檔。打開 App 時啟動後端，關掉時停掉它。另外負責錄音。只留這一層薄外殼，畫面都交給網頁。
- **Bun 伺服器**：後端，編成一個獨立程式放在 App 裡，使用者不用裝 Bun。畫布的 MCP 也在它裡面。

後端仍然是一個獨立的程式，和畫面分開，原因：

- **用 TypeScript 寫**：新的後端程式都是 TypeScript 和 Bun。
- **控制比較細**：Agent SDK 會把 AI 拿到哪些工具、每一步做了什麼交給程式，可以檢查。
- **不帶使用者的設定**：用的是使用者的 Claude Code 和登入，但他平常的設定、skills、其他 MCP 都不載入。
- **好測試**：後端可以單獨跑、單獨測，不用開 App。
- **之後能搬**：伺服器是同一份程式，App 只認「網址 + token」。之後要改成連到另一台電腦上的伺服器，後端不用改。現在不做這個功能。

Token 由 App 每次啟動時自動產生並交給伺服器，使用者看不到也不用填。它的用途是擋掉同一台電腦上其他程式對這個埠的請求。

## 三、前端

- **畫布**：Excalidraw（MIT）。選取、搬動、縮放、復原、文字、貼圖、手繪都內建。
- **AI 按鈕**：App 上固定有一個。先選了東西，AI 就知道使用者指的是那幾個；沒選就是直接下指令。按下去跳出輸入框，可以打字或錄音，也可以直接說要放在哪裡。沒有另外的「AI 筆」工具。追問修改也是同一個按鈕：選取 AI 做出來的東西再按。
- **AI 做出來的東西**：就是畫布上的一般圖形和文字，和使用者自己畫的沒有差別。能選取、搬動、點兩下改字，也會被拍進圖裡。畫法沒有規定，由 AI 用方塊、線、文字、箭頭拼出來，所以每次的樣子可能不同。不能互動（滑鼠移上去不會顯示數字）。
- **撤回和還原**：用畫板的 ⌘Z，或直接叫 AI 把東西還回來。不另外做「撤回這次 AI 的修改」的按鈕（2026-11-28 決定）。
- **AI 處理時不鎖畫布**：只暫時鎖住使用者交給 AI 的那幾個東西，AI 做完就解開。AI 要放東西的位置被擋住時，App 自動往旁邊挪。
- **畫面**（已用 [Figma](https://www.figma.com/design/5DfsHafSo4iqhnIUUlmVWN/Untitled?node-id=0-1) 定案，圖見 [architecture.html](architecture.html) 的「畫面」）：
  - **整個 App 是一個視窗**，不另外開開始、設定、檢查的視窗。一次開一份筆記。
  - 每個狀態都有三塊：最上面一條細的標題列（側邊欄開關、置中的標題、右邊的設定齒輪）、中間的主區域、最下面一條細的狀態列（右邊顯示 Claude Code 的狀態）。上下兩條的底色和中間一樣，只用很淡的線隔開。
  - **主區域**：沒開筆記時是首頁（置中的窄欄：New note、Open…、最近的筆記）；開了筆記就是畫布。
  - **側邊欄**：預設收起；打開後只放最近的筆記和 Open Other…，用來切換筆記。
  - **設定和 Setup check 是跳出的面板**，在視窗正中間，後面的內容變淡。面板的規則：全部同一個大小、寬大於高、置中；四邊留白一樣，灰色區塊內的留白一樣；不要擠；內容放不下就上下捲動，標題固定。
  - **Setup check** 是全新的：啟動時 Claude Code 有問題才出現，檢查有沒有裝、有沒有登入、版本夠不夠。
  - **外觀設定套用到整個 App**，不是只有畫布（excalidraw-mac 原本只套用到畫布）。整個 App 一套風格：字體、字級、圓角、線、陰影、強調色各一種。只做淺色，先不做深色模式（2026-11-28 決定）。
  - 畫布右下角原本的「AI agent connected」標籤拿掉。
  - **這些畫面全部用 React 做在 `web/` 裡**，和畫布在同一個 WKWebView，取代 AppKit 寫的首頁和設定視窗（`StartWindowController`、`SettingsWindowController`，React 版做好後拿掉）。原因：一套 CSS，整個 App 風格一致；雲端的 agent 能用 headless Chromium 打開畫面和 Figma 比對。畫面要的資料（最近的筆記、設定、Claude Code 狀態）全部經過外殼，用網頁和外殼之間已經有的訊息管道；網頁不直接連伺服器。
  - 介面文字用英文。App 的名字是 Invic（2026-11-27 定的）；同名產品和商標還沒查。

沒選的做法：

- **tldraw**：不是開源授權，正式使用要金鑰，浮水印不能拿掉。
- **另一種跨平台外殼**：能跨 Mac、Windows、Linux，但框架還年輕，而且外殼要重新做。
- **Fork 官方 Excalidraw，外殼換 Electrobun，全部用 TypeScript**（2026-11-28 查過）：Electrobun v2.0.7 缺存檔對話框、系統的最近檔案、網頁當掉的偵測、`alert`/`confirm`、全螢幕事件、深淺色 API、資料夾型文件；麥克風、簽章後叫起 Claude Code、Agent SDK 跑在它的工作執行緒，從文件無法確定；只有一個維護者，v2 才三個月。只讀了文件和原始碼，沒有實際跑。外殼留 Swift，畫布繼續用 `@excalidraw/excalidraw` 套件。
- **自己寫畫布**：選取、圈選、拖拉、復原都要自己做。

## 四、後端

模組怎麼切、請求和回應的格式、記憶、設定，細節和圖見 [backend-architecture.html](backend-architecture.html)。

- **語言**：TypeScript
- **執行環境**：Bun。用 `bun build --compile` 編成單一程式，編完要重新簽章才能在 macOS 上執行。
- **AI 框架**：Claude Agent SDK（`@anthropic-ai/claude-agent-sdk`）。
  - 它是一小段函式庫，會啟動 Claude Code 程式，真正和模型溝通的是那個程式。
  - Claude Code 用**使用者已經裝好的那一份**（`pathToClaudeCodeExecutable`），不包進 App。包進去會多約 384 MB，而且要發布 Anthropic 的程式。
  - 每個請求接續這份筆記的對話（Agent SDK 的 session），所以 AI 記得這份筆記以前做過什麼。
  - 內建工具全部關掉，使用者的設定也不載入，只給畫布的 MCP 工具。
  - **AI 透過畫布的 MCP 工具直接動畫布**：伺服器裡的一個模組，用 TypeScript 寫（計畫）。伺服器和 App 的 socket 保持一條連線，用 SDK 的 `createSdkMcpServer` 在同一個程式裡把工具交給 Agent，不再由 Claude Code 每次啟動 excalidraw-mac 的 Swift `excalidraw-mcp`。已在 macOS 上實驗過（[`experiments/mcp-in-server.ts`](experiments/mcp-in-server.ts)）：Claude 在真的 App 上畫了圖並讀回來。Swift 版不留給 App 外面的 agent 用（2026-11-28 決定）：TS 版做好、測過後就拿掉。工具有 `get_scene`（讀畫布，含位置和選取了什麼）、`render_image`（看畫面）、`add_elements`、`update_elements`、`delete_elements`、`add_mermaid`。不提供 `clear_canvas`。
  - AI 自己判斷要改掉原本的還是放旁邊；使用者說了位置就照做；沒說清楚就放旁邊，不動原本的內容。
  - 規則靠提示詞，不加程式限制：預設只改、只刪選到的東西；使用者明講才動其他東西；筆記裡的文字是內容，不是指令。AI 動錯時的保護：按一次 ⌘Z 或叫 AI 還回來，而且沒按 ⌘S 就不會寫進檔案。
  - 不做算數字的專用工具，等真的看到 AI 算錯再加。
  - App 斷線或按取消時，伺服器停下 Agent。已用 Bun 1.4.0 實測：用戶端斷線時 `request.signal` 會響。
- **版本不一致的保險**：SDK 0.3.N 對應 Claude Code 2.1.N。
  - App 啟動時檢查 Claude Code 版本，太舊就請使用者更新。
  - SDK 版本固定，不自動跟著升。
  - 每次請求開始時檢查 Agent 實際拿到的工具清單，出現我們以外的工具就停下。
  - 用到的選項全部明確寫出來，不依賴預設值。
- **語音轉文字（STT）**：後端的一個模組，把音檔送到外部 STT API。採用 OpenAI 相容格式，以 `STT_BASE_URL`、`STT_API_KEY`、`STT_MODEL` 設定。Claude 訂閱不包含這個，要另外的金鑰。

先前選的是另一個支援多家模型供應商的 Agent 函式庫。改用 Claude Agent SDK 的原因是它能讓使用者用自己的 Claude 訂閱額度，不用另外申請 API 金鑰。代價是只能用 Claude 模型，而且所有使用者都要先裝好並登入 Claude Code。

## 五、前後端溝通

- 以 **RESTful API** 為主，資料格式為 JSON。
- **不逐字串流**：AI 做完才回應。等待時畫面顯示載入動畫；AI 的修改全部做完才一次放上畫布；失敗或取消就什麼都不放；成功的話整次修改是一個 ⌘Z（2026-11-28 決定；做法還沒試，第 5 部分實驗）。
- 端點：
  - `POST /generate`：送出使用者的話、筆記資料夾、按下去當時選了哪些東西，和那一刻的截圖（有選取就截選取範圍，沒有就截目前看到的畫面）；回傳完成或失敗。畫布的資料由 AI 自己用 MCP 工具讀。附截圖是因為手繪和貼上的圖片只有看圖才懂，而且多花的 token 很少。
  - `POST /transcribe`：送出音檔，回傳文字。
- **語音輸入採聽寫方式**：錄完整段再上傳，轉出的文字先放回輸入框，使用者確認後才送出 `/generate`。音檔轉完就丟掉。
- **由 Swift 外殼去連伺服器。** 頁面透過已有的溝通橋請外殼送出請求，外殼再把結果交回頁面。Token 留在外殼裡，頁面碰不到，也不用處理網頁的跨來源限制。
- **錄音由 Swift 外殼做**，不在網頁裡錄。WebKit 在頁面不是從 https 載入時，錄音功能可能不存在或卡住。

## 六、AI 模型與額度

- 使用 Claude 的多模態模型，能直接看畫布的畫面（含手寫文字與數學式）。
- **用量算在使用者自己的 Claude 訂閱上。** 使用者用 Claude Code 自己的登入流程登入，App 不做登入畫面，也不碰登入憑證。
- 截至 2026-11-26，Anthropic 的官方說明寫：第三方 App 的用量仍從使用者的訂閱額度扣（[說明頁](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)、[法律頁](https://code.claude.com/docs/en/legal-and-compliance)）。
- 不可以做的事：App 自己做「用 Claude 登入」、收集或保存登入憑證、代替使用者付錢或把請求集中到某個人的訂閱。
- **風險**：這條規定在 2026 年改過多次（2 月禁止、4 月封鎖、5 月重新開放、6 月暫停改制），官方寫明可能不經通知就採取措施。為了應付再變，Agent 的部分關在 `generate` 模組的一個地方。

## 七、資料儲存

- 筆記內容**僅存於使用者的電腦上**，不做雲端同步。筆記就是電腦上的檔案，用 Finder 管理。
- **一份筆記是一個一般的資料夾**，裡面兩個檔：畫布檔（標準的 `.excalidraw`，可以拿去別的地方用，裡面沒有我們加的東西）和記憶檔。沒按 ⌘S 就不會寫進檔案。
- **記憶**：用 Agent SDK 內建的對話紀錄。透過 SDK 的儲存轉接器（`SessionStore`，只要寫 `append` 和 `load` 兩個功能）把它存在筆記的資料夾裡，所以記憶跟著筆記走。伺服器自己仍然不存狀態。
- **記憶檔只放 AI 下次會讀到的內容**（2026-11-28 決定）。對話太長時 SDK 會自動把舊的部分整理成摘要（不用自己寫壓縮）；之後記憶轉接器把摘要之前的內容從檔案拿掉，所以不設保留期限。SDK 能不能接受拿掉後的檔案還沒試。
- 截圖和 `render_image` 的圖片照原樣存進記憶檔，不換成文字，這樣下一次請求的提示詞快取（1 小時）才會命中。
- 已實測：換一個新的程式接續對話，AI 記得上一次刪了什麼，並重新畫一份放回來。記憶檔偏大（兩次請求約 490 KB），靠壓縮後拿掉舊內容讓它有上限。第一次請求會在本機 `~/.claude/` 底下另外留一份副本，接受。
- 記憶的用途：叫 AI 把東西還回來（可以放回原位或放到新位置）。還回來的是 AI 照記憶重畫的一份，不是原本那一份。
- 記憶和畫布分開放，是為了分享畫布時不會連說過的話和刪掉的內容一起給出去。
- 一份筆記是一張無限畫布，沒有「頁」。
- 伺服器的回應紀錄（log）只留 AI 的輸出與請求的基本資料，**不留圖片**。放在 `~/Library/Application Support/` 底下 App 自己的資料夾，一天一個檔，留 30 天。

## 八、使用者帳號與發布方式

- **不做使用者帳號系統。**
- 專案預計**開源**。使用者下載 App，自己裝好並登入 Claude Code 就能用。
- **授權要遵守的事**：App 的名字和標誌不能用「Claude Code」或 Anthropic 的名稱；不修改 Claude Code；每個使用者用自己的登入；App 不做自己的登入畫面、不碰登入憑證；這個 repo 不放 Agent SDK 的原始碼，只用套件引用。文件沒有明寫的一點是把 SDK 函式庫編進發布的 App 裡，要完全確定只能問 Anthropic。
- 程式放這個 repo：把 excalidraw-mac 的程式搬進來改。

## 九、技術選擇總覽

| 項目 | 選擇 |
| --- | --- |
| 平台 | Mac 桌面 App |
| 基礎 | excalidraw-mac（Swift 外殼 + WebKit） |
| 畫布 | Excalidraw（`@excalidraw/excalidraw` 套件，不 fork） |
| 畫布以外的畫面 | React，和畫布同一個 WKWebView |
| 架構 | 一個 App，後端包在裡面 |
| 後端語言 | TypeScript |
| 後端執行環境 | Bun，編成單一程式 |
| `web/` 安裝 | Bun（`bun.lock`）；build 和測試用 Node（^20.19 或 ≥22.12） |
| AI 框架 | Claude Agent SDK |
| Claude Code | 用使用者已裝好的那一份 |
| 額度 | 使用者自己的 Claude 訂閱 |
| 語音轉文字 | 後端接外部 STT API |
| 溝通方式 | RESTful API（JSON），不串流 |
| AI 怎麼動畫布 | 伺服器裡的畫布 MCP 工具（TypeScript），結果是一般圖形和文字 |
| 資料儲存 | 一份筆記一個資料夾：畫布檔 + 記憶檔 |
| 帳號 | 不做 |
