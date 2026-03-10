import { db, ref, set, remove, push, update, storage, storageRef, uploadBytes, getDownloadURL, get, auth, signOut } from './firebase-config.js';
import { onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ★★★ 身份驗證與白名單檢查 ★★★
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 檢查是否在白名單內
        // 修正：因為新版 Rules 已經限制只有白名單內的人可以讀取 admins
        // 我們不能再 get 整個 admins 節點 (會遇到 Permission Denied)
        // 改為精準查詢自己的信箱節點 (信箱中的 . 需替換為 , 作為 key)，並加上防呆避免 null 報錯
        const safeEmail = (user.email || '').replace(/\./g, ',');
        try {
            const snapshot = await get(ref(db, `admins/${safeEmail}`));
            if (snapshot.exists()) {
                document.body.style.display = 'block'; // 驗證通過才顯示內容
            } else {
                throw new Error("不在白名單中");
            }
        } catch (error) {
            console.error("驗證失敗:", error);
            alert("權限不足：您的帳號不在管理員白名單中！");
            await signOut(auth);
            window.location.href = "index.html";
        }
    } else {
        // 未登入，踢回首頁
        alert("請先從首頁登入管理員帳號！");
        window.location.href = "index.html";
    }
});

// 綁定登出函數到全域
window.logoutAdmin = async function () {
    try {
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) {
        console.error("登出發生錯誤:", error);
    }
};

// ★★★ 前端 XSS 防護處理 ★★★
window.escapeHTML = function (str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// ★★★ 時間格式化 (含毫秒) ★★★
window.formatTimeWithMs = function (ms, fallback = '') {
    if (!ms) return fallback || '-';
    const d = new Date(ms);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const hr = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const se = String(d.getSeconds()).padStart(2, '0');
    const mss = String(d.getMilliseconds()).padStart(3, '0');
    return `${yr}/${mo}/${da} ${hr}:${mi}:${se}.<span style="color:#aaa;font-size:10px;">${mss}</span>`;
};

// ★★★ 防偷跑與時間校準 ★★★
let serverTimeOffset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
    serverTimeOffset = snap.val() || 0;
});

// ★★★ 防閃爍快照變數 ★★★
let currentCourseListStr = "";
let currentClassSelectorStr = "";
let currentWaitlistSelectorStr = "";

// ★★★ Phase 6 全域變數與模板 ★★★
let lastAllocatedResult = {};    // 最後一次 AI 分發的正取結果
let lastWaitlistByClass = {};    // 最後一次 AI 分發的各班候補

const DEFAULT_TEMPLATES = {
    regular_seat: `🐻 山熊科學 - 劃位成功通知 🐻\n\n{{姓名}} 家長您好：\n恭喜您已順利完成課程劃位！您的專屬座位如下：\n\n{{劃位名單}}\n\n📌 後續我們即將為您開立專屬學費單，請留意訊息並於期限內完成繳費，期待相見！`,
    regular_wait: `🐻 山熊科學 - 候補進度通知 🐻\n\n{{姓名}} 家長您好，為您統整目前的候補進度：\n\n{{候補名單}}\n\n📌 若有家長退費或座位釋出，我們將第一時間依序通知您，請耐心等候，謝謝！`,
    regular_mix: `🐻 山熊科學 - 劃位與候補統整 🐻\n\n{{姓名}} 家長您好，為您統整目前的狀態：\n\n✅ 【已成功劃位】\n{{劃位名單}}\n\n⏳ 【目前候補進度】\n{{候補名單}}\n\n📌 成功劃位之科目我們將開立專屬學費單；候補科目若有座位釋出，將依序第一時間通知您！`,
    trial_seat: `✨ 山熊科學 - 試聽錄取通知 ✨\n\n{{姓名}} 家長您好：\n恭喜您錄取本次試聽活動！您的分發班級如下：\n\n{{劃位名單}}\n\n📌 請保留此訊息作為入場憑證，如有任何問題請隨時聯繫我們！`,
    trial_wait: `✨ 山熊科學 - 試聽候補通知 ✨\n\n{{姓名}} 家長您好：\n本次試聽活動報名熱烈，您目前的候補狀態為：\n\n{{候補名單}}\n\n📌 若有座位釋出，我們將第一時間通知您！`,
    trial_mix: `✨ 山熊科學 - 試聽分發與候補統整 ✨\n\n{{姓名}} 家長您好，為您統整本次試聽分發結果：\n\n✅ 【已錄取班級】\n{{劃位名單}}\n\n⏳ 【目前候補進度】\n{{候補名單}}\n\n📌 錄取班級請保留此訊息作為憑證；候補班級若有釋出將依序通知您！`
};
window.currentTemplates = { ...DEFAULT_TEMPLATES };
let gasWebhookUrl = ""; // 用於發送 LINE 通知

// ==========================================
// 📝 TinyMCE 預設文案模板庫 (Rich Text Templates)
// ==========================================
const HTML_TPL_REGULAR = `
<div style="background-color: #fdf2e9; padding: 20px; border-radius: 10px; border-left: 5px solid #e74c3c; margin-bottom: 20px;">
<h3 style="color: #c0392b; margin-top: 0; font-size: 20px;">🚨 系統安檢與防禦機制 (必讀)</h3>
<ul style="color: #333; line-height: 1.8; font-size: 16px;">
<li><strong>60秒座位鎖</strong>：點擊座位後，系統會為您保留 <strong>60 秒</strong>。只要手動填表且不觸發防護網，60 秒絕對充裕！</li>
<li><strong style="color: #e74c3c;">🚫 絕對避開 LINE 內建瀏覽器</strong>：在 LINE 聊天室直接點開網址，極容易被 Google 判定為高風險而觸發防護網。請務必點擊右上角選單<strong>「以 Safari 或 Chrome (預設瀏覽器) 開啟」</strong>。</li>
<li><strong>降低防護網干擾機率之訣竅</strong>：建議使用平時常用的 Google 帳號登入。請關閉「無痕模式」與廣告攔截器。劃位時建議暫時關閉 WiFi，<strong>改用個人 4G/5G 行動網路</strong>，可提升順暢度。</li>
<li><strong>嚴禁重複劃位</strong>：當日若不慎重複劃位，系統將<span style="background-color: #ffcccc; color: red; padding: 2px 5px; border-radius: 3px;">直接無效化第二個以上的座位</span>。</li>
<li><strong style="color: #d35400;">家有多寶必看（物理分流）</strong>：同一裝置同時僅能保留一席。若需搶兩個班，請務必<strong>使用不同裝置，由家人分頭進行！</strong></li>
</ul>
</div>
<h3 style="color: #2c3e50; border-bottom: 2px dashed #bdc3c7; padding-bottom: 8px;">📝 報名資料填寫規範</h3>
<ul style="color: #555; line-height: 1.8; font-size: 16px;">
<li><strong>學生姓名</strong>：請務必填寫學生真實姓名，切勿使用暱稱，且填寫後系統不開放自改。</li>
<li><strong>家長手機</strong>：請填寫 <span style="color: #27ae60; font-weight: bold;">10 碼正確手機號碼</span>。此號碼將作為日後「查詢訂單」的唯一鑰匙，填錯將無法查詢！若誤填他人姓名或電話號碼，一經系統比對發現，為保障其他家長權益，將直接取消該報名資格。</li>
</ul>
<div style="background-color: #e8f6f3; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
<h4 style="color: #16a085; margin-top: 0; font-size: 18px;">💰 繳費與保留座位流程</h4>
<p style="margin-bottom: 0; color: #333; line-height: 1.6; font-size: 16px;">劃位前請<strong>務必點擊畫面右下角圖示，加入官方 LINE 並傳送學生姓名</strong>以完成家長身分綁定。<br>舊生需確認是否有進行過綁定，才會收到通知哦。<br>劃位完成後，我們將在整理名單後，透過 LINE 回傳劃位成功確認及繳費通知。<br><br>收到通知後，請於 <strong style="color: #d35400;">3 日內</strong> 完成繳費（可現場現金或轉帳）。<br>⚠️ 若逾期未繳且未主動聯繫，系統將自動釋出您的座位給候補同學。</p>
</div>
<h3 style="color: #2c3e50; border-bottom: 2px dashed #bdc3c7; padding-bottom: 8px;">📞 聯絡資訊</h3>
<p style="color: #555; line-height: 1.8; font-size: 16px;"><strong>國中小山熊科學專線：</strong>03-6667360<br><strong>高中部山熊升大專線：</strong>03-6662248<br><strong>官方 LINE 帳號：</strong>請點擊畫面右下角圖示加入（國中小請點綠色「山熊科學」，高中請點藍色「山熊升大」）</p>
`;

const HTML_TPL_TRIAL_BASE = `
<div style="background-color: #fdf2e9; padding: 20px; border-radius: 10px; border-left: 5px solid #e74c3c; margin-bottom: 20px;">
<h3 style="color: #c0392b; margin-top: 0; font-size: 20px;">🚨 系統安檢與防禦機制 (必讀)</h3>
<ul style="color: #333; line-height: 1.8; font-size: 16px;">
<li><strong style="color: #e74c3c;">🚫 絕對避開 LINE 內建瀏覽器</strong>：在 LINE 聊天室直接點開網址，極容易被 Google 判定為高風險而觸發防護網鎖定。請務必點擊右上角選單<strong>「以 Safari 或 Chrome (預設瀏覽器) 開啟」</strong>。</li>
<li><strong>降低防護網干擾機率之訣竅</strong>：請關閉「無痕模式」與廣告攔截器。劃位時建議暫時關閉 WiFi，<strong>改用個人 4G/5G 行動網路</strong>，可提升順暢度。</li>
<li><strong>90秒預先入場</strong>：強烈建議在開放前 90 秒先進入網頁填寫基本資料，時間一到直接按下送出。</li>
</ul>
</div>
<!-- MAGIC_BLOCK -->
<h3 style="color: #2c3e50; border-bottom: 2px dashed #bdc3c7; padding-bottom: 8px;">📝 報名資料填寫規範</h3>
<ul style="color: #555; line-height: 1.8; font-size: 16px;">
<li><strong>學生姓名</strong>：請務必填寫學生真實姓名，切勿使用暱稱。</li>
<li><strong>家長手機</strong>：請填寫 <span style="color: #27ae60; font-weight: bold;">10 碼正確手機號碼</span>。我們將以此號碼發送最終的 <strong>LINE 錄取通知</strong>，填錯將無法收到訊息！</li>
</ul>
<div style="background-color: #e8f6f3; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
<h4 style="color: #16a085; margin-top: 0; font-size: 18px;">📩 後續通知與錄取確認</h4>
<p style="margin-bottom: 0; color: #333; line-height: 1.6; font-size: 16px;">請注意，網頁送出僅代表完成「意願登記」。<br>分發作業完成後，系統將會透過 <strong>山熊科學實驗教室 官方 LINE 帳號</strong> 將【正式錄取通知】或候補進度全自動推播給您。<br><strong style="color: #d35400;">※ 報名前請務必點擊畫面右下角圖示加入官方 LINE，並傳送學生姓名完成綁定！</strong></p>
</div>
<h3 style="color: #2c3e50; border-bottom: 2px dashed #bdc3c7; padding-bottom: 8px;">📞 聯絡資訊</h3>
<p style="color: #555; line-height: 1.8; font-size: 16px;"><strong>山熊科學專線：</strong>03-6667360<br><strong>官方 LINE 帳號：</strong>請點擊畫面右下角綠色「山熊科學」圖示加入</p>
`;

const TRIAL_LOGIC_BLOCKS = {
    "single_session": `<div style="background-color: #f4f6f7; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 5px solid #3498db;"><h4 style="color: #2980b9; margin-top: 0; font-size: 18px;">🎯 排序與候補規則 (單場次模式)</h4><ul style="margin-bottom: 0; color: #444; line-height: 1.6; font-size: 15px;"><li>本活動為單一場次，名額有限。</li><li>系統將嚴格依照您最後按下送出瞬間的<strong>「毫秒時間」</strong>進行排序。</li><li>名額額滿後，後續送出之名單將自動轉入<strong>候補池</strong>，依序遞補。</li></ul></div>`,
    "multi_choice": `<div style="background-color: #f4f6f7; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 5px solid #8e44ad;"><h4 style="color: #8e44ad; margin-top: 0; font-size: 18px;">🎯 志願分發規則 (多梯次模式)</h4><ul style="margin-bottom: 0; color: #444; line-height: 1.6; font-size: 15px;"><li>系統將嚴格依照您按下送出瞬間的<strong>「毫秒時間」</strong>排序，優先滿足早送出者的志願。</li><li><strong>強烈建議多填幾個志願</strong>！若您的第一志願已滿，AI 會瞬間為您安排第二志願，確保您最大的錄取機率。</li></ul></div>`,
    "dual_match": `<div style="background-color: #f4f6f7; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 5px solid #f39c12;"><h4 style="color: #d35400; margin-top: 0; font-size: 18px;">🎯 雙科分發與保底機制 (配課模式)</h4><ul style="margin-bottom: 0; color: #444; line-height: 1.6; font-size: 15px;"><li>若您選擇<strong>「兩科都上，所有時段皆可」</strong>，AI 會優先為您尋找「同一天連上兩科」的時段，減輕接送負擔。</li><li><strong>降級保底：</strong>若雙科皆爆滿，系統會啟動保底機制，先為您搶下其中一科，並將另一科排入優先候補，絕不讓您兩頭空！</li><li><div style="margin-top: 10px; padding: 10px; background-color: #fcf3cf; border: 1px dashed #e67e22; border-radius: 5px;"><strong style="color: #c0392b;">【雙科連動取消規範】</strong><br>由於排課邏輯連動，且座位保證皆為套裝設定，<strong style="color: #c0392b;">若日後須請假或取消，系統僅能「全部同時取消」，無法單獨保留一科！</strong><br>請務必確認選擇彈性選項時，孩子該時段的精神與時間皆能全程參與。</div></li></ul></div>`,
    "waitlist_only": `<div style="background-color: #f4f6f7; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 5px solid #95a5a6;"><h4 style="color: #7f8c8d; margin-top: 0; font-size: 18px;">🎯 意願登記規則 (純候補模式)</h4><ul style="margin-bottom: 0; color: #444; line-height: 1.6; font-size: 15px;"><li>本表單目前僅作為「候補意願登記」使用。</li><li>送出表單後即代表您已進入候補名單，<strong>不代表正式錄取</strong>。</li><li>若後續有座位釋出，或是決定加開班級，我們將依據登記順序主動聯繫您。</li></ul></div>`
};

onValue(ref(db, 'settings/templates'), (snap) => {
    const saved = snap.val() || {};
    window.currentTemplates = { ...DEFAULT_TEMPLATES, ...saved };
    if (document.getElementById('templateEditorArea') && document.getElementById('tab-notify').classList.contains('active')) {
        renderTemplateEditor();
    }
});

onValue(ref(db, 'settings/gasWebhookUrl'), (snap) => {
    gasWebhookUrl = snap.val() || "";
    const input = document.getElementById('setting-gas-webhook');
    if (input) input.value = gasWebhookUrl;
});

tinymce.init({
    selector: '#c_desc, #e_desc',
    plugins: 'image link lists media table code',
    toolbar: 'undo redo | code | fontfamily fontsize | forecolor backcolor | formatselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | image',
    height: 400,
    menubar: true
});

