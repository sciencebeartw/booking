/**
 * 檔案：GAS-master-seatmap.gs
 * 功能：專用於「座位總表」的寫入邏輯 (強化格式版)
 */

function doPost(e) {
  let postData;
  try {
    postData = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "JSON 解析失敗" })).setMimeType(ContentService.MimeType.JSON);
  }

  const { action, tabName, records, info } = postData;

  if (action === "export_seating_chart") {
    return handleExportSeatingChart(tabName, records, info);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "未知的 action" })).setMimeType(ContentService.MimeType.JSON);
}

function handleExportSeatingChart(tabName, records, info) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(tabName);
  
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }

  // 清除舊格式與內容
  sheet.clear();
  
  if (records.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "沒有座位資料" })).setMimeType(ContentService.MimeType.JSON);
  }

  // 計算最大邊界
  let maxRow = 0;
  let maxCol = 0;
  records.forEach(r => {
    if (r.rowIdx > maxRow) maxRow = r.rowIdx;
    if (r.colIdx > maxCol) maxCol = r.colIdx;
  });

  // 設定起始偏移 (留出標題空間)
  const CONTENT_START_ROW = 5; 
  const CONTENT_START_COL = 1;

  // 1. 寫入標題資訊
  sheet.getRange(1, 1).setValue(info.classType).setFontSize(16).setFontWeight("bold");
  sheet.getRange(2, 1).setValue("上課時間：" + info.time);
  sheet.getRange(2, 4).setValue("老師：" + info.teacher);
  sheet.getRange(3, 1).setValue("教室：" + info.classroom);

  // 2. 建立「講台」區塊 (置中合併)
  const stageRow = CONTENT_START_ROW - 1;
  const stageRange = sheet.getRange(stageRow, CONTENT_START_COL, 1, maxCol + 1);
  stageRange.merge()
            .setValue("講　　台")
            .setBackground("#f2f2f2")
            .setHorizontalAlignment("center")
            .setVerticalAlignment("middle")
            .setFontWeight("bold")
            .setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // 3. 寫入座位名單
  records.forEach(record => {
    const r = CONTENT_START_ROW + record.rowIdx;
    const c = CONTENT_START_COL + record.colIdx;
    const cell = sheet.getRange(r, c);
    
    cell.setValue(record.studentName || "");
    
    // 設置基本格線樣式 (白底黑框)
    cell.setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID);
    cell.setHorizontalAlignment("center");
    cell.setVerticalAlignment("middle");
    cell.setFontWeight("bold");
    cell.setFontSize(11);
  });

  // 4. 自動化格式調整
  const totalRange = sheet.getRange(CONTENT_START_ROW, CONTENT_START_COL, maxRow + 1, maxCol + 1);
  
  // 統一欄寬與列高 (讓座位看起來方正)
  for (let j = 0; j <= maxCol; j++) {
    sheet.setColumnWidth(CONTENT_START_COL + j, 100);
  }
  for (let i = 0; i <= maxRow; i++) {
    sheet.setRowHeight(CONTENT_START_ROW + i, 45);
  }

  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    msg: "成功更新座位表至 " + tabName 
  })).setMimeType(ContentService.MimeType.JSON);
}
