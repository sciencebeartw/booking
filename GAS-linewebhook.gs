// 檔案：LineWebhook.gs
// 功能：智慧掃描綁定、雙親與群組並存機制、家長自動請假登記、新生微型表單解析、★智慧過濾捕蚊燈
const LINE_ACCESS_TOKEN = 'jAroU7Z3wjOq2r95naibGSC2Vo+kfUkPFY43Wyn/QdVs2A+AtRf08GoaOi1cla8Z2tGuE1Ju19RYYXp1eGrkx4zW5ll/IOsm324mH7haqZHdNYrrFhm1IuLkpiSv9TJFSNTQjdSbReP5SAmpeXolkgdB04t89/1O/w1cDnyilFU=';

function doPost(e) {
  if (!e) return ContentService.createTextOutput("OK");

  let postData;
  let rawContent = "";
  
  // 優先嘗試處理 urlencoded 格式的 API 請求 (避開 CORS)
  if (e.parameter && e.parameter.action) {
      postData = e.parameter;
      if(typeof postData.payloadList === 'string') {
        try {
          postData.payloadList = JSON.parse(decodeURIComponent(postData.payloadList));
        } catch(err) {
          try {
            postData.payloadList = JSON.parse(postData.payloadList);
          } catch(err2) {}
        }
      }
  } else if (e.postData && e.postData.contents) {
      rawContent = e.postData.contents;
      try {
        postData = JSON.parse(rawContent);
      } catch(err) {
        return ContentService.createTextOutput("OK");
      }
  } else {
      return ContentService.createTextOutput("OK");
  }

  // ★ 判斷是否為 Booking System 的 API 呼叫 (發送通知)
  if (postData && postData.action === "send_notifications") {
    return handleSendNotificationsAPI(postData);
  }

  // ★ 接收來自前台的發送學費單請求
  if (postData && postData.action === "send_bill_to_line") {
    let studentName = postData.studentName || "";
    let courseNames = postData.courseNames || "";
    let base64Data = postData.base64Data || "";
    let result = sendBillToLine(studentName, courseNames, base64Data);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // 以下為 LINE Bot Webhook 原本邏輯
  const event = postData.events ? postData.events[0] : null;
  if (!event || !event.message) return ContentService.createTextOutput("OK");

  const replyToken = event.replyToken;
  if (replyToken === "00000000000000000000000000000000" || replyToken === "ffffffffffffffffffffffffffffffff") {
    return ContentService.createTextOutput("OK");
  }

  // ★★★ 核心升級：優先抓取群組或聊天室的 ID，如果沒有才抓個人 ID ★★★
  let targetId = "";
  if (event.source.groupId) {
    targetId = event.source.groupId; // C開頭的群組ID
  } else if (event.source.roomId) {
    targetId = event.source.roomId;  // 另一種聊天室ID
  } else {
    targetId = event.source.userId;  // U開頭的個人ID
  }
  const userId = targetId; // 統一放入 userId 變數供後續使用

  // 處理訊息格式 (支援文字與貼圖)
  let userMessage = "";
  if (event.message.type === "text") {
    userMessage = event.message.text.trim();
  } else if (event.message.type === "sticker") {
    userMessage = "[傳送了貼圖]";
  } else {
    userMessage = `[傳送了${event.message.type}格式]`;
  }

  // 定義請假關鍵字字典
  const leaveKeywords = ["請假", "病假", "事假", "喪假", "公假", "防疫假", "不能來", "無法去", "無法上課", "不克前往"];
  const isLeaveRequest = leaveKeywords.some(keyword => userMessage.includes(keyword));

  let isUpdate = userMessage.startsWith("更新");
  let isNewForm = userMessage.includes("學生姓名") && userMessage.includes("聯絡電話");

  // 🔴 路線一：舊生更新資料 (單行模式)
  if (isUpdate) {
    const phoneMatch = userMessage.match(/09\d{2}-?\d{3}-?\d{3}/);
    if (phoneMatch) {
      const inputPhone = phoneMatch[0].replace(/-/g, "");
      let extractedName = userMessage.replace(/更新/g, "").replace(/[0-9\-]/g, "").replace(/\s+/g, "").trim();

      const bindResult = smartBindLineIdToSheet(extractedName, inputPhone, userId, "", "", userMessage);

      if (bindResult.status === "perfect_match") {
        replyMessage(replyToken, `更新學生資料成功！\n歡迎【${bindResult.studentName}】的家長！\n未來孩子專屬的重要班務與通知，都會持續透過這裡發送給您喔！🚀`);
      } else {
        replyMessage(replyToken, `已收到您的更新資料！\n\n但在系統中暫時沒有核對到【${bindResult.studentName}】與您手機的相符資料，已將您的資訊轉交給行政老師人工核對✍️\n請稍候，我們會盡快為您確認！🚀`);
      }
    } else {
      replyMessage(replyToken, `請輸入完整的資訊喔！\n格式：「更新 學生姓名 手機號碼」\n(例如：更新 大白熊 0912345678)`);
    }
  }
  // 🟠 路線二：新生建檔 (微型表單解析模式)
  else if (isNewForm) {
    let nameMatch = userMessage.match(/學生姓名[：:\s]*([^\n]+)/);
    let schoolMatch = userMessage.match(/就讀學校[：:\s]*([^\n]+)/);
    let gradeMatch = userMessage.match(/目前年級[：:\s]*([^\n]+)/);
    let phoneMatch = userMessage.match(/聯絡電話[：:\s]*([0-9\-]+)/);

    let extName = nameMatch ? nameMatch[1].trim() : "未填寫";
    let extSchool = schoolMatch ? schoolMatch[1].trim() : "";
    let extGrade = gradeMatch ? gradeMatch[1].trim() : "";
    let extPhone = phoneMatch ? phoneMatch[1].replace(/-/g, "").trim() : "";

    if (extName !== "未填寫" && extPhone !== "") {
      const bindResult = smartBindLineIdToSheet(extName, extPhone, userId, extSchool, extGrade, userMessage);

      if (bindResult.status === "perfect_match") {
        replyMessage(replyToken, `學生資料建檔成功！\n歡迎【${extName}】的家長！\n未來的重要班務與通知，都會透過這個頻道專屬發送給您喔！🚀`);
      } else {
        replyMessage(replyToken, `已收到您的申請！\n\n目前系統正在為新生【${extName}】進行資料建檔中✍️\n\n待行政老師建檔完畢，會盡快回覆為您安排後續事宜喔！感謝您的耐心等待🚀\n\n⚠️聯繫小提醒：\n✅ 一對一聯絡/請假/諮詢：請統一使用 Line\n✅ 最新課程公告：請追蹤 FB 粉絲專頁🔗 https://www.facebook.com/share/1G3nvWNTkX/`);
      }
    } else {
      replyMessage(replyToken, `哎呀！系統好像沒有讀取到完整的姓名或電話，請您複製完整的表單格式填寫後再傳送一次喔！`);
    }
  }
  // 🟢 路線三：家長傳送請假訊息
  else if (isLeaveRequest) {
    handleLeaveRequest(userMessage, userId, replyToken);
  }
  // 🔘 路線四：閒聊或未辨識訊息 (啟動智慧捕蚊燈)
  else {
    logUnrecognizedMessage(userMessage, userId);
    return ContentService.createTextOutput("OK"); // 已讀不回
  }

  return ContentService.createTextOutput("OK");
}

function smartBindLineIdToSheet(studentName, inputPhone, userId, school, grade, rawMessage) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const targetSheets = sheets.filter(s => s.getName().includes("總名單") && !s.getName().startsWith("【核對】"));

  for (let s = 0; s < targetSheets.length; s++) { 
    const sheet = targetSheets[s]; 
    const data = sheet.getDataRange().getValues(); 
    if (data.length < 1) continue; 
    const headers = data[0]; 
    const nameCol = headers.indexOf("姓名"); 
    const momPhoneCol = headers.indexOf("母手機"); 
    const dadPhoneCol = headers.indexOf("父手機");
    const lineIdCol = headers.indexOf("LINE ID"); 
    
    if (lineIdCol === -1 || nameCol === -1) continue; 
    
    for (let i = 1; i < data.length; i++) { 
        const dbName = String(data[i][nameCol]).trim(); 
        if (!dbName) continue; 
        
        if (dbName === studentName || rawMessage.includes(dbName)) { 
            const momPhone = String(data[i][momPhoneCol] || "").replace(/-/g, "").trim(); 
            const dadPhone = String(data[i][dadPhoneCol] || "").replace(/-/g, "").trim(); 
            
            if (momPhone === inputPhone || dadPhone === inputPhone) { 
                let currentId = String(data[i][lineIdCol] || "").trim(); 
                if (currentId === "") {
                    sheet.getRange(i + 1, lineIdCol + 1).setValue(userId); 
                } else if (!currentId.includes(userId)) { 
                    sheet.getRange(i + 1, lineIdCol + 1).setValue(currentId + "," + userId); 
                } 
                return { status: "perfect_match", studentName: studentName }; 
            }
        } 
    } 
  } 

  const pendingSheetName = "新生待建檔與確認區"; 
  let pendingSheet = ss.getSheetByName(pendingSheetName); 
  if (!pendingSheet) {
      pendingSheet = ss.insertSheet(pendingSheetName); 
      pendingSheet.appendRow(["申請時間", "學生姓名", "就讀學校", "目前年級", "聯絡電話", "LINE ID (請複製)", "處理狀態", "家長原始訊息"]);
      pendingSheet.getRange("A1:H1").setBackground("#f4cccc").setFontWeight("bold"); 
      pendingSheet.setFrozenRows(1);
      pendingSheet.setColumnWidth(6, 250); 
  } 

  const timestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss"); 
  pendingSheet.appendRow([timestamp, studentName, school, grade, inputPhone, userId, "🔴 尚未建檔", rawMessage]); 
  return { status: "pending_verification", studentName: studentName }; 
} 

