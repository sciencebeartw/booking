# 山熊科學劃位系統 (V36.5)

本專案為山熊科學實體教室專用的旗艦級劃位與試聽管理系統，專為應對高併發流量與自動化行政流程設計。

### 🚀 主要功能
- **正式課程劃位 (Regular Booking)**：
  - 金融級「原子鎖」即時確保位子不超賣。
  - 獨家「90秒填表保護期」，解決家長填表時座位被搶走的痛點。
  - 毫秒級精準自動候補名單排序。
- **試聽活動報名 (Trial Registration)**：
  - AI 智能分發引擎（支援單場、多梯次志願、雙科配課模式）。
  - secureToken 防外掛預填機制。
  - 上帝模式手動調整與分發結果一鍵發佈。
- **行政管理指揮中心 (Admin Console)**：
  - **戰情室**：即時座位狀態動態監控 (Monitor)。
  - **財務處**：AI 學費單自動生成與批次下載 (Bills)。
  - **通知中心**：智慧模板與 LINE 通知自動化撰寫。
  - **雲端圖庫**：橫幅產生器與課程封面雲端化管理。

### 🛠️ 技術架構
- **Frontend**: Vanilla JavaScript (ESLint 規範), HTML5, CSS3 (Flexbox/Grid 佈局)
- **Backend**: Google Firebase Realtime Database
- **Auth**: Firebase Google OAuth 2.0 (管理員白名單制度)
- **Security**: Server-Side Time Clock (伺服器校時), reCAPTCHA v2 AI 行為偵測

---
© 2026 山熊科學實驗教室 | 系統開發：Sciencebear Tech Team