const classrooms = {
    "high_red": { name: "高中紅教室", layout: [["1-1:X", "1-2:X", "_", "1-3", "1-4", "1-5", "_", "1-6", "1-7", "1-8", "_", "1-9:X", "1-10:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8", "_", "2-9", "2-10"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8", "_", "3-9", "3-10"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8", "_", "4-9", "4-10"], ["5-1", "5-2", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "5-8", "_", "5-9", "5-10"], ["6-1", "6-2", "_", "6-3", "6-4", "6-5", "_", "6-6", "6-7", "6-8", "_", "6-9", "6-10"], ["7-1:X", "7-2:X", "_", "7-3:X", "7-4:X", "7-5:X", "_", "7-6:X", "7-7:X", "7-8:X", "_", "7-9:X", "7-10:X"], ["8-1:X", "8-2:X", "_", "8-3:X", "8-4:X", "8-5:X", "_", "8-6:X", "8-7:X", "8-8:X", "_", "_", "DOOR"]] },
    "high_orange": { name: "高中橘教室", layout: [["1-1:X", "1-2:X", "_", "1-3", "1-4", "1-5", "_", "1-6", "1-7", "1-8", "_", "1-9:X", "1-10:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8", "_", "2-9", "2-10"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8", "_", "3-9", "3-10"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8", "_", "4-9", "4-10"], ["5-1", "5-2", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "5-8", "_", "5-9", "5-10"], ["6-1", "6-2", "_", "6-3", "6-4", "6-5", "_", "6-6", "6-7", "6-8", "_", "6-9", "6-10"], ["_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "DOOR"]] },
    "high_green": { name: "高中綠教室", layout: [["1-1:X", "1-2", "_", "1-3", "1-4", "1-5", "_", "1-6:X", "1-7:X", "1-8:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8"], ["5-1", "5-2", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "5-8"], ["6-1:X", "6-2:X", "_", "6-3:X", "6-4:X", "6-5:X", "_", "_", "_", "DOOR"]] },
    "high_yellow": { name: "高中黃教室", layout: [["1-1", "1-2:X", "_", "1-3", "1-4", "1-5", "_", "1-6:X", "1-7:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7"], ["DOOR", "_", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7"], ["_", "_", "_", "5-3:X", "5-4:X", "5-5:X", "_", "5-6:X", "5-7:X"], ["_", "_", "_", "_", "_", "_", "_", "_", "_"]] },
    "high_blue": { name: "高中藍教室", layout: [["1-1:X", "1-2", "_", "1-3", "1-4", "1-5", "_", "1-6:X", "1-7:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7"], ["5-1:X", "5-2:X", "_", "5-3:X", "5-4:X", "_", "_", "5-6:X", "5-7:X"], ["6-1:X", "6-2:X", "_", "_", "DOOR", "_", "_", "_", "_"]] },
    "middle_new_orange": { name: "國中新橘教室", layout: [["1-1:X", "1-2", "_", "1-3", "1-4", "1-5", "_", "1-6", "1-7", "1-8:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8:X"], ["DOOR", "_", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "PILLAR"]] },
    "middle_new_blue": { name: "國中新藍教室", layout: [["1-1", "1-2", "1-3", "_", "1-4", "1-5", "1-6", "1-7:X"], ["2-1", "2-2", "2-3", "_", "2-4", "2-5", "2-6", "2-7:X"], ["3-1", "3-2", "3-3", "_", "3-4", "3-5", "3-6", "3-7:X"], ["4-1", "4-2", "4-3", "_", "4-4", "4-5", "4-6", "4-7:X"], ["5-1", "5-2", "5-3", "_", "5-4", "5-5", "5-6", "5-7:X"], ["6-1:X", "6-2:X", "6-3:X", "_", "6-4:X", "6-5:X", "6-6:X", "6-7:X"], ["7-1:X", "7-2:X", "7-3:X", "_", "7-4:X", "7-5:X", "7-6:X", "7-7:X"], ["DOOR", "_", "_", "_", "_", "_", "_", "_"]] },
    "middle_new_yellow": { name: "國中新黃教室", layout: [["1-1:X", "1-2", "1-3", "_", "1-4", "1-5", "1-6", "_", "1-7", "1-8:X"], ["PILLAR", "2-2", "2-3", "_", "2-4", "2-5", "2-6", "_", "2-7", "2-8:X"], ["3-1:X", "3-2", "3-3", "_", "3-4", "3-5", "3-6", "_", "3-7", "3-8"], ["4-1", "4-2", "4-3", "_", "4-4", "4-5", "4-6", "_", "4-7", "4-8"], ["5-1", "5-2", "5-3", "_", "5-4", "5-5", "5-6", "_", "5-7", "5-8"], ["6-1:X", "6-2", "6-3", "_", "6-4", "6-5", "6-6", "_", "6-7", "6-8"], ["DOOR", "_", "_", "_", "_", "_", "_", "_", "_", "_"]] },
    "middle_new_red": { name: "國中新紅教室", layout: [["1-1", "1-2:X", "1-3", "_", "1-4", "1-5", "1-6", "1-7", "_", "1-8", "1-9:X", "1-10:X"], ["2-1", "2-2", "2-3", "_", "2-4", "2-5", "2-6", "2-7", "_", "2-8", "2-9", "2-10"], ["3-1", "3-2", "3-3", "_", "3-4", "3-5", "3-6", "3-7", "_", "3-8", "3-9", "3-10"], ["DOOR", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_"], ["4-1", "4-2", "4-3", "_", "4-4", "4-5", "4-6", "4-7", "_", "4-8", "4-9", "4-10"], ["5-1", "5-2", "5-3", "_", "5-4", "5-5", "5-6", "5-7", "_", "5-8", "5-9", "5-10"], ["6-1", "6-2", "6-3", "_", "6-4", "6-5", "6-6", "6-7", "_", "6-8", "6-9", "6-10"], ["7-1", "7-2", "7-3", "_", "7-4", "7-5", "7-6", "7-7", "_", "7-8", "7-9", "7-10"], ["8-1:X", "8-2:X", "8-3:X", "_", "8-4:X", "8-5:X", "8-6:X", "8-7:X", "_", "8-8:X", "8-9:X", "8-10:X"]] },
    "middle_big_red": { name: "國中大紅教室", layout: [["1-1:X", "1-2", "_", "1-3", "1-4", "1-5", "_", "1-6", "1-7", "1-8", "_", "1-9", "1-10:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8", "_", "2-9", "2-10"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8", "_", "3-9", "3-10"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8", "_", "4-9", "4-10"], ["5-1", "5-2", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "5-8", "_", "5-9", "5-10"], ["6-1", "6-2", "_", "6-3", "6-4", "6-5", "_", "6-6", "6-7", "6-8", "_", "6-9", "6-10"], ["7-1:X", "7-2:X", "_", "7-3:X", "7-4:X", "7-5:X", "_", "7-6:X", "7-7:X", "7-8:X", "_", "7-9:X", "7-10:X"], ["_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "DOOR"]] },
    "middle_big_orange": { name: "國中大橘教室", layout: [["1-1:X", "1-2:X", "1-3", "_", "1-4", "1-5", "1-6", "_", "1-7", "1-8:X"], ["2-1", "2-2", "2-3", "_", "2-4", "2-5", "2-6", "_", "2-7", "2-8"], ["3-1", "3-2", "3-3", "_", "3-4", "3-5", "3-6", "_", "3-7", "3-8"], ["4-1", "4-2", "4-3", "_", "4-4", "4-5", "4-6", "_", "4-7", "4-8"], ["5-1", "5-2", "5-3", "_", "5-4", "5-5", "5-6", "_", "_", "DOOR"]] },
    "middle_big_green": { name: "國中大綠教室", layout: [["DOOR", "_", "_", "_", "_", "_"], ["1-1", "1-2", "1-3", "_", "1-4", "1-5"], ["2-1", "2-2", "2-3", "_", "2-4", "2-5"], ["3-1", "3-2", "3-3", "_", "3-4", "3-5"], ["PILLAR", "4-2", "4-3", "_", "4-4", "4-5"]] },
    "test_room": { name: "測試專用教室", layout: [["1-1", "1-2"]] }
};

let allBookings = [];
let coursesData = {};
let waitlistData = {};
let seatsData = {};
let waitlistDisplayList = [];
let schoolMap = {};
let printLayouts = {};

let billStudents = [];
let currentBillIndex = -1;

let opCourseId = null;
let opSeatId = null;
let bookingSort = { col: 'time', asc: false };
let waitlistSort = { col: 'timestamp', asc: true };

let currentEditorLayout = [];
let isEditorLocked = false;

window.switchTab = function (tabName) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tabs button').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');
    if (tabName === 'bills') initBillPage();
    if (tabName === 'print') initPrintPage();
    if (tabName === 'trial_events') renderTrialEventsList();
    if (tabName === 'notify') {
        renderTemplateEditor();
        renderRegularCourseCheckboxes();
        populateTrialNotifySelector();
    }
};
window.showCourseForm = function () {
    document.getElementById('courseListView').style.display = 'none';
    document.getElementById('courseFormView').style.display = 'block';
    resetForm();
    resetSeatEditor();
};
window.hideCourseForm = function () { document.getElementById('courseListView').style.display = 'block'; document.getElementById('courseFormView').style.display = 'none'; };

// ★★★ V36.1 更新：預覽圖片時也支援網路圖片 (從圖庫抓回來的) ★★★
window.previewImage = function (input, imgId = 'imgPreview', urlId = 'c_image_url') {
    const img = document.getElementById(imgId);
    const urlInput = document.getElementById(urlId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            img.src = e.target.result;
            img.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
        if (urlInput) urlInput.value = "";
    } else if (typeof input === 'string') {
        img.src = input;
        img.style.display = 'block';
    }
};

const subjectsByGrade = {
    "升小五課程": ["小五邏輯數學"],
    "升小六課程": ["小六資優自然", "小六資優數學"],
    "升國一課程": ["國一自然超前", "國一數學超前", "國一生物", "國一數學"],
    "升國二課程": ["國二理化"],
    "升國三課程": ["國三自然總複習", "國三數學總複習", "國三英文總複習", "國三國文總複習", "國三社會總複習"],
    "升高一課程": ["高一自然（物/化）", "高一粘立物理", "高一周逸化學", "高一黃浩數學", "高一明軒數學", "高一竹中數學", "高一小揚英文"],
    "升高二課程": ["高二粘立物理", "高二周逸化學", "高二黃浩數學", "高二明軒數學", "高二竹中數學", "高二小揚英文"],
    "升高三課程": ["高三粘立物理", "高三周逸化學", "高三黃浩數學", "高三明軒數學", "學測英文", "學測黃浩數學", "學測明軒數學", "學測自然"]
};
// ★★★ 通用自訂下拉 Combobox 系統（取代所有原生 datalist） ★★★
// 靜態選項庫
const TEACHER_OPTIONS = ['白熊老師', '阿喵老師', '小彥老師', '小東老師', '李翔老師', '冠維老師', '小揚老師', '黃道老師', '化鈞老師', 'Nick老師', '周逸老師', '黃浩老師', '小天老師', '富山老師', '黃韋老師', '蕭業老師', '郭序老師', '詩佩老師'];
const CLASS_TYPE_OPTIONS = ['週一班', '週二班', '週三班', '週四班', '週五班', '週一、四班', '週二、五班', '週三、六班', '週六班', '週日班', '週六上午班', '週六下午班', '週六晚上班', '週日上午班', '週日下午班', '週日晚上班'];

// 每個 combobox 的選項陣列（key = inputId）
const _comboboxOptions = {};

function _getComboboxEl(dropdownId) { return document.getElementById(dropdownId); }

function _renderCombobox(dropdownId, options, inputId, onSelect) {
    const dropdown = _getComboboxEl(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = '';
    options.forEach(s => {
        const item = document.createElement('div');
        item.textContent = s;
        item.style.cssText = 'padding:9px 12px; cursor:pointer; font-size:14px; border-bottom:1px solid #f0f0f0; color:#2c3e50;';
        item.addEventListener('mousedown', () => {
            const inp = document.getElementById(inputId);
            if (inp) inp.value = s;
            _getComboboxEl(dropdownId).style.display = 'none';
            if (onSelect) onSelect(s);
        });
        item.addEventListener('mouseenter', () => { item.style.background = '#f0f6ff'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        dropdown.appendChild(item);
    });
}

window.showCombobox = function (inputId, dropdownId) {
    const allOpts = _comboboxOptions[inputId] || [];
    const inp = document.getElementById(inputId);
    const val = inp ? inp.value : '';
    const filtered = allOpts.filter(s => s.toLowerCase().includes(val.toLowerCase()));
    _renderCombobox(dropdownId, filtered.length > 0 ? filtered : allOpts, inputId, _comboboxCallbacks[inputId]);
    const dropdown = _getComboboxEl(dropdownId);
    if (dropdown && allOpts.length > 0) dropdown.style.display = 'block';
};

window.hideCombobox = function (dropdownId) {
    const dropdown = _getComboboxEl(dropdownId);
    if (dropdown) dropdown.style.display = 'none';
};

window.filterCombobox = function (inputId, dropdownId, val) {
    const allOpts = _comboboxOptions[inputId] || [];
    const filtered = allOpts.filter(s => s.toLowerCase().includes(val.toLowerCase()));
    _renderCombobox(dropdownId, filtered.length > 0 ? filtered : allOpts, inputId, _comboboxCallbacks[inputId]);
    const dropdown = _getComboboxEl(dropdownId);
    if (dropdown && allOpts.length > 0) dropdown.style.display = 'block';
};

const _comboboxCallbacks = {};

function initCombobox(inputId, options, onSelect) {
    _comboboxOptions[inputId] = options;
    if (onSelect) _comboboxCallbacks[inputId] = onSelect;
}

// Subject 科目下拉（動態，由 updateSubjects 控制）
let _currentSubjectOptions = [];
window.updateSubjects = function () {
    const grade = document.getElementById('c_grade').value;
    _currentSubjectOptions = subjectsByGrade[grade] || [];
    _comboboxOptions['c_subject'] = _currentSubjectOptions;
    _renderCombobox('subject_dropdown', _currentSubjectOptions, 'c_subject', null);
};
// 保留舊的 show/hide/filter 入口對應 subject（HTML 還參照舊名）
window.showSubjectDropdown = () => window.showCombobox('c_subject', 'subject_dropdown');
window.hideSubjectDropdown = () => window.hideCombobox('subject_dropdown');
window.filterSubjectDropdown = (val) => window.filterCombobox('c_subject', 'subject_dropdown', val);

// 初始化靜態 comboboxes
initCombobox('c_teacher', TEACHER_OPTIONS);
initCombobox('e_teacher', TEACHER_OPTIONS);
initCombobox('c_class_type', CLASS_TYPE_OPTIONS, (val) => {
    // 選完班別自動帶入上課時間（延遲確保 input.value 已填入）
    setTimeout(() => window.autoFillTime(), 0);
});

window.autoFillTime = function () {
    const type = document.getElementById('c_class_type').value;
    const timeInput = document.getElementById('c_time_desc');

    if (type === "週一、四班") {
        timeInput.value = "每週一、四 16:50-18:20";
    } else if (type === "週二、五班") {
        timeInput.value = "每週二、五 16:50-18:20";
    } else if (type === "週三、六班") {
        timeInput.value = "每週三 16:50-18:20 及 每週六 08:30-10:00";
    } else if (type === "週六上午班") {
        timeInput.value = "每週六 09:00-12:00";
    } else if (type === "週六下午班") {
        timeInput.value = "每週六 13:00-16:00";
    } else if (type === "週六晚上班") {
        timeInput.value = "每週六 18:00-21:00";
    } else if (type === "週日上午班") {
        timeInput.value = "每週日 09:00-12:00";
    } else if (type === "週日下午班") {
        timeInput.value = "每週日 13:00-16:00";
    } else if (type === "週日晚上班") {
        timeInput.value = "每週日 18:00-21:00";
    }
    else if (type.includes("週")) {
        const day = type.replace("班", "").replace("週", "每週");
        timeInput.value = `${day} 18:30-21:30`;
    }
};
window.formatPrice = function (input) { let val = input.value.replace(/[^0-9]/g, ''); if (val) input.value = "$" + parseInt(val).toLocaleString(); };
window.formatDate = function (input) { const val = input.value.trim(); if (/^\d{1,2}\/\d{1,2}$/.test(val)) { const [m, d] = val.split('/'); const date = new Date(2026, m - 1, d); const weekDay = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]; const mm = m.padStart(2, '0'); const dd = d.padStart(2, '0'); input.value = `2026/${mm}/${dd} (${weekDay})`; } };

const coursesRef = ref(db, 'courses');
onValue(coursesRef, (snapshot) => {
    coursesData = snapshot.val() || {};
    renderCourseList();
    updateClassSelector();
    updateWaitlistSelector();
    updateDatalists();
    renderClassroomPreview();
});

function updateDatalists() {
    const gradeEl = document.getElementById('c_grade');
    const selectedGrade = gradeEl ? gradeEl.value : '';

    if (selectedGrade && subjectsByGrade[selectedGrade]) {
        // 年級已選 → 用 updateSubjects 更新自訂下拉清單
        window.updateSubjects();
    } else {
        // 未選年級 → 把現有課程科目存入選項陣列（使用者 focus 時才顯示）
        _currentSubjectOptions = [...new Set(Object.values(coursesData).map(c => c.subject).filter(Boolean))];
        _comboboxOptions['c_subject'] = _currentSubjectOptions;
        _renderCombobox('subject_dropdown', _currentSubjectOptions, 'c_subject', null);
    }
}


window.resetSeatEditor = function () {
    if (isEditorLocked) {
        alert("🔒 此課程已有售出紀錄，無法重置座位表！");
        const courseId = document.getElementById('c_id').value;
        if (courseId && coursesData[courseId]) {
            document.getElementById('c_classroom').value = coursesData[courseId].classroom;
        }
        return;
    }

    const classroomType = document.getElementById('c_classroom').value;
    const config = classrooms[classroomType];
    if (!config) return;

    currentEditorLayout = JSON.parse(JSON.stringify(config.layout));
    renderEditorGrid();
};

function renderEditorGrid() {
    const grid = document.getElementById('editorGrid');
    grid.innerHTML = "";

    currentEditorLayout.forEach((row, rIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        row.forEach((code, cIndex) => {
            const seat = document.createElement('div');
            seat.className = 'seat';

            let displayCode = code;
            if (code.includes(':X')) {
                seat.classList.add('blocked');
                displayCode = code.split(':')[0];
            } else if (code === "_") {
                seat.classList.add('aisle');
            } else if (code === "DOOR") {
                seat.classList.add('door');
                seat.textContent = "門";
            } else if (code === "PILLAR") {
                seat.classList.add('pillar');
                seat.textContent = "柱";
            } else {
                seat.textContent = code;
            }

            if (!isEditorLocked) {
                seat.onclick = () => toggleSeatType(rIndex, cIndex);
            } else {
                seat.style.cursor = "not-allowed";
                seat.style.opacity = "0.7";
            }

            rowDiv.appendChild(seat);
        });
        grid.appendChild(rowDiv);
    });
}

function toggleSeatType(r, c) {
    const currentCode = currentEditorLayout[r][c];
    let newCode = currentCode;

    if (currentCode === "_") {
        const classroomType = document.getElementById('c_classroom').value;
        const originalCode = classrooms[classroomType].layout[r][c];
        const baseId = (originalCode === "_" || originalCode === "DOOR" || originalCode === "PILLAR") ? `${r + 1}-${c + 1}` : originalCode.split(':')[0];
        newCode = `${baseId}:X`;
    }
    else if (currentCode.includes(":X")) {
        newCode = "PILLAR";
    }
    else if (currentCode === "PILLAR") {
        newCode = "DOOR";
    }
    else if (currentCode === "DOOR") {
        const classroomType = document.getElementById('c_classroom').value;
        const originalCode = classrooms[classroomType].layout[r][c];
        const baseId = (originalCode === "_" || originalCode === "DOOR" || originalCode === "PILLAR") ? `${r + 1}-${c + 1}` : originalCode.split(':')[0];
        newCode = baseId;
    }
    else {
        newCode = "_";
    }

    currentEditorLayout[r][c] = newCode;
    renderEditorGrid();
}

window.autoFillPhaseTimes = function (phase) {
    const dateStr = document.getElementById(`c_phase${phase}_date`).value;
    if (!dateStr) return;
    const prefix = phase === '1' ? 'c_' : `c_t${phase}_`;
    document.getElementById(`${prefix}start1`).value = `${dateStr}T19:00`;
    document.getElementById(`${prefix}end1`).value = `${dateStr}T20:00`;
    document.getElementById(`${prefix}start2`).value = `${dateStr}T21:00`;
    document.getElementById(`${prefix}end2`).value = `${dateStr}T22:00`;
};


window.saveCourse = async function () {
    const btn = document.getElementById('btnSave');
    btn.disabled = true;
    btn.textContent = "處理中...";

    const id = document.getElementById('c_id').value;

    try {
        const descContent = tinymce.get('c_desc').getContent();
        const grade = document.getElementById('c_grade').value;
        const subject = document.getElementById('c_subject').value;
        const classType = document.getElementById('c_class_type').value;
        const teacher = document.getElementById('c_teacher').value;
        const classroom = document.getElementById('c_classroom').value;

        const phase1Date = document.getElementById('c_phase1_date').value;
        const phase1Text = document.getElementById('c_phase1_text') ? document.getElementById('c_phase1_text').value : '';
        const start1 = document.getElementById('c_start1').value;
        const end1 = document.getElementById('c_end1').value;
        const start2 = document.getElementById('c_start2').value;
        const end2 = document.getElementById('c_end2').value;

        const phase2Date = document.getElementById('c_phase2_date').value;
        const phase2Text = document.getElementById('c_phase2_text').value;
        const t2_start1 = document.getElementById('c_t2_start1').value;
        const t2_end1 = document.getElementById('c_t2_end1').value;
        const t2_start2 = document.getElementById('c_t2_start2').value;
        const t2_end2 = document.getElementById('c_t2_end2').value;

        const phase3Date = document.getElementById('c_phase3_date').value;
        const phase3Text = document.getElementById('c_phase3_text').value;
        const t3_start1 = document.getElementById('c_t3_start1').value;
        const t3_end1 = document.getElementById('c_t3_end1').value;
        const t3_start2 = document.getElementById('c_t3_start2').value;
        const t3_end2 = document.getElementById('c_t3_end2').value;

        const price = document.getElementById('c_price').value;
        const lessons = document.getElementById('c_lessons').value;
        const timeDesc = document.getElementById('c_time_desc').value;
        const startDate = document.getElementById('c_start_date').value;
        const displayStart = document.getElementById('c_display_start').value;
        const displayEnd = document.getElementById('c_display_end').value;
        const fileInput = document.getElementById('c_image_file');
        const oldImageUrl = document.getElementById('c_image_url').value;

        const waitlistEnabled = document.getElementById('c_waitlist_enabled').checked;
        const waitlistLimit = document.getElementById('c_waitlist_limit').value;

        if (!grade || !subject || !start1) throw new Error("請填寫完整資料！");

        let totalSeats = 0;
        currentEditorLayout.forEach(row => {
            row.forEach(seatCode => {
                if (seatCode !== "_" && seatCode !== "DOOR" && seatCode !== "PILLAR" && !seatCode.includes(":X")) {
                    totalSeats++;
                }
            });
        });

        let imageUrl = oldImageUrl || "https://via.placeholder.com/400x200?text=No+Image";
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const storagePath = `course_images/${Date.now()}_${file.name}`;
            const imgRef = storageRef(storage, storagePath);
            document.getElementById('uploadStatus').textContent = "上傳圖片中...";
            const metadata = { contentType: file.type };
            await uploadBytes(imgRef, file, metadata);
            imageUrl = await getDownloadURL(imgRef);
        }

        const courseData = {
            grade, subject, classType, teacher, classroom,
            phase1Date, phase1Text, start1, end1, start2, end2,
            phase2Date, phase2Text, t2_start1, t2_end1, t2_start2, t2_end2,
            phase3Date, phase3Text, t3_start1, t3_end1, t3_start2, t3_end2,
            price, lessons,
            timeDescription: timeDesc, startDate: startDate,
            displayStart, displayEnd, desc: descContent,
            image: imageUrl, updatedAt: Date.now(),
            waitlistEnabled: waitlistEnabled,
            waitlistLimit: parseInt(waitlistLimit) || 0,
            totalSeats: totalSeats,
            layout: currentEditorLayout
        };

        let courseId = id;
        if (id) {
            await update(ref(db, `courses/${id}`), courseData);
            alert("✅ 課程更新成功！座位表已同步更新。");
        } else {
            const newRef = push(coursesRef);
            courseId = newRef.key;
            courseData.createdAt = Date.now();
            await set(newRef, courseData);
            alert("✅ 課程新增成功！座位表已建立。");
        }

        const start1Time = start1 ? new Date(start1).getTime() : 9999999999999;
        const end1Time = end1 ? new Date(end1).getTime() : 9999999999999;
        const start2Time = start2 ? new Date(start2).getTime() : 9999999999999;
        const end2Time = end2 ? new Date(end2).getTime() : 9999999999999;

        const t2_start1Time = t2_start1 ? new Date(t2_start1).getTime() : 9999999999999;
        const t2_end1Time = t2_end1 ? new Date(t2_end1).getTime() : 9999999999999;
        const t2_start2Time = t2_start2 ? new Date(t2_start2).getTime() : 9999999999999;
        const t2_end2Time = t2_end2 ? new Date(t2_end2).getTime() : 9999999999999;

        const t3_start1Time = t3_start1 ? new Date(t3_start1).getTime() : 9999999999999;
        const t3_end1Time = t3_end1 ? new Date(t3_end1).getTime() : 9999999999999;
        const t3_start2Time = t3_start2 ? new Date(t3_start2).getTime() : 9999999999999;
        const t3_end2Time = t3_end2 ? new Date(t3_end2).getTime() : 9999999999999;

        await set(ref(db, `seats/${courseId}/_settings`), {
            start1: start1Time, end1: end1Time, start2: start2Time, end2: end2Time,
            t2_start1: t2_start1Time, t2_end1: t2_end1Time, t2_start2: t2_start2Time, t2_end2: t2_end2Time,
            t3_start1: t3_start1Time, t3_end1: t3_end1Time, t3_start2: t3_start2Time, t3_end2: t3_end2Time
        });

        hideCourseForm();

    } catch (err) {
        alert("錯誤：" + err.message);
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = id ? "確認更新課程" : "確認新增課程";
    }
};

window.editCourse = function (key) {
    const c = coursesData[key];
    showCourseForm();
    document.getElementById('formTitle').textContent = "✏️ 編輯課程";
    document.getElementById('btnSave').textContent = "確認更新課程";

    document.getElementById('c_id').value = key;
    document.getElementById('c_grade').value = c.grade;
    document.getElementById('c_subject').value = c.subject;
    document.getElementById('c_class_type').value = c.classType || "";
    document.getElementById('c_teacher').value = c.teacher;
    document.getElementById('c_classroom').value = c.classroom;

    document.getElementById('c_phase1_date').value = c.phase1Date || "";
    if (document.getElementById('c_phase1_text')) document.getElementById('c_phase1_text').value = c.phase1Text || "";
    document.getElementById('c_start1').value = c.start1 || "";
    document.getElementById('c_end1').value = c.end1 || "";
    document.getElementById('c_start2').value = c.start2 || "";
    document.getElementById('c_end2').value = c.end2 || "";

    document.getElementById('c_phase2_date').value = c.phase2Date || "";
    document.getElementById('c_phase2_text').value = c.phase2Text || "";
    document.getElementById('c_t2_start1').value = c.t2_start1 || "";
    document.getElementById('c_t2_end1').value = c.t2_end1 || "";
    document.getElementById('c_t2_start2').value = c.t2_start2 || "";
    document.getElementById('c_t2_end2').value = c.t2_end2 || "";

    document.getElementById('c_phase3_date').value = c.phase3Date || "";
    document.getElementById('c_phase3_text').value = c.phase3Text || "";
    document.getElementById('c_t3_start1').value = c.t3_start1 || "";
    document.getElementById('c_t3_end1').value = c.t3_end1 || "";
    document.getElementById('c_t3_start2').value = c.t3_start2 || "";
    document.getElementById('c_t3_end2').value = c.t3_end2 || "";

    document.getElementById('c_price').value = c.price;
    document.getElementById('c_lessons').value = c.lessons || "12";
    document.getElementById('c_time_desc').value = c.timeDescription || "";
    document.getElementById('c_start_date').value = c.startDate || "";
    document.getElementById('c_display_start').value = c.displayStart || "";
    document.getElementById('c_display_end').value = c.displayEnd || "";

    document.getElementById('c_image_url').value = c.image;
    window.previewImage(c.image, 'imgPreview', 'c_image_url');

    document.getElementById('c_waitlist_enabled').checked = c.waitlistEnabled || false;
    document.getElementById('c_waitlist_limit').value = c.waitlistLimit || 0;

    tinymce.get('c_desc').setContent(c.desc);

    const courseSeats = seatsData[key] || {};
    let hasSold = false;
    Object.values(courseSeats).forEach(s => {
        if (s.status === 'sold') hasSold = true;
    });

    isEditorLocked = hasSold;
    const lockMsg = document.getElementById('editorLockMsg');
    const classroomSelect = document.getElementById('c_classroom');

    if (hasSold) {
        lockMsg.style.display = 'block';
        classroomSelect.disabled = true;
    } else {
        lockMsg.style.display = 'none';
        classroomSelect.disabled = false;
    }

    if (c.layout) {
        currentEditorLayout = JSON.parse(JSON.stringify(c.layout));
    } else {
        const config = classrooms[c.classroom];
        if (config) {
            currentEditorLayout = JSON.parse(JSON.stringify(config.layout));
        }
    }
    renderEditorGrid();
};

window.resetForm = function () {
    document.getElementById('formTitle').textContent = "➕ 新增課程";
    document.getElementById('btnSave').textContent = "確認新增課程";
    document.querySelectorAll('input:not([type="password"])').forEach(i => i.value = '');
    document.getElementById('c_lessons').value = "12";
    document.getElementById('c_price').value = "21600";
    document.getElementById('c_waitlist_enabled').checked = false;
    document.getElementById('c_waitlist_limit').value = "0";

    // ★★★ 核心修改：載入正式課程預設完美版文案 ★★★
    if (tinymce.get('c_desc')) {
        tinymce.get('c_desc').setContent(HTML_TPL_REGULAR);
    }

    document.getElementById('uploadStatus').textContent = "";
    document.getElementById('imgPreview').style.display = 'none';

    isEditorLocked = false;
    document.getElementById('editorLockMsg').style.display = 'none';
    document.getElementById('c_classroom').disabled = false;
};

function renderCourseList() {
    const newDataStr = JSON.stringify(coursesData);
    if (currentCourseListStr === newDataStr) return;
    currentCourseListStr = newDataStr;

    const listDiv = document.getElementById('courseList');
    listDiv.innerHTML = "";

    // ★ 依 sortOrder 由小到大排序序️
    const sortedKeys = Object.keys(coursesData).sort((a, b) => {
        const soA = coursesData[a].sortOrder !== undefined ? coursesData[a].sortOrder : 999999;
        const soB = coursesData[b].sortOrder !== undefined ? coursesData[b].sortOrder : 999999;
        return soA - soB;
    });

    sortedKeys.forEach(key => {
        const c = coursesData[key];

        // 計算課程目前狀態燈號
        const now = Date.now() + serverTimeOffset;
        let statusLight = '';

        if (c.isTrialEvent) {
            // --- 試聽活動邏輯 (同步自 index.html) ---
            const trialStart = c.start1 ? new Date(c.start1).getTime() : 0;
            const trialEarlyStart = trialStart - (parseInt(c.earlyAccessSec) || 0) * 1000;
            const trialEnd = c.closeTime ? new Date(c.closeTime).getTime() : 9999999999999;

            if (c.forceClosed || now >= trialEnd) {
                statusLight = `<span style="color:#e74c3c; font-weight:bold;">🔴 報名已結束</span>`;
            } else if (now < trialEarlyStart) {
                statusLight = `<span style="color:#95a5a6; font-weight:bold;">⚪ 尚未開放</span>`;
            } else if (now >= trialEarlyStart && now < trialEnd) {
                statusLight = now < trialStart ? `<span style="color:#2ecc71; font-weight:bold;">🟢 即將開放</span>` : `<span style="color:#2ecc71; font-weight:bold;">🟢 開放報名中</span>`;
            } else {
                statusLight = `<span style="color:#95a5a6; font-weight:bold;">⚪ 尚未開放</span>`;
            }
        } else {
            // --- 常規課程邏輯 (使用 seats/_settings 數字時間戳) ---
            const st = (seatsData[key] && seatsData[key]['_settings']) || {};
            const pT = (v, str) => v || (str ? new Date(str).getTime() : null);
            const allPhases = [
                { s1: pT(st.start1, c.start1), e1: pT(st.end1, c.end1), s2: pT(st.start2, c.start2), e2: pT(st.end2, c.end2) },
                { s1: pT(st.t2_start1, c.t2_start1), e1: pT(st.t2_end1, c.t2_end1), s2: pT(st.t2_start2, c.t2_start2), e2: pT(st.t2_end2, c.t2_end2) },
                { s1: pT(st.t3_start1, c.t3_start1), e1: pT(st.t3_end1, c.t3_end1), s2: pT(st.t3_start2, c.t3_start2), e2: pT(st.t3_end2, c.t3_end2) }
            ].filter(p => p.s1);

            let foundActive = false;
            let latestEnd = 0;
            for (let i = 0; i < allPhases.length; i++) {
                const p = allPhases[i];
                const hasS2 = p.s2 && p.s2 < 9999999999999;
                const phaseEnd = hasS2 ? (p.e2 || 9999999999999) : (p.e1 || 9999999999999);
                if (phaseEnd > latestEnd) latestEnd = phaseEnd;
                if (now >= p.s1 && (!p.e1 || now < p.e1)) { statusLight = `<span style="color:#2ecc71; font-weight:bold;">🟢 開放劃位中</span>`; foundActive = true; break; }
                if (hasS2 && now >= p.e1 && now < p.s2) { statusLight = `<span style="color:#f39c12; font-weight:bold;">🟡 座位整理中</span>`; foundActive = true; break; }
                if (hasS2 && now >= p.s2 && (!p.e2 || now < p.e2)) { statusLight = `<span style="color:#2ecc71; font-weight:bold;">🟢 開放劃位中</span>`; foundActive = true; break; }
                if (i < allPhases.length - 1 && allPhases[i + 1].s1 && now >= phaseEnd && now < allPhases[i + 1].s1) { statusLight = `<span style="color:#95a5a6; font-weight:bold;">⚪ 等待下一梯次</span>`; foundActive = true; break; }
            }
            if (!foundActive) {
                const firstStart = allPhases.length > 0 ? allPhases[0].s1 : null;
                if (!firstStart || now < firstStart) statusLight = `<span style="color:#95a5a6; font-weight:bold;">⚪ 尚未開放</span>`;
                else statusLight = `<span style="color:#e74c3c; font-weight:bold;">🔴 劃位已結束</span>`;
            }
        }

        const card = document.createElement('div');
        card.className = 'admin-course-card';
        card.dataset.id = key;
        card.onclick = (e) => { if (!e.target.classList.contains('btn-delete') && !e.target.classList.contains('drag-handle')) editCourse(key); };
        card.innerHTML = `
                    <div class="drag-handle" title="拖曳排序" style="position:absolute; top:8px; left:8px; font-size:18px; color:#bdc3c7; cursor:grab; z-index:10; line-height:1; user-select:none;">☰</div>
                    <div class="card-thumb" style="background-image: url('${c.image}');"></div>
                    <div class="card-content">
                        <h3>[${c.grade}] ${c.subject} ${c.classType || ''}</h3>
                        <p>👨‍🏫 ${c.teacher} | ⏰ ${c.timeDescription || '-'}</p>
                        <p>${statusLight}</p>
                    </div>
                    <button class="btn-delete" onclick="window.deleteCourse('${key}', event)">刪除</button>
                `;
        listDiv.appendChild(card);
    });

    // ★ 初始化 SortableJS（每次重新 render 都重新綁定）
    if (window.Sortable) {
        if (listDiv._sortable) listDiv._sortable.destroy();
        listDiv._sortable = new Sortable(listDiv, {
            animation: 200,
            handle: '.drag-handle',
            onEnd: function () {
                const updates = {};
                Array.from(listDiv.children).forEach((el, index) => {
                    const id = el.dataset.id;
                    if (id) updates[`courses/${id}/sortOrder`] = index;
                });
                update(ref(db), updates).then(() => {
                    Swal.fire({ icon: 'success', title: '排序已儲存', timer: 1500, showConfirmButton: false });
                }).catch(err => Swal.fire('錯誤', '儲存排序失敗：' + err.message, 'error'));
            }
        });
    }
}

window.deleteCourse = async function (courseId, event) {
    if (event) event.stopPropagation();
    if (confirm("⚠️ 確定要刪除此課程？\n\n注意：這將會連帶徹底清除該課程的所有「劃位紀錄」、「候補名單」與「歷史釋出紀錄」，且無法復原！")) {
        const updates = {};
        updates[`courses/${courseId}`] = null;
        updates[`seats/${courseId}`] = null;
        updates[`waitlist/${courseId}`] = null;
        updates[`archived_seats/${courseId}`] = null;

        try {
            await update(ref(db), updates);
            alert("✅ 課程設定及其所有相關報名資料已徹底清除乾淨！");
        } catch (e) {
            alert("❌ 刪除失敗：" + e.message);
        }
    }
};

// ★★★ 機器人防禦網監控 (Bot Monitor) ★★★
const botWarningsBookingRef = ref(db, 'bot-warnings/booking_enter');
const botWarningsTrialRef = ref(db, 'bot-warnings/trial_enter');

function renderBotTable(snapshot, tableId, typeLabel) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    tbody.innerHTML = '';
    const data = snapshot.val() || {};

    // 轉為陣列並以時間反序排列 (最新的在最上面)
    const list = Object.keys(data).map(key => ({ key, ...data[key] })).sort((a, b) => b.timestamp - a.timestamp);

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#95a5a6;">尚無異常紀錄</td></tr>`;
        return;
    }

    list.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #eee";

        const timeStr = window.formatTimeWithMs(item.timestamp);
        let emailStr = item.email || item.uid || '未知';
        if (item.studentName) {
            emailStr = `${emailStr} <br><span style="font-size:11px; color:#3498db;">(學生：${window.escapeHTML(item.studentName)})</span>`;
        }

        let targetStr = item.targetId || '-';
        if (typeLabel === 'booking') {
            const course = coursesData[item.targetId];
            if (course) {
                targetStr = `[${course.grade}] ${course.subject} ${course.classType || ''}`;
            }
        }

        const penaltyStr = item.penaltySeconds ? `<span style="background:#e74c3c; color:white; padding:2px 6px; border-radius:4px; font-size:12px;">延遲 ${item.penaltySeconds} 秒</span>` : '-';

        tr.innerHTML = `
            <td style="padding:8px; font-size:13px; color:#555;">${timeStr}</td>
            <td style="padding:8px; font-size:13px; font-weight:bold;">${emailStr}</td>
            <td style="padding:8px; font-size:13px; color:#444;">${window.escapeHTML(targetStr)}</td>
            <td style="padding:8px; font-size:13px;">${penaltyStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

onValue(botWarningsBookingRef, (snapshot) => {
    renderBotTable(snapshot, 'botTableBooking', 'booking');
});

onValue(botWarningsTrialRef, (snapshot) => {
    renderBotTable(snapshot, 'botTableTrial', 'trial');
});

let archivedSeatsData = {};
const allSeatsRef = ref(db, 'seats');
const archivedSeatsRef = ref(db, 'archived_seats');

function buildAllBookings() {
    allBookings = [];

    // 爬梳現有座位
    Object.keys(seatsData).forEach(courseId => {
        const seats = seatsData[courseId];
        const c = coursesData[courseId];
        const courseName = c ? `[${c.grade}] ${c.subject} ${c.classType || ''}` : courseId;
        Object.keys(seats).forEach(seatId => {
            if (seatId === '_settings') return;
            const info = seats[seatId];
            if (info.status === 'sold' || info.status === 'locked' || info.status === 'deleted') {
                allBookings.push({
                    courseId, courseName, seatId, status: info.status,
                    studentName: info.studentName || '-', parentPhone: info.parentPhone || '-',
                    isOldStudent: info.isOldStudent || '-',
                    userEmail: info.userEmail || '-',
                    time: info.soldTime || '-', rawTime: info.timestamp,
                    orderId: info.orderId || '-'
                });
            }
        });
    });

    // 爬梳封存座位(釋出)
    Object.keys(archivedSeatsData).forEach(courseId => {
        const archived = archivedSeatsData[courseId];
        const c = coursesData[courseId];
        const courseName = c ? `[${c.grade}] ${c.subject} ${c.classType || ''}` : courseId;
        Object.keys(archived).forEach(archiveKey => {
            const info = archived[archiveKey];
            allBookings.push({
                courseId, courseName, seatId: info.originalSeatId || '-', status: 'deleted',
                studentName: info.studentName || '-', parentPhone: info.parentPhone || '-',
                isOldStudent: info.isOldStudent || '-',
                userEmail: info.userEmail || '-',
                time: info.soldTime || '-', rawTime: info.timestamp,
                orderId: info.orderId || '-', archiveKey: archiveKey
            });
        });
    });

    renderTable();
    updateStats();
    loadVisualMap();
}

onValue(allSeatsRef, (snapshot) => {
    seatsData = snapshot.val() || {};
    buildAllBookings();
});

onValue(archivedSeatsRef, (snapshot) => {
    archivedSeatsData = snapshot.val() || {};
    buildAllBookings();
});

window.sortBookingTable = function (col) {
    if (bookingSort.col === col) bookingSort.asc = !bookingSort.asc;
    else { bookingSort.col = col; bookingSort.asc = true; }
    renderTable();
};

window.applyAdvancedFilters = function() {
    renderTable();
};

window.clearAdvancedFilters = function() {
    if(document.getElementById('filter_status')) document.getElementById('filter_status').value = '';
    if(document.getElementById('filter_seatId')) document.getElementById('filter_seatId').value = '';
    if(document.getElementById('filter_studentName')) document.getElementById('filter_studentName').value = '';
    if(document.getElementById('filter_parentPhone')) document.getElementById('filter_parentPhone').value = '';
    if(document.getElementById('filter_isOldStudent')) document.getElementById('filter_isOldStudent').value = '';
    if(document.getElementById('filter_userEmail')) document.getElementById('filter_userEmail').value = '';
    renderTable();
};

function renderTable() {
    const searchText = document.getElementById('searchInput').value.trim().toLowerCase();
    
    // 進階過濾欄位
    const filterStatus = document.getElementById('filter_status') ? document.getElementById('filter_status').value : '';
    const filterSeat = document.getElementById('filter_seatId') ? document.getElementById('filter_seatId').value : '';
    const filterName = document.getElementById('filter_studentName') ? document.getElementById('filter_studentName').value.trim().toLowerCase() : '';
    const filterPhone = document.getElementById('filter_parentPhone') ? document.getElementById('filter_parentPhone').value.trim().toLowerCase() : '';
    const filterIsOldStudent = document.getElementById('filter_isOldStudent') ? document.getElementById('filter_isOldStudent').value : '';
    const filterEmail = document.getElementById('filter_userEmail') ? document.getElementById('filter_userEmail').value.trim().toLowerCase() : '';
    
    const tbody = document.getElementById('bookingTable');
    tbody.innerHTML = "";

    let displayList = allBookings.filter(b => {
        // 班級過濾：如果有多選班級，只顯示選中的班級；如果都沒選，預設顯示全部。
        if (currentSelectedClasses.length > 0 && !currentSelectedClasses.includes(b.courseId)) return false;
        
        // 全域搜尋過濾
        if (searchText && !b.studentName.toLowerCase().includes(searchText) && !b.parentPhone.includes(searchText) && !b.orderId.toLowerCase().includes(searchText)) return false;
        
        // 進階欄位過濾
        if (filterStatus && b.status !== filterStatus) return false;
        if (filterSeat && b.seatId !== filterSeat) return false;
        if (filterName && !b.studentName.toLowerCase().includes(filterName)) return false;
        if (filterPhone && !b.parentPhone.includes(filterPhone)) return false;
        if (filterIsOldStudent && b.isOldStudent !== filterIsOldStudent) return false;
        if (filterEmail && !b.userEmail.toLowerCase().includes(filterEmail)) return false;

        return true;
    });

    displayList.sort((a, b) => {
        let valA = a[bookingSort.col] || '';
        let valB = b[bookingSort.col] || '';
        if (bookingSort.col === 'time') {
            valA = a.rawTime || Date.parse(a.time) || 0;
            valB = b.rawTime || Date.parse(b.time) || 0;
        }
        if (valA < valB) return bookingSort.asc ? -1 : 1;
        if (valA > valB) return bookingSort.asc ? 1 : -1;
        return 0;
    });

    const nameCounts = {};
    // ✅ 新增邏輯：跨班級抓取重複報名的學生，只要是 sold 都計數
    displayList.forEach(b => {
        if (b.status === 'sold') {
            // 如果是多選班級，我們計算「名字出現幾次」來抓出同時報名多班的家長
            // 否則，同一班級內通常不允許名字重複，但可以維持原本邏輯加上 courseId
            const countKey = currentSelectedClasses.length > 1 ? b.studentName : (b.courseId + '_' + b.studentName);
            nameCounts[countKey] = (nameCounts[countKey] || 0) + 1;
        }
    });

    // 動態重複調色盤：用名字算出專屬背景色，保證同一人顏色一樣，不同群組顏色不同。
    const duplicatePalette = ['#ffe6e6', '#e6f2ff', '#e6ffe6', '#fffada', '#f2e6ff', '#ffebe6'];
    const getColorForName = (name) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return duplicatePalette[Math.abs(hash) % duplicatePalette.length];
    };

    displayList.forEach(b => {
        const tr = document.createElement('tr');
        let statusBadge = '';
        let btnText = '釋出';
        let btnClass = 'danger';

        let recoverBtnHtml = '';
        if (b.status === 'sold') {
            statusBadge = '<span class="badge sold">已劃位</span>';
            const countKey = currentSelectedClasses.length > 1 ? b.studentName : (b.courseId + '_' + b.studentName);
            
            if (nameCounts[countKey] > 1) {
                // 如果是多個班級且偵測到重複，使用高亮黃色並加上粗體提示，否則使用預設調色盤
                if (currentSelectedClasses.length > 1) {
                    tr.style.backgroundColor = '#fff3cd'; // 醒目的黃底色
                    tr.style.fontWeight = 'bold';
                    tr.style.border = '2px solid #ffeeba';
                } else {
                    const rowColor = getColorForName(b.studentName);
                    tr.style.backgroundColor = rowColor;
                }
            }
        } else if (b.status === 'locked') {
            statusBadge = '<span class="badge locked">填寫中</span>';
        } else if (b.status === 'deleted') {
            statusBadge = '<span class="badge deleted">已釋出</span>';
            tr.classList.add('row-deleted');
            btnText = '永久刪除';
            btnClass = 'dark';
            recoverBtnHtml = `<button class="success" style="padding:5px 10px; font-size:12px; margin-right:5px;" onclick="window.recoverSeat('${b.courseId}', '${b.seatId}', '${b.studentName}', '${b.archiveKey || ""}')">恢復劃位</button>`;
        }

        tr.innerHTML = `<td>${b.orderId}</td><td class=\"wrap-text\">${b.courseName}</td><td>${window.formatTimeWithMs(b.rawTime, b.time)}</td><td>${statusBadge}</td><td>${b.seatId}</td><td>${window.escapeHTML(b.studentName)}</td><td>${window.escapeHTML(b.parentPhone)}</td><td>${window.escapeHTML(b.isOldStudent || '-')}</td><td>${window.escapeHTML(b.userEmail)}</td>
                <td>
                    ${recoverBtnHtml}
                    <button class="warning" style="padding:5px 10px; font-size:12px;" onclick="window.editOrder('${b.courseId}', '${b.seatId}', '${b.parentPhone}', '${b.orderId}', '${b.studentName}')">編輯</button>
                    <button class="${btnClass}" style="padding:5px 10px; font-size:12px;" onclick="window.releaseSeat('${b.courseId}', '${b.seatId}', '${b.status}', '${b.archiveKey || ""}')">${btnText}</button>
                </td>`;
        tbody.appendChild(tr);
    });
    
    populateAdvancedFilters(allBookings.filter(b => {
        // 更新過濾選項內容時，只看目前選中的班級
        if (currentSelectedClasses.length > 0 && !currentSelectedClasses.includes(b.courseId)) return false;
        if (searchText && !b.studentName.toLowerCase().includes(searchText) && !b.parentPhone.includes(searchText) && !b.orderId.toLowerCase().includes(searchText)) return false;
        return true;
    }));
}

function populateAdvancedFilters(list) {
    const filterSeat = document.getElementById('filter_seat');
    const currentSeatSel = filterSeat.value;
    
    const uniqueSeats = [...new Set(list.map(b => b.seatId))].filter(Boolean).sort();
    
    filterSeat.innerHTML = '<option value="">(全部)</option>';
    uniqueSeats.forEach(seat => {
        filterSeat.innerHTML += `<option value="${seat}">${seat}</option>`;
    });
    
    if (uniqueSeats.includes(currentSeatSel)) {
        filterSeat.value = currentSeatSel;
    }
}

window.loadVisualMap = function () {
    const mapContainer = document.getElementById('visualMap');
    const mapContent = document.getElementById('mapContent');

    // 視覺地圖只在「剛好選取 1 個班級」的時候才會正常顯示圖形！
    // 多選的時候我們就把地圖隱藏，因為教室座位不相容！
    if (currentSelectedClasses.length !== 1 || !coursesData[currentSelectedClasses[0]]) {
        mapContainer.style.display = 'none';
        return;
    }

    const courseId = currentSelectedClasses[0];
    mapContainer.style.display = 'block';
    mapContent.innerHTML = "";


    const c = coursesData[courseId];
    let layoutToRender = [];

    if (c.layout) {
        layoutToRender = c.layout;
    } else {
        const config = classrooms[c.classroom];
        if (config) layoutToRender = config.layout;
    }

    const currentSeats = seatsData[courseId] || {};

    // 取得是否有開啟姓名顯示的狀態
    const isShowingNames = window.isSeatNameVisible || false;

    if (layoutToRender && layoutToRender.length > 0) {
        layoutToRender.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'row';
            row.forEach(seatCode => {
                const seat = document.createElement('div');
                seat.className = 'seat';
                let code = seatCode;
                let isBlocked = false;
                if (seatCode.includes(':X')) { code = seatCode.split(':')[0]; isBlocked = true; }

                if (code === "_") seat.classList.add('aisle');
                else if (code === "DOOR") { seat.textContent = "門"; seat.classList.add('aisle'); }
                else if (code === "PILLAR") { seat.textContent = "柱"; seat.classList.add('aisle'); }
                else if (isBlocked) {
                    seat.classList.add('blocked');
                }
                else {
                    seat.textContent = "";

                    const numSpan = document.createElement('span');
                    numSpan.className = 'seat-num';
                    numSpan.textContent = code;
                    seat.appendChild(numSpan);

                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'seat-name';

                    const info = currentSeats[code];

                    if (info) {
                        if (info.status === 'sold') {
                            seat.classList.add('sold');
                            let displayName = info.studentName || '未知名稱';
                            if (displayName.includes('現場保留') || displayName.includes('保留')) {
                                displayName = '保留';
                            }
                            nameSpan.textContent = displayName;
                            seat.innerHTML += `<div class="seat-tooltip">${window.escapeHTML(info.studentName)}<br>${window.escapeHTML(info.parentPhone)}</div>`;
                        } else if (info.status === 'locked') {
                            seat.classList.add('locked');
                            if (info.user === 'admin_reserved') {
                                seat.classList.add('reserved');
                                nameSpan.textContent = '暫留';
                                seat.innerHTML += `<div class="seat-tooltip">暫留位</div>`;
                            } else if (info.user === 'admin_phase2') {
                                seat.classList.add('reserved');
                                seat.classList.add('phase2');
                                nameSpan.innerHTML = '<span style="display:block;font-size:11px;line-height:1.1;">下梯開放</span>';
                                seat.innerHTML += `<div class="seat-tooltip">跨梯次保留 (第二梯次)</div>`;
                            } else if (info.user === 'admin_phase3') {
                                seat.classList.add('reserved');
                                seat.classList.add('phase3');
                                nameSpan.innerHTML = '<span style="display:block;font-size:11px;line-height:1.1;">下梯開放</span>';
                                seat.innerHTML += `<div class="seat-tooltip">跨梯次保留 (第三梯次)</div>`;
                            } else {
                                nameSpan.textContent = '填寫中';
                                seat.innerHTML += `<div class="seat-tooltip">填寫中...</div>`;
                            }
                        }
                    }

                    seat.appendChild(nameSpan);

                    if (isShowingNames && info && (info.status === 'sold' || info.status === 'locked')) {
                        seat.classList.add('show-names');
                    }

                    seat.onclick = () => toggleReserve(courseId, code, info);
                }
                rowDiv.appendChild(seat);
            });
            mapContent.appendChild(rowDiv);
        });
    }
};

// ★★★ V36.2 新增：切換座位表顯示姓名的功能 ★★★
window.isSeatNameVisible = false;
window.toggleSeatNames = function () {
    window.isSeatNameVisible = !window.isSeatNameVisible;
    const btn = document.getElementById('toggleNamesBtn');

    if (window.isSeatNameVisible) {
        btn.textContent = "🙈 隱藏姓名版圖";
        btn.classList.remove('success');
        btn.classList.add('warning');
    } else {
        btn.textContent = "👁️ 顯示姓名版圖";
        btn.classList.remove('warning');
        btn.classList.add('success');
    }

    // 開關切換後立刻重新渲染畫面
    loadVisualMap();
};

window.toggleReserve = async function (courseId, seatId, info) {
    if (info && info.status === 'sold') {
        if (confirm(`確定要釋出 ${seatId} (${info.studentName}) 嗎？`)) {
            update(ref(db, `seats/${courseId}/${seatId}`), {
                status: 'deleted'
            });
        }
    } else if (info && info.status === 'locked' && (info.user === 'admin_reserved' || info.user === 'admin_phase2' || info.user === 'admin_phase3')) {
        openOpModal(courseId, seatId);
    } else if (!info || (info && info.status === 'deleted')) {
        const snap = await get(ref(db, `seats/${courseId}/${seatId}`));
        if (snap.exists()) {
            const currentSeat = snap.val();
            if (currentSeat.status === 'sold') {
                if (!confirm(`⚠️ 警告：這個位子剛剛被學生 [${currentSeat.studentName}] 搶走了！確定要強制踢除並覆蓋為保留位嗎？`)) return;
            } else if (currentSeat.status === 'locked' && !['admin_reserved', 'admin_phase2', 'admin_phase3'].includes(currentSeat.user)) {
                if (!confirm("⚠️ 警告：目前正有【前台家長】在填寫此座位！確定要無情地踢除他並設為保留位嗎？")) return;
            }
        }

        const { value: reserveChoice } = await Swal.fire({
            title: `🏷️ 設定空位 [${seatId}]`,
            icon: 'question',
            html: `
              <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                <label style="display:flex; align-items:center; gap:10px; padding:12px 16px; border:2px solid #ddd; border-radius:10px; cursor:pointer; transition:0.2s; white-space:nowrap;" id="rb_lbl_res">
                  <input type="radio" name="reserveOpt" value="admin_reserved" style="width:18px;height:18px; accent-color:#8e44ad;">
                  <span>🔒 一般保留（前台橘色暫留）</span>
                </label>
                <label style="display:flex; align-items:center; gap:10px; padding:12px 16px; border:2px solid #ddd; border-radius:10px; cursor:pointer; transition:0.2s; white-space:nowrap;" id="rb_lbl_p2">
                  <input type="radio" name="reserveOpt" value="admin_phase2" style="width:18px;height:18px; accent-color:#7f8c8d;">
                  <span>📅 保留至第二梯次（前台靛色不可點）</span>
                </label>
                <label style="display:flex; align-items:center; gap:10px; padding:12px 16px; border:2px solid #ddd; border-radius:10px; cursor:pointer; transition:0.2s; white-space:nowrap;" id="rb_lbl_p3">
                  <input type="radio" name="reserveOpt" value="admin_phase3" style="width:18px;height:18px; accent-color:#95a5a6;">
                  <span>📅 保留至第三梯次（前台靛色不可點）</span>
                </label>
              </div>
            `,
            didOpen: () => {
                document.querySelectorAll('input[name="reserveOpt"]').forEach(radio => {
                    radio.addEventListener('change', () => {
                        document.querySelectorAll('label[id^="rb_lbl"]').forEach(lbl => lbl.style.borderColor = '#ddd');
                        radio.closest('label').style.borderColor = '#3498db';
                    });
                });
            },
            preConfirm: () => {
                const sel = document.querySelector('input[name="reserveOpt"]:checked');
                if (!sel) { Swal.showValidationMessage('請選擇一種保留方式！'); return false; }
                return sel.value;
            },
            showCancelButton: true,
            confirmButtonText: '✅ 確定保留',
            cancelButtonText: '取消',
            confirmButtonColor: '#8e44ad'
        });

        if (reserveChoice) {
            const seatPayload = {
                status: 'locked',
                user: reserveChoice,
            };
            // ★ admin_phase2/admin_phase3 不儲存 timestamp，
            //   確保殭屍清除器永遠不會誤清這些「保留至下梯次」座位。
            // ★ admin_reserved 仍保留 timestamp，讓清除器可以清掉它（保留時間過長時）。
            if (reserveChoice === 'admin_reserved') {
                seatPayload.timestamp = Date.now();
            }
            set(ref(db, `seats/${courseId}/${seatId}`), seatPayload).catch(err => {
                alert("保留失敗：權限不足！");
            });
        }
    }
};

window.openOpModal = function (courseId, seatId) {
    opCourseId = courseId;
    opSeatId = seatId;
    document.getElementById('opTarget').textContent = `座位：${seatId}`;
    document.getElementById('opModal').style.display = 'flex';
};

window.closeOpModal = function () {
    document.getElementById('opModal').style.display = 'none';
    opCourseId = null;
    opSeatId = null;
};

window.confirmOpRelease = function () {
    if (!opCourseId || !opSeatId) return;
    set(ref(db, `seats/${opCourseId}/${opSeatId}`), null).then(() => {
        closeOpModal();
    });
};

window.confirmOpSell = function () {
    if (!opCourseId || !opSeatId) return;
    const name = prompt("請輸入學生姓名 (留空則為'保留')", "保留");
    if (name === null) return; // 如果按下取消，直接中斷流程

    const phone = prompt("請輸入家長電話 (留空則為'0000000000')", "0000000000");
    if (phone === null) return; // 如果按下取消，直接中斷流程

    const orderId = "ADMIN_" + Date.now();
    const seatData = {
        status: 'sold',
        studentName: name,
        parentPhone: phone,
        soldTime: window.formatTimeWithMs(Date.now()),
        timestamp: Date.now(),
        orderId: orderId
    };

    set(ref(db, `seats/${opCourseId}/${opSeatId}`), seatData).then(() => {
        alert("已成功轉為已售出！");
        closeOpModal();
    }).catch(err => alert("失敗：" + err.message));
};

let currentSelectedClasses = [];

function updateClassSelector() {
    const optionsData = Object.keys(coursesData).map(k => `${k}-${coursesData[k].grade}-${coursesData[k].subject}-${coursesData[k].classType}`).join('|');
    if (currentClassSelectorStr === optionsData) return;
    currentClassSelectorStr = optionsData;

    const selector = document.getElementById('classSelector');
    const currentVal = selector.value;
    selector.innerHTML = '<option value="all">選擇班級加入監看...</option>';
    Object.keys(coursesData).forEach(key => {
        const c = coursesData[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `[${c.grade}] ${c.subject} ${c.classType || ''}`;
        selector.appendChild(option);
    });
    selector.value = currentVal;
}

window.addSelectedClass = function() {
    const selector = document.getElementById('classSelector');
    const courseId = selector.value;
    if (courseId !== 'all' && !currentSelectedClasses.includes(courseId)) {
        if (currentSelectedClasses.length >= 5) {
            alert("⚠️ 最多只能同時監看 5 個班級！");
            return;
        }
        currentSelectedClasses.push(courseId);
        renderSelectedClasses();
        renderTable();
        loadVisualMap();
    }
    selector.value = 'all'; // 重置選單
};

window.removeSelectedClass = function(courseId) {
    currentSelectedClasses = currentSelectedClasses.filter(id => id !== courseId);
    renderSelectedClasses();
    renderTable();
    loadVisualMap();
};

window.clearSelectedClasses = function() {
    currentSelectedClasses = [];
    renderSelectedClasses();
    renderTable();
    loadVisualMap();
};

function renderSelectedClasses() {
    const container = document.getElementById('selectedClassesContainer');
    if (!container) return;
    container.innerHTML = '';
    currentSelectedClasses.forEach(id => {
        const c = coursesData[id];
        if (!c) return;
        const tag = document.createElement('span');
        tag.className = 'class-tag';
        tag.innerHTML = `[${c.grade}] ${c.subject} ${c.classType || ''} <span class="remove" onclick="window.removeSelectedClass('${id}')">×</span>`;
        container.appendChild(tag);
    });
}

window.releaseSeat = async function (courseId, seatId, currentStatus, archiveKey) {
    if (currentStatus === 'deleted') {
        if (confirm("⚠️ 確定要【永久刪除】此紀錄嗎？刪除後無法復原。")) {
            if (archiveKey) {
                set(ref(db, `archived_seats/${courseId}/${archiveKey}`), null);
            } else {
                set(ref(db, `seats/${courseId}/${seatId}`), null);
            }
        }
    } else {
        if (confirm("確定釋出座位？(資料將封存為已釋出，座位將空出給其他人)")) {
            try {
                const snap = await get(ref(db, `seats/${courseId}/${seatId}`));
                if (snap.exists()) {
                    const seatData = snap.val();
                    seatData.originalSeatId = seatId; // 記錄他原本坐哪裡
                    const newArchiveRef = push(ref(db, `archived_seats/${courseId}`));
                    await set(newArchiveRef, seatData);
                    await set(ref(db, `seats/${courseId}/${seatId}`), null); // 清空原座位
                }
            } catch (e) {
                alert("釋出失敗：" + e.message);
            }
        }
    }
};

window.recoverSeat = async function (courseId, seatId, studentName, archiveKey) {
    if (!archiveKey) {
        alert("無法復原：找不到歷史封存紀錄 (可能是舊版資料)");
        return;
    }

    try {
        // 🛡️ 先檢查原座位是否還空著 (防呵升級：連同 locked 一起擋)
        const snap = await get(ref(db, `seats/${courseId}/${seatId}`));
        if (snap.exists()) {
            const currentSeat = snap.val();
            if (currentSeat.status === 'sold') {
                alert(`⚠️ 復原失敗！\n原本的座位 [${seatId}] 已經被其他人 (${currentSeat.studentName || '新學生'}) 劃走了。\n請引導 ${studentName} 重新劃位，或先將目前的人強制釋出。`);
                return;
            } else if (currentSeat.status === 'locked') {
                const isAdminLock = ['admin_reserved', 'admin_phase2', 'admin_phase3'].includes(currentSeat.user);
                const lockUser = isAdminLock ? '管理員' : '前台家長';
                let msg = `確定要強制釋出目前被 [${lockUser}] 鎖定中的座位 ${seatId} 嗎？`;
                if (!isAdminLock) {
                    msg += `\n⚠️ 警告：這會中斷該名家長的劃位流程！`;
                }
                if (!confirm(msg)) return;
            }
        }

        if (confirm(`💡 確定要恢復 ${studentName} 在 ${seatId} 的劃位嗎？`)) {
            const archiveSnap = await get(ref(db, `archived_seats/${courseId}/${archiveKey}`));
            if (archiveSnap.exists()) {
                const seatData = archiveSnap.val();
                seatData.status = 'sold'; // 恢復為售出
                delete seatData.originalSeatId;

                // 1. 寫回原本座位
                await set(ref(db, `seats/${courseId}/${seatId}`), seatData);
                // 2. 刪除封存紀錄
                await set(ref(db, `archived_seats/${courseId}/${archiveKey}`), null);
            }
        }
    } catch (e) {
        alert('恢復失敗：' + e.message);
    }
};

window.editOrder = async function (courseId, seatId, oldPhone, orderId, oldName) {
    const newName = prompt("修改學生姓名：", oldName);
    if (newName === null) return;
    const newPhone = prompt("修改家長電話 (若修改電話，系統將自動搬移訂單)：", oldPhone);
    if (newPhone === null) return;

    try {
        const seatUpdate = {
            studentName: newName,
            parentPhone: newPhone
        };
        await update(ref(db, `seats/${courseId}/${seatId}`), seatUpdate);

        if (newPhone !== oldPhone) {
            const oldOrderRef = ref(db, `orders/${oldPhone}/${orderId}`);
            const snap = await get(oldOrderRef);
            if (snap.exists()) {
                const orderData = snap.val();
                orderData.studentName = newName;
                orderData.parentPhone = newPhone;
                await set(ref(db, `orders/${newPhone}/${orderId}`), orderData);
                await remove(oldOrderRef);
            }
        } else {
            await update(ref(db, `orders/${oldPhone}/${orderId}`), {
                studentName: newName
            });
        }
        alert("修改成功！");
    } catch (err) {
        alert("修改失敗：" + err.message);
        console.error(err);
    }
};

function updateStats() {
    document.getElementById('totalSold').textContent = allBookings.filter(b => b.status === 'sold').length;
}

window.exportBookingCSV = function () {
    let csv = "\uFEFF訂單編號,課程,時間,狀態,座位,姓名,電話,Google 帳號\n";
    allBookings.forEach(b => {
        if (currentSelectedClasses.length > 0 && !currentSelectedClasses.includes(b.courseId)) return;
        let statusText = b.status === 'sold' ? '已劃位' : (b.status === 'deleted' ? '已釋出' : '填寫中');
        csv += `'${b.orderId},${b.courseName},${b.time},${statusText},${b.seatId},${b.studentName},'${b.parentPhone},'${b.userEmail}\n`;
    });
    downloadCSV(csv, "booking_data.csv");
};

window.exportWaitlistCSV = function () {
    const filterId = document.getElementById('waitlistSelector').value;
    let csv = "\uFEFF課程,登記時間,狀態,序號,姓名,電話,備註\n";

    const list = waitlistData[filterId] || {};
    const c = coursesData[filterId];
    const courseName = c ? `[${c.grade}] ${c.subject} ${c.classType || ''}` : filterId;

    let exportList = Object.keys(list).map(key => ({ ...list[key], key, courseName }));
    const activeItems = exportList.filter(w => w.status !== 'deleted');
    activeItems.sort((a, b) => a.timestamp - b.timestamp);
    const rankMap = {};
    activeItems.forEach((item, index) => { rankMap[item.key] = index + 1; });

    exportList.forEach(w => {
        let seq = rankMap[w.key] || '-';
        let statusText = w.status === 'deleted' ? '已刪除' : '候補中';
        csv += `${w.courseName},${window.formatTimeWithMs(w.timestamp)},${statusText},${seq},${w.studentName},'${w.parentPhone},${w.note || ''}\n`;
    });
    downloadCSV(csv, "waitlist_data.csv");
};

function downloadCSV(content, fileName) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}

// 監聽 Class Selector 的 change 不再直接 render，而是給 Add 按鈕觸發
// 不過為了防止使用者操作有誤，不綁定 onchange，依賴 Add 按鈕
document.getElementById('searchInput').addEventListener('input', renderTable);
// 進階過濾器的 event listener
if(document.getElementById('filter_status')) {
    document.getElementById('filter_status').addEventListener('change', window.applyAdvancedFilters);
    if(document.getElementById('filter_seatId')) document.getElementById('filter_seatId').addEventListener('change', window.applyAdvancedFilters);
    if(document.getElementById('filter_studentName')) document.getElementById('filter_studentName').addEventListener('input', window.applyAdvancedFilters);
    if(document.getElementById('filter_parentPhone')) document.getElementById('filter_parentPhone').addEventListener('input', window.applyAdvancedFilters);
    if(document.getElementById('filter_userEmail')) document.getElementById('filter_userEmail').addEventListener('input', window.applyAdvancedFilters);
}

// 試算表同步相關
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('sheetIdInput')) {
        document.getElementById('sheetIdInput').value = localStorage.getItem('bear_sync_sheetId') || '';
        document.getElementById('sheetTabInput').value = localStorage.getItem('bear_sync_tabName') || '';
        document.getElementById('sheetColumnInput').value = localStorage.getItem('bear_sync_columnName') || '';
        document.getElementById('matchCol1Input').value = localStorage.getItem('bear_sync_matchCol1') || '';
        document.getElementById('matchCol2Input').value = localStorage.getItem('bear_sync_matchCol2') || '';
    }
});

window.syncToGoogleSheet = async function() {
    const sheetId = document.getElementById('sheetIdInput').value.trim();
    const tabName = document.getElementById('sheetTabInput').value.trim();
    const columnName = document.getElementById('sheetColumnInput').value.trim();
    const compareCol1 = document.getElementById('matchCol1Input').value.trim();
    const compareCol2 = document.getElementById('matchCol2Input').value.trim();

    if(!sheetId || !tabName || !columnName) {
        if(typeof Swal !== 'undefined') {
            Swal.fire("錯誤", "試算表 ID、分頁名稱 與 寫入欄位 均為必填！", "warning");
        } else {
            alert("試算表 ID、分頁名稱 與 寫入欄位 均為必填！");
        }
        return;
    }

    // 儲存至 localStorage 方便下次使用
    localStorage.setItem('bear_sync_sheetId', sheetId);
    localStorage.setItem('bear_sync_tabName', tabName);
    localStorage.setItem('bear_sync_columnName', columnName);
    localStorage.setItem('bear_sync_matchCol1', compareCol1);
    localStorage.setItem('bear_sync_matchCol2', compareCol2);


    if(!gasWebhookUrl) {
        if(typeof Swal !== 'undefined') {
            Swal.fire("發送失敗", "尚未設定 GAS Webhook API 網址，請先至下方【系統設定】設定！", "error");
        } else {
            alert("尚未設定 GAS Webhook API 網址！");
        }
        return;
    }

    // 蒐集名單資料
    let exportData = [];
    allBookings.forEach(b => {
        // 只過濾 "已售出" 的學生
        if(b.status !== 'sold') return;
        // 如果有指定班級，過濾班級
        if(currentSelectedClasses.length > 0 && !currentSelectedClasses.includes(b.courseId)) return;
        
        // 抓出班級代碼 (例如：14, 25)
        // 假設課程名稱中我們不直接用課程名稱，而是直接抓 c.classType (但這裡原本存了 courseName，也可以只送 courseId 或將 className 切割)
        // 這裡直接取 c.classType (如週六班)，或者抓取當下的座位前綴。但以使用者需求來說，他們希望填入的是 "25" (班級)。
        const classStr = coursesData[b.courseId] ? (coursesData[b.courseId].classType || b.courseName) : b.courseName;

        exportData.push({
            studentName: b.studentName,
            parentPhone: b.parentPhone,
            className: classStr // 將供 GAS 使用填入對應欄位
        });
    });

    if(exportData.length === 0) {
        if(typeof Swal !== 'undefined') Swal.fire("無資料", "目前選取的條件下沒有已劃位的名單可供同步！", "info");
        else alert("無資料同步");
        return;
    }

    if(!confirm(`確定要將 ${exportData.length} 筆資料同步至試算表 [${tabName}] 的 [${columnName}] 欄位嗎？`)) return;



    if(typeof Swal !== 'undefined') {
        Swal.fire({
            title: '同步至 Google 試算表中...',
            html: '這可能需要幾十秒鐘，請耐心等候',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });
    }

    try {
        const payload = {
            action: 'sync_to_sheet',
            sheetId: sheetId,
            tabName: tabName,
            columnName: columnName,
            compareCol1: compareCol1,
            compareCol2: compareCol2,
            records: exportData
        };

        const response = await fetch(gasWebhookUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        const resData = await response.json();

        if (typeof Swal !== 'undefined') {
            if (resData.success) {
                Swal.fire("同步成功！", `成功更新 ${resData.updatedCount} 筆舊生資料，新增 ${resData.addedCount} 筆新生資料！`, "success");
            } else {
                Swal.fire("同步失敗", resData.msg, "error");
            }
        } else {
            alert(resData.success ? `同步成功！\n更新 ${resData.updatedCount}，新增 ${resData.addedCount}` : "同步失敗：\n" + resData.msg);
        }
    } catch (e) {
        console.error(e);
        if(typeof Swal !== 'undefined') Swal.fire("例外錯誤", e.message, "error");
        else alert("錯誤: " + e.message);
    }
};

window.fetchedSheetData = null;

window.fetchSheetInfo = async function() {
    const sheetId = document.getElementById('sheetIdInput').value.trim();
    if(!sheetId) {
        if(typeof Swal !== 'undefined') Swal.fire("錯誤", "請先輸入 Google Sheet ID！", "warning");
        return;
    }
    if(!gasWebhookUrl) {
        if(typeof Swal !== 'undefined') Swal.fire("錯誤", "尚未設定 GAS Webhook API 網址，請先至下方【系統設定】設定！", "error");
        return;
    }

    const btn = document.getElementById('btnFetchSheetInfo');
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ 載入中...";
    btn.disabled = true;

    try {
        const payload = {
            action: 'get_sheet_info',
            sheetId: sheetId
        };
        const response = await fetch(gasWebhookUrl, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if(result.success) {
            window.fetchedSheetData = result.data;
            
            const tabsList = document.getElementById('sheetTabsList');
            tabsList.innerHTML = '';
            result.data.tabs.forEach(tab => {
                const opt = document.createElement('option');
                opt.value = tab.name;
                tabsList.appendChild(opt);
            });
            
            if(typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: '讀取成功',
                    text: `成功讀取 ${result.data.tabs.length} 個分頁。請輸入或選擇分頁，系統將自動載入該分頁的欄位。`,
                    timer: 2000,
                    showConfirmButton: false
                });
            }
            
            updateColumnDatalist();
        } else {
            if(typeof Swal !== 'undefined') Swal.fire("讀取失敗", result.msg || "未知錯誤", "error");
        }
    } catch(err) {
        if(typeof Swal !== 'undefined') Swal.fire("發生錯誤", err.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.updateColumnDatalist = function() {
    if(!window.fetchedSheetData) return;
    const currentTab = document.getElementById('sheetTabInput').value.trim();
    const colsList = document.getElementById('sheetColsList');
    colsList.innerHTML = '';
    
    const tabObj = window.fetchedSheetData.tabs.find(t => t.name === currentTab);
    if(tabObj && tabObj.headers) {
        tabObj.headers.forEach(h => {
            if(h) {
                const opt = document.createElement('option');
                opt.value = h;
                colsList.appendChild(opt);
            }
        });
    }
};

const bannersRef = ref(db, 'banners');
const trialBannersRef = ref(db, 'trial_banners');

onValue(bannersRef, (snapshot) => {
    const data = snapshot.val() || {};
    const list = document.getElementById('bannerList');
    if (!list) return;
    list.innerHTML = "";
    Object.keys(data).forEach(key => {
        const b = data[key];
        const item = document.createElement('div');
        item.className = 'banner-item';
        item.innerHTML = `<img src="${b.url}"><button class="btn-delete" onclick="window.deleteBanner('${key}', 'regular', event)">刪除</button>`;
        list.appendChild(item);
    });
});

// ★★★ 新增：取出橫幅秒數設定並更新前端選項 ★★★
const bannerSettingsRef = ref(db, 'settings/bannerInterval');
onValue(bannerSettingsRef, (snapshot) => {
    const val = snapshot.val() || 5000;
    const intervalSelect = document.getElementById('bannerIntervalSelect');
    if (intervalSelect) {
        intervalSelect.value = val;
    }
});

window.saveBannerSettings = async function () {
    const intervalSelect = document.getElementById('bannerIntervalSelect');
    if (!intervalSelect) return;
    const val = parseInt(intervalSelect.value, 10);

    try {
        await set(ref(db, 'settings/bannerInterval'), val);
        Swal.fire({
            icon: 'success',
            title: '儲存成功！',
            text: `首頁橫幅輪播速度已設定為 ${val / 1000} 秒。`,
            timer: 2000,
            showConfirmButton: false
        });
    } catch (err) {
        Swal.fire('錯誤', '儲存設定失敗：' + err.message, 'error');
    }
}

onValue(trialBannersRef, (snapshot) => {
    const data = snapshot.val() || {};
    const list = document.getElementById('trialBannerList');
    if (!list) return;
    list.innerHTML = "";
    Object.keys(data).forEach(key => {
        const b = data[key];
        const item = document.createElement('div');
        item.className = 'banner-item';
        item.innerHTML = `<img src="${b.url}"><button class="btn-delete" onclick="window.deleteBanner('${key}', 'trial', event)">刪除</button>`;
        list.appendChild(item);
    });
});

window.uploadBanner = async function (type = 'regular') {
    const isTrial = type === 'trial';
    const fileInputId = isTrial ? 'tb_file' : 'b_file';
    const statusId = isTrial ? 'trialBannerStatus' : 'bannerStatus';
    const storagePrefix = isTrial ? 'trial_banners' : 'banners';
    const dbNode = isTrial ? 'trial_banners' : 'banners';

    const fileInput = document.getElementById(fileInputId);
    if (fileInput.files.length === 0) return alert("請選擇圖片");
    const file = fileInput.files[0];
    const storagePath = `${storagePrefix}/${Date.now()}_${file.name}`;
    const imgRef = storageRef(storage, storagePath);

    document.getElementById(statusId).textContent = "上傳中...";
    const metadata = { contentType: file.type };
    await uploadBytes(imgRef, file, metadata);
    const url = await getDownloadURL(imgRef);

    await push(ref(db, dbNode), { url: url, createdAt: Date.now() });

    document.getElementById(statusId).textContent = "";
    fileInput.value = "";
};

window.deleteBanner = function (key, type, event) {
    if (event) event.stopPropagation();
    const dbNode = type === 'trial' ? 'trial_banners' : 'banners';
    const title = type === 'trial' ? '試聽首頁推播橫幅' : '正式課程首頁橫幅';
    if (confirm(`確定刪除此${title}？`)) remove(ref(db, `${dbNode}/${key}`));
};

const waitlistRef = ref(db, 'waitlist');
onValue(waitlistRef, (snapshot) => {
    waitlistData = snapshot.val() || {};
    updateWaitlistSelector();
    renderWaitlistTable();
});

function updateWaitlistSelector() {
    const optionsData = Object.keys(coursesData).map(k => `${k}-${coursesData[k].grade}-${coursesData[k].subject}-${coursesData[k].classType}`).join('|');
    if (currentWaitlistSelectorStr === optionsData) return;
    currentWaitlistSelectorStr = optionsData;

    const selector = document.getElementById('waitlistSelector');
    const currentVal = selector.value;
    selector.innerHTML = '<option value="all">選擇課程查看候補</option>';
    Object.keys(coursesData).forEach(key => {
        const c = coursesData[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `[${c.grade}] ${c.subject} ${c.classType || ''}`;
        selector.appendChild(option);
    });
    selector.value = currentVal;
}

window.sortWaitlistTable = function (col) {
    if (waitlistSort.col === col) waitlistSort.asc = !waitlistSort.asc;
    else { waitlistSort.col = col; waitlistSort.asc = true; }
    renderWaitlistTable();
};

window.renderWaitlistTable = function () {
    const filterId = document.getElementById('waitlistSelector').value;
    const searchKeyword = (document.getElementById('waitlistSearchInput')?.value || "").toLowerCase();
    const tbody = document.getElementById('waitlistTable');
    if (!tbody) return;
    tbody.innerHTML = "";

    waitlistDisplayList = [];
    let rawList = [];
    const rankMap = {};

    if (filterId === 'all') {
        for (const [cid, list] of Object.entries(waitlistData)) {
            const c = coursesData[cid];
            const courseName = c ? `[${c.grade}] ${c.subject} ${c.classType || ''}` : cid;

            const cList = Object.keys(list).map(key => ({
                ...list[key],
                key,
                courseName,
                courseId: cid
            }));
            rawList.push(...cList);

            // 分別計算每個課程內的序號
            const cActive = cList.filter(w => w.status !== 'deleted');
            cActive.sort((a, b) => a.timestamp - b.timestamp);
            cActive.forEach((item, index) => {
                rankMap[item.key] = index + 1;
            });
        }
    } else {
        const list = waitlistData[filterId] || {};
        const c = coursesData[filterId];
        const courseName = c ? `[${c.grade}] ${c.subject} ${c.classType || ''}` : filterId;

        rawList = Object.keys(list).map(key => ({
            ...list[key],
            key,
            courseName,
            courseId: filterId
        }));

        const cActive = rawList.filter(w => w.status !== 'deleted');
        cActive.sort((a, b) => a.timestamp - b.timestamp);
        cActive.forEach((item, index) => {
            rankMap[item.key] = index + 1;
        });
    }

    if (searchKeyword) {
        waitlistDisplayList = rawList.filter(w => {
            const nameMatch = (w.studentName || "").toLowerCase().includes(searchKeyword);
            const phoneMatch = (w.parentPhone || "").includes(searchKeyword);
            return nameMatch || phoneMatch;
        });
    } else {
        waitlistDisplayList = rawList;
    }

    // 排序
    waitlistDisplayList.sort((a, b) => {
        if (waitlistSort.col === 'seq') {
            const rankA = rankMap[a.key] || 999999;
            const rankB = rankMap[b.key] || 999999;
            return waitlistSort.asc ? rankA - rankB : rankB - rankA;
        }

        let valA = a[waitlistSort.col] || '';
        let valB = b[waitlistSort.col] || '';
        if (valA < valB) return waitlistSort.asc ? -1 : 1;
        if (valA > valB) return waitlistSort.asc ? 1 : -1;
        return 0;
    });

    const nameCounts = {};
    // 排除 deleted（已刪除），只計算有效候補的重複姓名
    waitlistDisplayList.forEach(w => {
        if (w.status !== 'deleted') {
            nameCounts[w.studentName] = (nameCounts[w.studentName] || 0) + 1;
        }
    });

    // 動態重複調色盤：用名字算出專屬背景色，保證同一人顏色一樣，不同群組顏色不同。
    const duplicatePalette = ['#ffe6e6', '#e6f2ff', '#e6ffe6', '#fffada', '#f2e6ff', '#ffebe6'];
    const getColorForName = (name) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return duplicatePalette[Math.abs(hash) % duplicatePalette.length];
    };

    waitlistDisplayList.forEach(w => {
        const tr = document.createElement('tr');
        const time = window.formatTimeWithMs(w.timestamp);

        let btnText = '刪除';
        let btnClass = 'danger';
        let statusBadge = '<span class="badge wait">候補中</span>';
        let seqDisplay = rankMap[w.key] || '-';

        let recoverBtn = '';
        if (w.status === 'deleted') {
            tr.classList.add('row-deleted');
            btnText = '永久刪除';
            btnClass = 'dark';
            statusBadge = '<span class="badge deleted">已刪除</span>';
            recoverBtn = `<button class="success" style="padding:5px 10px; font-size:12px; margin-right:5px;" onclick="window.recoverWaitlist('${w.courseId}', '${w.key}')">復原候補</button>`;
        } else {
            if (nameCounts[w.studentName] > 1) {
                const rowColor = getColorForName(w.studentName);
                tr.style.backgroundColor = rowColor;
            }
        }

        tr.innerHTML = `
                    <td>${w.courseName}</td>
                    <td>${time}</td>
                    <td>${statusBadge}</td>
                    <td style="font-weight:bold; color:#d35400;">${seqDisplay}</td>
                    <td>${window.escapeHTML(w.studentName)}</td>
                    <td>${window.escapeHTML(w.parentPhone)}</td>
                    <td>${window.escapeHTML(w.note || '-')}</td>
                    <td>
                        ${recoverBtn}
                        <button class="warning" style="padding:5px 10px; font-size:12px;" onclick="window.editWaitlist('${w.courseId}', '${w.key}', '${w.studentName}', '${w.parentPhone}', '${w.note}')">編輯</button>
                        <button class="${btnClass}" style="padding:5px 10px; font-size:12px;" onclick="window.deleteWaitlist('${w.courseId}', '${w.key}', '${w.status}')">${btnText}</button>
                    </td>`;
        tbody.appendChild(tr);
    });
}

window.deleteWaitlist = function (courseId, waitlistId, currentStatus) {
    if (currentStatus === 'deleted') {
        if (confirm("確定要【永久刪除】此候補嗎？")) {
            set(ref(db, `waitlist/${courseId}/${waitlistId}`), null);
        }
    } else {
        if (confirm("確定移除此候補？(資料將保留，序號將釋出)")) {
            update(ref(db, `waitlist/${courseId}/${waitlistId}`), {
                status: 'deleted'
            });
        }
    }
};

window.recoverWaitlist = function (courseId, waitlistId) {
    if (confirm("💡 確定要【復原】這名學生的候補資格嗎？\n(他將會重新回到該課程的有效候補清單中)")) {
        update(ref(db, `waitlist/${courseId}/${waitlistId}`), {
            status: 'waiting'
        }).catch(e => alert("復原失敗：" + e.message));
    }
};

window.editWaitlist = function (courseId, waitlistId, oldName, oldPhone, oldNote) {
    const newName = prompt("修改姓名", oldName);
    const newPhone = prompt("修改電話", oldPhone);
    const newNote = prompt("修改備註", oldNote);

    if (newName && newPhone) {
        update(ref(db, `waitlist/${courseId}/${waitlistId}`), {
            studentName: newName,
            parentPhone: newPhone,
            note: newNote
        }).then(() => alert("修改成功")).catch(e => alert("修改失敗：" + e.message));
    }
};

document.getElementById('waitlistSelector').addEventListener('change', renderWaitlistTable);

function renderClassroomPreview() {
    const list = document.getElementById('classroomList');
    list.innerHTML = "";
    Object.keys(classrooms).forEach(key => {
        const c = classrooms[key];
        const card = document.createElement('div');
        card.className = 'classroom-card';
        card.innerHTML = `<h4>${c.name}</h4><div style="font-size:12px; color:#666;">代碼: ${key}</div>`;
        card.onclick = () => showPreview(key);
        list.appendChild(card);
    });
}

window.showPreview = function (key) {
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const content = document.getElementById('previewContent');
    const config = classrooms[key];

    title.textContent = config.name;
    content.innerHTML = "";

    config.layout.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        row.forEach(seatCode => {
            const seat = document.createElement('div');
            seat.className = 'seat';
            let code = seatCode;
            if (seatCode.includes(':X')) { code = seatCode.split(':')[0]; seat.classList.add('blocked'); }
            if (code === "_") seat.classList.add('aisle');
            else if (code === "DOOR") { seat.textContent = "門"; seat.classList.add('aisle'); }
            else if (code === "PILLAR") { seat.textContent = "柱"; seat.classList.add('aisle'); }
            else seat.textContent = code;
            rowDiv.appendChild(seat);
        });
        content.appendChild(rowDiv);
    });

    modal.style.display = "flex";
};

window.closePreview = function () {
    document.getElementById('previewModal').style.display = "none";
};

renderClassroomPreview();

const ZOMBIE_TIMEOUT = 1.5 * 60 * 1000;
const SWEEP_INTERVAL = 10 * 1000;

function startZombieSweeper() {
    const statusDiv = document.getElementById('sweeperStatus');

    setInterval(() => {
        const now = Date.now() + serverTimeOffset;
        let clearedCount = 0;

        Object.keys(seatsData).forEach(courseId => {
            const seats = seatsData[courseId];
            Object.keys(seats).forEach(seatId => {
                if (seatId === '_settings') return;
                const info = seats[seatId];

                // ★ 三道防線確保管理員保留位不被清除：
                // 1. 只清除 locked 狀態
                // 2. 不清除任何 admin_* 保留座位
                // 3. 必須有 timestamp 欄位才計算過期（admin_phase2/3 刻意不存 timestamp）
                const isAdminSeat = ['admin_reserved', 'admin_phase2', 'admin_phase3'].includes(info.user);
                if (info.status === 'locked' && !isAdminSeat && info.timestamp) {
                    if (now - info.timestamp > ZOMBIE_TIMEOUT) {
                        set(ref(db, `seats/${courseId}/${seatId}`), null);
                        clearedCount++;
                        // [Sweeper] 清除殭屍座位
                    }
                }
            });
        });

        if (clearedCount > 0) {
            statusDiv.textContent = `🧹 剛剛清除了 ${clearedCount} 個殭屍座位`;
            statusDiv.style.backgroundColor = "#e74c3c";
            setTimeout(() => {
                statusDiv.textContent = "🧹 殭屍清除器：待命";
                statusDiv.style.backgroundColor = "rgba(0,0,0,0.7)";
            }, 3000);
        }
    }, SWEEP_INTERVAL);
}

startZombieSweeper();

window.initBillPage = function () {
    window.renderCourseConfig();
    window.processBills();
};

onValue(ref(db, 'print_layouts'), (snapshot) => {
    printLayouts = snapshot.val() || {};
    if (document.getElementById('tab-print').classList.contains('active')) {
        updatePrintCourseList();
    }
});

window.renderCourseConfig = function () {
    const container = document.getElementById('courseConfigList');
    container.innerHTML = "";
    const billType = document.getElementById('billTypeSelector').value;

    Object.keys(coursesData).forEach(key => {
        const c = coursesData[key];
        const isSeniorCourse = c.grade.includes("高");
        if (billType === 'senior' && !isSeniorCourse) return;
        if (billType === 'junior' && isSeniorCourse) return;

        const div = document.createElement('div');
        div.className = "config-row";
        div.innerHTML = `
                    <div style="display:flex; align-items:center; flex: 1 1 100%; min-width:200px; margin-bottom:5px;">
                        <input type="checkbox" id="bill_check_${key}" style="margin-right:10px;" checked onchange="window.processBills()">
                        <span style="font-weight:bold; word-break:break-word;">${c.subject}</span>
                    </div>
                    <input type="text" id="bill_date_${key}" placeholder="日期 (如 3/5)" style="width:80px; flex: 1 1 80px;" value="${c.billDate || ''}">
                    <input type="text" id="bill_count_${key}" placeholder="堂數 (如 12)" style="width:60px; flex: 1 1 60px;" value="${c.billCount || ''}">
                    <input type="text" id="bill_price_${key}" placeholder="金額" style="width:80px; flex: 1 1 80px;" value="${c.billPrice || c.price.replace(/[$,]/g, '')}">
                    <input type="text" id="bill_note_${key}" placeholder="備註 (選填)" style="width:100px; flex: 2 1 120px;" value="${c.billNote || ''}">
                `;
        container.appendChild(div);
    });

    window.processBills();
};

window.saveAllBillConfigs = function () {
    const updates = {};
    Object.keys(coursesData).forEach(key => {
        if (document.getElementById(`bill_date_${key}`)) {
            const date = document.getElementById(`bill_date_${key}`).value;
            const count = document.getElementById(`bill_count_${key}`).value;
            const price = document.getElementById(`bill_price_${key}`).value;
            const note = document.getElementById(`bill_note_${key}`).value;

            updates[`courses/${key}/billDate`] = date;
            updates[`courses/${key}/billCount`] = count;
            updates[`courses/${key}/billPrice`] = price;
            updates[`courses/${key}/billNote`] = note;
        }
    });

    update(ref(db), updates).then(() => {
        alert("✅ 設定已儲存！");
        window.processBills();
    }).catch(err => alert("儲存失敗：" + err.message));
};

window.importSchoolCSV = function () {
    const fileInput = document.getElementById('csvSchoolFile');
    if (fileInput.files.length === 0) return alert("請選擇 CSV 檔案");
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split('\n');
        let count = 0;

        if (lines.length === 0) return;

        const headers = lines[0].split(',').map(h => h.trim().replace(/["']/g, '').replace(/^\uFEFF/, ''));
        const schoolIdx = headers.findIndex(h => h.includes('學校'));
        const nameIdx = headers.findIndex(h => h.includes('姓名'));

        if (schoolIdx === -1 || nameIdx === -1) {
            return alert("❌ CSV 檔案標題列必須包含「學校」與「姓名」欄位！");
        }

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            const parts = line.split(',');
            if (parts.length > Math.max(schoolIdx, nameIdx)) {
                const school = parts[schoolIdx].trim().replace(/["']/g, '');
                const name = parts[nameIdx].trim().replace(/["']/g, '');
                if (name && school) {
                    schoolMap[name] = school;
                    count++;
                }
            }
        }
        document.getElementById('csvStatus').textContent = `✅ 已匯入 ${count} 筆學校資料`;
        window.processBills();
    };
    reader.readAsText(file);
};

window.processBills = function () {
    const billType = document.getElementById('billTypeSelector').value;
    const studentMap = {};

    const footerInfo = document.getElementById('footerInfo');
    const bankInfo = document.getElementById('bankInfo');

    if (billType === 'senior') {
        footerInfo.innerHTML = '新竹市私立山熊升大文理短期補習班 &nbsp; 地址：新竹市科學園路107巷2號B1 &nbsp; 立案字號：府教社字第1120072237號';
        bankInfo.innerHTML = '第一銀行(007) 竹科分行 &nbsp;&nbsp; 戶名：新竹市私立山熊升大文理短期補習班 &nbsp;&nbsp; 帳號：303-100-34751<br><span class="bank-highlight">★ 匯款後請告知我們上課科目、匯款金額及帳號後 5 碼以利我們對帳，謝謝。</span>';
    } else {
        footerInfo.innerHTML = '新竹市私立山熊科學文理短期補習班 &nbsp; 地址：新竹市科學園路107巷1號 &nbsp; 立案字號：府教社字第1010019608號';
        bankInfo.innerHTML = '第一銀行(007) 竹科分行 &nbsp;&nbsp; 戶名：新竹市私立山熊科學文理短期補習班 &nbsp;&nbsp; 帳號：303-100-13273<br><span class="bank-highlight">★ 匯款後請告知我們上課科目、匯款金額及帳號後 5 碼以利我們對帳，謝謝。</span>';
    }

    Object.keys(seatsData).forEach(courseId => {
        const seats = seatsData[courseId];
        const c = coursesData[courseId];
        if (!c) return;

        const checkbox = document.getElementById(`bill_check_${courseId}`);
        if (!checkbox || !checkbox.checked) return;

        const isSeniorCourse = c.grade.includes("高");
        if (billType === 'senior' && !isSeniorCourse) return;
        if (billType === 'junior' && isSeniorCourse) return;

        Object.keys(seats).forEach(seatId => {
            if (seatId === '_settings') return;
            const info = seats[seatId];
            if (info.status === 'sold') {
                const name = info.studentName;
                if (!studentMap[name]) {
                    studentMap[name] = {
                        name: name,
                        phone: info.parentPhone,
                        items: [],
                        total: 0,
                        grade: inferGrade(c.grade),
                        school: schoolMap[name] || "",
                        selected: false // 加入發送勾選預設狀態
                    };
                }

                let priceInput = document.getElementById(`bill_price_${courseId}`);
                let price = priceInput ? parseInt(priceInput.value) : (parseInt(c.billPrice) || parseInt(c.price.replace(/[$,]/g, '')) || 0);

                let dateInput = document.getElementById(`bill_date_${courseId}`);
                let countInput = document.getElementById(`bill_count_${courseId}`);
                let noteInput = document.getElementById(`bill_note_${courseId}`);

                let dateVal = dateInput ? dateInput.value : (c.billDate || "");
                let countVal = countInput ? countInput.value : (c.billCount || "");
                let noteVal = noteInput ? noteInput.value : (c.billNote || "");

                studentMap[name].items.push({
                    name: c.subject,
                    seatInfo: "", // 應要求：拿掉學費單備註中顯示的座位號碼
                    dateHtml: formatBillDate(dateVal, countVal),
                    price: price,
                    note: noteVal
                });
                studentMap[name].total += price;
            }
        });
    });

    // --- 比對發送歷史 ---
    // 取得 bill_sent 節點資料做檢查 (同步執行需要依賴先前 fetch 完的變數，這裡為了簡化我們先直接轉成陣列，
    // 在 loadBill 渲染時再做比對或提前 await 取資料，因為 processBills 沒宣告成 async。
    // 這邊把 processBills 宣告成 async 較為方便)
    
    // 將 Object.values 轉存
    const tempBillStudents = Object.values(studentMap);
    
    // 如果是 async，我們可以使用 get()，但為了不大幅翻修 processBills，我們可以透過全域物件做快取比對。
    if (tempBillStudents.length > 0) {
        get(ref(db, 'bill_sent')).then(snap => {
            const sentHistory = snap.val() || {};
            
            tempBillStudents.forEach(s => {
                // 將目前這單的商品內容壓縮成字串當版本號
                const currentVersion = JSON.stringify(s.items);
                s.currentVersion = currentVersion;
                
                // 檢查是否發送過
                let lastVersion = null;
                if (sentHistory[s.phone] && sentHistory[s.phone][s.name]) {
                    lastVersion = sentHistory[s.phone][s.name].last_version;
                }
                
                // 若沒發過、或是版本不一樣，就打勾
                if (lastVersion !== currentVersion) {
                    s.selected = true;
                    s.isChanged = true;
                } else {
                    s.selected = false;
                    s.isChanged = false;
                }
            });
            
            billStudents = tempBillStudents;
            loadBill(0);
        });
    } else {
        billStudents = [];
        document.getElementById('billName').textContent = "無資料";
        document.getElementById('billGrade').textContent = "";
        document.getElementById('billSchool').textContent = "";
        document.getElementById('billTotal').textContent = "0";
        document.getElementById('billNote').innerText = "";
        document.getElementById('itemsTable').innerHTML = "<tr><td colspan='3' style='text-align:center; padding: 20px;'>此部別目前沒有學費單資料</td></tr>";
        document.getElementById('billCounter').textContent = "0 / 0";
    }
};

function formatBillDate(dateStr, count) {
    let html = "";
    if (dateStr) {
        const parts = dateStr.split('/');
        if (parts.length === 2) {
            html += `自<span class="w-num">${parts[0]}</span><span class="d-text">月</span><span class="w-num">${parts[1]}</span><span class="d-text">日</span>起`;
        } else {
            html += dateStr;
        }
    }
    if (count) {
        html += ` 共 <span class="w-num">${count}</span> 堂`;
    }
    return html;
}

function inferGrade(gradeStr) {
    if (!gradeStr) return "";
    if (gradeStr.includes("小五")) return "五";
    if (gradeStr.includes("小六")) return "六";
    if (gradeStr.includes("國一")) return "七";
    if (gradeStr.includes("國二")) return "八";
    if (gradeStr.includes("國三")) return "九";
    if (gradeStr.includes("高一")) return "高一";
    if (gradeStr.includes("高二")) return "高二";
    if (gradeStr.includes("高三")) return "高三";
    return "";
}

window.prevBill = function () {
    if (currentBillIndex > 0) {
        loadBill(currentBillIndex - 1);
    }
};

window.nextBill = function () {
    if (currentBillIndex < billStudents.length - 1) {
        loadBill(currentBillIndex + 1);
    }
};

window.loadBill = function (index) {
    currentBillIndex = index;
    const s = billStudents[index];

    // 動態在標題旁插入這個學費單發送的打勾選項
    let cbHtml = `<label style="display:inline-flex; align-items:center; gap:5px; margin-left:15px; background:${s.selected ? '#e8f6e9' : '#fff3e0'}; padding:2px 10px; border-radius:15px; font-size:14px; cursor:pointer; font-weight:normal;">
                    <input type="checkbox" id="billCheck_${index}" ${s.selected ? 'checked' : ''} onchange="window.toggleBillSelection(${index})">
                    ${s.isChanged ? '<span style="color:#27ae60;">✨資料有異動/新開立</span>' : '<span style="color:#d35400;">✓ 已發過此版本</span>'}
                  </label>`;

    document.getElementById('billCounter').innerHTML = `${index + 1} / ${billStudents.length} ${cbHtml}`;
    document.getElementById('billName').textContent = s.name;
    document.getElementById('billGrade').textContent = s.grade;
    document.getElementById('billSchool').textContent = s.school;
    document.getElementById('billTotal').textContent = s.total.toLocaleString();

    const billType = document.getElementById('billTypeSelector') ? document.getElementById('billTypeSelector').value : 'junior';
    const billNoteEl = document.getElementById('billNote');
    if (billType === 'senior') {
        billNoteEl.classList.add('high-school');
    } else {
        billNoteEl.classList.remove('high-school');
    }

    let notes = [];
    s.items.forEach(item => {
        let parts = [];
        if (item.seatInfo) parts.push(item.seatInfo); // 原本是座位，現在已設為空字串，所以不會加入
        if (item.note) parts.push(item.note);
        if (parts.length > 0) {
            notes.push(`【${item.name}】\n${parts.join('\n')}`);
        }
    });
    document.getElementById('billNote').innerText = notes.join("\n\n");

    const tbody = document.getElementById('itemsTable');
    tbody.innerHTML = "";

    s.items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
                    <td class="col-1" contenteditable="true">${item.name}</td>
                    <td class="col-2" contenteditable="true">${item.dateHtml}</td>
                    <td class="col-3" contenteditable="true">$${item.price.toLocaleString()}</td>
                `;
        tbody.appendChild(tr);
    });

    for (let i = s.items.length; i < 6; i++) {
        const tr = document.createElement('tr');
        if (i === s.items.length) {
            tr.innerHTML = '<td class="col-1" style="color:black; font-weight:bold;">　【 以 下 空 白 】</td><td colspan="2"></td>';
        } else {
            tr.innerHTML = '<td colspan="3">&nbsp;</td>';
        }
        tbody.appendChild(tr);
    }
};

window.createManualBill = function () {
    const emptyStudent = {
        name: "姓名",
        grade: "",
        school: "",
        total: 0,
        items: [{ name: "科目名稱", dateHtml: "日期", price: 0 }],
        selected: true,
        isChanged: true
    };
    billStudents.push(emptyStudent);
    loadBill(billStudents.length - 1);
};

window.toggleBillSelection = function(index) {
    const cb = document.getElementById(`billCheck_${index}`);
    if (billStudents[index]) {
        billStudents[index].selected = cb.checked;
        
        // 更新 label 顏色
        const label = cb.closest('label');
        if (cb.checked) {
            label.style.background = '#e8f6e9';
        } else {
            label.style.background = '#fff3e0';
        }
    }
};

window.downloadCurrentBill = function () {
    const element = document.getElementById('billArea');
    const name = document.getElementById('billName').textContent || "學費單";
    html2canvas(element, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${name}_學費單.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

window.sendBillToLine = async function () {
    if (typeof currentBillIndex === 'undefined' || !billStudents[currentBillIndex]) {
        if (typeof Swal !== 'undefined') {
            Swal.fire("發送失敗", "無法取得目前學費單資料，請先產生學費單！", "error");
        } else {
            alert("發送失敗：無法取得目前學費單資料，請先產生學費單！");
        }
        return;
    }

    // 從現有學費單物件中取得資料
    const s = billStudents[currentBillIndex];
    const courseName = s.items.map(item => item.name).filter(n => n && n !== '科目名稱').join('、') || "科學課程";

    const element = document.getElementById('billArea');
    const studentName = document.getElementById('billName').textContent || s.name || "未知姓名";

    // 確認是否發送
    let userConfirmed = true;
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '確認發送學費單？',
            html: `即將發送 <b>${studentName}</b> 的專屬學費單至 LINE<br><br>這需要幾秒鐘的時間產生圖片並上傳，請稍候。`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2ecc71',
            cancelButtonColor: '#d33',
            confirmButtonText: '🚀 確定發送',
            cancelButtonText: '取消'
        });
        userConfirmed = result.isConfirmed;
    } else {
        userConfirmed = confirm(`確認發送學費單？\n\n即將發送 ${studentName} 的專屬學費單至 LINE\n\n這需要幾秒鐘的時間產生圖片並上傳，請稍候。`);
    }

    if (!userConfirmed) return;

    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: '圖片產生與傳送中...',
            html: '正在對接山熊魔法通道 🚀',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });
    }

    try {
        const canvas = await html2canvas(element, { scale: 2 });
        const base64Data = canvas.toDataURL("image/png");

        // 取得設定好的 Webhook 網址 (從 settings/gasWebhookUrl)
        const scriptUrl = gasWebhookUrl;

        if (!scriptUrl) {
            if (typeof Swal !== 'undefined') {
                Swal.fire("發送失敗", "尚未設定 GAS Webhook API 網址，請先至下方【系統設定】頁面設定！", "error");
            } else {
                alert("發送失敗：尚未設定 GAS Webhook API 網址，請先至下方【系統設定】頁面設定！");
            }
            return;
        }

        // 為了完美避開 CORS 阻擋 (Load failed)，發送時不要使用 URLSearchParams，
        // 也不要用隱藏表單 (因為圖檔 Base64 容易超出表單上限)。
        // 這裡改使用純文字 (text/plain) 將 JSON 字串包入 body 送出，GAS 的 doPost() 可以直接讀取 e.postData.contents 解析。
        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: JSON.stringify({
                'action': 'send_bill_to_line',
                'studentName': studentName,
                'courseNames': courseName,
                'base64Data': base64Data
            }),
            headers: {
                // 不能用 application/json 否則會觸發 CORS preflight 導致被 block
                'Content-Type': 'text/plain;charset=utf-8',
            }
        });

        // 雖然是 text/plain 發出，但 GAS 理論上會回傳 MimeType JSON 的資料回來
        const resData = await response.json();

        if (typeof Swal !== 'undefined') {
            if (resData.success) {
                // 發送成功後，將此次版本記錄進 Firebase
                await set(ref(db, `bill_sent/${s.phone}/${s.name}/last_version`), s.currentVersion);
                
                // 動態更新當前畫面狀態
                s.isChanged = false;
                loadBill(currentBillIndex);
                
                Swal.fire("發送成功！", resData.msg, "success");
            } else {
                Swal.fire("發送失敗", resData.msg, "error");
            }
        } else {
            if (resData.success) {
                await set(ref(db, `bill_sent/${s.phone}/${s.name}/last_version`), s.currentVersion);
                s.isChanged = false;
                loadBill(currentBillIndex);
            }
            alert(resData.success ? "發送成功！\n" + resData.msg : "發送失敗：\n" + resData.msg);
        }
    } catch (error) {
        console.error("LINE 發送錯誤:", error);
        if (typeof Swal !== 'undefined') {
            Swal.fire("發送發生異常", error.message, "error");
        } else {
            alert("發送發生異常：\n" + error.message);
        }
    }
};

window.downloadAllBills = async function () {
    if (!confirm(`確定要下載全部 ${billStudents.length} 張學費單嗎？`)) return;

    for (let i = 0; i < billStudents.length; i++) {
        loadBill(i);
        await new Promise(r => setTimeout(r, 500));
        const element = document.getElementById('billArea');
        const name = billStudents[i].name;

        await html2canvas(element, { scale: 2 }).then(canvas => {
            const link = document.createElement('a');
            link.download = `${name}_學費單.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    }
    alert("✅ 全部下載完成！");
};

window.sendAllBillsToLine = async function () {
    const scriptUrl = gasWebhookUrl;
    if (!scriptUrl) {
        if (typeof Swal !== 'undefined') {
            Swal.fire("發送失敗", "尚未設定 GAS Webhook API 網址，請先至下方【系統設定】頁面設定！", "error");
        } else {
            alert("發送失敗：尚未設定 GAS Webhook API 網址，請先至下方【系統設定】頁面設定！");
        }
        return;
    }

    if (billStudents.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire("發送失敗", "目前沒有任何學費單可發送，請先計算！", "error");
        } else {
            alert("發送失敗：目前沒有任何學費單可發送，請先計算！");
        }
        return;
    }

    const selectedBills = billStudents.filter(s => s.selected);
    
    if (selectedBills.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire("發送失敗", "目前沒有勾選任何需要發送的學費單！", "warning");
        } else {
            alert("發送失敗：目前沒有勾選任何需要發送的學費單！");
        }
        return;
    }

    let userConfirmed = true;
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: `確認一鍵發送 ${selectedBills.length} 張學費單？`,
            html: `只會發送目前畫面上【有勾選】的學費單。<br><br>這將會逐一產生圖片並發送到對應家長的 LINE。<br>請準備好等候幾十秒鐘。`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#27ae60',
            cancelButtonColor: '#d33',
            confirmButtonText: '🚀 全部發送！',
            cancelButtonText: '取消'
        });
        userConfirmed = result.isConfirmed;
    } else {
        userConfirmed = confirm(`確認一鍵發送 ${selectedBills.length} 張學費單？\n\n只會發送有勾選的學費單。\n會花費數十秒鐘，請按確定後耐心等待。`);
    }

    if (!userConfirmed) return;

    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: '大批學費單產生與傳送中...',
            html: '正在對接山熊魔法通道，請勿關閉網頁 🚀',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });
    }

    let successCount = 0;
    let failedList = [];

    const barArea = document.getElementById('billProgressArea');
    const barText = document.getElementById('billProgressText');
    const barFill = document.getElementById('billProgressFill');
    const reportEl = document.getElementById('billReportArea');

    if (barArea) {
        barArea.style.display = 'block';
        if (barText) barText.innerText = `0 / ${selectedBills.length}`;
        if (barFill) barFill.style.width = `0%`;
    }
    if (reportEl) {
        reportEl.style.display = 'none';
        reportEl.innerHTML = '';
    }

    for (let i = 0; i < billStudents.length; i++) {
        const s = billStudents[i];
        if (!s.selected) continue; // 略過沒勾選的
        
        // 更新 UI (若 Swal 存在則更新內文進度)
        if (typeof Swal !== 'undefined' && Swal.isVisible()) {
            Swal.update({ html: `正在處理第 <b>${successCount + failedList.length + 1} / ${selectedBills.length}</b> 張學費單 (${s.name})...` });
        }

        if (barText) barText.innerText = `${successCount + failedList.length + 1} / ${selectedBills.length} (${s.name})`;
        if (barFill) barFill.style.width = `${((successCount + failedList.length) / selectedBills.length) * 100}%`;

        loadBill(i);
        await new Promise(r => setTimeout(r, 600)); // 等待畫面渲染

        const courseName = s.items.map(item => item.name).filter(n => n && n !== '科目名稱').join('、') || "科學課程";
        const element = document.getElementById('billArea');
        const studentName = document.getElementById('billName').textContent || s.name || "未知姓名";

        try {
            const canvas = await html2canvas(element, { scale: 2 });
            const base64Data = canvas.toDataURL("image/png");

            const resData = await fetch(scriptUrl, {
                method: 'POST',
                body: JSON.stringify({
                    'action': 'send_bill_to_line',
                    'studentName': studentName,
                    'courseNames': courseName,
                    'base64Data': base64Data
                }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            }).then(r => r.json());

            if (resData.success) {
                successCount++;
                // 發送成功後，將此次版本記錄進 Firebase
                await set(ref(db, `bill_sent/${s.phone}/${s.name}/last_version`), s.currentVersion);
                s.isChanged = false;
                s.selected = false; // 發送完畢關閉勾選
            } else {
                failedList.push({ name: studentName, reason: resData.msg });
            }
        } catch (error) {
            console.error(`發送給 ${studentName} 時發生錯誤:`, error);
            failedList.push({ name: studentName, reason: error.message || '網路傳輸錯誤' });
        }

        if (barFill) barFill.style.width = `${((successCount + failedList.length) / selectedBills.length) * 100}%`;
    }

    // 將畫面還原到最後處理的狀態或回到第一張以更新選取狀態
    if (billStudents.length > 0) loadBill(0);

    if (barText) barText.innerText = `✅ 發送完畢 (${selectedBills.length} / ${selectedBills.length})`;

    // 發送完成結果報告
    if (typeof Swal !== 'undefined') {
        if (failedList.length > 0) {
            Swal.fire(
                "批次發送完成！",
                `共成功處理 ${successCount} 張，失敗 <b>${failedList.length}</b> 張。<br>請查看網頁上的失敗清單。`,
                "warning"
            );
        } else {
            Swal.fire(
                "大成功！",
                `共成功處理 ${successCount} 張學費單，<br>請家長陸續到各自的 LINE 確認收件。`,
                "success"
            );
        }
    } else {
        alert(`批次發送完成！共成功 ${successCount} 張，失敗 ${failedList.length} 張。`);
    }

    // Render report onto billReportArea
    if (reportEl) {
        if (failedList.length > 0) {
            reportEl.style.display = 'block';
            let html = `<div style="background:#fdebd0; border:2px solid #e67e22; border-radius:8px; padding:15px; text-align:left;">
                <h3 style="color:#d35400; margin-top:0;">⚠️ 傳送失敗名單 (共 ${failedList.length} 筆)</h3>
                <ul style="color:#c0392b; line-height:1.6; margin-bottom:0; font-weight:bold; font-size:14px;">`;
            failedList.forEach(f => {
                html += `<li>${f.name} - 原因：${f.reason}</li>`;
            });
            html += `</ul></div>`;
            reportEl.innerHTML = html;
        } else if (successCount > 0) {
            reportEl.style.display = 'block';
            reportEl.innerHTML = `<div style="background:#d5f5e3; border:2px solid #27ae60; border-radius:8px; padding:15px; color:#1e8449; font-weight:bold; text-align:center;">
                🎉 太棒了！本次發送 0 失敗，全部推播成功！
            </div>`;
        } else {
            reportEl.style.display = 'none';
        }
    }
};

window.initPrintPage = function () {
    updatePrintCourseList();
};

window.updatePrintCourseList = function () {
    const source = document.getElementById('printSourceSelector').value;
    const selector = document.getElementById('printCourseSelector');
    const saveArea = document.getElementById('manualSaveArea');

    selector.innerHTML = '<option value="">請選擇...</option>';
    saveArea.style.display = 'none';

    if (source === 'live') {
        saveArea.style.display = 'flex';
        Object.keys(coursesData).forEach(key => {
            const c = coursesData[key];
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `[Live] ${c.grade} ${c.subject} ${c.classType || ''}`;
            selector.appendChild(option);
        });
    } else if (source === 'manual') {
        saveArea.style.display = 'flex';
        Object.keys(printLayouts).forEach(key => {
            const layout = printLayouts[key];
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `[Saved] ${layout.name}`;
            selector.appendChild(option);
        });
    } else if (source === 'empty') {
        saveArea.style.display = 'flex';
        Object.keys(classrooms).forEach(key => {
            const c = classrooms[key];
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `[Empty] ${c.name}`;
            selector.appendChild(option);
        });
    }
};

window.generateSeatingChart = function () {
    const source = document.getElementById('printSourceSelector').value;
    const selectedId = document.getElementById('printCourseSelector').value;
    const grid = document.getElementById('printGrid');
    grid.innerHTML = "";

    if (!selectedId) return;

    let layoutToRender = null;
    let currentSeats = {};
    let classroomName = "";
    let classType = "";
    let time = "";
    let teacher = "";

    if (source === 'live') {
        const c = coursesData[selectedId];
        if (!c) return;

        classroomName = classrooms[c.classroom] ? classrooms[c.classroom].name : c.classroom;
        classType = `班級：${c.subject} ${c.classType || ''}`;
        time = `上課時間：${c.timeDescription || '-'}`;
        teacher = `老師：${c.teacher}`;

        layoutToRender = c.layout || (classrooms[c.classroom] ? classrooms[c.classroom].layout : null);
        currentSeats = seatsData[selectedId] || {};

    } else if (source === 'manual') {
        const saved = printLayouts[selectedId];
        if (!saved) return;

        classroomName = saved.classroomName;
        classType = `班級：${saved.name}`;
        time = `上課時間：${saved.time || ''}`;
        teacher = `老師：${saved.teacher || ''}`;

        layoutToRender = saved.layout;

    } else if (source === 'empty') {
        const c = classrooms[selectedId];
        if (!c) return;

        classroomName = c.name;
        classType = "班級：(請點擊輸入)";
        time = "上課時間：";
        teacher = "老師：";
        layoutToRender = c.layout;
        currentSeats = {};
    }

    if (!layoutToRender) return;

    document.getElementById('p_classroom').textContent = classroomName;
    document.getElementById('p_classType').textContent = classType;
    document.getElementById('p_time').textContent = time;
    document.getElementById('p_teacher').textContent = teacher;

    document.getElementById('p_classType').contentEditable = true;
    document.getElementById('p_time').contentEditable = true;
    document.getElementById('p_teacher').contentEditable = true;

    layoutToRender.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'print-row';
        row.forEach(seatCode => {
            const seat = document.createElement('div');
            seat.className = 'print-seat';

            let code = seatCode;
            let isBlocked = false;

            if (code.includes(':X')) { code = code.split(':')[0]; isBlocked = true; }

            if (code === "_") {
                seat.classList.add('aisle');
            } else if (code === "DOOR") {
                seat.classList.add('door');
                seat.textContent = "門";
            } else if (code === "PILLAR") {
                seat.classList.add('pillar');
                seat.textContent = "柱";
            } else {
                if (isBlocked) {
                    seat.classList.add('blocked');
                    seat.textContent = code;
                } else {
                    seat.dataset.id = code;
                    seat.contentEditable = true;

                    if (source === 'live') {
                        const info = currentSeats[code];
                        if (info && info.status === 'sold') {
                            seat.textContent = info.studentName;
                            if (info.studentName.length > 3) seat.style.fontSize = "18px";
                        }
                    } else if (source === 'manual') {
                        const saved = printLayouts[selectedId];
                        if (saved.seatMap && saved.seatMap[code]) {
                            seat.textContent = saved.seatMap[code];
                            if (saved.seatMap[code].length > 3) seat.style.fontSize = "18px";
                        }
                    }
                }
            }
            rowDiv.appendChild(seat);
        });
        grid.appendChild(rowDiv);
    });

    setTimeout(() => {
        const container = document.querySelector('.print-container');
        const gridEl = document.getElementById('printGrid');

        gridEl.style.transform = 'none';

        const availableWidth = container.clientWidth - 40;
        const gridWidth = gridEl.scrollWidth;

        if (gridWidth > availableWidth && availableWidth > 0) {
            const scale = availableWidth / gridWidth;
            gridEl.style.transform = `scale(${scale})`;
        }
    }, 100);
};