function handleLeaveRequest(userMessage, userId, replyToken) { 
  const ss = SpreadsheetApp.getActiveSpreadsheet(); 
  let studentName = "未知(可能尚未綁定或新生)"; 
  const sheets = ss.getSheets().filter(s => s.getName().includes("總名單") && !s.getName().startsWith("【核對】"));

  for (let s of sheets) {
      const data = s.getDataRange().getValues();
      if (data.length < 1) continue; 
      const nameCol = data[0].indexOf("姓名"); 
      const lineIdCol = data[0].indexOf("LINE ID"); 
      if (nameCol === -1 || lineIdCol === -1) continue; 
      for (let i = 1; i < data.length; i++) { 
          let ids = String(data[i][lineIdCol] || ""); 
          if (ids.includes(userId)) { 
              studentName = String(data[i][nameCol]).trim(); 
              break; 
          } 
      } 
      if (studentName !== "未知(可能尚未綁定或新生)") break; 
  } 

  let leaveSheet = ss.getSheetByName("家長請假"); 
  if (!leaveSheet) {
      leaveSheet = ss.insertSheet("家長請假"); 
      leaveSheet.appendRow(["登記時間", "學生姓名", "處理狀態", "請假詳細訊息"]);
      leaveSheet.getRange("A1:D1").setBackground("#fff2cc").setFontWeight("bold"); 
      leaveSheet.setFrozenRows(1);
      leaveSheet.setColumnWidth(1, 150); 
      leaveSheet.setColumnWidth(2, 100); 
      leaveSheet.setColumnWidth(3, 100);
      leaveSheet.setColumnWidth(4, 400); 
  } 
  
  const timestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss"); 
  leaveSheet.appendRow([timestamp, studentName, "🔴 待確認", userMessage]); 
} 

