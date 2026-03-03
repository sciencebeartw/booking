// Code.gs

// --- 1. 選單與介面啟動 ---
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🐻 山熊行政系統')
    .addItem('🔑 0. 初次使用系統授權 (新帳號必按)', 'forceAuth')
    .addSeparator()
    .addItem('1. 建立學費核對表', 'showSetupDialog')
    .addSeparator()
    .addItem('2. 產生學費單圖片', 'showBillGenerator') 
    .addSeparator() 
    .addItem('3. 新增學生資料', 'showStudentForm') 
    .addSeparator() 
    .addItem('4. 山熊通訊中心 (LINE發送)', 'showLineMessageCenter') 
    .addToUi();
}

function forceAuth() {
  try {
    // 1. 強制喚醒「雲端硬碟」權限
    DriveApp.getFiles().hasNext(); 
    // 2. 強制喚醒「試算表」權限
    SpreadsheetApp.getActiveSpreadsheet();
    // 3. 強制喚醒「外部連線 (LINE發送)」權限 (把你之前的那行加回來！)
    UrlFetchApp.fetch("https://www.google.com");

    // 如果上面三個動作都順利通過，代表權限全開了
    SpreadsheetApp.getUi().alert('✅ 授權檢查通過！\n\n您的帳號已經具備完整的系統執行與發送權限，可以開始正常操作囉！🐻✨');
  } catch (e) {
    // 如果有任何一個權限沒過，就會被這裡攔截並跳出教學提示
    SpreadsheetApp.getUi().alert('⚠️ 系統提示\n\n系統正在請求您的權限，請在接下來彈出的視窗中點擊「繼續」➔「選擇您的帳號」➔「進階」➔「前往」➔「允許」。');
  }
}

function showSetupDialog() {
  const html = HtmlService.createHtmlOutputFromFile('SetupForm')
    .setWidth(600).setHeight(750).setTitle('建立新學期學費單'); 
  SpreadsheetApp.getUi().showModalDialog(html, '學費單設定精靈');
}

function showBillGenerator() {
  const html = HtmlService.createHtmlOutputFromFile('BillGenerator')
    .setWidth(900).setHeight(700).setTitle('學費單列印視窗');
  SpreadsheetApp.getUi().showModalDialog(html, '學費單預覽');
}

function showLineMessageCenter() {
  const html = HtmlService.createHtmlOutputFromFile('MessageCenter')
    .setWidth(900).setHeight(700).setTitle('🐻 山熊通訊中心');
  SpreadsheetApp.getUi().showModalDialog(html, '山熊數位通訊中心');
}

// ==========================================
// ★ 山熊通訊中心專用程式碼 (LINE發送與分群) ★
// ==========================================

function getLineBoundStudents(targetYear) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const yearInt = parseInt(targetYear);
  const yearStr = String(targetYear);
  
  const sheetNames = [
    "國小總名單", 
    `${yearInt}國一總名單`, 
    `${yearInt - 1}國二總名單`, 
    `${yearInt - 2}國三總名單`
  ];
  
  let students = [];

  sheetNames.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return; 
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return; 

    const headers = data[0];
    const nameCol = headers.indexOf('姓名');
    const lineIdCol = headers.indexOf('LINE ID');

    if (nameCol === -1 || lineIdCol === -1) return;

    for (let i = 1; i < data.length; i++) {
      const name = data[i][nameCol];
      const lineId = data[i][lineIdCol];
      
      // ★ 核心修復：同時支援 U(個人), C(群組), R(聊天室)
      if (name && lineId && (String(lineId).includes('U') || String(lineId).includes('C') || String(lineId).includes('R'))) {
        let tags = [sheetName]; 

        for(let c = 0; c < headers.length; c++) {
           const headerName = String(headers[c]).trim();
           const cellValue = String(data[i][c]).trim();

           if(headerName.startsWith(yearStr) && cellValue) {
               let translatedValue = cellValue;
               const lowerVal = cellValue.toLowerCase();

               if (lowerVal === '14') {
                 translatedValue = '週一、四班';
               } else if (lowerVal === '25') {
                 translatedValue = '週二、五班';
               } else if (lowerVal === '36') {
                 translatedValue = '週三、六班';
               } else if (lowerVal === 'v') {
                 translatedValue = '參加';
               } else if (lowerVal === '暑') {
                 translatedValue = '暑期班';
               } else if (['1', '2', '3', '4', '5', '6', '7'].includes(lowerVal)) {
                 const weekMap = {'1':'一', '2':'二', '3':'三', '4':'四', '5':'五', '6':'六', '7':'日'};
                 translatedValue = `週${weekMap[lowerVal]}班`;
               }

               let tag = `${headerName} (${translatedValue})`; 
               tags.push(tag); 
           }
        }

        students.push({
          name: name,
          lineId: String(lineId).trim(),
          tags: tags 
        });
      }
    }
  });
  
  return students;
}