window.saveManualLayout = function () {
    const saveName = document.getElementById('manualSaveName').value.trim();
    if (!saveName) return alert("請輸入存檔名稱！");

    let existingKey = null;
    for (let key in printLayouts) {
        if (printLayouts[key].name === saveName) {
            existingKey = key;
            break;
        }
    }

    if (existingKey) {
        if (!confirm(`⚠️ 檔名「${saveName}」已存在，是否要覆蓋原本的存檔？`)) {
            return;
        }
    }

    const source = document.getElementById('printSourceSelector').value;
    const selectedId = document.getElementById('printCourseSelector').value;

    const seatMap = {};
    document.querySelectorAll('.print-seat[data-id]').forEach(seat => {
        const text = seat.textContent.trim();
        if (text) {
            seatMap[seat.dataset.id] = text;
        }
    });

    const classType = document.getElementById('p_classType').textContent;
    const time = document.getElementById('p_time').textContent;
    const teacher = document.getElementById('p_teacher').textContent;
    const classroomName = document.getElementById('p_classroom').textContent;

    let baseLayout = [];
    if (source === 'live') {
        const c = coursesData[selectedId];
        baseLayout = c.layout || classrooms[c.classroom].layout;
    } else if (source === 'empty') {
        baseLayout = classrooms[selectedId].layout;
    } else if (source === 'manual') {
        baseLayout = printLayouts[selectedId].layout;
    }

    const saveId = existingKey ? existingKey : "LAYOUT_" + Date.now();
    const saveData = {
        name: saveName,
        classroomName: classroomName,
        classType: classType,
        time: time,
        teacher: teacher,
        layout: baseLayout,
        seatMap: seatMap,
        updatedAt: Date.now()
    };

    update(ref(db, `print_layouts/${saveId}`), saveData).then(() => {
        alert("✅ 已另存新檔！您可以在「手動排位存檔」中找到它。");
        document.getElementById('printSourceSelector').value = 'manual';
        updatePrintCourseList();
    }).catch(err => alert("存檔失敗：" + err.message));
};