function logUnrecognizedMessage(userMessage, userId) { 
  const ss = SpreadsheetApp.getActiveSpreadsheet(); 
  
  const targetSheets = ss.getSheets().filter(s => s.getName().includes("總名單") && !s.getName().startsWith("【核對】"));
  for (let s of targetSheets) {
      const data = s.getDataRange().getValues();
      if (data.length < 1) continue; 
      const lineIdCol = data[0].indexOf("LINE ID"); 
      if (lineIdCol === -1) continue; 
      for (let i = 1; i < data.length; i++) { 
          if (String(data[i][lineIdCol]).includes(userId)) { 
             return; 
          } 
      } 
  } 
  
  const logSheetName = "家長閒聊與未辨識區"; 
  let logSheet = ss.getSheetByName(logSheetName); 
  if (!logSheet) { 
      logSheet = ss.insertSheet(logSheetName); 
      logSheet.appendRow(["收到時間", "家長最新訊息", "LINE ID (可手動複製綁定)"]); 
      logSheet.getRange("A1:C1").setBackground("#d9d2e9").setFontWeight("bold"); 
      logSheet.setFrozenRows(1);
      logSheet.setColumnWidth(1, 150); 
      logSheet.setColumnWidth(2, 300); 
      logSheet.setColumnWidth(3, 250); 
  } 
  
  const timestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss"); 
  const data = logSheet.getDataRange().getValues(); 
  let found = false; 
  
  for (let i = 1; i < data.length; i++) { 
      if (String(data[i][2]) === userId) { 
          logSheet.getRange(i + 1, 1).setValue(timestamp);
          logSheet.getRange(i + 1, 2).setValue(userMessage); 
          found = true; 
          break; 
      } 
  } 
  
  if (!found) { 
      logSheet.appendRow([timestamp, userMessage, userId]); 
  } 
} 

function replyMessage(replyToken, text) { 
  const url = "https://api.line.me/v2/bot/message/reply"; 
  const payload = { 
      replyToken: replyToken, 
      messages: [{ type: "text", text: text }] 
  }; 
  const options = { 
      method: "post", 
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN }, 
      payload: JSON.stringify(payload) 
  }; 
  try { 
      UrlFetchApp.fetch(url, options); 
  } catch (error) { 
      console.error("回覆失敗:", error); 
  } 
}