function getLineTemplates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("LINE訊息範本庫");
  
  if (!sheet) {
    sheet = ss.insertSheet("LINE訊息範本庫");
    sheet.appendRow(["範本標題", "訊息內容"]);
    sheet.getRange("A1:B1").setBackground("#d9ead3").setFontWeight("bold");
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 400);
    sheet.appendRow(["(範例) 繳費提醒", "親愛的 {學生姓名} 家長您好：\n本期學費單已發放，請記得於本週繳交喔！🐻"]);
    sheet.appendRow(["(範例) 颱風停課", "緊急通知 🚨\n因颱風來襲，今日山熊科學停課一次，請 {學生姓名} 在家注意安全！"]);
  }
  
  const data = sheet.getDataRange().getValues();
  let templates = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      templates.push({ title: String(data[i][0]), content: String(data[i][1]) });
    }
  }
  return templates;
}

// 執行批次發送 LINE 訊息 (支援 4圖連發 + 自動上傳 Drive 直連密道 + 雙親與群組接收)
function sendBatchLineMessages(messages, imagesData) {
  const LINE_ACCESS_TOKEN = 'jAroU7Z3wjOq2r95naibGSC2Vo+kfUkPFY43Wyn/QdVs2A+AtRf08GoaOi1cla8Z2tGuE1Ju19RYYXp1eGrkx4zW5ll/IOsm324mH7haqZHdNYrrFhm1IuLkpiSv9TJFSNTQjdSbReP5SAmpeXolkgdB04t89/1O/w1cDnyilFU=';
  const url = 'https://api.line.me/v2/bot/message/push';
  let successCount = 0;
  let failCount = 0;

  // 1. 處理前端傳來的本機圖片 (自動上傳 Google Drive，取得 lh3 神祕直連網址)
  let finalImageUrls = [];
  if (imagesData && Array.isArray(imagesData) && imagesData.length > 0) {
    try {
      const mainFolderName = "山熊通訊中心發送圖庫";
      let mainFolders = DriveApp.getFoldersByName(mainFolderName);
      let mainFolder = mainFolders.hasNext() ? mainFolders.next() : DriveApp.createFolder(mainFolderName);

      const monthStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy年MM月");
      let subFolders = mainFolder.getFoldersByName(monthStr);
      let targetFolder = subFolders.hasNext() ? subFolders.next() : mainFolder.createFolder(monthStr);

      imagesData.forEach(img => {
        if (!img || !img.data) return;
        // 抓取 base64 並且去除雜質
        let base64String = img.data.split(",")[1].replace(/[\s\r\n]+/g, ''); 
        let decodedBytes = Utilities.base64Decode(base64String);
        
        let fileName = new Date().getTime() + "_" + img.name;
        let blob = Utilities.newBlob(decodedBytes, 'image/png', fileName);
        let file = targetFolder.createFile(blob);
        
        // 開啟共用並取得直連網址
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        let fileId = file.getId();
        finalImageUrls.push("https://lh3.googleusercontent.com/d/" + fileId);
      });
    } catch (e) {
      console.error("圖片上傳 Drive 失敗: ", e);
    }
  }

  // 2. 開始群發
  messages.forEach(msg => {
    let msgArray = [];
    
    // 放入文字泡泡
    if (msg.text && msg.text.trim() !== "") {
      msgArray.push({ type: 'text', text: msg.text });
    }
    
    // 放入圖片泡泡 (最多 4 張)
    finalImageUrls.forEach(imgUrl => {
      msgArray.push({
        type: 'image',
        originalContentUrl: imgUrl,
        previewImageUrl: imgUrl
      });
    });

    if (msgArray.length === 0) return; 

    // 把儲存格裡的 LINE ID 用逗號拆開 (支援雙親綁定與群組)
    const ids = msg.lineId.split(',').map(id => id.trim()).filter(id => id !== '');
    
    ids.forEach(singleId => {
      const payload = {
        to: singleId,
        messages: msgArray
      };
      
      const options = {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      
      try {
        const res = UrlFetchApp.fetch(url, options);
        if (res.getResponseCode() === 200) {
          successCount++;
        } else {
          failCount++;
          console.error("發送失敗: ", res.getContentText());
        }
      } catch (e) {
        failCount++;
        console.error("發送異常: ", e);
      }
      
      Utilities.sleep(50); // 稍微暫停，避免被 LINE 封鎖
    });
  });
  
  return { success: successCount, fail: failCount };
}

function handleSendNotificationsAPI(requestData) {
  if (requestData && requestData.action === "send_notifications" && requestData.payloadList) {
    let results = [];
    let ss = SpreadsheetApp.getActiveSpreadsheet();
    let targetSheets = ss.getSheets().filter(s => s.getName().includes('總名單') && !s.getName().startsWith('【核對】'));

    let finalMessages = [];
    let payloadList = requestData.payloadList;

    if (typeof payloadList === 'string') {
      try { payloadList = JSON.parse(payloadList); } catch (e) { payloadList = []; }
    }

    payloadList.forEach(item => {
      let extName = item.name.trim();
      let extPhone = String(item.phone).replace(/-/g, '').trim();
      let msgText = item.message;
      let foundLineId = "";

      for (let s of targetSheets) {
        let data = s.getDataRange().getValues();
        if (data.length < 2) continue;

        const headers = data[0];
        const nameCol = headers.indexOf('姓名');
        const momPhoneCol = headers.indexOf('母手機');
        const dadPhoneCol = headers.indexOf('父手機');
        const lineIdCol = headers.indexOf('LINE ID');

        if (nameCol === -1 || lineIdCol === -1) continue;

        for (let i = 1; i < data.length; i++) {
          let dbName = String(data[i][nameCol]).trim();
          let dbMomPhone = String(data[i][momPhoneCol] || '').replace(/-/g, '').trim();
          let dbDadPhone = String(data[i][dadPhoneCol] || '').replace(/-/g, '').trim();

          if (dbName === extName && (dbMomPhone === extPhone || dbDadPhone === extPhone)) {
            let id = String(data[i][lineIdCol]).trim();
            // ★ 核心修復：包含 R (聊天室)
            if (id && (id.includes('U') || id.includes('C') || id.includes('R'))) {
               foundLineId = id;
               break; 
            }
          }
        }
        if (foundLineId) break; 
      }

      if (foundLineId) {
        finalMessages.push({ lineId: foundLineId, text: msgText });
        results.push({ name: extName, phone: extPhone, status: "success", msg: "已加入發送佇列" });
      } else {
        results.push({ name: extName, phone: extPhone, status: "failed", msg: "找不到符合的手機或未綁定 LINE" });
      }
    });

    let sendResult = { success: 0, fail: 0 };
    if (finalMessages.length > 0) { sendResult = sendBatchLineMessages(finalMessages, []); }

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "completed", 
      scan_results: results,
      total_sent: sendResult.success,
      total_failed: sendResult.fail
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unknown action" })).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// --- 2. 核對表建立 (Step 1) ---
// ==========================================

function getTargetSheetNames(targetYear) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const yearStr = targetYear.toString();
  const prevYearStr = (parseInt(targetYear) - 1).toString();
  const prevPrevYearStr = (parseInt(targetYear) - 2).toString();
  const targetPatterns = [`國小總名單`, `${yearStr}國一總名單`, `${prevYearStr}國二總名單`, `${prevPrevYearStr}國三總名單`];
  
  return ss.getSheets()
    .map(s => s.getName())
    .filter(name => {
      const matchesPattern = targetPatterns.some(pattern => name.includes(pattern));
      const isNotReviewSheet = !name.startsWith("【核對】");
      return matchesPattern && isNotReviewSheet;
    });
}

function getSubjectColumns(sheetName, targetYear) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const subjects = [];
  const yearPrefix = targetYear.toString(); 

  for (let i = 12; i < headers.length; i++) {
    const header = headers[i].toString().trim();
    if (!header) continue;
    
    if (header.indexOf(yearPrefix) === 0) { 
      const uniqueValues = new Set();
      for (let r = 1; r < data.length; r++) {
        const cellVal = data[r][i];
        if (cellVal && cellVal.toString().trim() !== "") {
          uniqueValues.add(cellVal.toString().trim());
        }
      }
      const distinctClasses = Array.from(uniqueValues).sort();

      subjects.push({ name: header, index: i, uniqueValues: distinctClasses });
    }
  }
  return subjects;
}

function generateTuitionReviewSheet(formData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(formData.sourceSheetName);
  const data = sourceSheet.getDataRange().getValues();
  const outputData = [];
  const isElementary = formData.sourceSheetName.includes("國小");
  const targetYearInt = parseInt(formData.targetYear); 
  
  const newHeaders = ['姓名', '學校', '年級'];
  formData.selectedSubjects.forEach(sub => {
    let cleanName = sub.name.toString().replace(formData.targetYear.toString(), '');
    newHeaders.push(`${cleanName} [內容]`, `${cleanName} [資訊]`, `${cleanName} [原價]`, `${cleanName} [統一扣課(堂)]`, `${cleanName} [個別扣課(堂)]`, `${cleanName} [備註]`, `${cleanName} [小計]`);
  });
  newHeaders.push('本期學費總計'); 
  outputData.push(newHeaders);
  
  let currentRowIndex = 2; 
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[4]; const school = row[0]; const grade = row[1];
    
    let gradeDisplay = grade;
    if (grade) {
        const gradeInt = parseInt(grade);
        if (isElementary) {
            const diff = gradeInt - targetYearInt;
            const map = {1: '六', 2: '五', 3: '四', 4: '三', 5: '二', 6: '一'};
            if (map[diff]) gradeDisplay = map[diff];
        } else {
            const diff = targetYearInt - gradeInt;
            if (diff === 0) gradeDisplay = "七"; 
            if (diff === 1) gradeDisplay = "八"; 
            if (diff === 2) gradeDisplay = "九";
        }
    }

    let hasClass = false;
    let rowData = [name, school, gradeDisplay];
    let formulaParts = []; 
    let colOffset = 3; 

    formData.selectedSubjects.forEach(sub => {
      const cellValue = row[sub.index];
      const valStr = (cellValue) ? cellValue.toString().trim() : "";
      
      if (valStr !== "" && sub.allowedValues.includes(valStr)) {
        hasClass = true;
        let finalClassName = "";
        
        if (isElementary) {
          const headerName = sub.name; 
          if (headerName.includes("數學")) {
              if (valStr === "小六數") finalClassName = "小六邏輯數學";
              else if (valStr === "小五數") finalClassName = "小五邏輯數學";
              else if (valStr === "小六數資") finalClassName = "小六資優數學";
              else finalClassName = valStr; 
          } else if (headerName.includes("資優自然")) finalClassName = "小六資優自然" + valStr;
          else finalClassName = valStr;
        } else {
          const headerName = sub.name; 
          if (headerName.includes("國總")) { finalClassName = "國文總複習" + (valStr !== 'v' ? ` (${valStr})` : ''); }
          else if (headerName.includes("英總")) { finalClassName = "英文總複習" + (valStr !== 'v' ? ` (${valStr})` : ''); }
          else if (headerName.includes("社總")) { finalClassName = "社會總複習" + (valStr !== 'v' ? ` (${valStr})` : ''); }
          else if (headerName.includes("數總")) {
             if (valStr === "下午") finalClassName = "數學總複習下午班";
             else if (valStr === "晚上") finalClassName = "數學總複習晚上班";
             else finalClassName = "數學總複習" + (valStr !== 'v' ? ` (${valStr})` : '');
          } else if (headerName.includes("自總")) {
             if (valStr === "下午") finalClassName = "自然總複習下午班";
             else if (valStr === "晚上") finalClassName = "自然總複習晚上班";
             else finalClassName = "自然總複習" + (valStr !== 'v' ? ` (${valStr})` : '');
          } else {
             const subjectTitle = sub.name.replace(formData.targetYear.toString(), ''); 
             let classSuffix = "";
             if (valStr.toLowerCase() === 'v') classSuffix = ""; 
             else if (valStr === '14') classSuffix = " (週一、四班)";
             else if (valStr === '25') classSuffix = " (週二、五班)";
             else if (valStr === '36') classSuffix = " (週三、六班)";
             else if (valStr === '暑') classSuffix = " (暑期班)";
             else if (!isNaN(valStr)) {
                const num = parseInt(valStr);
                const weekMap = ['日', '一', '二', '三', '四', '五', '六'];
                if (weekMap[num]) classSuffix = ` (週${weekMap[num]}班)`;
                else classSuffix = ` (${valStr}班)`;
             } else classSuffix = ` (${valStr})`;
             finalClassName = subjectTitle + classSuffix;
          }
        }

        let targetDate = sub.startDate;
        if (sub.classSpecificDates && sub.classSpecificDates[valStr]) {
            targetDate = sub.classSpecificDates[valStr];
        }

        const totalFee = parseInt(sub.defaultFee) || 0;
        const totalLessons = parseInt(sub.lessonCount) || 1;
        const unitPrice = (totalLessons > 0) ? Math.round(totalFee / totalLessons) : 0;
        const deductCount = parseInt(sub.deductCount) || 0; 

        const colOriginal = columnToLetter(colOffset + 3); 
        const colGlobalCount = columnToLetter(colOffset + 4); 
        const colIndCount = columnToLetter(colOffset + 5); 

        rowData.push(finalClassName);
        rowData.push(`自 ${targetDate} 起 共 ${totalLessons} 堂`);
        rowData.push(totalFee); 
        rowData.push(deductCount > 0 ? deductCount : 0); 
        rowData.push(""); 
        rowData.push(sub.deductReason || ""); 
        rowData.push(`=${colOriginal}${currentRowIndex}-(${colGlobalCount}${currentRowIndex}+${colIndCount}${currentRowIndex})*${unitPrice}`);
        
        formulaParts.push(`${columnToLetter(colOffset + 7)}${currentRowIndex}`);
      } else {
        rowData.push("", "", "", "", "", "", "");
      }
      colOffset += 7; 
    });
    
    if (formulaParts.length > 0) rowData.push(`=${formulaParts.join('+')}`); else rowData.push(0);
    if (hasClass) { outputData.push(rowData); currentRowIndex++; }
  }
  
  const newSheetName = `【核對】${formData.sourceSheetName}`;
  let targetSheet = ss.getSheetByName(newSheetName);
  if (targetSheet) ss.deleteSheet(targetSheet);
  targetSheet = ss.insertSheet(newSheetName);
  
  if (outputData.length > 0) {
    const totalCols = outputData[0].length;
    const numRows = outputData.length;
    const range = targetSheet.getRange(1, 1, numRows, totalCols);
    range.setValues(outputData);
    
    targetSheet.setFrozenRows(1);
    targetSheet.getRange(1, 1, 1, totalCols).setBackground('#cfe2f3').setFontWeight('bold').setBorder(true, true, true, true, true, true);
    range.setHorizontalAlignment('center').setVerticalAlignment('middle');
    targetSheet.setRowHeights(1, numRows, 35); 
    
    const numSubjects = formData.selectedSubjects.length;
    for (let s = 0; s < numSubjects; s++) {
        let baseCol = 4 + (s * 7); 
        let globalDeductCol = baseCol + 3; 
        let indDeductCol = baseCol + 4; 
        let noteCol = baseCol + 5; 
        
        if (numRows > 1) {
            targetSheet.getRange(2, globalDeductCol, numRows-1, 1).setBackground('#f4cccc'); 
            targetSheet.getRange(2, indDeductCol, numRows-1, 1).setBackground('#fff2cc'); 
            targetSheet.getRange(2, noteCol, numRows-1, 1).setBackground('#fff2cc'); 
        }
    }
    
    targetSheet.autoResizeColumns(1, totalCols);
    targetSheet.setColumnWidth(1, 80); targetSheet.setColumnWidth(2, 60); targetSheet.setColumnWidth(3, 50);  
    for (let s = 0; s < numSubjects; s++) {
        let contentCol = 4 + (s * 7); 
        targetSheet.setColumnWidth(contentCol, 180); 
        targetSheet.setColumnWidth(contentCol + 1, 150); 
        targetSheet.setColumnWidth(contentCol + 5, 150); 
    }
  }
  return outputData.length - 1;
}