window.downloadSeatingChart = function () {
    const element = document.querySelector('.print-container');
    const title = document.getElementById('p_classType').textContent.replace('班級：', '').trim() || "座位表";
    const filename = `${title}_座位表.png`;

    html2canvas(element, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

// ★★★ V36.0 雲端圖庫邏輯 (共用模組) ★★★
let bannerGalleryData = {};
let coverGalleryData = {};
let currentGalleryType = 'banner';

onValue(ref(db, 'banner_gallery'), (snapshot) => {
    bannerGalleryData = snapshot.val() || {};
    if (document.getElementById('galleryModal').style.display === 'flex' && currentGalleryType === 'banner') {
        renderGalleryGrid();
    }
});

onValue(ref(db, 'cover_gallery'), (snapshot) => {
    coverGalleryData = snapshot.val() || {};
    if (document.getElementById('galleryModal').style.display === 'flex' && currentGalleryType === 'cover') {
        renderGalleryGrid();
    }
});

window.openBannerGalleryModal = function (type = 'regular') {
    currentGalleryType = type === 'trial' ? 'trial_banner' : 'banner';
    document.getElementById('galleryModalTitle').textContent = type === 'trial' ? "☁️ 雲端試聽首頁橫幅圖庫" : "☁️ 雲端橫幅圖庫";
    document.getElementById('galleryModalDesc').textContent = "點擊圖片即可將其設為首頁輪播圖！";
    document.getElementById('galleryModal').style.display = 'flex';
    renderGalleryGrid();
};

window.openCoverGalleryModal = function (target = 'course') {
    // target can be 'course' or 'trial'
    currentGalleryType = target === 'trial' ? 'cover_trial' : 'cover';
    document.getElementById('galleryModalTitle').textContent = "🖼️ 雲端課程封面圖庫";
    document.getElementById('galleryModalDesc').textContent = "點擊圖片即可將其設為本課程封面！";
    document.getElementById('galleryModal').style.display = 'flex';
    renderGalleryGrid();
};

window.closeGalleryModal = function () {
    document.getElementById('galleryModal').style.display = 'none';
};

window.renderGalleryGrid = function () {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = "";

    const dataSource = (currentGalleryType === 'banner' || currentGalleryType === 'trial_banner') ? bannerGalleryData : coverGalleryData;
    const keys = Object.keys(dataSource).sort((a, b) => dataSource[b].createdAt - dataSource[a].createdAt);

    if (keys.length === 0) {
        grid.innerHTML = "<div style='grid-column: 1 / -1; text-align: center; color: #999; padding: 20px;'>雲端圖庫目前是空的。</div>";
        return;
    }

    keys.forEach(key => {
        const item = dataSource[key];
        const date = new Date(item.createdAt).toLocaleDateString();
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `
                    <button class="btn-gallery-del" onclick="deleteGalleryItem('${key}', event)" title="從圖庫永久刪除">✕</button>
                    <img src="${item.url}" class="gallery-img" onclick="selectFromGallery('${item.url}', '${item.name}')" title="點擊套用">
                    <div class="gallery-info" title="${item.name}">${item.name}<br><span style="font-size:10px;color:#999;">${date}</span></div>
                `;
        grid.appendChild(div);
    });
};

window.selectFromGallery = async function (url, name) {
    if (currentGalleryType === 'banner' || currentGalleryType === 'trial_banner') {
        if (confirm(`確定要將「${name}」加入首頁輪播圖嗎？`)) {
            try {
                const dbNode = currentGalleryType === 'trial_banner' ? 'trial_banners' : 'banners';
                await push(ref(db, dbNode), { url: url, createdAt: Date.now(), source: 'gallery' });
                alert("✅ 成功加入首頁輪播圖！");
                closeGalleryModal();
            } catch (err) {
                alert("加入失敗：" + err.message);
            }
        }
    } else if (currentGalleryType === 'cover') {
        document.getElementById('c_image_url').value = url;
        window.previewImage(url, 'imgPreview', 'c_image_url');
        closeGalleryModal();
    } else if (currentGalleryType === 'cover_trial') {
        document.getElementById('e_coverImage').value = url;
        window.previewImage(url, 'e_imgPreview', 'e_coverImage');
        closeGalleryModal();
    }
};

window.deleteGalleryItem = async function (key, event) {
    event.stopPropagation();
    const targetNode = (currentGalleryType === 'banner' || currentGalleryType === 'trial_banner') ? 'banner_gallery' : 'cover_gallery';

    if (confirm("⚠️ 確定要從雲端圖庫中永久刪除這張圖片嗎？")) {
        try {
            await remove(ref(db, `${targetNode}/${key}`));
        } catch (err) {
            alert("刪除失敗：" + err.message);
        }
    }
};

// ★★★ V36.1 封面圖庫批次上傳邏輯 ★★★
window.uploadMultipleCovers = async function (input) {
    const files = input.files;
    if (files.length === 0) return;

    const statusEl = document.getElementById('uploadStatus');
    statusEl.style.color = "#3498db";

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        statusEl.textContent = `🚀 正在上傳第 ${i + 1} / ${files.length} 張圖片：${file.name}...`;

        try {
            const storagePath = `cover_gallery/${Date.now()}_${file.name}`;
            const imgRef = storageRef(storage, storagePath);
            await uploadBytes(imgRef, file, { contentType: file.type });
            const url = await getDownloadURL(imgRef);

            await push(ref(db, 'cover_gallery'), {
                name: file.name.split('.')[0],
                url: url,
                createdAt: Date.now()
            });
        } catch (err) {
            console.error(`上傳 ${file.name} 失敗:`, err);
            alert(`❌ 圖片 ${file.name} 上傳失敗！請檢查密碼或網路。`);
            input.value = "";
            statusEl.textContent = "";
            return;
        }
    }

    statusEl.style.color = "#27ae60";
    statusEl.textContent = `✅ 批次上傳完成！共存入 ${files.length} 張封面。`;
    input.value = "";

    setTimeout(() => { statusEl.textContent = ""; }, 3000);
};

// ==========================================
// 🤖 試聽報名監控與智能分發引擎 (Trial Booking Engine)
// ==========================================
let trialRegistrations = [];
let trialSort = { col: 'timestamp', asc: true };
let currentTrialEventId = "";
let unsubscribeTrial = null;

// ★ 實時監聽試聽報名數據 (動態榜單)
window.listenToTrialRegistrations = function (eventId) {
    if (unsubscribeTrial) {
        unsubscribeTrial(); // 取消之前的監聽
        unsubscribeTrial = null;
    }

    trialRegistrations = [];
    renderTrialMonitorTable();

    if (!eventId) return;

    unsubscribeTrial = onValue(ref(db, `trial_events/registrations/${eventId}`), (snapshot) => {
        trialRegistrations = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            trialRegistrations = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            }));
        }
        renderTrialMonitorTable();
    });
};




