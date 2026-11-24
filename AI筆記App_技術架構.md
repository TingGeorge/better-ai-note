# AI 筆記 App 技術架構

本文件記錄 App 的技術選擇與整體架構，作為概念文件的延伸。後端的元件圖與流程圖見 [backend-architecture.html](backend-architecture.html)。

## 一、平台

- **主要平台：iPad**，以 Apple Pencil 手寫為核心體驗。
- 選擇先做 iPad 而不是電腦版，原因是「手寫筆記 + AI 整理」的情境在平板上最自然。
- iPad 原生 App 之後要延伸到 Mac 也相對容易（Mac Catalyst 或 Apple 晶片 Mac 直接執行）。

## 二、整體架構：Client-Server

採用前後端分離的架構：

- **iPad App（Client）**：負責畫布、手寫、圈選、顯示 AI 結果等所有需要即時反應的功能，皆在本機執行。
- **後端伺服器（Server）**：只在使用者用 AI 筆送出請求（或用語音輸入需求）時才連線，負責呼叫 AI 模型與語音轉文字。伺服器不存狀態，每個請求各自獨立。

選擇有伺服器架構的原因：

- **更新方便**：提示詞、模型設定都放在伺服器，修改後所有使用者立即生效，不需重新發布 App 或等待 App Store 審核。
- **換模型容易**：更換模型供應商或版本只需改後端，App 不用動。
- **品質可掌握**：可在伺服器端記錄 AI 回應，找出常出錯的情境並調整提示詞。
- **金鑰安全**：API 金鑰存放在伺服器，不會打包進 App。

## 三、前端

- **語言與框架**：Swift + SwiftUI
- **手寫畫布**：PencilKit

選擇原生開發而非 PWA、React Native 或 Capacitor 的原因：筆記軟體最重視書寫手感，些微延遲使用者都感受得到。PencilKit 由 Apple 優化，具備筆跡預測、壓力感應與防誤觸，跨平台或網頁方案難以達到同等體驗。

## 四、後端

- **語言**：TypeScript
- **執行環境**：Bun（速度快，可直接執行 TypeScript，免額外編譯設定）
- **AI 框架**：pi-agent-core（pi-mono 專案中的套件，套件名稱為 `@earendil-works/pi-agent-core`），透過其底層的 pi-ai 支援多家模型供應商，日後換模型方便。
  - 畫圖表、心智圖這類任務較複雜，所以用 agent 讓模型可以呼叫工具、分幾步完成。
  - 每個請求開一個新的 Agent，做完就丟。
  - 工具（暫定）：`calc` 用程式計算平均數、標準差等數字，不讓模型心算；`check block` 檢查圖表或心智圖的資料格式，不對就讓模型重做。
- **語音轉文字（STT）**：伺服器上的一個模組，把音檔送到外部 STT API。採用 OpenAI 相容格式，以 `STT_BASE_URL`、`STT_API_KEY`、`STT_MODEL` 設定，可換成不同供應商或自架 Whisper。

## 五、前後端溝通

- 前端以 SwiftUI 內建的 URLSession 呼叫後端 API。
- 以 **RESTful API** 為主，資料格式為 JSON。
- AI 生成結果較慢，可用 **SSE 串流**讓內容逐步出現在預留區，提升等待體驗。
- 端點：
  - `POST /generate`：送出圈選範圍的圖片與需求文字，以 SSE 回傳結果。
  - `POST /revise`：追問修改。伺服器不存東西，所以 App 要再送一次原圖、上一版結果和留言。
  - `POST /transcribe`：送出音檔，回傳文字。
- **輸出格式**：串流過程中的 `delta` 是預覽文字；最後的 `done` 帶一個 typed block（`kind` 為 `table`、`chart`、`steps`、`mindmap`、`summary` 其中之一，加上 `data`），由 SwiftUI 把每一種原生畫出來。
- **語音輸入採聽寫方式**：錄完整段再上傳，轉出的文字先放回輸入框，使用者確認後才送出 `/generate`。音檔轉完就丟掉。

## 六、AI 模型策略

- 使用**單一強力的多模態模型**，透過 API 直接處理圈選內容（含手寫文字與數學式）。
- 曾考慮「本地小模型前處理 + 大模型」的兩階段架構，但以目前規模而言，單一模型架構更單純、出錯環節更少、延遲更低。
- 日後若使用量變大、成本成為問題，再考慮加入小模型做分流。
- API 費用需自行負擔；開發測試階段可善用免費額度或較便宜的模型。

## 七、資料儲存

- 筆記內容**僅存於 iPad 本機**，不做雲端同步。
- 伺服器的回應紀錄（log）只留 AI 的輸出與請求的基本資料，**不留圈選的圖片**。代價是出錯時看不到模型當時看到什麼。

## 八、使用者帳號與發布方式

- **不做使用者帳號系統。**
- 專案預計**開源**，採自行架設（self-hosted）模式：想使用的人自行下載、架設後端，並填入自己的 AI API 金鑰，費用各自負擔。
- **Access token**：伺服器 `.env` 設一個 `ACCESS_TOKEN`（一串長亂數）。App 在設定頁輸入伺服器網址與 token，存進 Keychain，每個請求帶 `Authorization: Bearer <token>`。不符就回 401；沒設 token 伺服器就拒絕啟動。這是用來擋掉陌生人花用 API 費用，不是帳號系統。
- **部署**：用 Docker。`docker compose up -d` 啟動，compose 讀 `.env`，並掛一個 volume 放 log。
- **連線加密**：用 Tailscale。伺服器不對外公開，只有自己的裝置連得到；iPad 和伺服器都要裝 Tailscale。

## 九、技術選擇總覽

| 項目 | 選擇 |
| --- | --- |
| 平台 | iPad |
| 架構 | Client-Server |
| 前端 | Swift + SwiftUI + PencilKit |
| 後端語言 | TypeScript |
| 後端執行環境 | Bun |
| AI 框架 | pi-agent-core（含工具） |
| 語音轉文字 | 伺服器接外部 STT API |
| 溝通方式 | RESTful API（JSON），AI 生成可用 SSE 串流 |
| 輸出格式 | Typed block（`kind` + `data`） |
| AI 模型 | 單一多模態模型，透過 API 呼叫 |
| 資料儲存 | 本機 |
| 帳號 | 不做，開源自行架設 |
| 存取控制 | 一個共用的 access token |
| 部署 | Docker + Tailscale |
