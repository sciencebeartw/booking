/**
 * 檔案：GAS-master-seatmap.gs
 * 功能：專用於「座位總表」的寫入邏輯 (格式極致強化版)
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
  const CONTENT_START_ROW = 6; // 下移一點，留給大標題
  const CONTENT_START_COL = 1;

  // 1. 寫入與美化標題資訊 (合併儲存格)
  // [標題] 班級名稱
  const titleRange = sheet.getRange(1, 1, 1, totalCols);
  titleRange.merge()
            .setValue(info.classType)
            .setFontSize(24)
            .setFontWeight("bold")
            .setHorizontalAlignment("center")
            .setVerticalAlignment("middle");
  sheet.setRowHeight(1, 45);

  // [副標題] 時間與老師
  const subTitleRange = sheet.getRange(2, 1, 1, totalCols);
  subTitleRange.merge()
               .setValue("上課時間：" + info.time + "　/　老師：" + info.teacher)
               .setFontSize(12)
               .setFontWeight("normal")
               .setHorizontalAlignment("center")
               .setVerticalAlignment("middle");
  sheet.setRowHeight(2, 25);

  // [副標題] 教室
  const roomRange = sheet.getRange(3, 1, 1, totalCols);
  roomRange.merge()
           .setValue("教室：" + info.classroom)
           .setFontSize(12)
           .setFontWeight("normal")
           .setHorizontalAlignment("center")
           .setVerticalAlignment("middle");
  sheet.setRowHeight(3, 25);

  // 2. 建立「講台」區塊 (大幅強化)
  const stageRow = CONTENT_START_ROW - 1;
  const stageRange = sheet.getRange(stageRow, CONTENT_START_COL, 1, totalCols);
  stageRange.merge()
            .setValue("講　　　　台")
            .setBackground("#f2f2f2")
            .setHorizontalAlignment("center")
            .setVerticalAlignment("middle")
            .setFontWeight("bold")
            .setFontSize(20)
            .setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setRowHeight(stageRow, 40);

  // 3. 寫入座位名單
  records.forEach(record => {
    const r = CONTENT_START_ROW + record.rowIdx;
    const c = CONTENT_START_COL + record.colIdx;
    const cell = sheet.getRange(r, c);
    
    cell.setValue(record.studentName || "");
    
    // 設置格線樣式 (更粗的邊框)
    cell.setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID);
    cell.setHorizontalAlignment("center");
    cell.setVerticalAlignment("middle");
    cell.setFontWeight("bold");
    cell.setFontSize(14); // 名字字體大一點
  });

  // 4. 自動化格式調整 (讓格子更方正)
  // 設定欄寬 (約等於原本的 100 像素效果)
  for (let j = 0; j < totalCols; j++) {
    sheet.setColumnWidth(CONTENT_START_COL + j, 110);
  }
  // 設定列高 (增加高度讓它接近正方形)
  for (let i = 0; i <= maxRow; i++) {
    sheet.setRowHeight(CONTENT_START_ROW + i, 80);
  }

  // 凍結前 5 列
  sheet.setFrozenRows(CONTENT_START_ROW - 1);

  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    msg: "成功更新座位表至 " + tabName + " (格式已優化)" 
  })).setMimeType(ContentService.MimeType.JSON);
}