const prefMap = {
    "both_any": "所有雙科皆可",
    "both_day1": "Day 1 雙科優先",
    "both_day2": "Day 2 雙科優先",
    "math_any": "單補數學皆可",
    "math_day1_slotA": "數：Day 1 時段 A",
    "math_day1_slotB": "數：Day 1 時段 B",
    "math_day2_slotA": "數：Day 2 時段 A",
    "math_day2_slotB": "數：Day 2 時段 B",
    "sci_any": "單補自然皆可",
    "sci_day1_slotA": "自：Day 1 時段 A",
    "sci_day1_slotB": "自：Day 1 時段 B",
    "sci_day2_slotA": "自：Day 2 時段 A",
    "sci_day2_slotB": "自：Day 2 時段 B"
};

window.renderTrialMonitorTable = function () {
    const tbody = document.getElementById('trialMonitorTable');
    if (!tbody) return;
    tbody.innerHTML = "";

    const searchKeyword = (document.getElementById('trialSearchInput')?.value || "").toLowerCase();

    // 過濾
    let filteredList = trialRegistrations.filter(student => {
        if (!searchKeyword) return true;
        const nameMatch = (student.studentName || "").toLowerCase().includes(searchKeyword);
        const phoneMatch = (student.parentPhone || "").includes(searchKeyword);
        const statusMatch = (student.assignDesc || "").toLowerCase().includes(searchKeyword);
        const rawStatusMatch = (student.status === "deleted" && "已取消報名".includes(searchKeyword));
        return nameMatch || phoneMatch || statusMatch || rawStatusMatch;
    });

    // 排序
    filteredList.sort((a, b) => {
        let valA, valB;
        if (trialSort.col === 'timestamp') { valA = a.clientTimestampMs || 0; valB = b.clientTimestampMs || 0; }
        else if (trialSort.col === 'name') { valA = a.studentName || ''; valB = b.studentName || ''; }
        else if (trialSort.col === 'phone') { valA = a.parentPhone || ''; valB = b.parentPhone || ''; }
        else if (trialSort.col === 'result') { valA = a.assignDesc || ''; valB = b.assignDesc || ''; }

        if (valA < valB) return trialSort.asc ? -1 : 1;
        if (valA > valB) return trialSort.asc ? 1 : -1;
        return 0;
    });

    const nameCounts = {};
    // 排除 deleted（已取消），只計算有效報名的重複姓名
    filteredList.forEach(student => {
        if (student.status !== 'deleted') {
            nameCounts[student.studentName] = (nameCounts[student.studentName] || 0) + 1;
        }
    });

    // 動態重複調色盤：用名字算出專屬背景色，保證同一人顏色一樣，不同群組顏色不同。
    const duplicatePalette = ['#ffe6e6', '#e6f2ff', '#e6ffe6', '#fffada', '#f2e6ff', '#ffebe6'];
    const getColorForName = (name) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return duplicatePalette[Math.abs(hash) % duplicatePalette.length];
    };

    filteredList.forEach(student => {
        const tr = document.createElement('tr');
        const timeStr = window.formatTimeWithMs(student.clientTimestampMs);

        if (student.status !== 'deleted' && nameCounts[student.studentName] > 1) {
            const rowColor = getColorForName(student.studentName);
            tr.style.backgroundColor = rowColor;
        }

        // 整理志願字串
        let prefArr = [];
        if (student.preferences) {
            for (let i = 1; i <= 6; i++) {
                let rawVal = student.preferences[`choice${i}`];
                if (rawVal && rawVal !== "none") {
                    let displayVal = prefMap[rawVal] || rawVal;
                    prefArr.push(`<span class="badge" style="background:#34495e; color:white; font-size:11px;">#${i}: ${displayVal}</span>`);
                }
            }
        }
        const prefStr = prefArr.length > 0 ? prefArr.join(" ") : "無志願資料";

        // 結果標籤與刪除樣式
        let resultBadge = student.assignDesc
            ? `<span class="badge" style="background:#2ecc71;">${student.assignDesc}</span>`
            : `<span class="badge" style="background:#95a5a6;">尚未分發</span>`;

        let trStyle = "";
        let btnHtml = `<button class="danger" style="padding:5px 10px; font-size:12px;" onclick="deleteTrialRegistration('${student.id}', false)">取消資格</button>`;

        if (student.status === "deleted") {
            resultBadge = `<span class="badge" style="background:#34495e;">已取消報名</span>`;
            trStyle = "opacity: 0.5; text-decoration: line-through; background:#f9f9f9;";
            btnHtml = `<button class="success" style="padding:5px 10px; font-size:12px; margin-right:5px;" onclick="recoverTrialRegistration('${student.id}')">復原資格</button>
                       <button class="dark" style="padding:5px 10px; font-size:12px;" onclick="deleteTrialRegistration('${student.id}', true)">永久刪除</button>`;
        } else if (student.assignDesc === "排位失敗 / 候補中") {
            resultBadge = `<span class="badge" style="background:#e74c3c;">${student.assignDesc}</span>`;
        }

        tr.innerHTML = `
            <td style="${trStyle}">${timeStr}</td>
            <td style="font-weight:bold; ${trStyle}">${window.escapeHTML(student.studentName)}</td>
            <td style="${trStyle}">${window.escapeHTML(student.parentPhone)}</td>
            <td style="max-width:300px; display:flex; flex-wrap:wrap; gap:5px; ${trStyle}">${prefStr}</td>
            <td>${resultBadge}</td>
            <td>${btnHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.sortTrialTable = function (col) {
    if (trialSort.col === col) {
        trialSort.asc = !trialSort.asc;
    } else {
        trialSort.col = col;
        trialSort.asc = true;
    }
    renderTrialMonitorTable();
}

window.deleteTrialRegistration = async function (id, isHardDelete) {
    if (!currentTrialEventId) return alert("⚠️ 請先選擇上方的試聽活動。");

    if (isHardDelete) {
        if (confirm("⚠️ 確定要【永久刪除】這筆資料嗎？刪除後無法復原。")) {
            try {
                await remove(ref(db, `trial_events/registrations/${currentTrialEventId}/${id}`));
            } catch (e) {
                alert('刪除失敗：' + e.message);
            }
        }
    } else {
        if (confirm("確定要【取消】這名學生的報名資格嗎？(將會有刪除線，並從分發名單中剃除)")) {
            try {
                await update(ref(db, `trial_events/registrations/${currentTrialEventId}/${id}`), { status: 'deleted' });
            } catch (e) {
                alert('取消失敗：' + e.message);
            }
        }
    }
}

window.recoverTrialRegistration = async function (id) {
    if (!currentTrialEventId) return alert("⚠️ 請先選擇上方的試聽活動。");

    if (confirm("💡 確定要【復原】這名學生的報名資格嗎？\n(他將會重新回到「候補中/待分發」狀態，需重新點擊 AI 分發按鈕)")) {
        try {
            await update(ref(db, `trial_events/registrations/${currentTrialEventId}/${id}`), { status: 'pending' });
        } catch (e) {
            alert('復原失敗：' + e.message);
        }
    }
}
// ==========================================
// Phase 5: 動態試聽活動管理 (Trial Events Config)
// ==========================================
let trialEventsConfig = {};

onValue(ref(db, 'trial_events_config'), (snapshot) => {
    trialEventsConfig = snapshot.val() || {};
    renderTrialEventsList();
});

window.renderTrialEventsList = function () {
    const container = document.getElementById('eventList');
    const selector = document.getElementById('trialEventSelector');

    if (selector) {
        const oldVal = selector.value;
        // 依 sortOrder 排序下拉選單
        const sortedIds = Object.keys(trialEventsConfig).sort((a, b) => {
            const orderA = trialEventsConfig[a].sortOrder !== undefined ? trialEventsConfig[a].sortOrder : 999999;
            const orderB = trialEventsConfig[b].sortOrder !== undefined ? trialEventsConfig[b].sortOrder : 999999;
            return orderA - orderB;
        });
        selector.innerHTML = '<option value="">―― 請選擇試聽活動 ――</option>';
        sortedIds.forEach(id => {
            const ev = trialEventsConfig[id];
            selector.innerHTML += `<option value="${id}">${ev.title || id}</option>`;
        });
        if (trialEventsConfig[oldVal]) {
            selector.value = oldVal;
        }
    }

    if (!container) return;
    container.innerHTML = "";

    const typesMap = {
        "single_session": "單場次秒殺模式",
        "multi_choice": "多梯次志願模式",
        "dual_match": "雙科配課模式",
        "waitlist_only": "純候補抽放模式"
    };

    const statusMap = {
        "active": `<span style="color:#2ecc71; font-weight:bold;">🟢 開放報名中</span>`,
        "allocating": `<span style="color:#f39c12; font-weight:bold;">🟡 暫停/排位中</span>`,
        "closed": `<span style="color:#e74c3c; font-weight:bold;">🔴 已結束</span>`
    };

    // ★ 依 sortOrder 排序後再渲染
    const sortedIds = Object.keys(trialEventsConfig).sort((a, b) => {
        const orderA = trialEventsConfig[a].sortOrder !== undefined ? trialEventsConfig[a].sortOrder : 999999;
        const orderB = trialEventsConfig[b].sortOrder !== undefined ? trialEventsConfig[b].sortOrder : 999999;
        return orderA - orderB;
    });

    sortedIds.forEach(eventId => {
        const ev = trialEventsConfig[eventId];
        const sessionCount = ev.sessions ? Object.keys(ev.sessions).length : 0;

        let div = document.createElement('div');
        div.className = "admin-course-card";
        div.dataset.id = eventId;
        div.onclick = (e) => { if (!e.target.classList.contains('btn-delete') && !e.target.classList.contains('drag-handle')) editEvent(eventId); };
        div.innerHTML = `
            <div class="drag-handle" title="拖曳排序" style="position:absolute; top:8px; left:8px; font-size:18px; color:#bdc3c7; cursor:grab; z-index:10; line-height:1; user-select:none;">☰</div>
            <div class="card-thumb" style="background-image: url('${ev.coverImage || ''}'); ${!ev.coverImage ? 'background:#bdc3c7; display:flex; align-items:center; justify-content:center;' : ''}">
                ${!ev.coverImage ? '<span style="color:white; font-size:30px;">✨</span>' : ''}
            </div>
            <button class="btn-delete" onclick="window.deleteEvent('${eventId}', event)">刪除</button>
            <div class="card-content">
                <h3>${ev.title || "未命名活動"}</h3>
                <p>📋 ${typesMap[ev.type] || ev.type}</p>
                <p>${statusMap[ev.status] || ev.status}</p>
                <p style="font-family:monospace; font-size:11px; color:#95a5a6; margin-top:8px;">ID: ${eventId}</p>
            </div>
        `;
        container.appendChild(div);
    });

    if (Object.keys(trialEventsConfig).length === 0) {
        container.innerHTML = "<p style='text-align:center; width:100%; color:#95a5a6;'>目前尚未建立任何試聽活動</p>";
    }

    // ★ 初始化 SortableJS
    if (window.Sortable) {
        if (container._sortable) container._sortable.destroy();
        container._sortable = new Sortable(container, {
            animation: 200,
            handle: '.drag-handle',
            onEnd: function () {
                const updates = {};
                Array.from(container.children).forEach((el, index) => {
                    const id = el.dataset.id;
                    if (id) updates[`trial_events_config/${id}/sortOrder`] = index;
                });
                update(ref(db), updates).then(() => {
                    Swal.fire({ icon: 'success', title: '排序已儲存 ✅', timer: 1500, showConfirmButton: false });
                }).catch(err => Swal.fire('錯誤', '儲存排序失敗：' + err.message, 'error'));
            }
        });
    }
};

window.switchTrialEvent = function () {
    const selector = document.getElementById('trialEventSelector');
    currentTrialEventId = selector.value;

    // 清空舊的面板數據
    const statusEl = document.getElementById('aiEngineStatus');
    statusEl.innerHTML = currentTrialEventId ? `✅ 已切換至活動：${currentTrialEventId}，等待分發...` : "⚠️ 請先選擇上方的試聽活動。";
    statusEl.style.color = currentTrialEventId ? "#2ecc71" : "#e74c3c";

    document.getElementById('trialResultsBoard').style.display = 'none';
    document.getElementById('trialClassesGrid').innerHTML = '';
    document.getElementById('trialWaitlistBoard').innerHTML = '';
    document.getElementById('trialWaitlistByClassGrid').innerHTML = '';

    // 動態建構本活動專屬的「各班招收名額預設值設定」
    const capContainer = document.getElementById('dynamicCapacitiesContainer');
    if (capContainer) {
        if (!currentTrialEventId || !trialEventsConfig[currentTrialEventId] || !trialEventsConfig[currentTrialEventId].sessions) {
            capContainer.innerHTML = '請先選擇上方支援場次的試聽活動...';
        } else {
            let html = '';
            const sess = trialEventsConfig[currentTrialEventId].sessions;
            for (let key in sess) {
                html += `<div style="display:flex; align-items:center; min-width:180px;"><label style="margin-right:5px;">${sess[key].name}:</label> <input type="number" id="cap_${key}" value="${sess[key].capacity}" style="width:60px; padding:4px;"></div>`;
            }
            capContainer.innerHTML = html;
        }
    }

    // 掛載實時監聽
    listenToTrialRegistrations(currentTrialEventId);
};

window.showEventForm = function () {
    document.getElementById('eventListView').style.display = 'none';
    document.getElementById('eventFormView').style.display = 'block';
    document.getElementById('eventFormTitle').innerText = '➕ 新增試聽活動';

    // 歸零並隱藏快捷區塊
    document.getElementById('dualMatchQuickSet').style.display = 'none';
    document.getElementById('qm_day1').value = '';
    document.getElementById('qm_day2').value = '';
    document.getElementById('qm_timeA').value = '';
    document.getElementById('qm_timeB').value = '';

    document.getElementById('e_id').value = '';
    document.getElementById('e_title').value = '';
    document.getElementById('e_type').value = 'single_session';
    document.getElementById('e_coverImage').value = '';
    document.getElementById('e_teacher').value = '';
    document.getElementById('e_openTime').value = '';
    document.getElementById('e_closeTime').value = '';
    document.getElementById('e_earlyAccessSec').value = '0';
    document.getElementById('e_maxChoices').value = '2';
    document.getElementById('e_status').value = 'active';

    // ★★★ 核心修改：載入試聽預設文案 (預設為 single_session) ★★★
    if (tinymce.get('e_desc')) {
        const defaultHtml = HTML_TPL_TRIAL_BASE.replace('<!-- MAGIC_BLOCK -->', TRIAL_LOGIC_BLOCKS['single_session']);
        tinymce.get('e_desc').setContent(defaultHtml);
    }

    // Image preview reset
    document.getElementById('e_imgPreview').style.display = 'none';
    document.getElementById('e_uploadStatus').textContent = "";
    document.getElementById('e_image_file').value = "";

    document.getElementById('e_sessionsContainer').innerHTML = '';

    // 初始化 UI 狀態與表頭
    window.handleEventTypeChange('single_session', true);
    // 新增時，自動提供一筆空白的單場次
    window.addEventSessionRow("session_1", "單場次預設");
};

window.hideEventForm = function () {
    document.getElementById('eventFormView').style.display = 'none';
    document.getElementById('eventListView').style.display = 'block';
};

window.addEventSessionRow = function (key = "", name = "", date = "", time = "", classroomId = "c_normal", subject = "math", capacity = "40", isReadOnly = false, extraData = {}) {
    const container = document.getElementById('e_sessionsContainer');
    const tr = document.createElement('tr');
    const type = document.getElementById('e_type').value;

    let clsOptions = '<option value="">-- 免選教室 --</option>';
    Object.keys(classrooms).forEach(k => {
        const sel = k === classroomId ? 'selected' : '';
        clsOptions += `<option value="${k}" ${sel}>${classrooms[k].name}</option>`;
    });

    const keyInputHtml = isReadOnly
        ? `<input type="text" class="sess-key" value="${key}" readonly style="width:100%; padding:8px; box-sizing:border-box; background-color:#eee; color:#666; cursor:not-allowed; border: 1px solid #ccc;">`
        : `<input type="text" class="sess-key" placeholder="如 m_01" value="${key}" style="width:100%; padding:8px; box-sizing:border-box;">`;

    const deleteBtnHtml = isReadOnly
        ? `<span style="color:#aaa; font-size:12px;">🔒鎖定</span>`
        : `<button onclick="this.closest('tr').remove()" style="background:#e74c3c; color:white; border:none; border-radius:4px; padding:6px 10px; cursor:pointer;">✖</button>`;

    if (type === 'waitlist_only') {
        const courseStr = extraData.courseName || name;
        const classStr = extraData.className || date;
        const startSeq = extraData.startSeq || 1;

        tr.innerHTML = `
            <td style="padding:4px;">${keyInputHtml}</td>
            <td style="padding:4px;"><input type="text" class="sess-course" placeholder="例如: 中年級科學實驗" value="${courseStr}" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px;"><input type="text" class="sess-class" placeholder="例如: 週一班" value="${classStr}" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px;"><input type="text" class="sess-time" placeholder="例如: 19:00-20:30" value="${time}" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px;"><select class="sess-classroom" style="width:100%; padding:8px; box-sizing:border-box;">${clsOptions}</select></td>
            <td style="padding:4px;"><input type="number" class="sess-seq" value="${startSeq}" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px;"><input type="number" class="sess-waitcap" value="${capacity == 0 ? '' : capacity}" placeholder="上限" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px; text-align:center; vertical-align:middle;">${deleteBtnHtml}</td>
        `;
    } else {
        tr.innerHTML = `
            <td style="padding:4px;">${keyInputHtml}</td>
            <td style="padding:4px;"><input type="text" class="sess-name" placeholder="前台顯示名稱" value="${name}" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px;"><input type="text" class="sess-date" placeholder="日期 (例: 5/1)" value="${date}" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px;"><input type="text" class="sess-time" placeholder="時間 (例: 13:00-14:30)" value="${time}" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px;"><select class="sess-classroom" style="width:100%; padding:8px; box-sizing:border-box;">${clsOptions}</select></td>
            <td style="padding:4px;">
                <select class="sess-subject" style="width:100%; padding:8px; box-sizing:border-box;">
                    <option value="math" ${subject === 'math' ? 'selected' : ''}>數學</option>
                    <option value="sci" ${subject === 'sci' ? 'selected' : ''}>自然</option>
                    <option value="other" ${subject === 'other' ? 'selected' : ''}>其他/綜合</option>
                </select>
            </td>
            <td style="padding:4px;"><input type="number" class="sess-cap" placeholder="容量" value="${capacity == 0 ? '' : capacity}" style="width:100%; padding:8px; box-sizing:border-box;"></td>
            <td style="padding:4px; text-align:center; vertical-align:middle;">${deleteBtnHtml}</td>
        `;
    }
    container.appendChild(tr);
};
// ★★★ V36.6 新增：切換活動類型時，決定是否顯示雙科快捷區塊與動態文案 ★★★
window.handleEventTypeChange = function (type, isInit = false) {
    const quickSet = document.getElementById('dualMatchQuickSet');
    const container = document.getElementById('e_sessionsContainer');

    // 切換表頭與新增按鈕
    const thead = document.querySelector('#e_sessionsContainer').closest('table').querySelector('thead');
    const btnAdd = document.getElementById('btnAddSessionBtn');
    const maxChoicesContainer = document.getElementById('e_maxChoices_container');

    if (maxChoicesContainer) maxChoicesContainer.style.display = (type === 'waitlist_only') ? 'block' : 'none';

    if (btnAdd) btnAdd.style.display = 'inline-block';

    if (type === 'single_session') {
        if (btnAdd) btnAdd.style.display = 'none'; // 單場次不給加多筆
        if (thead) thead.innerHTML = `
            <tr style="background:#ecf0f1; font-size:14px; border-bottom:2px solid #bdc3c7;">
                <th style="padding:8px;">後台代碼</th><th style="padding:8px;">前台名稱</th><th style="padding:8px;">試聽日期</th>
                <th style="padding:8px;">試聽時間</th><th style="padding:8px;">教室</th><th style="padding:8px;">屬性</th><th style="padding:8px; width:70px;">容量</th><th style="padding:8px; width:50px;">操作</th>
            </tr>`;
    } else if (type === 'waitlist_only') {
        if (thead) {
            thead.innerHTML = `
            <tr style="background:#fff3cd; font-size:14px; border-bottom:2px solid #e3a008; color:#856404;">
                <th style="padding:8px;">代碼</th><th style="padding:8px;">課程 (ex: 中年級科學)</th><th style="padding:8px;">上課班級 (ex: 週一班)</th>
                <th style="padding:8px;">上課時間</th><th style="padding:8px;">上課教室</th><th style="padding:8px; width:80px;">起始序號</th><th style="padding:8px; width:70px;">候補上限</th><th style="padding:8px; width:50px;">操作</th>
            </tr>`;
        }
    } else {
        if (thead) thead.innerHTML = `
            <tr style="background:#ecf0f1; font-size:14px; border-bottom:2px solid #bdc3c7;">
                <th style="padding:8px;">後台代碼</th><th style="padding:8px;">前台名稱</th><th style="padding:8px;">試聽日期</th>
                <th style="padding:8px;">試聽時間</th><th style="padding:8px;">教室</th><th style="padding:8px;">屬性</th><th style="padding:8px; width:70px;">容量</th><th style="padding:8px; width:50px;">操作</th>
            </tr>`;
    }

    // 處理雙科快捷鍵顯示與防呆切換
    if (type === 'dual_match') {
        quickSet.style.display = 'block';
        if (btnAdd) btnAdd.style.display = 'none'; // 雙科不給加多筆
    } else {
        quickSet.style.display = 'none';
    }

    // 如果不是系統初始載入 (也就是使用者手動點擊切換)
    if (!isInit) {
        let shouldReset = true;
        if (container.children.length > 0) {
            shouldReset = confirm("🔄 切換活動模式會清空下方的場次設定，請問是否繼續？");
        }

        if (shouldReset) {
            container.innerHTML = '';
            if (type === 'single_session') {
                window.addEventSessionRow("session_1", "單場次預設");
            } else if (type === 'dual_match') {
                window.autoGenerateDualMatchSessions(true); // silent = true
            }
        }
    }

    // 2. 判斷是否處於「新增模式」(e_id 為空)，如果是，切換對應的文案
    if (!isInit) {
        const eventId = document.getElementById('e_id').value;
        if (!eventId && tinymce.get('e_desc')) {
            const currentContent = tinymce.get('e_desc').getContent();
            if (currentContent === "" || currentContent.includes('🎯 排序與候補規則') || currentContent.includes('🎯 志願分發規則') || currentContent.includes('🎯 雙科分發與保底機制') || currentContent.includes('🎯 意願登記規則')) {
                const newHtml = HTML_TPL_TRIAL_BASE.replace('<!-- MAGIC_BLOCK -->', TRIAL_LOGIC_BLOCKS[type]);
                tinymce.get('e_desc').setContent(newHtml);
            }
        }
    }
};

// ★★★ V36 雙科 8 場次產生器 (補回詳細的 Alert 說明) ★★★
window.autoGenerateDualMatchSessions = function (silent = false) {
    const container = document.getElementById('e_sessionsContainer');
    if (!silent && container.children.length > 0) {
        if (!confirm("⚠️ 確定要載入雙科預設的 8 個場次嗎？這會清除您目前在下方填寫的場次資料！")) return;
    }
    container.innerHTML = '';
    window.addEventSessionRow("math_day1_slotA", "Day 1 數學 (時段 A)", "", "", "high_red", "math", "40", true);
    window.addEventSessionRow("math_day1_slotB", "Day 1 數學 (時段 B)", "", "", "high_red", "math", "40", true);
    window.addEventSessionRow("math_day2_slotA", "Day 2 數學 (時段 A)", "", "", "high_red", "math", "40", true);
    window.addEventSessionRow("math_day2_slotB", "Day 2 數學 (時段 B)", "", "", "high_red", "math", "40", true);
    window.addEventSessionRow("sci_day1_slotA", "Day 1 自然 (時段 A)", "", "", "high_red", "sci", "40", true);
    window.addEventSessionRow("sci_day1_slotB", "Day 1 自然 (時段 B)", "", "", "high_red", "sci", "40", true);
    window.addEventSessionRow("sci_day2_slotA", "Day 2 自然 (時段 A)", "", "", "high_red", "sci", "40", true);
    window.addEventSessionRow("sci_day2_slotB", "Day 2 自然 (時段 B)", "", "", "high_red", "sci", "40", true);

    if (!silent) alert("✅ 已自動建立 8 個雙科標準場次！\n\n您現在只需使用上方的『⚡ 快捷設定』或手動填寫名稱與時間即可。\n\n⚠️ 代碼已被鎖定以確保 AI 引擎正常運作。");
};

// ★★★ 魔法印表機：一鍵將上方 4 個格子套印到下方 8 個場次 ★★★
window.applyDualMatchQuickSet = function () {
    const d1 = document.getElementById('qm_day1').value.trim() || "Day1";
    const d2 = document.getElementById('qm_day2').value.trim() || "Day2";
    const tA = document.getElementById('qm_timeA').value.trim() || "時段A";
    const tB = document.getElementById('qm_timeB').value.trim() || "時段B";

    const container = document.getElementById('e_sessionsContainer');

    // 如果底下沒有 8 個場次，就先幫他生出來
    if (container.children.length !== 8) {
        if (!confirm("下方場次數量似乎不正確（非 8 個），是否要系統自動重置成標準 8 場次後再套用？")) return;
        window.autoGenerateDualMatchSessions(true);
    }

    const rows = container.querySelectorAll('tr');
    rows.forEach(row => {
        const keyInput = row.querySelector('.sess-key');
        if (!keyInput) return;
        const key = keyInput.value;

        // 判斷這列是什麼屬性
        let subjName = key.includes('math') ? '數學' : '自然';
        let dateVal = key.includes('day1') ? d1 : d2;
        let timeVal = key.includes('slotA') ? tA : tB;

        // 組裝前台完美的顯示名稱：例如 "5/1 數學 (13:00-14:30)"
        let dispName = `${dateVal} ${subjName} (${timeVal})`;

        row.querySelector('.sess-name').value = dispName;
        row.querySelector('.sess-date').value = dateVal;
        row.querySelector('.sess-time').value = timeVal;
    });

    alert("🚀 魔法套用成功！\n下方 8 個場次已自動填入您的設定，您仍可針對個別場次進行微調。");
};
window.saveTrialEvent = async function () {
    const id = document.getElementById('e_id').value || `evt_${Date.now()}`;
    const title = document.getElementById('e_title').value.trim();
    if (!title) return alert("❌ 請填寫活動名稱！");

    const oldImageUrl = document.getElementById('e_coverImage').value.trim();
    const fileInput = document.getElementById('e_image_file');

    let imageUrl = oldImageUrl;
    if (fileInput && fileInput.files.length > 0) {
        try {
            const file = fileInput.files[0];
            const storagePath = `trial_images/${Date.now()}_${file.name}`;
            const imgRef = storageRef(storage, storagePath);
            document.getElementById('e_uploadStatus').textContent = "上傳圖片中...";
            const metadata = { contentType: file.type };
            await uploadBytes(imgRef, file, metadata);
            imageUrl = await getDownloadURL(imgRef);
        } catch (e) {
            console.error("圖片上傳失敗:", e);
            alert("圖片上傳失敗，請重試！");
            return;
        }
    }

    const payload = {
        title: title,
        type: document.getElementById('e_type').value,
        status: document.getElementById('e_status').value,
        openTime: document.getElementById('e_openTime').value,
        closeTime: document.getElementById('e_closeTime').value,
        earlyAccessSec: parseInt(document.getElementById('e_earlyAccessSec').value) || 0,
        maxChoices: parseInt(document.getElementById('e_maxChoices').value) || 2, // ★新增上限
        coverImage: imageUrl,
        teacher: document.getElementById('e_teacher').value,
        desc: tinymce.get('e_desc') ? tinymce.get('e_desc').getContent() : '',
        updatedAt: Date.now()
    };

    const sessionRows = document.querySelectorAll('#e_sessionsContainer tr');
    let sessions = {};
    let errorMsg = null;

    sessionRows.forEach(row => {
        const type = document.getElementById('e_type').value;
        const key = row.querySelector('.sess-key').value.trim();
        const time = row.querySelector('.sess-time')?.value.trim() || '';
        const classroom = row.querySelector('.sess-classroom')?.value || '';

        // 基本資料結構
        let sessionData = { time, classroom };

        if (!key) {
            errorMsg = "❌ 場次代碼不可留白";
            return;
        }

        if (type === 'waitlist_only') {
            sessionData.courseName = row.querySelector('.sess-course')?.value.trim() || '';
            sessionData.className = row.querySelector('.sess-class')?.value.trim() || '';
            sessionData.startSeq = parseInt(row.querySelector('.sess-seq')?.value) || 1;
            sessionData.capacity = parseInt(row.querySelector('.sess-waitcap')?.value) || 0;
            // 為了相容前台，把 name 設成課程+班級
            sessionData.name = `${sessionData.courseName} ${sessionData.className}`.trim();
            if (!sessionData.courseName) errorMsg = "❌ 課程不可留白";
        } else {
            sessionData.name = row.querySelector('.sess-name')?.value.trim() || '';
            sessionData.date = row.querySelector('.sess-date')?.value.trim() || '';
            sessionData.subject = row.querySelector('.sess-subject')?.value || 'other';
            sessionData.capacity = parseInt(row.querySelector('.sess-cap')?.value) || 0;
            // 相容未設定的情況
            sessionData.startSeq = 1;

            if (!sessionData.name) errorMsg = "❌ 名稱不可留白";
        }

        if (sessions[key]) {
            errorMsg = `❌ 場次代碼重複：${key}`;
            return;
        }

        sessions[key] = sessionData;
    });

    if (errorMsg) return alert(errorMsg);

    // 若沒有任何 sessions 還是允許存檔建立基本資訊
    payload.sessions = sessions;

    try {
        await set(ref(db, `trial_events_config/${id}`), payload);
        alert(document.getElementById('e_id').value ? "✅ 活動更新成功！" : "✅ 活動新增成功！");
        hideEventForm();
    } catch (e) {
        alert("❌ 儲存失敗：" + e.message);
    }
};

window.editEvent = function (id) {
    const ev = trialEventsConfig[id];
    if (!ev) return;

    showEventForm();
    document.getElementById('eventFormTitle').innerText = '✏️ 編輯試聽活動';

    document.getElementById('e_id').value = id;
    document.getElementById('e_title').value = ev.title || '';
    document.getElementById('e_type').value = ev.type || 'single_session';
    document.getElementById('e_openTime').value = ev.openTime || '';
    document.getElementById('e_closeTime').value = ev.closeTime || '';
    document.getElementById('e_earlyAccessSec').value = ev.earlyAccessSec || '0';
    document.getElementById('e_maxChoices').value = ev.maxChoices || '2';
    document.getElementById('e_status').value = ev.status || 'active';
    document.getElementById('e_teacher').value = ev.teacher || '';

    if (ev.coverImage) {
        document.getElementById('e_coverImage').value = ev.coverImage;
        window.previewImage(ev.coverImage, 'e_imgPreview', 'e_coverImage');
    }

    if (tinymce.get('e_desc')) {
        tinymce.get('e_desc').setContent(ev.desc || '');
    }

    // 判斷編輯狀態下是否要打開快捷區塊
    const quickSet = document.getElementById('dualMatchQuickSet');
    if (ev.type === 'dual_match') {
        quickSet.style.display = 'block';
    } else {
        quickSet.style.display = 'none';
    }

    const container = document.getElementById('e_sessionsContainer');
    container.innerHTML = '';

    if (ev.sessions) {
        // ★★★ 判斷是否為雙科模式，如果是，編輯時也要把代碼與刪除鈕鎖死 ★★★
        const isDualMatch = (ev.type === 'dual_match');

        Object.keys(ev.sessions).forEach(key => {
            const s = ev.sessions[key];
            // 第 9 個參數為 startSeq
            addEventSessionRow(key, s.name, s.date || "", s.time || "", s.classroom || "c_normal", s.subject, s.capacity, isDualMatch, s.startSeq || 1);
        });

        // 載入完畢後，手動觸發一次 UI 切換以確保欄位正確顯示 (傳入 true 代表是初始化，不觸發清空防呆)
        window.handleEventTypeChange(ev.type || 'single_session', true);
    }
};

window.deleteEvent = async function (id, event) {
    if (event) event.stopPropagation();
    const ev = trialEventsConfig[id];
    if (confirm(`⚠️ 確定要刪除「${ev.title}」嗎？\n刪除後前台將無法報名，但已報名的紀錄不會被刪除。`)) {
        try {
            await remove(ref(db, `trial_events_config/${id}`));
        } catch (e) {
            alert("❌ 刪除失敗：" + e.message);
        }
    }
};
window.runTrialAIAllocation = async function () {
    const statusEl = document.getElementById('aiEngineStatus');
    statusEl.innerHTML = "⏳ 正在執行分發...";
    statusEl.style.color = "#f39c12";

    if (!currentTrialEventId) {
        statusEl.innerHTML = "⚠️ 請先選擇上方的試聽活動。";
        return;
    }

    const currentEvent = trialEventsConfig[currentTrialEventId];
    if (!currentEvent) {
        statusEl.innerHTML = "⚠️ 找不到該活動配置。";
        return;
    }

    try {
        if (trialRegistrations.length === 0) {
            statusEl.innerHTML = "⚠️ 目前沒有任何報名資料。";
            return;
        }

        // 重新備份一份做排序，並清除舊的分配結果
        let processingList = JSON.parse(JSON.stringify(trialRegistrations));

        // 絕對公平：依據毫秒時間戳記排序
        processingList.sort((a, b) => a.clientTimestampMs - b.clientTimestampMs);

        statusEl.innerHTML = `✅ 資料讀取完成，共 ${processingList.length} 筆。啟動「${currentEvent.type}」引擎核心...`;

        // 將動態 Sessions 轉換為容量配置表與空陣列
        let capacities = {};
        let allocated = {};
        let waitlist = [];
        let optCount = 0; // 用來接住 AI 無損挪位的次數

        if (currentEvent.sessions) {
            Object.keys(currentEvent.sessions).forEach(key => {
                const uiCap = document.getElementById('cap_' + key);
                capacities[key] = uiCap ? parseInt(uiCap.value, 10) : (currentEvent.sessions[key].capacity || 0);
                allocated[key] = [];
            });
        }

        // 依據 Event Type 呼叫對應的 AI 演算法
        switch (currentEvent.type) {
            case "single_session":
                runSingleSessionEngine(processingList, capacities, allocated, waitlist, currentEvent.sessions);
                break;
            case "multi_choice":
                runMultiChoiceEngine(processingList, capacities, allocated, waitlist, currentEvent.sessions);
                break;
            case "dual_match":
                // 讀取已經在上方建構好的 capacities
                optCount = runDualMatchEngine(processingList, capacities, allocated, waitlist) || 0;
                break;
            case "waitlist_only":
                runWaitlistOnlyEngine(processingList, waitlist, currentEvent.sessions);
                break;
            default:
                throw new Error("未知的活動類型：" + currentEvent.type);
        }

        // 將 AI 的派發結果即時寫回 DOM Model
        trialRegistrations.forEach(t => {
            const found = processingList.find(p => p.id === t.id);
            if (found) t.assignDesc = found.assignDesc;
        });

        // 統一呼叫通用渲染畫板
        renderTrialResults(allocated, waitlist, currentEvent.sessions);
        renderTrialMonitorTable();

        const totalAllocated = Object.values(allocated).reduce((sum, arr) => sum + arr.length, 0);
        let optMsg = optCount > 0 ? ` <span style="color:#8e44ad; font-weight:bold;">(其中 ${optCount} 人次透過 AI 無損挪位獲得黃金席次 ✨)</span>` : '';
        statusEl.innerHTML += `<br>🏆 引擎執行完畢。成功劃位 ${totalAllocated} 人次${optMsg}，進入候補 ${waitlist.length} 人。`;

    } catch (err) {
        statusEl.innerHTML = "❌ 分發失敗：" + err.message;
        console.error(err);
    }
};

function runSingleSessionEngine(processingList, capacities, allocated, waitlist, sessionsMap) {
    const targetSessionKey = Object.keys(capacities)[0];
    if (!targetSessionKey) return;
    const maxCap = capacities[targetSessionKey];

    processingList.forEach(student => {
        if (student.status === 'deleted') return;
        if (allocated[targetSessionKey].length < maxCap) {
            student.assignedClasses = [targetSessionKey];
            student.assignDesc = `直接錄取 (${sessionsMap[targetSessionKey].name})`;
            allocated[targetSessionKey].push(student);
        } else {
            student.assignDesc = "名額已滿 / 候補中";
            waitlist.push(student);
        }
    });
}

function runMultiChoiceEngine(processingList, capacities, allocated, waitlist, sessionsMap) {
    processingList.forEach(student => {
        if (student.status === 'deleted') return;
        let isPlaced = false;
        if (!student.preferences) student.preferences = {};

        for (let i = 1; i <= 6; i++) {
            let choice = student.preferences[`choice${i}`];
            if (!choice || choice === "none") continue;

            if (allocated[choice] && allocated[choice].length < capacities[choice]) {
                student.assignedChoiceKey = choice;
                student.assignedChoiceLevel = i;
                student.assignedClasses = [choice];
                student.assignDesc = `志願 ${i} (${sessionsMap[choice].name})`;
                allocated[choice].push(student);
                isPlaced = true;
                break;
            }
        }

        if (!isPlaced) {
            student.assignDesc = "排位失敗 / 候補中";
            waitlist.push(student);
        }
    });
}

function runWaitlistOnlyEngine(processingList, waitlist, sessionsMap) {
    // 1. 讀取各班設定的起始序號
    let currentSeq = {};
    for (let k in sessionsMap) {
        currentSeq[k] = parseInt(sessionsMap[k].startSeq) || 1;
    }

    processingList.forEach(student => {
        if (student.status === 'deleted') return;

        let descParts = [];
        // 前台 Transaction 成功時，會將搶到的班級寫入 bookedClasses 陣列
        const choices = student.bookedClasses || [];

        choices.forEach(choice => {
            if (sessionsMap[choice]) {
                const seq = currentSeq[choice]++; // 給予序號後遞增

                // 為了讓下方的 renderTrialResults 能正確分班顯示，我們為每一科複製一個虛擬分身塞入 waitlist
                let stuCopy = JSON.parse(JSON.stringify(student));
                stuCopy.assignedClasses = []; // 清空以防被當成正取
                stuCopy.waitlistTarget = choice; // 標記這張卡片是屬於哪個班的候補
                stuCopy.rank = seq; // 賦予絕對序號

                waitlist.push(stuCopy);
                descParts.push(`${sessionsMap[choice].name} (#${seq})`);
            }
        });

        if (choices.length > 0) {
            student.assignDesc = `✅ 候補成功: ` + descParts.join(", ");
        } else {
            student.assignDesc = "❌ 名額已滿 / 未排入";
        }
    });
}