function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function getVerificationSheets() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName()).filter(name => name.startsWith("【核對】"));
}

function getBillData(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getDisplayValues(); 
  const bills = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const student = {
      name: row[0], school: row[1], grade: row[2],
      items: [], 
      total: row[row.length - 1] 
    };
    
    const subjectEndCol = row.length - 1; 
    for (let c = 3; c < subjectEndCol; c += 7) {
      const content = row[c];
      const info = row[c+1]; 
      const originalPrice = row[c+2]; 
      const note = row[c+5]; 
      
      if (content && content.trim() !== "") {
        student.items.push({
          name: content,
          date: info,
          note: note, 
          price: originalPrice.replace(/,/g, '') 
        });
      }
    }
    bills.push(student);
  }
  return bills;
}

// ==========================================
// ★ 學費單直接發送 LINE 專用引擎
// ==========================================

function sendBillToLine(studentName, courseNames, base64Data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => s.getName().includes('總名單') && !s.getName().startsWith('【核對】'));
  let lineIds = "";

  for (let s of sheets) {
    const data = s.getDataRange().getValues();
    const nameCol = data[0].indexOf('姓名');
    const lineIdCol = data[0].indexOf('LINE ID');
    if (nameCol === -1 || lineIdCol === -1) continue;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][nameCol]).trim() === studentName) {
        lineIds = String(data[i][lineIdCol]).trim();
        break;
      }
    }
    if (lineIds) break;
  }

  // ★ 核心修復：發送學費單時，也要同時支援發給 U(個人), C(群組), R(聊天室)
  if (!lineIds || (!lineIds.includes('U') && !lineIds.includes('C') && !lineIds.includes('R'))) {
    return { success: false, msg: `找不到【${studentName}】的 LINE 綁定紀錄，請確認家長是否已完成建檔！` };
  }

  if (!base64Data || !base64Data.includes(",")) {
    return { success: false, msg: "圖片轉檔失敗，請重新整理網頁後再試一次！" };
  }

  try {
    let base64String = base64Data.split(",")[1].replace(/[\s\r\n]+/g, ''); 

    const mainFolderName = "山熊學費單發送紀錄";
    let mainFolders = DriveApp.getFoldersByName(mainFolderName);
    let mainFolder = mainFolders.hasNext() ? mainFolders.next() : DriveApp.createFolder(mainFolderName);

    const monthStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy年MM月");
    let subFolders = mainFolder.getFoldersByName(monthStr);
    let targetFolder = subFolders.hasNext() ? subFolders.next() : mainFolder.createFolder(monthStr);

    const timeString = Utilities.formatDate(new Date(), "Asia/Taipei", "MMdd_HHmm");
    const fileName = `${studentName}_學費單_${timeString}.png`;

    const decodedBytes = Utilities.base64Decode(base64String);
    const blob = Utilities.newBlob(decodedBytes, 'image/png', fileName);
    const file = targetFolder.createFile(blob); 

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();

    const imageUrl = "https://lh3.googleusercontent.com/d/" + fileId;

    const LINE_ACCESS_TOKEN = 'jAroU7Z3wjOq2r95naibGSC2Vo+kfUkPFY43Wyn/QdVs2A+AtRf08GoaOi1cla8Z2tGuE1Ju19RYYXp1eGrkx4zW5ll/IOsm324mH7haqZHdNYrrFhm1IuLkpiSv9TJFSNTQjdSbReP5SAmpeXolkgdB04t89/1O/w1cDnyilFU=';
    const url = 'https://api.line.me/v2/bot/message/push';

    const officialText = `親愛的 ${studentName} 家長您好\n此附件為本期 ${courseNames} 學費單。因應環保及家長方便繳費，改為線上傳學費通知。收到後可以選擇臨櫃現金繳費，也可以線上匯款。\n\n在此提供我們的匯款帳號：\n山熊科學實驗教室 匯款帳號\n第一銀行 007 - 竹科分行\n戶名 : 新竹市私立山熊科學文理短期補習班\n帳號 : 303-100-13273\n\n若使用匯款再請提供後五碼以利我們對帳，謝謝您！`;

    const msgArray = [
      { type: 'text', text: officialText },
      { type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl }
    ];

    const ids = lineIds.split(',').map(id => id.trim()).filter(id => id !== '');
    
    ids.forEach(singleId => {
      const payload = { to: singleId, messages: msgArray };
      const options = {
        method: 'post',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      UrlFetchApp.fetch(url, options);
      Utilities.sleep(50);
    });

    return { success: true, msg: `✅ 已成功發送學費單給【${studentName}】的家長！` };

  } catch (e) {
    return { success: false, msg: "系統內部錯誤：" + e.message };
  }
}

// ==========================================
// ★ 雲端清潔工：自動銷毀 30 天前的傳送圖片 ★
// ==========================================
function cleanUpOldImages() {
  const foldersToClean = ["山熊學費單發送紀錄", "山熊通訊中心發送圖庫"];
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  foldersToClean.forEach(folderName => {
    const folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) return; 
    
    const mainFolder = folders.next();
    const subFolders = mainFolder.getFolders();
    
    while (subFolders.hasNext()) {
      let subFolder = subFolders.next();
      let files = subFolder.getFiles();
      
      while (files.hasNext()) {
        let file = files.next();
        if (file.getDateCreated() < thirtyDaysAgo) {
          file.setTrashed(true);
        }
      }
    }
  });
}