/**
 * 檔案：GAS-master-seatmap.gs
 * 功能：專用於「座位總表」的寫入邏輯 (極致格式優化 V3)
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
  sheet.clearFormats();
  
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

  const totalCols = maxCol + 1;
  const CONTENT_START_ROW = 8; // 下移更多，留給講台厚度
  const CONTENT_START_COL = 1;

  // 1. 寫入與美化標題資訊 (合併儲存格)
  // [標題] 班級名稱 (置中合併)
  const titleRange = sheet.getRange(1, 1, 1, totalCols);
  titleRange.merge()
            .setValue(info.classType)
            .setFontSize(24)
            .setFontWeight("bold")
            .setHorizontalAlignment("center")
            .setVerticalAlignment("middle");
  sheet.setRowHeight(1, 50);

  // [副標題] 時間與老師 (置中合併)
  const subTitleRange = sheet.getRange(2, 1, 1, totalCols);
  subTitleRange.merge()
               .setValue("上課時間：" + info.time + "　/　老師：" + info.teacher)
               .setFontSize(12)
               .setHorizontalAlignment("center")
               .setVerticalAlignment("middle");
  sheet.setRowHeight(2, 30);

  // [教室資訊] (12pt, 左側)
  const roomRange = sheet.getRange(3, 1, 1, totalCols);
  roomRange.merge()
           .setValue("教室：" + info.classroom)
           .setFontSize(12)
           .setHorizontalAlignment("center")
           .setVerticalAlignment("middle");
  sheet.setRowHeight(3, 25);

  // 2. 建立「講台」區塊 (合併 2 列以增加厚度, 36pt 字體)
  const stageStartRow = 4;
  const stageNumRows = 3; // 4, 5, 6
  const stageRange = sheet.getRange(stageStartRow, CONTENT_START_COL, stageNumRows, totalCols);
  stageRange.merge()
            .setValue("講　　　　台")
            .setBackground("#f2f2f2")
            .setHorizontalAlignment("center")
            .setVerticalAlignment("middle")
            .setFontWeight("bold")
            .setFontSize(36) // 使用者要求 36pt
            .setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  
  for(let i=0; i<stageNumRows; i++) {
    sheet.setRowHeight(stageStartRow + i, 30);
  }

  // 3. 寫入座位名單 (17pt 字體)
  records.forEach(record => {
    const r = CONTENT_START_ROW + record.rowIdx;
    const c = CONTENT_START_COL + record.colIdx;
    const cell = sheet.getRange(r, c);
    
    cell.setValue(record.studentName || "");
    
    // 設置格線樣式
    cell.setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID);
    cell.setHorizontalAlignment("center");
    cell.setVerticalAlignment("middle");
    cell.setFontWeight("bold");
    cell.setFontSize(17); // 使用者要求 17pt
  });

  // 4. 自動化格式調整 (讓格子方正)
  for (let j = 0; j < totalCols; j++) {
    sheet.setColumnWidth(CONTENT_START_COL + j, 120);
  }
  for (let i = 0; i <= maxRow; i++) {
    sheet.setRowHeight(CONTENT_START_ROW + i, 90);
  }

  // 凍結功能 (保留標題與講台)
  sheet.setFrozenRows(CONTENT_START_ROW - 1);

  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    msg: "成功導出座位表 (字體與格式已更新)" 
  })).setMimeType(ContentService.MimeType.JSON);
}