// ----------------------------------------------------
// 🧠 Dual Match Engine (動態平衡 + 同天優先 雙層排序終極版)
// ----------------------------------------------------
function runDualMatchEngine(processingList, capacities, allocated, waitlist) {
    const prefMap = {
        "math_day1_slotA": "Day 1 時段 A 數學", "math_day1_slotB": "Day 1 時段 B 數學",
        "math_day2_slotA": "Day 2 時段 A 數學", "math_day2_slotB": "Day 2 時段 B 數學",
        "sci_day1_slotA": "Day 1 時段 A 自然", "sci_day1_slotB": "Day 1 時段 B 自然",
        "sci_day2_slotA": "Day 2 時段 A 自然", "sci_day2_slotB": "Day 2 時段 B 自然"
    };

    const getRemain = (cls) => {
        if (!allocated[cls] || capacities[cls] === undefined) return 0;
        return capacities[cls] - allocated[cls].length;
    };
    const canFit = (cls) => getRemain(cls) > 0;

    const allCombos = [
        { m: "math_day1_slotA", s: "sci_day1_slotB", c: "both_day1", isSameDay: true },
        { m: "math_day1_slotB", s: "sci_day1_slotA", c: "both_day1", isSameDay: true },
        { m: "math_day2_slotA", s: "sci_day2_slotB", c: "both_day2", isSameDay: true },
        { m: "math_day2_slotB", s: "sci_day2_slotA", c: "both_day2", isSameDay: true },
        { m: "math_day1_slotA", s: "sci_day2_slotA", c: "both_any", isSameDay: false },
        { m: "math_day1_slotA", s: "sci_day2_slotB", c: "both_any", isSameDay: false },
        { m: "math_day1_slotB", s: "sci_day2_slotA", c: "both_any", isSameDay: false },
        { m: "math_day1_slotB", s: "sci_day2_slotB", c: "both_any", isSameDay: false },
        { m: "math_day2_slotA", s: "sci_day1_slotA", c: "both_any", isSameDay: false },
        { m: "math_day2_slotA", s: "sci_day1_slotB", c: "both_any", isSameDay: false },
        { m: "math_day2_slotB", s: "sci_day1_slotA", c: "both_any", isSameDay: false },
        { m: "math_day2_slotB", s: "sci_day1_slotB", c: "both_any", isSameDay: false }
    ];

    let optimizationCount = 0;

    // ===============================================
    // Stage 1: 初步雙層排序分發
    // ===============================================
    processingList.forEach(student => {
        if (student.status === 'deleted') return;

        let isPlaced = false;
        if (!student.preferences) student.preferences = {};

        for (let i = 1; i <= 6; i++) {
            let choice = student.preferences[`choice${i}`];
            if (!choice || choice === "none") continue;

            if (choice === "both_any" || choice === "both_day1" || choice === "both_day2") {
                let validCombos = allCombos.filter(combo => choice === "both_any" || choice === combo.c);
                let availableCombos = validCombos.map(combo => ({ ...combo, bottleneck: Math.min(getRemain(combo.m), getRemain(combo.s)) })).filter(combo => combo.bottleneck > 0);

                // ✨ 雙層排序：1. 同天優先  2. 剩餘容量大優先
                availableCombos.sort((a, b) => {
                    if (a.isSameDay && !b.isSameDay) return -1;
                    if (!a.isSameDay && b.isSameDay) return 1;
                    return b.bottleneck - a.bottleneck;
                });

                if (availableCombos.length > 0) {
                    let bestCombo = availableCombos[0];
                    student.assignedChoiceKey = choice;
                    student.assignedChoiceLevel = i;
                    student.assignedClasses = [bestCombo.m, bestCombo.s];
                    student.assignDesc = `志願 ${i} (${prefMap[bestCombo.m] || bestCombo.m} & ${prefMap[bestCombo.s] || bestCombo.s})`;
                    allocated[bestCombo.m].push({ ...student, isDualChild: true });
                    allocated[bestCombo.s].push({ ...student, isDualChild: true });
                    isPlaced = true;
                    break;
                } else {
                    // ✨ 公平保底單科：不偏心數學或自然，誰空位多排誰
                    let fallbackOptions = [];
                    validCombos.forEach(combo => {
                        let mRemain = getRemain(combo.m);
                        let sRemain = getRemain(combo.s);
                        if (mRemain > 0 && !fallbackOptions.find(opt => opt.cls === combo.m)) fallbackOptions.push({ cls: combo.m, remain: mRemain });
                        if (sRemain > 0 && !fallbackOptions.find(opt => opt.cls === combo.s)) fallbackOptions.push({ cls: combo.s, remain: sRemain });
                    });

                    if (fallbackOptions.length > 0) {
                        fallbackOptions.sort((a, b) => b.remain - a.remain);
                        let bestSingle = fallbackOptions[0].cls;
                        student.assignedChoiceKey = choice;
                        student.assignedChoiceLevel = i;
                        student.assignedClasses = [bestSingle];
                        student.assignDesc = `保底單科 (${prefMap[bestSingle] || bestSingle})`;
                        allocated[bestSingle].push({ ...student, isDualChild: false });
                        isPlaced = true;
                        break;
                    }
                }
            } else if (choice.startsWith("math_any") || choice.startsWith("sci_any")) {
                let prefix = choice.startsWith("math_") ? "math_" : "sci_";
                let availableClasses = Object.keys(allocated)
                    .filter(key => key.startsWith(prefix))
                    .map(key => ({ cls: key, remain: getRemain(key) }))
                    .filter(item => item.remain > 0)
                    .sort((a, b) => b.remain - a.remain); // 動態找最空的

                if (availableClasses.length > 0) {
                    let bestSingle = availableClasses[0].cls;
                    student.assignedChoiceKey = choice;
                    student.assignedChoiceLevel = i;
                    student.assignedClasses = [bestSingle];
                    student.assignDesc = `志願 ${i} (${prefMap[bestSingle] || bestSingle})`;
                    allocated[bestSingle].push({ ...student, isDualChild: false });
                    isPlaced = true; break;
                }
            } else {
                if (canFit(choice)) {
                    student.assignedChoiceKey = choice;
                    student.assignedChoiceLevel = i;
                    student.assignedClasses = [choice];
                    student.assignDesc = `志願 ${i} (${prefMap[choice] || choice})`;
                    allocated[choice].push({ ...student, isDualChild: false });
                    isPlaced = true; break;
                }
            }
        }

        if (!isPlaced) {
            student.assignDesc = "排位失敗 / 候補中";
            waitlist.push(student);
        } else if (student.assignDesc && student.assignDesc.startsWith("保底單科")) {
            waitlist.push(student);
        }
    });

    // ===============================================
    // Stage 2: Lossless Optimization (動態排序 + 篩選修正版)
    // ===============================================
    const forceMakeRoom = (tClass) => {
        if (!allocated[tClass]) return false;
        if (getRemain(tClass) > 0) return true;

        for (let k = 0; k < allocated[tClass].length; k++) {
            let g = allocated[tClass][k];

            // 修正：確保是佔了兩個位子的雙科生，並依照當初志願篩選可搬移的組合
            if (["both_any", "both_day1", "both_day2"].includes(g.assignedChoiceKey) && g.assignedClasses.length === 2) {
                let validCombos = allCombos.filter(c => g.assignedChoiceKey === "both_any" || g.assignedChoiceKey === c.c);

                let moveOptions = validCombos.map(combo => {
                    let mRemain = getRemain(combo.m) + (g.assignedClasses.includes(combo.m) ? 1 : 0);
                    let sRemain = getRemain(combo.s) + (g.assignedClasses.includes(combo.s) ? 1 : 0);
                    return { ...combo, bottleneck: Math.min(mRemain, sRemain) };
                }).filter(c => c.bottleneck > 0 && !(c.m === g.assignedClasses[0] && c.s === g.assignedClasses[1]));

                if (moveOptions.length > 0) {
                    // 同樣套用雙層排序，確保 AI 挪位不會把人塞去拆天劣等組合
                    moveOptions.sort((a, b) => {
                        if (a.isSameDay && !b.isSameDay) return -1;
                        if (!a.isSameDay && b.isSameDay) return 1;
                        return b.bottleneck - a.bottleneck;
                    });

                    let best = moveOptions[0];
                    allocated[g.assignedClasses[0]] = allocated[g.assignedClasses[0]].filter(x => x.id !== g.id);
                    allocated[g.assignedClasses[1]] = allocated[g.assignedClasses[1]].filter(x => x.id !== g.id);

                    g.assignedClasses = [best.m, best.s];
                    g.assignDesc = `志願 ${g.assignedChoiceLevel} (${prefMap[best.m] || best.m} & ${prefMap[best.s] || best.s}) [✨ AI挪位]`;
                    allocated[best.m].push(g);
                    allocated[best.s].push(g);
                    optimizationCount++;
                    return true;
                }
            } else if (g.assignedChoiceKey === "math_any" && tClass.startsWith("math_")) {
                let opts = Object.keys(allocated)
                    .filter(key => key.startsWith("math_") && key !== tClass)
                    .map(key => ({ cls: key, remain: getRemain(key) }))
                    .filter(o => o.remain > 0)
                    .sort((a, b) => b.remain - a.remain);

                if (opts.length > 0) {
                    let best = opts[0].cls;
                    allocated[tClass] = allocated[tClass].filter(x => x.id !== g.id);
                    g.assignedClasses = [best];
                    g.assignDesc = `志願 ${g.assignedChoiceLevel} (${prefMap[best] || best}) [✨ AI挪位]`;
                    allocated[best].push(g);
                    optimizationCount++;
                    return true;
                }
            } else if (g.assignedChoiceKey === "sci_any" && tClass.startsWith("sci_")) {
                let opts = Object.keys(allocated)
                    .filter(key => key.startsWith("sci_") && key !== tClass)
                    .map(key => ({ cls: key, remain: getRemain(key) }))
                    .filter(o => o.remain > 0)
                    .sort((a, b) => b.remain - a.remain);

                if (opts.length > 0) {
                    let best = opts[0].cls;
                    allocated[tClass] = allocated[tClass].filter(x => x.id !== g.id);
                    g.assignedClasses = [best];
                    g.assignDesc = `志願 ${g.assignedChoiceLevel} (${prefMap[best] || best}) [✨ AI挪位]`;
                    allocated[best].push(g);
                    optimizationCount++;
                    return true;
                }
            }
        }
        return false;
    };

    // ===============================================
    // Stage 3: 候補名單嘗試補位
    // ===============================================
    let finalWaitlist = [];
    waitlist.forEach(student => {
        let isPlaced = false;

        const clearOldSeats = () => {
            if (student.assignedClasses && student.assignedClasses.length > 0) {
                student.assignedClasses.forEach(oldCls => {
                    if (allocated[oldCls]) allocated[oldCls] = allocated[oldCls].filter(x => x.id !== student.id);
                });
            }
        };

        for (let i = 1; i <= 6; i++) {
            let choice = student.preferences[`choice${i}`];
            if (!choice || choice === "none") continue;

            if (choice === "both_any" || choice === "both_day1" || choice === "both_day2") {
                let validCombos = allCombos.filter(combo => choice === "both_any" || choice === combo.c);
                let availableCombos = validCombos.map(combo => ({ ...combo, bottleneck: Math.min(getRemain(combo.m), getRemain(combo.s)) })).filter(c => c.bottleneck > 0);

                // 先試直接空位（雙層排序）
                if (availableCombos.length > 0) {
                    availableCombos.sort((a, b) => {
                        if (a.isSameDay && !b.isSameDay) return -1;
                        if (!a.isSameDay && b.isSameDay) return 1;
                        return b.bottleneck - a.bottleneck;
                    });
                    let bestCombo = availableCombos[0];
                    clearOldSeats();
                    student.assignedChoiceKey = choice;
                    student.assignedChoiceLevel = i;
                    student.assignedClasses = [bestCombo.m, bestCombo.s];
                    student.assignDesc = `志願 ${i} (${prefMap[bestCombo.m] || bestCombo.m} & ${prefMap[bestCombo.s] || bestCombo.s})`;
                    allocated[bestCombo.m].push({ ...student, isDualChild: true });
                    allocated[bestCombo.s].push({ ...student, isDualChild: true });
                    isPlaced = true;
                    break;
                }

                // 修正：forceMakeRoom 前也套用雙層排序
                validCombos.sort((a, b) => {
                    if (a.isSameDay && !b.isSameDay) return -1;
                    if (!a.isSameDay && b.isSameDay) return 1;
                    let aCap = Math.min(getRemain(a.m), getRemain(a.s));
                    let bCap = Math.min(getRemain(b.m), getRemain(b.s));
                    return bCap - aCap;
                });

                for (let combo of validCombos) {
                    let mHasSpace = getRemain(combo.m) > 0;
                    let sHasSpace = getRemain(combo.s) > 0;

                    if (mHasSpace && !sHasSpace && forceMakeRoom(combo.s)) {
                        clearOldSeats();
                        student.assignedChoiceKey = choice;
                        student.assignedChoiceLevel = i;
                        student.assignedClasses = [combo.m, combo.s];
                        student.assignDesc = `志願 ${i} (${prefMap[combo.m] || combo.m} & ${prefMap[combo.s] || combo.s})`;
                        allocated[combo.m].push({ ...student, isDualChild: true });
                        allocated[combo.s].push({ ...student, isDualChild: true });
                        isPlaced = true; break;
                    } else if (!mHasSpace && sHasSpace && forceMakeRoom(combo.m)) {
                        clearOldSeats();
                        student.assignedChoiceKey = choice;
                        student.assignedChoiceLevel = i;
                        student.assignedClasses = [combo.m, combo.s];
                        student.assignDesc = `志願 ${i} (${prefMap[combo.m] || combo.m} & ${prefMap[combo.s] || combo.s})`;
                        allocated[combo.m].push({ ...student, isDualChild: true });
                        allocated[combo.s].push({ ...student, isDualChild: true });
                        isPlaced = true; break;
                    }
                }
                if (isPlaced) break;

                // 修正死碼 Bug：Stage 3 保底單科
                if (!isPlaced && (!student.assignedClasses || student.assignedClasses.length === 0)) {
                    let fallbackOptions = [];
                    validCombos.forEach(combo => {
                        let mRemain = getRemain(combo.m);
                        let sRemain = getRemain(combo.s);
                        if (mRemain > 0 && !fallbackOptions.find(opt => opt.cls === combo.m)) fallbackOptions.push({ cls: combo.m, remain: mRemain });
                        if (sRemain > 0 && !fallbackOptions.find(opt => opt.cls === combo.s)) fallbackOptions.push({ cls: combo.s, remain: sRemain });
                    });

                    if (fallbackOptions.length > 0) {
                        fallbackOptions.sort((a, b) => b.remain - a.remain);
                        let bestSingle = fallbackOptions[0].cls;
                        student.assignedChoiceKey = choice;
                        student.assignedChoiceLevel = i;
                        student.assignedClasses = [bestSingle];
                        student.assignDesc = `保底單科 (${prefMap[bestSingle] || bestSingle})`;
                        allocated[bestSingle].push({ ...student, isDualChild: false });
                        isPlaced = true;
                        break;
                    } else {
                        // 直接空位為 0，改從 validCombos 蒐集所有關聯班級嘗試 forceMakeRoom
                        let allSingleClasses = [];
                        validCombos.forEach(combo => {
                            if (!allSingleClasses.includes(combo.m)) allSingleClasses.push(combo.m);
                            if (!allSingleClasses.includes(combo.s)) allSingleClasses.push(combo.s);
                        });
                        for (let cls of allSingleClasses) {
                            if (forceMakeRoom(cls)) {
                                clearOldSeats();
                                student.assignedChoiceKey = choice;
                                student.assignedChoiceLevel = i;
                                student.assignedClasses = [cls];
                                student.assignDesc = `保底單科 (${prefMap[cls] || cls})`;
                                allocated[cls].push({ ...student, isDualChild: false });
                                isPlaced = true;
                                break;
                            }
                        }
                        if (isPlaced) break;
                    }
                }

            } else if (choice.startsWith("math_any") || choice.startsWith("sci_any")) {
                let prefix = choice.startsWith("math_") ? "math_" : "sci_";
                for (let key in allocated) {
                    if (key.startsWith(prefix) && forceMakeRoom(key)) {
                        clearOldSeats();
                        student.assignedChoiceKey = choice;
                        student.assignedChoiceLevel = i;
                        student.assignedClasses = [key];
                        student.assignDesc = `志願 ${i} (${prefMap[key] || key})`;
                        allocated[key].push({ ...student, isDualChild: false });
                        isPlaced = true; break;
                    }
                }
                if (isPlaced) break;
            } else {
                if (forceMakeRoom(choice)) {
                    clearOldSeats();
                    student.assignedChoiceKey = choice;
                    student.assignedChoiceLevel = i;
                    student.assignedClasses = [choice];
                    student.assignDesc = `志願 ${i} (${prefMap[choice] || choice})`;
                    allocated[choice].push({ ...student, isDualChild: false });
                    isPlaced = true; break;
                }
            }
        }

        // 防呆：確保原本有單科保底的人，不會在 Stage 3 失敗後被刷掉描述
        if (!isPlaced) {
            if (!student.assignedClasses || student.assignedClasses.length === 0) {
                student.assignDesc = "排位失敗 / 候補中";
            }
            finalWaitlist.push(student);
        } else if (student.assignDesc && student.assignDesc.startsWith("保底單科")) {
            finalWaitlist.push(student);
        }
    });

    // 將新名單覆蓋回 waitlist 陣列，達成指標更新
    waitlist.length = 0;
    waitlist.push(...finalWaitlist);

    return optimizationCount; // 回傳無損挪位次數給主引擎
}

