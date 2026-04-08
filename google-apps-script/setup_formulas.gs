/**
 * SETUP FORMULAS - BÁO CÁO BĐH DỰ ÁN
 * ====================================
 * Chạy hàm này 1 lần duy nhất để cài đặt tất cả công thức.
 * 
 * CẤU TRÚC CỘT:
 *   A = STT
 *   B = TÊN DỰ ÁN
 *   C = KH (%) - Kế hoạch tiến độ
 *   D = LK HÔM QUA (%) - Thủ công cập nhật mỗi ngày
 *   E = HÔM NAY (%) - Thủ công nhập mỗi ngày
 *   F = LK HÔM NAY (%) - CÔNG THỨC: =D+E
 *   G = GT HĐ (tỷ) - Giá trị hợp đồng
 *   H = GT SẢN LƯỢNG (tỷ)
 *   I = GT NGHIỆM THU (tỷ)
 *   J = % SL/HĐ - CÔNG THỨC: =H/G
 *   K = CẢNH BÁO - CÔNG THỨC tự động
 *   L = CÔNG VIỆC TRONG NGÀY - Thủ công
 *   M = VƯỚNG MẮC - Thủ công
 */

function setupFormulas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("NHAP LIEU");
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert("❌ Không tìm thấy sheet 'NHAP LIEU'. Kiểm tra lại tên sheet.");
    return;
  }
  
  var lastRow = sheet.getLastRow();
  Logger.log("Sheet NHAP LIEU - Tổng dòng: " + lastRow);
  
  // ─── BƯỚC 1: TỐ CHỨC THÔNG TIN (in ra log để người dùng kiểm tra) ───────
  var allData = sheet.getRange(1, 1, lastRow, 15).getValues();
  
  // Tìm các dòng dữ liệu dự án (có nội dung ở cột B và không phải header)
  var projectRows = [];  // các dòng dự án thực sự
  var summaryRow = -1;   // dòng tổng hợp
  var headerRow = -1;    // dòng header cột
  
  for (var i = 0; i < allData.length; i++) {
    var rowNum = i + 1;
    var valA = String(allData[i][0]).trim(); // Cột A
    var valB = String(allData[i][1]).trim(); // Cột B
    
    // Tìm header row (dòng có "TÊN DỰ ÁN" ở cột B hoặc "STT" ở cột A)
    if (valA.toUpperCase() === "STT" || valB.toUpperCase().indexOf("TÊN DỰ ÁN") >= 0) {
      headerRow = rowNum;
      Logger.log("✅ Header row: " + rowNum);
      continue;
    }
    
    // Tìm dòng tổng/bình quân
    if (valB.toUpperCase().indexOf("TỔNG") >= 0 || valB.toUpperCase().indexOf("BÌNH QUÂN") >= 0 
        || valA.toUpperCase().indexOf("TỔNG") >= 0) {
      summaryRow = rowNum;
      Logger.log("✅ Summary row: " + rowNum);
      continue;
    }
    
    // Dòng dự án: cột B có nội dung VÀ không phải section header (ĐÃ KHỞI CÔNG, CHƯA KHỞI CÔNG)
    if (valB !== "" && valB !== "undefined" 
        && valB.toUpperCase().indexOf("KHỞI CÔNG") < 0
        && valB.toUpperCase().indexOf("KH_CONG") < 0
        && headerRow > 0) {
      // Bỏ qua dòng hướng dẫn/quy ước ở đầu file
      var valG = allData[i][6]; // Cột G - GT HĐ
      var isProjectRow = (typeof valG === 'number' && valG > 0) 
                         || valB.toUpperCase().indexOf("XLNT") >= 0
                         || valB.toUpperCase().indexOf("RACH") >= 0
                         || valB.toUpperCase().indexOf("HƯƠNG") >= 0
                         || valB.toUpperCase().indexOf("CẦU") >= 0
                         || valB.toUpperCase().indexOf("THƯỜNG PHƯỚC") >= 0;
      
      if (isProjectRow || (headerRow > 0 && rowNum > headerRow && valB !== "")) {
        projectRows.push(rowNum);
        Logger.log("  📌 Dự án row " + rowNum + ": " + valB);
      }
    }
  }
  
  Logger.log("\nTổng dòng dự án tìm thấy: " + projectRows.length);
  Logger.log("Header tại: " + headerRow + ", Summary tại: " + summaryRow);
  
  // ─── BƯỚC 2: CÀI CÔNG THỨC CHO TỪNG DÒNG DỰ ÁN ──────────────────────────
  var formulasApplied = 0;
  
  for (var p = 0; p < projectRows.length; p++) {
    var r = projectRows[p];
    
    // Cột F: LK HÔM NAY = LK HÔM QUA + HÔM NAY
    var cellF = sheet.getRange(r, 6); // Cột F = index 6
    cellF.setFormula("=SUM(D" + r + ",E" + r + ")");
    cellF.setNumberFormat("0.00%");
    
    // Cột J: % SL/HĐ = GT Sản Lượng / GT Hợp Đồng
    var cellJ = sheet.getRange(r, 10); // Cột J = index 10
    cellJ.setFormula('=IF(G' + r + '=0,"",H' + r + '/G' + r + ')');
    cellJ.setNumberFormat("0.00%");
    
    // Cột K: CẢNH BÁO - so sánh % SL/HĐ với LK tiến độ
    var cellK = sheet.getRange(r, 11); // Cột K = index 11
    // Nếu % SL < LK tiến độ hơn 5% → cảnh báo
    cellK.setFormula(
      '=IF(AND(J' + r + '<>"",F' + r + '<>"",J' + r + '<F' + r + '-0.05),' +
      '"⚠ SL < TĐ "&TEXT(F' + r + '-J' + r + ',"0%"),' +
      '"✔")'
    );
    
    formulasApplied++;
    Logger.log("  ✅ Đã cài công thức dòng " + r);
  }
  
  // ─── BƯỚC 3: CÀI CÔNG THỨC DÒNG TỔNG ─────────────────────────────────────
  if (summaryRow > 0 && projectRows.length > 0) {
    var firstDataRow = projectRows[0];
    var lastDataRow = projectRows[projectRows.length - 1];
    var range = firstDataRow + ":" + lastDataRow;
    
    // F tổng: BÌNH QUÂN tiến độ
    var cellFSum = sheet.getRange(summaryRow, 6);
    cellFSum.setFormula("=IFERROR(AVERAGE(F" + firstDataRow + ":F" + lastDataRow + "),0)");
    cellFSum.setNumberFormat("0.00%");
    
    // G tổng: Tổng giá trị hợp đồng
    sheet.getRange(summaryRow, 7).setFormula("=SUM(G" + firstDataRow + ":G" + lastDataRow + ")");
    sheet.getRange(summaryRow, 7).setNumberFormat("0.000");
    
    // H tổng: Tổng sản lượng
    sheet.getRange(summaryRow, 8).setFormula("=SUM(H" + firstDataRow + ":H" + lastDataRow + ")");
    sheet.getRange(summaryRow, 8).setNumberFormat("0.000");
    
    // I tổng: Tổng nghiệm thu
    sheet.getRange(summaryRow, 9).setFormula("=SUM(I" + firstDataRow + ":I" + lastDataRow + ")");
    sheet.getRange(summaryRow, 9).setNumberFormat("0.000");
    
    // J tổng: % SL/HĐ tổng
    sheet.getRange(summaryRow, 10).setFormula(
      "=IF(G" + summaryRow + "=0,\"\",H" + summaryRow + "/G" + summaryRow + ")"
    );
    sheet.getRange(summaryRow, 10).setNumberFormat("0.00%");
    
    Logger.log("✅ Đã cài công thức dòng Tổng (row " + summaryRow + ")");
    formulasApplied++;
  }
  
  // ─── BƯỚC 4: TÔ MÀU THEO QUY ƯỚC ─────────────────────────────────────────
  // Màu vàng (FFFF99) = nhập tay mỗi ngày: cột D và E
  // Màu xanh nhạt (DBEAFE) = công thức tự tính: cột F, J, K
  if (projectRows.length > 0) {
    var firstR = projectRows[0];
    var lastR = projectRows[projectRows.length - 1];
    
    // Cột D, E → vàng (nhập tay)
    sheet.getRange(firstR, 4, lastR - firstR + 1, 2)
      .setBackground("#FFFF99");
    
    // Cột F → xanh nhạt (công thức)
    sheet.getRange(firstR, 6, lastR - firstR + 1, 1)
      .setBackground("#DBEAFE");
    
    // Cột J, K → xanh nhạt (công thức)  
    sheet.getRange(firstR, 10, lastR - firstR + 1, 2)
      .setBackground("#DBEAFE");
  }
  
  // ─── BƯỚC 5: THÔNG BÁO KẾT QUẢ ───────────────────────────────────────────
  var msg = "✅ HOÀN TẤT!\n\n"
    + "• Header tại dòng: " + headerRow + "\n"
    + "• Dòng dự án: " + projectRows.join(", ") + "\n"
    + "• Dòng Tổng: " + (summaryRow > 0 ? summaryRow : "Không tìm thấy") + "\n"
    + "• Số công thức đã cài: " + formulasApplied + " dòng\n\n"
    + "Công thức đã cài:\n"
    + "  • Cột F = D + E (Lũy kế hôm nay)\n"
    + "  • Cột J = H / G (% Sản lượng / Hợp đồng)\n"
    + "  • Cột K = Cảnh báo tự động\n"
    + "  • Dòng Tổng = SUM/AVERAGE tương ứng\n\n"
    + "MÀU SẮC:\n"
    + "  • Vàng (FFFF99) = Nhập tay hàng ngày (D, E)\n"
    + "  • Xanh nhạt (DBEAFE) = Công thức tự tính (F, J, K)";
  
  SpreadsheetApp.getUi().alert(msg);
  Logger.log(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// HÀM PHỤ: Chạy hàm này nếu muốn xem cấu trúc sheet trước
// ─────────────────────────────────────────────────────────────────────────────
function debugSheetStructure() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("NHAP LIEU");
  
  if (!sheet) {
    Logger.log("Không tìm thấy sheet NHAP LIEU!");
    return;
  }
  
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(1, 1, lastRow, 13).getValues();
  
  Logger.log("=== CẤU TRÚC SHEET NHAP LIEU ===");
  Logger.log("Tổng số dòng: " + lastRow);
  Logger.log("");
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var nonEmpty = [];
    for (var j = 0; j < row.length; j++) {
      if (row[j] !== "" && row[j] !== null) {
        var colLetter = String.fromCharCode(65 + j);
        nonEmpty.push(colLetter + "=" + String(row[j]).substring(0, 25));
      }
    }
    if (nonEmpty.length > 0) {
      Logger.log("Dòng " + (i+1) + ": " + nonEmpty.join(" | "));
    }
  }
}