window.renderTrialResults = function (allocated, waitlist, sessionsMap) {
    document.getElementById('trialResultsBoard').style.display = 'block';

    const grid = document.getElementById('trialClassesGrid');
    grid.innerHTML = "";

    // 建立拖曳相關函數 (God Mode 拖曳調整)

    // ✨ 拖曳占位符動畫系統
    let _dragPlaceholder = null;
    let _dragSourceId = null;
    let _dragSourceEl = null;   // 被拖曳的元素參照
    let _hideTimeout = null;    // 防止 setTimeout race condition
    let _isDragging = false;    // ✨ 是否正在拖曳中（用來擋掉 drop 後的殘留 rAF）
    let _rafPending = false;
    let _rafId = null;          // ✨ 記錄 rAF ID，可以隨時 cancel

    function _getOrCreatePlaceholder(sourceHeight) {
        if (!_dragPlaceholder) {
            _dragPlaceholder = document.createElement('div');
            _dragPlaceholder.className = 'wl-drag-placeholder';
            _dragPlaceholder.style.cssText = `
                height: ${sourceHeight ? sourceHeight + 'px' : '36px'};
                background: rgba(0, 0, 0, 0.05);
                border: 2px dashed #bdc3c7;
                border-radius: 4px;
                margin: 4px 0;
                transition: height 0.2s ease, opacity 0.2s ease;
                pointer-events: none;
            `;
        } else if (sourceHeight) {
            _dragPlaceholder.style.height = sourceHeight + 'px';
        }
        return _dragPlaceholder;
    }

    function _removePlaceholder() {
        if (_dragPlaceholder && _dragPlaceholder.parentNode) {
            _dragPlaceholder.remove();
        }
        _dragPlaceholder = null;
    }

    window.allowDrop = function (ev) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';

        const clientY = ev.clientY;
        const target = ev.target;

        if (_rafPending) return;
        _rafPending = true;

        _rafId = requestAnimationFrame(() => {
            _rafId = null;
            _rafPending = false;

            // ✨ 關鍵防護：如果 drop/dragEnd 已經結束拖曳，立刻退出，絕對不插入 placeholder
            if (!_isDragging) return;

            const container = target.closest('.class-list-container');
            if (!container) return;

            const placeholder = _getOrCreatePlaceholder(window._dragSourceHeight);

            const visibleCards = Array.from(container.querySelectorAll('div[data-original-id]'))
                .filter(c => c.id !== _dragSourceId); // ✨ 排除正在被拖曳的來源卡片

            let insertBeforeCard = null;
            for (const card of visibleCards) {
                const rect = card.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (clientY < midY) {
                    insertBeforeCard = card;
                    break;
                }
            }

            if (insertBeforeCard === null) {
                if (container.lastChild !== placeholder) container.appendChild(placeholder);
            } else {
                if (placeholder.nextSibling !== insertBeforeCard) container.insertBefore(placeholder, insertBeforeCard);
            }
        });
    }

    function _restoreDragSource() {
        // ✨ 立刻停止拖曳狀態，讓 rAF 回調知道不要再插入 placeholder
        _isDragging = false;
        // ✨ 取消任何尚未執行的 rAF，直接在 js event loop 層面消除殘留
        if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
        _rafPending = false;
        if (_hideTimeout) { clearTimeout(_hideTimeout); _hideTimeout = null; }
        if (_dragSourceEl) {
            _dragSourceEl.style.opacity = '';
            _dragSourceEl.style.pointerEvents = '';
            _dragSourceEl = null;
        }
    }

    window.drag = function (ev) {
        const el = ev.target.closest('div[data-original-id]') || ev.target;
        ev.dataTransfer.setData("stu_id", el.id);
        ev.dataTransfer.setData("source_class", el.getAttribute('data-class'));
        ev.dataTransfer.effectAllowed = 'move';
        _dragSourceId = el.id;
        _dragSourceEl = el;
        _isDragging = true; // ✨ 標記開始拖曳

        // 紀錄高度給 placeholder 使用
        const rect = el.getBoundingClientRect();
        window._dragSourceHeight = rect.height;

        // ✨ 拖曳開始：只改透明度，不隱藏卡片，保持 list 高度穩定避免 layout 跳動
        requestAnimationFrame(() => {
            if (_dragSourceEl === el) {
                el.style.opacity = '0.25';
                el.style.pointerEvents = 'none';
            }
        });
    }

    // ✨ 拖曳結束：還原外觀、移除占位符（drop 不成功時的保底還原）
    window.dragEnd = function (ev) {
        _restoreDragSource();
        _removePlaceholder();
        _dragSourceId = null;
        window._dragSourceHeight = null;
    }

    // ✨ 重算候補序號 (每次拖曳後呼叫) - 改用 data-is-waitlist 屬性辨別
    window.renumberWaitlist = function (container) {
        if (!container) return;
        const cards = container.querySelectorAll('div[data-is-waitlist="true"]');
        cards.forEach((card, idx) => {
            const seqSpan = card.querySelector('.wl-seq');
            if (seqSpan) seqSpan.textContent = `#${idx + 1}`;
        });
    }

    window.drop = function (ev) {
        ev.preventDefault();

        // ✨ 先記住 placeholder 目前在哪（nextSibling 就是插入參考點），再移除它
        const placeholderNext = _dragPlaceholder ? _dragPlaceholder.nextSibling : null;
        const placeholderParent = _dragPlaceholder ? _dragPlaceholder.parentNode : null;
        _removePlaceholder(); // 清除占位符

        const data = ev.dataTransfer.getData("stu_id");      // 元素的 ID (例如 stu_12345)
        const source_class = ev.dataTransfer.getData("source_class"); // 來源班級
        const targetContainer = ev.target.closest('.class-list-container');
        if (!targetContainer) return;

        const targetClass = targetContainer.getAttribute('data-cls');
        const isSameContainer = source_class === targetClass;

        // ✨ 找到拖曳目標、被拖曳元素、判斷是否為插隊模式
        const el = document.getElementById(data);
        if (!el) return;
        _restoreDragSource();

        let isInsertMode = true;
        let insertRef = null;

        // ✨ 優先用 placeholder 最後所在的位置（最準確，就是使用者看到的那個細縫）
        if (placeholderParent && placeholderParent === targetContainer) {
            insertRef = placeholderNext; // insert before this node (null = append to end)
        } else {
            // 萬一 placeholder 沒出現在 targetContainer（拖太快），fallback 到 ev.target
            const dropTarget = ev.target.closest('div[data-original-id]');
            if (dropTarget && dropTarget !== el && targetContainer.contains(dropTarget)) {
                const rect = dropTarget.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                insertRef = (ev.clientY < midY) ? dropTarget : dropTarget.nextSibling;
            }
        }

        // 防呆：同容器且插入點就是元素本身，代表沒有真正移動
        if (isSameContainer && insertRef === el) return;
        if (isSameContainer && !placeholderParent && insertRef === null) return;

        const isSourceWl = el.getAttribute('data-is-waitlist') === 'true';
        const isTargetWl = targetClass === 'waitlist';

        // ✨ 防呆：禁止跨科拖曳（僅在正取區之間）
        // 只有當來源是正取區、目標也是正取區時才進行科目比對
        if (!isSourceWl && !isTargetWl) {
            const srcSubj = source_class.startsWith('math_') ? 'math' : source_class.startsWith('sci_') ? 'sci' : null;
            const tgtSubj = targetClass.startsWith('math_') ? 'math' : targetClass.startsWith('sci_') ? 'sci' : null;
            if (srcSubj && tgtSubj && srcSubj !== tgtSubj) {
                // 彈跳提示 (輕量)
                el.style.outline = '3px solid #e74c3c';
                setTimeout(() => el.style.outline = '', 800);
                return; // 阻擋跨科拖曳
            }
        }

        // ✨ 防呆：禁止從候補區跨科拖入正取班（數學候補不能拉進自然班，反之亦然）
        if (isSourceWl && !isTargetWl && targetClass !== 'waitlist') {
            const srcSubj = source_class.startsWith('math_') ? 'math' : source_class.startsWith('sci_') ? 'sci' : null;
            const tgtSubj = targetClass.startsWith('math_') ? 'math' : targetClass.startsWith('sci_') ? 'sci' : null;
            if (srcSubj && tgtSubj && srcSubj !== tgtSubj) {
                el.style.outline = '3px solid #e74c3c';
                setTimeout(() => el.style.outline = '', 800);
                return;
            }
        }

        // 抓出學生的唯一原始 ID (用來找影分身)
        const studentId = el.getAttribute('data-original-id') || data.replace('stu_', '').split('_')[0];

        el.setAttribute('data-class', targetClass);

        // ✨ 更新 ID 功能：候補區內拖曳排序時保留 _wl_ 標記；拉入正取區才椎改 ID
        const wasWaitlist = el.getAttribute('data-is-waitlist') === 'true';
        if (wasWaitlist) {
            if (isTargetWl || isSameContainer) {
                // 各候補區內拖曳：保留候補標記，只更新 data-class
                // ID 保留 _wl_ 不改
            } else {
                // 候補拉入正取區：移除候補標記、更新 ID、移除序號
                el.setAttribute('data-is-waitlist', 'false');
                el.id = `stu_${studentId}_${targetClass}`;
                const seqSpan = el.querySelector('.wl-seq');
                if (seqSpan) seqSpan.remove();
            }
        } else {
            el.id = `stu_${studentId}_${targetClass}`;
        }

        if (isInsertMode && insertRef) {
            targetContainer.insertBefore(el, insertRef);
        } else if (isInsertMode) {
            targetContainer.appendChild(el); // insertRef 為 null 代表放在尾端
        } else {
            targetContainer.appendChild(el);
        }

        // ✨ 重算候補名單序號 (目標容器)
        if (isTargetWl || wasWaitlist) {
            window.renumberWaitlist(targetContainer);
        }
        // 也重算來源容器（如果不是同容器）
        if (!isSameContainer) {
            const sourceContainer = document.querySelector(`.class-list-container[data-cls="${source_class}"]`);
            if (sourceContainer) {
                window.renumberWaitlist(sourceContainer);
            }
        }

        // --- 需求二：同科影分身消除機制 ---
        // ✨ 只有從候補拉入正取時才觸發，同容器排序不消除
        if (!isSameContainer && wasWaitlist && !isTargetWl) {
            // 判斷目標班級是數學還是自然
            const isTargetMath = targetClass.startsWith('math_');
            const isTargetSci = targetClass.startsWith('sci_');

            // 尋找畫面上所有屬於這名學生的候補影分身
            const shadowClones = document.querySelectorAll(`div[data-original-id="${studentId}"]`);

            shadowClones.forEach(clone => {
                if (clone === el) return; // 不要刪自己
                // 只處理候補名單中的影分身
                if (clone.getAttribute('data-is-waitlist') !== 'true') return;

                const cloneClass = clone.getAttribute('data-class');
                const isCloneMath = cloneClass.startsWith('math_');
                const isCloneSci = cloneClass.startsWith('sci_');

                // 如果影分身跟目標班級是「同科目」，就把它消除
                if ((isTargetMath && isCloneMath) || (isTargetSci && isCloneSci)) {
                    // 消除前先重算該容器的序號
                    const cloneContainer = clone.closest('.class-list-container');
                    clone.remove();
                    if (cloneContainer) window.renumberWaitlist(cloneContainer);
                }
            });
        }

        // 這裡我們不處理正取名單的互斥（考量到雙科生本來就會在兩個正取班），只處理把候補的冗餘卡片刪掉
        // 更新標題人數
        window.updateClassCounts();
    }

    // 渲染各班看板
    const classNames = {};
    if (sessionsMap) {
        Object.keys(sessionsMap).forEach(k => classNames[k] = sessionsMap[k].name);
    }

    for (let cls in allocated) {
        let div = document.createElement('div');
        div.style.background = "#f4f6f7";
        div.style.padding = "15px";
        div.style.borderRadius = "8px";
        div.style.border = "1px solid #ddd";

        let header = document.createElement('h3');
        header.style.marginTop = "0";
        header.style.color = "#2c3e50";
        header.className = "cls-header";
        header.innerText = `${classNames[cls] || cls} (共 ${allocated[cls].length} 人)`;

        let listContainer = document.createElement('div');
        listContainer.className = "class-list-container";
        listContainer.setAttribute('data-cls', cls);
        listContainer.style.minHeight = "150px";
        listContainer.style.background = "#fff";
        listContainer.style.border = "2px dashed #bdc3c7";
        listContainer.style.padding = "10px";
        listContainer.ondrop = window.drop;
        listContainer.ondragover = window.allowDrop;

        allocated[cls].forEach(stu => {
            let stuItem = document.createElement('div');
            stuItem.id = `stu_${stu.id}_${cls}`;
            stuItem.setAttribute('data-class', cls);
            stuItem.setAttribute('data-original-id', stu.id);
            stuItem.draggable = true;
            stuItem.ondragstart = window.drag;
            stuItem.style.background = "#3498db";
            stuItem.style.color = "white";
            stuItem.style.padding = "8px";
            stuItem.style.margin = "5px 0";
            stuItem.style.borderRadius = "5px";
            stuItem.style.cursor = "grab";
            stuItem.style.position = "relative";

            // "複製 LINE 通知" 按鈕
            let copyBtn = document.createElement('button');
            copyBtn.innerHTML = "📋";
            copyBtn.style.position = "absolute";
            copyBtn.style.right = "5px";
            copyBtn.style.top = "5px";
            copyBtn.style.background = "rgba(255,255,255,0.3)";
            copyBtn.style.border = "none";
            copyBtn.style.borderRadius = "3px";
            copyBtn.style.cursor = "pointer";
            copyBtn.title = "複製錄取通知至剪貼簿";
            copyBtn.onclick = (e) => {
                let msg = `🎉 恭喜 ${stu.studentName} 同學錄取「山熊科學」試聽課程！\n\n您被分配到的班級是：\n${classNames[cls] || cls}\n\n如有任何問題，請隨時透過官方 LINE 聯繫我們。期待相見！`;
                navigator.clipboard.writeText(msg).then(() => {
                    let oldHtml = copyBtn.innerHTML;
                    copyBtn.innerHTML = "✔️";
                    setTimeout(() => copyBtn.innerHTML = oldHtml, 2000);
                });
            };

            stuItem.innerHTML = `<strong>${window.escapeHTML(stu.studentName)}</strong> (${window.escapeHTML(stu.parentPhone)}) 
            <div style="font-size:11px; margin-top:5px; background:rgba(0,0,0,0.2); padding:2px 5px; border-radius:3px; color:white; display:inline-block;">${stu.assignDesc}</div>`;
            stuItem.appendChild(copyBtn);
            listContainer.appendChild(stuItem);
        });

        div.appendChild(header);
        div.appendChild(listContainer);
        grid.appendChild(div);
    }

    // 處理候補名單
    const waitlistBoard = document.getElementById('trialWaitlistBoard');
    waitlistBoard.innerHTML = "";
    waitlistBoard.className = "class-list-container";
    waitlistBoard.setAttribute('data-cls', 'waitlist');
    waitlistBoard.ondrop = window.drop;
    waitlistBoard.ondragover = window.allowDrop;

    // --- 候補目標解析神器 ---
    function getWaitlistTargetsKeys(prefs) {
        if (!prefs) return [];
        let targets = new Set();

        // 如果是全新動態建立的活動，它通常只會有一個選項就是 key 本身
        for (let i = 1; i <= 6; i++) {
            let ch = prefs[`choice${i}`];
            if (!ch || ch === "none") continue;

            // 處理抽象化後的雙科複合志願
            if (ch === "both_any") {
                ["math_day1_slotA", "math_day1_slotB", "math_day2_slotA", "math_day2_slotB", "sci_day1_slotA", "sci_day1_slotB", "sci_day2_slotA", "sci_day2_slotB"].forEach(t => targets.add(t));
            } else if (ch === "both_day1") {
                ["math_day1_slotA", "math_day1_slotB", "sci_day1_slotA", "sci_day1_slotB"].forEach(t => targets.add(t));
            } else if (ch === "both_day2") {
                ["math_day2_slotA", "math_day2_slotB", "sci_day2_slotA", "sci_day2_slotB"].forEach(t => targets.add(t));
            } else if (ch === "math_any") {
                ["math_day1_slotA", "math_day1_slotB", "math_day2_slotA", "math_day2_slotB"].forEach(t => targets.add(t));
            } else if (ch === "sci_any") {
                ["sci_day1_slotA", "sci_day1_slotB", "sci_day2_slotA", "sci_day2_slotB"].forEach(t => targets.add(t));
            } else {
                targets.add(ch);
            }
        }
        return Array.from(targets);
    }

    // 將散落的候補名單依據各班拆分
    let waitlistByClass = {};
    if (sessionsMap) {
        Object.keys(sessionsMap).forEach(k => waitlistByClass[k] = []);
    }

    waitlist.forEach(stu => {
        // 如果是純候補引擎產生出來的分身，它已經自帶目標班級了
        let targetKeys = stu.waitlistTarget ? [stu.waitlistTarget] : getWaitlistTargetsKeys(stu.preferences);

        targetKeys.forEach(key => {
            if (waitlistByClass[key]) {
                if (stu.assignedClasses && stu.assignedClasses.includes(key)) return;
                waitlistByClass[key].push(stu);
            }
        });
    });

    const wlGrid = document.getElementById('trialWaitlistByClassGrid');
    wlGrid.innerHTML = "";

    for (let cls in waitlistByClass) {
        let div = document.createElement('div');
        div.style.background = "#fff";
        div.style.padding = "10px";
        div.style.borderRadius = "8px";
        div.style.border = "1px dashed #e74c3c";

        let header = document.createElement('h4');
        header.style.marginTop = "0";
        header.style.color = "#c0392b";
        header.innerText = `⏳排 ${classNames[cls] || cls} (${waitlistByClass[cls].length})`;

        let listContainer = document.createElement('div');
        listContainer.className = "class-list-container";
        listContainer.setAttribute('data-cls', cls);
        listContainer.style.minHeight = "40px";
        listContainer.style.background = "#fdf2f0";
        listContainer.style.padding = "5px";
        listContainer.ondrop = window.drop;
        listContainer.ondragover = window.allowDrop;
        listContainer.ondragleave = function (ev) {
            if (!ev.currentTarget.contains(ev.relatedTarget)) _removePlaceholder();
        };

        waitlistByClass[cls].forEach((stu, wIndex) => {
            let stuItem = document.createElement('div');
            stuItem.id = `stu_${stu.id}_wl_${cls}`;
            stuItem.setAttribute('data-class', cls);
            stuItem.setAttribute('data-original-id', stu.id);
            stuItem.setAttribute('data-is-waitlist', 'true'); // ✨ 候補卡片標記
            stuItem.draggable = true;
            stuItem.ondragstart = window.drag;
            stuItem.ondragend = window.dragEnd; // ✨ 拖曳結束還原
            stuItem.style.background = "#e74c3c";
            stuItem.style.color = "white";
            stuItem.style.padding = "6px";
            stuItem.style.margin = "4px 0";
            stuItem.style.borderRadius = "4px";
            stuItem.style.fontSize = "12px";
            stuItem.style.cursor = "grab";
            stuItem.style.transition = "opacity 0.2s, transform 0.2s"; // ✨ 動畫過渡

            // ★ 如果引擎已經賦予了絕對 rank，就用它的，否則按順序排
            let displayRank = stu.rank ? stu.rank : (wIndex + 1);

            // ✨ 顯示報名送單時間
            let timeStr = '';
            if (stu.clientTimestampMs) {
                const d = new Date(stu.clientTimestampMs);
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                const ss = String(d.getSeconds()).padStart(2, '0');
                timeStr = `<span style="opacity:0.75; font-size:10px; margin-left:6px;">⏱ ${mm}/${dd} ${hh}:${min}:${ss}</span>`;
            }

            stuItem.innerHTML = `<span class="wl-seq" style="background:rgba(0,0,0,0.2); padding:2px 4px; border-radius:3px; margin-right:4px;">#${displayRank}</span> <strong>${window.escapeHTML(stu.studentName)}</strong> (${window.escapeHTML(stu.parentPhone)})${timeStr}`;
            listContainer.appendChild(stuItem);
        });

        div.appendChild(header);
        div.appendChild(listContainer);
        wlGrid.appendChild(div);
    }



    // 儲存到 module-level 供鎖死寫入時使用
    lastAllocatedResult = allocated;
    lastWaitlistByClass = waitlistByClass;
}

window.updateClassCounts = function () {
    document.querySelectorAll('.class-list-container').forEach(container => {
        const d_cls = container.getAttribute('data-cls');
        if (d_cls === 'waitlist') return;
        const cnt = container.children.length;
        const header = container.previousElementSibling;
        header.innerText = header.innerText.replace(/\(共 \d+ 人\)/, `(共 ${cnt} 人)`);
    });
}

window.openGodModeInjection = function () {
    if (!currentTrialEventId) return alert("⚠️ 請先選擇上方的試聽活動。");

    // 計算目前第一名時間
    let firstMs = Date.now();
    if (trialRegistrations.length > 0) {
        const sorted = [...trialRegistrations].filter(t => t.status !== 'deleted').sort((a, b) => a.clientTimestampMs - b.clientTimestampMs);
        if (sorted.length > 0) firstMs = sorted[0].clientTimestampMs;
    }
    const targetMs = firstMs - 1;

    const html = `
        <div style="text-align:left;">
            <label style="display:block; margin-bottom:5px;">學生姓名：</label>
            <input type="text" id="godName" style="padding:10px; width:100%; box-sizing:border-box; margin-bottom:15px; border:2px solid #ccc; border-radius:5px;" placeholder="例：特權生">
            <label style="display:block; margin-bottom:5px;">家長電話：</label>
            <input type="text" id="godPhone" style="padding:10px; width:100%; box-sizing:border-box; margin-bottom:15px; border:2px solid #ccc; border-radius:5px;" placeholder="例：0911222333">
            <label style="display:block; margin-bottom:5px;">指定毫秒時間 <span style="color:#e74c3c; font-size:12px;">💡 目前第一名時間為: ${firstMs}，若要插隊請輸入: ${targetMs}</span>：</label>
            <div style="display:flex; gap:10px; margin-bottom:15px;">
                <input type="number" id="godMs" style="padding:10px; flex:1; box-sizing:border-box; border:2px solid #ccc; border-radius:5px;" value="${Date.now()}">
                <button type="button" onclick="document.getElementById('godMs').value = '${targetMs}'" style="padding:10px; background:#f1c40f; border:none; border-radius:5px; cursor:pointer; white-space:nowrap;">👑 快速填入榜首時間</button>
            </div>
        </div>
    `;

    // 如果系統有載入 alert 或 SweetAlert，使用 prompt 等代替。這裡用簡單的 DOM 動態建立避開沒有 Swal 的狀況
    const modal = document.createElement('div');
    modal.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:99999; display:flex; justify-content:center; align-items:center;";
    modal.innerHTML = `
        <div style="background:white; padding:30px; border-radius:15px; max-width:400px; width:100%;">
            <h3 style="margin-top:0; color:#8e44ad;">⚡ 上帝模式：人工插隊登錄</h3>
            ${html}
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                <button id="godCancelBtn" style="padding:10px 20px; border:none; border-radius:5px; cursor:pointer;">取消</button>
                <button id="godSaveBtn" style="padding:10px 20px; border:none; border-radius:5px; background:#8e44ad; color:white; cursor:pointer;">登錄神聖名單</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('godCancelBtn').onclick = () => modal.remove();
    document.getElementById('godSaveBtn').onclick = async () => {
        const name = document.getElementById('godName').value;
        const phone = document.getElementById('godPhone').value;
        const ms = parseInt(document.getElementById('godMs').value);
        if (!name || !phone) {
            alert('❌ 姓名與電話不可空白');
            return;
        }

        const payload = {
            studentName: name,
            parentName: "上帝指派",
            parentPhone: phone,
            preferences: { choice1: "both_any" }, // 預設滿級志願
            clientTimestampMs: ms,
            status: 'pending'
        };
        try {
            await push(ref(db, `trial_events/registrations/${currentTrialEventId}`), payload);
            alert('✅ 成功：已降下神聖之光，請重新點擊 [啟動 AI 智能分發] 以刷新名單！');
            modal.remove();
        } catch (e) {
            alert('❌ 錯誤：' + e.message);
        }
    };
}

window.exportTrialAllocationCSV = function () {
    const grid = document.getElementById('trialClassesGrid');
    if (!grid || grid.innerHTML === "") {
        alert("請先執行 AI 智能分發後再匯出！");
        return;
    }

    let csvContent = "\uFEFF"; // BOM for Excel UTF-8
    csvContent += "狀態,班級,姓名,家長電話,備註說明\n";

    // 1. 抓取正取各班
    const classContainers = document.querySelectorAll('#trialClassesGrid .class-list-container');
    classContainers.forEach(container => {
        const classNameRaw = container.previousElementSibling.innerText; // ex: 5/01 (五) 13:00 數學 (共 40 人)
        const className = classNameRaw.split(' (共')[0];

        const students = container.querySelectorAll('div[id^="stu_"]');
        students.forEach(stuDiv => {
            // 從 DOM 解析文字，格式大概是： <strong>姓名</strong> (電話) <div...>[說明]</div>📋
            const strongTag = stuDiv.querySelector('strong');
            const name = strongTag ? strongTag.innerText.trim() : "";

            // 透過正則提取括號內的電話
            const phoneMatch = stuDiv.innerHTML.match(/\((09\d{8})\)/);
            const phone = phoneMatch ? phoneMatch[1] : "";

            const descDiv = stuDiv.querySelector('div');
            const desc = descDiv ? descDiv.innerText.trim() : "";

            csvContent += `正取,${className},${name},${phone},${desc}\n`;
        });
    });

    // 2. 抓取候補各班
    const wlContainers = document.querySelectorAll('#trialWaitlistByClassGrid .class-list-container');
    wlContainers.forEach(container => {
        const classNameRaw = container.previousElementSibling.innerText; // ex: ⏳排 5/01 (五) 13:00 數學 (40)
        const className = classNameRaw.substring(3).replace(/\s*\(\d+\)$/, ''); // 去除 "⏳排 " 及人數後綴

        const students = container.querySelectorAll('div[id^="stu_"]');
        students.forEach(stuDiv => {
            const strongTag = stuDiv.querySelector('strong');
            const name = strongTag ? strongTag.innerText.trim() : "";

            // 候補名單的文字結構略有不同：<span...>#1</span> <strong>姓名</strong> (電話)
            const phoneMatch = stuDiv.innerHTML.match(/\((09\d{8})\)/);
            const phone = phoneMatch ? phoneMatch[1] : "";

            const seqSpan = stuDiv.querySelector('span');
            const seq = seqSpan ? seqSpan.innerText.trim() : "";

            csvContent += `候補,${className},${name},${phone},候補順位 ${seq}\n`;
        });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `試聽分發結果_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.saveFinalTrialAllocation = async function () {
    if (!currentTrialEventId) { alert('❌ 請先選擇活動'); return; }
    const grid = document.getElementById('trialClassesGrid');
    if (!grid || grid.innerHTML === '') { alert('❌ 請先執行 AI 分發'); return; }

    if (!confirm('⚠️ 確定鎖死所有分發結果？\n\n鎖死後，通知中心才可讀取「最終定案名單」產生通知，且重新整理頁面也不會遺失！')) return;

    // 1. 從 DOM 讀取（包含手動拖曳微調後的正取名單）
    const finalAllocated = {};
    document.querySelectorAll('#trialClassesGrid .class-list-container').forEach(container => {
        const cls = container.getAttribute('data-cls');
        finalAllocated[cls] = [];
        container.querySelectorAll('div[id^="stu_"]').forEach(el => {
            finalAllocated[cls].push({
                id: el.getAttribute('data-original-id'),
                studentName: el.querySelector('strong')?.innerText || '',
                parentPhone: (el.innerHTML.match(/\((09\d{8})\)/) || [])[1] || '',
                assignDesc: el.querySelector('div')?.innerText || ''
            });
        });
    });

    // 2. 候補從 DOM 讀取（確保順位正確，含拖曳後調整）
    const finalWaitlist = {};
    document.querySelectorAll('#trialWaitlistByClassGrid .class-list-container').forEach(container => {
        const cls = container.getAttribute('data-cls');
        finalWaitlist[cls] = [];
        container.querySelectorAll('div[id^="stu_"]').forEach((el, idx) => {
            finalWaitlist[cls].push({
                id: el.getAttribute('data-original-id'),
                studentName: el.querySelector('strong')?.innerText || '',
                parentPhone: (el.innerHTML.match(/\((09\d{8})\)/) || [])[1] || '',
                rank: idx + 1
            });
        });
    });

    // 3. 寫入 Firebase
    const payload = {
        lockedAt: Date.now(),
        allocated: finalAllocated,
        waitlistByClass: finalWaitlist
    };
    try {
        await set(ref(db, `trial_events_config/${currentTrialEventId}/lockedAllocation`), payload);
        alert('✅ 分發結果已完美鎖死並儲存！\n\n您現在可以前往【📢 通知發送中心】產生通知名單了！');
    } catch (e) {
        alert('❌ 鎖死失敗：' + e.message);
    }
}

window.clearTrialAllocationBoard = function () {
    document.getElementById('trialClassesGrid').innerHTML = "";
    document.getElementById('trialWaitlistByClassGrid').innerHTML = "";
    document.getElementById('trialWaitlistBoard').innerHTML = "";
    document.getElementById('trialResultsBoard').style.display = "none";

    // Clear the visual badges on the main table without deleting the database
    trialRegistrations.forEach(t => t.assignDesc = null);
    renderTrialMonitorTable();

    const statusEl = document.getElementById('aiEngineStatus');
    statusEl.innerHTML = "🧹 分發看板已清空，可隨時重新執行。";
    statusEl.style.color = "#f39c12";
}

// ==========================================
// Phase 6: 通知發送中心與手動候補黑箱
// ==========================================

window.saveGasWebhook = async function () {
    const url = document.getElementById('setting-gas-webhook').value.trim();
    if (!url.startsWith('https://script.google.com/macros/s/')) {
        return alert('❌ 錯誤：這看起來不是有效的 Google Apps Script /exec 網址！\n請確定您的網址開頭是 https://script.google.com/macros/s/');
    }
    try {
        await set(ref(db, 'settings/gasWebhookUrl'), url);
        alert('✅ GAS Webhook API 網址已儲存！');
    } catch (e) {
        alert('儲存失敗：' + e.message);
    }
};

window.saveTemplates = async function () {
    await set(ref(db, 'settings/templates'), window.currentTemplates);
    alert('✅ 模板已成功儲存至 Firebase！');
};

window.renderTemplateEditor = function () {
    const area = document.getElementById('templateEditorArea');
    if (!area) return;
    area.innerHTML = '';

    const fields = [
        { key: 'regular_seat', name: '🐻 正式課程 - 純劃位' },
        { key: 'regular_wait', name: '🐻 正式課程 - 純候補' },
        { key: 'regular_mix', name: '🐻 正式課程 - 綜合型' },
        { key: 'trial_seat', name: '✨ 試聽活動 - 純錄取' },
        { key: 'trial_wait', name: '✨ 試聽活動 - 純候補' },
        { key: 'trial_mix', name: '✨ 試聽活動 - 綜合型' }
    ];

    fields.forEach(f => {
        const div = document.createElement('div');
        div.innerHTML = `
            <label style="font-weight:bold; color:#2c3e50; display:block; margin-bottom:5px;">${f.name}</label>
            <textarea id="tpl_${f.key}" style="width:100%; height:140px; padding:10px; box-sizing:border-box; border-radius:5px; border:1px solid #bdc3c7;" oninput="window.currentTemplates['${f.key}'] = this.value">${window.currentTemplates[f.key]}</textarea>
        `;
        area.appendChild(div);
    });
};

window.renderRegularCourseCheckboxes = function () {
    const container = document.getElementById('regularCourseCheckboxes');
    if (!container) return;
    container.innerHTML = '<label style="font-weight:bold; margin-right:15px; cursor:pointer;"><input type="checkbox" onchange="document.querySelectorAll(\'.regular-notify-cb\').forEach(cb => cb.checked = this.checked)"> 全選/全不選</label>';

    Object.keys(coursesData).forEach(key => {
        const c = coursesData[key];
        const name = `[${c.grade}] ${c.subject} ${c.classType || ''}`;
        container.innerHTML += `<label style="cursor:pointer; background:#fff; padding:5px 10px; border-radius:5px; border:1px solid #ccc; display:inline-block;"><input type="checkbox" class="regular-notify-cb" value="${key}"> ${name}</label>`;
    });
};

window.generateRegularNotifyList = function () {
    const selectedIds = Array.from(document.querySelectorAll('.regular-notify-cb:checked')).map(cb => cb.value);
    if (selectedIds.length === 0) return alert('請至少勾選一個正式課程！');

    const personMap = {};

    selectedIds.forEach(courseId => {
        const c = coursesData[courseId];
        if (!c) return;
        const courseName = `[${c.grade}] ${c.subject} ${c.classType || ''}`;

        // 抓正取
        const seats = seatsData[courseId] || {};
        Object.keys(seats).forEach(seatId => {
            if (seatId === '_settings') return;
            const info = seats[seatId];
            if (info.status === 'sold') {
                const key = `${info.studentName}_${info.parentPhone}`;
                if (!personMap[key]) personMap[key] = { name: info.studentName, phone: info.parentPhone, seats: [], waits: [] };
                personMap[key].seats.push(`✅ ${courseName} (座位: ${seatId})`);
            }
        });

        // 抓候補（計算序號）
        const wList = waitlistData[courseId] || {};
        let activeWaits = Object.values(wList).filter(w => w.status !== 'deleted');
        activeWaits.sort((a, b) => a.timestamp - b.timestamp);
        activeWaits.forEach((w, idx) => {
            const key = `${w.studentName}_${w.parentPhone}`;
            if (!personMap[key]) personMap[key] = { name: w.studentName, phone: w.parentPhone, seats: [], waits: [] };
            personMap[key].waits.push(`⏳ ${courseName} (候補第 ${idx + 1} 順位)`);
        });
    });

    renderNotifyCards('regularNotifyList', personMap, 'regular');

    // Toggle send all button visibility
    const btnSendAll = document.getElementById('btn-send-all-regular');
    if (Object.keys(personMap).length > 0) {
        btnSendAll.style.display = 'block';
    } else {
        btnSendAll.style.display = 'none';
    }
};

window.populateTrialNotifySelector = function () {
    const selector = document.getElementById('trialNotifySelector');
    if (!selector) return;
    const oldVal = selector.value;
    selector.innerHTML = '<option value="">-- 請選擇已鎖死的試聽活動 --</option>';

    Object.keys(trialEventsConfig).forEach(id => {
        const ev = trialEventsConfig[id];
        if (ev.lockedAllocation) {
            const lockedAt = window.formatTimeWithMs(ev.lockedAllocation.lockedAt);
            selector.innerHTML += `<option value="${id}">🔒 ${ev.title || id} (鎖死於 ${lockedAt})</option>`;
        }
    });
    selector.value = oldVal;
};

window.generateTrialNotifyList = function () {
    const eventId = document.getElementById('trialNotifySelector').value;
    if (!eventId) return alert('請選擇試聽活動！');

    const ev = trialEventsConfig[eventId];
    if (!ev || !ev.lockedAllocation) return alert('找不到鎖死資料。請先至「試聽分發引擎」點擊【💾 確定鎖死並發布通知】！');

    const personMap = {};
    const locked = ev.lockedAllocation;
    const sessions = ev.sessions || {};

    if (locked.allocated) {
        Object.keys(locked.allocated).forEach(classKey => {
            const className = sessions[classKey] ? sessions[classKey].name : classKey;
            (locked.allocated[classKey] || []).forEach(stu => {
                const key = `${stu.studentName}_${stu.parentPhone}`;
                if (!personMap[key]) personMap[key] = { name: stu.studentName, phone: stu.parentPhone, seats: [], waits: [] };
                personMap[key].seats.push(`✅ ${className}`);
            });
        });
    }

    if (locked.waitlistByClass) {
        Object.keys(locked.waitlistByClass).forEach(classKey => {
            const className = sessions[classKey] ? sessions[classKey].name : classKey;
            (locked.waitlistByClass[classKey] || []).forEach(stu => {
                const key = `${stu.studentName}_${stu.parentPhone}`;
                if (!personMap[key]) personMap[key] = { name: stu.studentName, phone: stu.parentPhone, seats: [], waits: [] };
                personMap[key].waits.push(`⏳ ${className} (候補第 ${stu.rank} 順位)`);
            });
        });
    }

    renderNotifyCards('trialNotifyList', personMap, 'trial');

    // Toggle send all button visibility
    const btnSendAll = document.getElementById('btn-send-all-trial');
    if (Object.keys(personMap).length > 0) {
        btnSendAll.style.display = 'block';
    } else {
        btnSendAll.style.display = 'none';
    }
};

// 通用名單渲染函數（修正 \n 換行 Bug）
function renderNotifyCards(containerId, personMap, typePrefix) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const keys = Object.keys(personMap);
    if (keys.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#7f8c8d; padding:20px;">查無資料。</p>';
        return;
    }

    keys.forEach(key => {
        const p = personMap[key];
        const aCount = p.seats.length;
        const bCount = p.waits.length;

        let tplKey = '';
        if (aCount > 0 && bCount === 0) tplKey = `${typePrefix}_seat`;
        else if (aCount === 0 && bCount > 0) tplKey = `${typePrefix}_wait`;
        else tplKey = `${typePrefix}_mix`;

        // 使用真正的換行符 \n（注意：不是 \\n）
        let msg = window.currentTemplates[tplKey] || '';
        msg = msg.replace(/\{\{姓名\}\}/g, p.name);
        msg = msg.replace(/\{\{劃位名單\}\}/g, p.seats.join('\n'));
        msg = msg.replace(/\{\{候補名單\}\}/g, p.waits.join('\n'));

        const div = document.createElement('div');
        div.className = 'notify-card'; // Add class for batch processing
        div.dataset.name = p.name;
        div.dataset.phone = p.phone;
        div.dataset.message = msg;
        div.style.cssText = 'background:#fff; padding:15px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:flex-start; gap:15px;';

        // HTML 預覽要把 \n 轉 <br>
        const textPreview = msg.replace(/\n/g, '<br>');

        div.innerHTML = `
            <div style="flex:1;">
                <h4 style="margin:0 0 10px 0; color:#2c3e50;">👤 ${p.name} (<span class="card-phone">${p.phone}</span>)</h4>
                <div style="font-size:13px; color:#555; background:#f4f6f7; padding:10px; border-radius:5px; max-height:150px; overflow-y:auto; line-height:1.6;">${textPreview}</div>
                <div class="send-status" style="margin-top: 5px; font-weight: bold; font-size: 13px;"></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px; align-self: center;">
                <button class="success btn-copy" style="white-space:nowrap;">📋 複製通知</button>
                <button class="success btn-line" style="white-space:nowrap; background:#00B900;">🚀 單獨傳送</button>
            </div>
        `;

        const btnCopy = div.querySelector('.btn-copy');
        btnCopy.onclick = () => {
            navigator.clipboard.writeText(msg).then(() => {
                const old = btnCopy.innerHTML;
                btnCopy.innerHTML = '✔️ 已複製！';
                btnCopy.classList.replace('success', 'warning');
                setTimeout(() => { btnCopy.innerHTML = old; btnCopy.classList.replace('warning', 'success'); }, 2000);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = msg;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                btnCopy.innerHTML = '✔️ 已複製！';
                setTimeout(() => { btnCopy.innerHTML = '📋 複製通知'; }, 2000);
            });
        };

        const btnLine = div.querySelector('.btn-line');
        btnLine.onclick = () => {
            sendNotificationToGAS([{ name: p.name, phone: p.phone, message: msg }], [div]);
        };

        container.appendChild(div);
    });
}

// 發送通知到 GAS Webhook
async function sendNotificationToGAS(payloadList, cardElements) {
    if (!gasWebhookUrl) {
        return alert('❌ 錯誤：請先在「通知文案模板設定」上方綁定 LINE API (GAS Webhook URL)！');
    }

    // 將按鈕與狀態改成 loading
    cardElements.forEach(card => {
        const btnLine = card.querySelector('.btn-line');
        const statusEl = card.querySelector('.send-status');
        btnLine.disabled = true;
        btnLine.innerHTML = '⏳ 發送中...';
        btnLine.style.background = '#ccc';
        statusEl.innerHTML = '';
    });

    try {
        const payloadData = {
            action: 'send_notifications',
            payloadList: payloadList
        };

        // GAS 經常阻擋 application/json 的 preflight request，改用 FormData / url-encoded 可以完美繞過
        const formBody = [];
        for (const property in payloadData) {
            const encodedKey = encodeURIComponent(property);
            const encodedValue = encodeURIComponent(typeof payloadData[property] === 'object' ? JSON.stringify(payloadData[property]) : payloadData[property]);
            formBody.push(encodedKey + "=" + encodedValue);
        }

        const response = await fetch(gasWebhookUrl, {
            method: 'POST',
            body: formBody.join('&'),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            redirect: 'follow'
        });

        // 必須等待重導向完成，抓出最後的 json 回應
        const result = await response.json();

        // 處理回傳結果
        if (result.status === 'completed' && result.scan_results) {
            result.scan_results.forEach((res, index) => {
                const card = cardElements[index];
                if (!card) return;
                const btnLine = card.querySelector('.btn-line');
                const statusEl = card.querySelector('.send-status');

                btnLine.disabled = false;

                if (res.status === 'success') {
                    btnLine.innerHTML = '✔️ 傳送成功';
                    btnLine.style.background = '#27ae60';
                    btnLine.classList.replace('success', 'warning'); // Change styling to show completion
                    statusEl.innerHTML = '🟢 已成功推播至 LINE';
                    statusEl.style.color = '#27ae60';
                } else {
                    btnLine.innerHTML = '❌ 傳送失敗';
                    btnLine.style.background = '#e74c3c';
                    statusEl.innerHTML = `🔴 發送失敗：${res.msg}`;
                    statusEl.style.color = '#e74c3c';
                }
            });
            return result.scan_results;
        } else {
            throw new Error(result.message || '未知 API 錯誤');
        }
    } catch (error) {
        console.error('GAS Webhook Error:', error);
        cardElements.forEach(card => {
            const btnLine = card.querySelector('.btn-line');
            const statusEl = card.querySelector('.send-status');
            btnLine.disabled = false;
            btnLine.innerHTML = '❌ 連線錯誤';
            btnLine.style.background = '#e74c3c';
            statusEl.innerHTML = `🔴 網路錯誤，請重新發送`;
            statusEl.style.color = '#e74c3c';
        });
        alert('🚨 與 LINE API (GAS) 連線失敗，請檢查網址或權限設定！\n' + error.message);
        return payloadList.map(p => ({ status: 'error', msg: error.message }));
    }
}

// 一鍵全數推播 (正式課程)
window.sendAllRegularNotifications = function () {
    triggerBatchSend('regularNotifyList', 'btn-send-all-regular');
};

// 一鍵全數推播 (試聽活動)
window.sendAllTrialNotifications = function () {
    triggerBatchSend('trialNotifyList', 'btn-send-all-trial');
};

async function triggerBatchSend(containerId, buttonId) {
    const container = document.getElementById(containerId);
    const cards = Array.from(container.querySelectorAll('.notify-card'));

    if (cards.length === 0) return alert('沒有可以推播的名單！');
    if (!confirm(`確定要將這 ${cards.length} 筆通知全部推播至 LINE 嗎？\n(未綁定 LINE 的家長系統會回報錯誤)`)) return;

    const isRegular = containerId === 'regularNotifyList';
    const barId = isRegular ? 'regularNotifyProgress' : 'trialNotifyProgress';
    const reportId = isRegular ? 'regularNotifyReport' : 'trialNotifyReport';
    const btnSendAll = document.getElementById(buttonId);

    const barEl = document.getElementById(barId);
    const reportEl = document.getElementById(reportId);

    if (barEl) {
        barEl.style.display = 'block';
        barEl.innerHTML = `
            <div style="font-size:16px; font-weight:bold; color:#2c3e50; margin-bottom:10px;">
                🚀 發送進度：<span id="${barId}-text">0 / ${cards.length}</span>
            </div>
            <div style="width:100%; height:20px; background:#eee; border-radius:10px; overflow:hidden;">
                <div id="${barId}-fill" style="width:0%; height:100%; background:#2ecc71; transition:width 0.3s;"></div>
            </div>`;
    }
    if (reportEl) {
        reportEl.style.display = 'none';
        reportEl.innerHTML = '';
    }
    if (btnSendAll) {
        btnSendAll.disabled = true;
        btnSendAll.style.opacity = '0.5';
    }

    let failedList = [];

    // Loop through cards one by one to show progress
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];

        if (barEl) {
            document.getElementById(`${barId}-text`).innerText = `${i + 1} / ${cards.length} (${card.dataset.name})`;
            document.getElementById(`${barId}-fill`).style.width = `${((i) / cards.length) * 100}%`;
        }

        const payload = [{
            name: card.dataset.name,
            phone: card.dataset.phone,
            message: card.dataset.message
        }];

        const results = await sendNotificationToGAS(payload, [card]);

        if (results && results[0]) {
            if (results[0].status !== 'success') {
                failedList.push({ name: card.dataset.name, phone: card.dataset.phone, reason: results[0].msg });
            }
        } else {
            failedList.push({ name: card.dataset.name, phone: card.dataset.phone, reason: '網路傳輸錯誤' });
        }

        if (barEl) {
            document.getElementById(`${barId}-fill`).style.width = `${((i + 1) / cards.length) * 100}%`;
        }

        await new Promise(r => setTimeout(r, 200));
    }

    if (barEl) {
        document.getElementById(`${barId}-text`).innerText = `✅ 發送完畢 (${cards.length} / ${cards.length})`;
    }
    if (btnSendAll) {
        btnSendAll.disabled = false;
        btnSendAll.style.opacity = '1';
    }

    // Render report
    if (reportEl && failedList.length > 0) {
        reportEl.style.display = 'block';
        let html = `<div style="background:#fdebd0; border:2px solid #e67e22; border-radius:8px; padding:15px; margin-top:20px; text-align:left;">
            <h3 style="color:#d35400; margin-top:0;">⚠️ 傳送失敗名單 (共 ${failedList.length} 筆)</h3>
            <ul style="color:#c0392b; line-height:1.6; margin-bottom:0; font-weight:bold; font-size:14px;">`;
        failedList.forEach(f => {
            html += `<li>${f.name} (${f.phone}) - 原因：${f.reason}</li>`;
        });
        html += `</ul></div>`;
        reportEl.innerHTML = html;
    } else if (reportEl && failedList.length === 0) {
        reportEl.style.display = 'block';
        reportEl.innerHTML = `<div style="background:#d5f5e3; border:2px solid #27ae60; border-radius:8px; padding:15px; margin-top:20px; color:#1e8449; font-weight:bold; text-align:center;">
            🎉 太棒了！本次發送 0 失敗，全部推播成功！
        </div>`;
    }
}

// 🧰 任務四：正式候補黑箱 - 手動安插候補
window.openManualWaitlistInjection = function () {
    const courseId = document.getElementById('waitlistSelector').value;
    if (courseId === 'all') return alert('請先在上方下拉選單選擇要安插候補的「特定課程」！');

    const sel = document.getElementById('waitlistSelector');
    const courseName = sel.options[sel.selectedIndex].text;

    // 計算目前第一名時間
    let firstMs = Date.now();
    const wList = waitlistData[courseId] || {};
    const activeWaits = Object.values(wList).filter(w => w.status !== 'deleted');
    if (activeWaits.length > 0) {
        activeWaits.sort((a, b) => a.timestamp - b.timestamp);
        firstMs = activeWaits[0].timestamp;
    }
    const targetMs = firstMs - 1;

    const modal = document.createElement('div');
    modal.id = 'manualWaitlistModal';
    modal.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:99999; display:flex; justify-content:center; align-items:center;";
    modal.innerHTML = `
        <div style="background:white; padding:30px; border-radius:15px; max-width:440px; width:100%;">
            <h3 style="margin-top:0; color:#e67e22;">➕ 手動安插候補 (黑箱作業)</h3>
            <p style="color:#7f8c8d; font-size:14px; margin-top:-5px;">目標課程：<strong>${courseName}</strong></p>
            <div style="text-align:left;">
                <label style="display:block; margin-bottom:5px;">學生姓名：</label>
                <input type="text" id="wGodName" style="padding:10px; width:100%; box-sizing:border-box; margin-bottom:15px; border:1px solid #ccc; border-radius:5px;" placeholder="例：王小明">
                <label style="display:block; margin-bottom:5px;">家長電話：</label>
                <input type="text" id="wGodPhone" style="padding:10px; width:100%; box-sizing:border-box; margin-bottom:15px; border:1px solid #ccc; border-radius:5px;" placeholder="例：0912345678">
                <label style="display:block; margin-bottom:5px;">備註：</label>
                <input type="text" id="wGodNote" style="padding:10px; width:100%; box-sizing:border-box; margin-bottom:15px; border:1px solid #ccc; border-radius:5px;" placeholder="例：主任交辦">
                <label style="display:block; margin-bottom:5px;">指定時間戳記 <span style="color:#e74c3c; font-size:12px;">💡 目前第一名: ${firstMs}，插隊榜首請輸入: ${targetMs}</span>：</label>
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <input type="number" id="wGodMs" style="padding:10px; flex:1; box-sizing:border-box; border:1px solid #ccc; border-radius:5px;" value="${Date.now()}">
                    <button type="button" onclick="document.getElementById('wGodMs').value = '${targetMs}'" style="padding:10px; background:#f1c40f; border:none; border-radius:5px; cursor:pointer; white-space:nowrap;">👑 快速填入榜首時間</button>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                <button id="wGodCancelBtn" style="padding:10px 20px; border:none; border-radius:5px; cursor:pointer; background:#ecf0f1;">取消</button>
                <button id="wGodSaveBtn" style="padding:10px 20px; border:none; border-radius:5px; background:#e67e22; color:white; cursor:pointer;">✅ 登錄候補名單</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 綁定按鈕（不用脆弱的 CSS 選擇器）
    document.getElementById('wGodCancelBtn').onclick = () => modal.remove();
    document.getElementById('wGodSaveBtn').onclick = async () => {
        const name = document.getElementById('wGodName').value.trim();
        const phone = document.getElementById('wGodPhone').value.trim();
        const note = document.getElementById('wGodNote').value.trim();
        const ms = parseInt(document.getElementById('wGodMs').value);
        if (!name || !phone) return alert('❌ 姓名與電話不可空白');

        const payload = {
            studentName: name,
            parentPhone: phone,
            note: note,
            status: 'waiting',
            timestamp: ms
        };
        try {
            await push(ref(db, `waitlist/${courseId}`), payload);
            alert('✅ 候補安插成功！');
            modal.remove();
        } catch (e) {
            alert('❌ 錯誤：' + e.message);
        }
    };
};

// === 正式課程測試輔助：產生與刪除假資料 ===
window.generateCourseTestData = async function () {
    const courseId = document.getElementById('classSelector').value;
    if (courseId === 'all') return alert("請先從上方下拉選單選擇「單一特定課程」！");

    const countStr = prompt("請問要產生幾筆假資料？\n(系統會優先填滿空位，滿了自動轉入候補)", "30");
    const generateCount = parseInt(countStr);
    if (isNaN(generateCount) || generateCount <= 0) return;

    const firstNames = ["家豪", "志明", "俊傑", "建宏", "俊宏", "志偉", "柏翰", "冠宇", "宥廷", "柏睿", "雅婷", "怡君", "佳穎", "詩涵", "雅雯", "瑜婷", "宛婷", "佩穎", "婉婷", "靜雯"];
    const lastNames = ["陳", "林", "黃", "張", "李", "王", "吳", "劉", "蔡", "楊", "許", "鄭", "謝", "洪", "郭", "邱", "曾", "廖", "賴", "徐"];

    // 抓取空位（先用自訂 layout，找不到才用教室預設）
    const layout = coursesData[courseId].layout || classrooms[coursesData[courseId].classroom]?.layout;
    if (!layout) return alert("❌ 找不到課程座位圖資料！請確認該課程已設定教室。");

    let emptySeats = [];
    layout.forEach(row => row.forEach(code => {
        if (code !== "_" && code !== "DOOR" && code !== "PILLAR" && !code.includes(':X')) {
            if (!seatsData[courseId] || !seatsData[courseId][code] || seatsData[courseId][code].status !== 'sold') {
                emptySeats.push(code);
            }
        }
    }));

    let tasks = [];
    let baseTime = Date.now() - 100000;

    for (let i = 0; i < generateCount; i++) {
        const name = lastNames[Math.floor(Math.random() * lastNames.length)] + firstNames[Math.floor(Math.random() * firstNames.length)] + "(測試)";
        const phone = `09${Math.floor(Math.random() * 90000000 + 10000000)}`;
        const timestamp = baseTime + (i * 1000);

        if (emptySeats.length > 0) {
            const seatId = emptySeats.shift();
            tasks.push(update(ref(db, `seats/${courseId}/${seatId}`), {
                status: 'sold',
                studentName: name,
                parentPhone: phone,
                soldTime: window.formatTimeWithMs(timestamp),
                timestamp: timestamp,
                orderId: "TEST_" + timestamp
            }));
        } else {
            tasks.push(push(ref(db, `waitlist/${courseId}`), {
                studentName: name,
                parentPhone: phone,
                note: "自動產生測試",
                status: 'waiting',
                timestamp: timestamp
            }));
        }
    }

    try {
        await Promise.all(tasks);
        alert(`✅ 成功產生 ${generateCount} 筆假資料！請查看座位表與候補名單。`);
    } catch (e) {
        alert("❌ 發生錯誤：" + e.message);
    }
};

window.clearCourseTestData = async function () {
    const courseId = document.getElementById('classSelector').value;
    if (courseId === 'all') return alert("請先從上方選擇「單一特定課程」！");
    if (!confirm("⚠️ 確定要清除此課程【所有】帶有「(測試)」字樣的座位與候補資料嗎？")) return;

    let tasks = [];

    // 清座位
    const seats = seatsData[courseId] || {};
    Object.keys(seats).forEach(seatId => {
        if (seatId === '_settings') return;
        if (seats[seatId].studentName && seats[seatId].studentName.includes("(測試)")) {
            tasks.push(set(ref(db, `seats/${courseId}/${seatId}`), null));
        }
    });

    // 清候補
    const wList = waitlistData[courseId] || {};
    Object.keys(wList).forEach(wId => {
        if (wList[wId].studentName && wList[wId].studentName.includes("(測試)")) {
            tasks.push(set(ref(db, `waitlist/${courseId}/${wId}`), null));
        }
    });

    if (tasks.length === 0) return alert("找不到帶有「(測試)」標記的資料。");

    try {
        await Promise.all(tasks);
        alert(`✅ 已清除 ${tasks.length} 筆測試資料！`);
    } catch (e) {
        alert("❌ 清除失敗：" + e.message);
    }
};

// === 試聽測試輔助：產生與刪除假資料 ===
window.generateTrialTestData = async function () {
    if (!currentTrialEventId) return alert("⚠️ 請先選擇上方的試聽活動。");
    if (!confirm(`是否確定要在「${currentTrialEventId}」生成 20 筆測試用的假名單？這將會直接寫入資料庫。`)) return;

    const currentEvent = trialEventsConfig[currentTrialEventId];
    if (!currentEvent || !currentEvent.sessions) {
        return alert("⚠️ 該活動尚未建立任何場次，無法生成假資料。");
    }

    let possibleChoices = Object.keys(currentEvent.sessions);

    // 如果是 dual_match 類型，順便加入複合選項模擬
    if (currentEvent.type === "dual_match") {
        possibleChoices.push("both_any", "both_day1", "both_day2");
        if (possibleChoices.some(k => k.includes("math_"))) possibleChoices.push("math_any");
        if (possibleChoices.some(k => k.includes("sci_"))) possibleChoices.push("sci_any");
    }

    const firstNames = ["家豪", "志明", "俊傑", "建宏", "俊宏", "志偉", "柏翰", "冠宇", "宥廷", "柏睿", "雅婷", "怡君", "佳穎", "詩涵", "雅雯", "瑜婷", "宛婷", "佩穎", "婉婷", "靜雯"];
    const lastNames = ["陳", "林", "黃", "張", "李", "王", "吳", "劉", "蔡", "楊", "許", "鄭", "謝", "洪", "郭", "邱", "曾", "廖", "賴", "徐"];

    let tasks = [];
    let baseTime = new Date().getTime() - 10000; // 模擬 10 秒前的時間開始

    for (let i = 1; i <= 20; i++) {
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        // 將志願陣列打亂，並取前 3 個不重複的
        const shuffledChoices = [...possibleChoices].sort(() => 0.5 - Math.random());

        const payload = {
            studentName: lastName + firstName,
            parentName: lastName + "爸爸",
            parentPhone: `09${Math.floor(Math.random() * 90000000 + 10000000)}`,
            preferences: {
                choice1: shuffledChoices[0] || "",
                choice2: shuffledChoices[1] || "",
                choice3: shuffledChoices[2] || ""
            },
            clientTimestampMs: baseTime + Math.floor(Math.random() * 5000), // 隨機加上 0~5秒
            status: 'pending'
        };
        tasks.push(push(ref(db, `trial_events/registrations/${currentTrialEventId}`), payload));
    }

    try {
        await Promise.all(tasks);
        alert('✅ 20 筆假資料生成完畢！請點擊 AI 智能分發。');
    } catch (e) {
        alert('❌ 生成失敗：' + e.message);
    }
}

window.clearTrialTestData = async function () {
    if (!currentTrialEventId) return alert("⚠️ 請先選擇上方的試聽活動。");
    if (confirm(`⚠️ 警告：這將會清空「${currentTrialEventId}」內所有的試聽報名資料！\n\n確定要徹底刪除嗎？`)) {
        try {
            await remove(ref(db, `trial_events/registrations/${currentTrialEventId}`));
            alert('✅ 所有資料已被徹底刪除！');
            document.getElementById('trialClassesGrid').innerHTML = "";
            document.getElementById('trialWaitlistBoard').innerHTML = "";
            document.getElementById('aiEngineStatus').innerHTML = "狀態：已清空資料庫。";
        } catch (e) {
            alert('❌ 刪除失敗：' + e.message);
        }
    }
}