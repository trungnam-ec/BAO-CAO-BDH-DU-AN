/**
 * Google Apps Script - BÁO CÁO BĐH DỰ ÁN
 * Version 4.0 - Auto thêm dòng mới nếu dự án chưa có
 *
 * CẤU TRÚC SHEET NHAP LIEU (dòng 2 = header, dữ liệu từ dòng 3):
 *   A = STT
 *   B = TÊN DỰ ÁN
 *   C = KH (%)          → luôn = 100% = 1
 *   D = LK HÔM QUA (%)  → nhập tay hoặc copy từ F hôm qua
 *   E = HÔM NAY (%)     → CẬP NHẬT TỪ APP = lkHomNay(PDF) - D(sheet)
 *   F = LK HÔM NAY      → CÔNG THỨC =D+E (không ghi đè)
 *   G = GT HĐ (tỷ)      → CẬP NHẬT TỪ APP
 *   H = GT SẢN LƯỢNG    → CẬP NHẬT TỪ APP
 *   I = GT NGHIỆM THU   → CẬP NHẬT TỪ APP
 *   J = % SL/HĐ         → CÔNG THỨC =H/G
 *   K = CẢNH BÁO        → CÔNG THỨC
 *   L = CÔNG VIỆC NGÀY  → CẬP NHẬT TỪ APP
 *   M = VƯỚNG MẮC       → CẬP NHẬT TỪ APP
 */

var HEADER_ROW  = 2;     // Dòng tiêu đề cột
var DATA_START  = 3;     // Dữ liệu bắt đầu từ dòng 3
var SHEET_NAME  = "NHAP LIEU";

// ─────────────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || "updateBaoCao";

    if (action === "updateBaoCao") {
      return handleUpdateBaoCao(data);
    } else {
      return respond("error", { message: "Unknown action: " + action });
    }
  } catch (error) {
    return respond("error", { message: error.toString() });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function handleUpdateBaoCao(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return respond("error", { message: "Không tìm thấy sheet '" + SHEET_NAME + "'" });
  }

  var tenDuAn = (data.tenDuAn || "").trim();
  if (!tenDuAn || tenDuAn === "N/A") {
    return respond("error", { message: "Thiếu tên dự án" });
  }

  // 1. Tìm tất cả các dòng của dự án này
  var rows = findAllProjectRows(sheet, tenDuAn);
  var targetRow = -1;
  var isNew = false;
  var incomingDate = (data.ngayBaoCao || "").trim();

  if (rows.length === 0) {
    // Dự án MỚI hoàn toàn → thêm dòng
    targetRow = addNewProjectRow(sheet, tenDuAn, data);
    rows.push(targetRow);
    isNew = true;
  } else {
    // Đã có dự án → Tìm xem ngày này đã có chưa
    var foundIndex = -1;
    for (var i = 0; i < rows.length; i++) {
      var dateSheet = String(sheet.getRange(rows[i], 11).getDisplayValue()).trim();
      if (dateSheet === incomingDate && incomingDate !== "") {
        targetRow = rows[i];
        foundIndex = i;
        break;
      }
    }

    if (targetRow === -1) {
      // Ngày mới chưa có → Chèn thêm 1 dòng TRƯỚC dòng kế tiếp (ngay DƯỚI dòng cuối của dự án)
      var lastR = rows[rows.length - 1];
      sheet.insertRowAfter(lastR);
      targetRow = lastR + 1;
      
      // Update mảng rows (nếu insert dòng bên dưới tất cả các dòng cũ thì ko làm thay đổi index các dòng cũ)
      rows.push(targetRow);

      // Cột K: Ngày cập nhật (hoặc Ngày báo cáo)
      if (incomingDate && incomingDate !== "N/A") {
        sheet.getRange(targetRow, 11).setValue("'" + incomingDate); // Ép định dạng Text để không bị lật ngày tháng
      } else {
        var now = new Date();
        var dateStr = ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + now.getFullYear();
        sheet.getRange(targetRow, 11).setValue("'" + dateStr);
      }

      // Copy thông tin cố định (STT, Tên, KH, GT Hợp đồng)
      sheet.getRange(targetRow, 1).setValue(sheet.getRange(lastR, 1).getValue());
      sheet.getRange(targetRow, 2).setValue(sheet.getRange(lastR, 2).getValue());
      sheet.getRange(targetRow, 3).setValue(sheet.getRange(lastR, 3).getValue());
      sheet.getRange(targetRow, 3).setNumberFormat("0%");
      
      // Auto-roll: Lũy kế hôm qua (Cột D dòng mới) = Lũy kế hôm nay (Cột F dòng cũ)
      var prevF = sheet.getRange(lastR, 6).getValue();
      var prevFNum = (typeof prevF === "number" && !isNaN(prevF)) ? prevF : 0;
      sheet.getRange(targetRow, 4).setValue(prevFNum);
      sheet.getRange(targetRow, 4).setNumberFormat("0.00%");
      
      sheet.getRange(targetRow, 7).setValue(sheet.getRange(lastR, 7).getValue());
      sheet.getRange(targetRow, 7).setNumberFormat("#,##0.000");

      // Set công thức (công thức D+E để tính lũy kế, tránh #VALUE! khi có ô trống)
      sheet.getRange(targetRow, 6).setFormula("=D" + targetRow + "+E" + targetRow);
      sheet.getRange(targetRow, 6).setNumberFormat("0.00%");
      sheet.getRange(targetRow, 10).setFormula("=IFERROR(H" + targetRow + "/G" + targetRow + ")");
      sheet.getRange(targetRow, 10).setNumberFormat("0.00%");
    }
  }

  // Cập nhật dữ liệu vào targetRow
  var result = updateRowData(sheet, targetRow, data, isNew);

  // CLEANUP: Lưu tối đa 2 ngày gần nhất
  if (rows.length > 2) {
    var items = [];
    for (var k = 0; k < rows.length; k++) {
      var dStr = String(sheet.getRange(rows[k], 11).getDisplayValue()).trim();
      var t = 0;
      if (dStr) {
        var parts = dStr.split("/");
        if (parts.length === 3) {
          t = new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])).getTime();
        } else {
          t = new Date(dStr).getTime();
        }
      }
      if (isNaN(t)) t = 0;
      items.push({ r: rows[k], t: t });
    }
    
    // Sắp xếp ngày giảm dần (mới nhất lên đầu)
    items.sort(function(a, b) { return b.t - a.t; });
    
    var toDelete = [];
    for (var m = 2; m < items.length; m++) {
      toDelete.push(items[m].r);
    }
    // Sắp xếp số dòng giảm dần để khi xóa thì index dòng trên không bị ảnh hưởng
    toDelete.sort(function(a, b) { return b - a; });
    
    for (var m = 0; m < toDelete.length; m++) {
      sheet.deleteRow(toDelete[m]);
    }
  }

  // Tự động cập nhật công thức cho dòng TỔNG BÌNH QUÂN sau khi thêm/sửa/xoá dòng
  updateSummaryRow(sheet);

  return respond("success", {
    action: isNew ? "inserted" : "updated",
    duAn: tenDuAn,
    row: targetRow,
    ngayBaoCao: data.ngayBaoCao || "N/A",
    updated: result
  });
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Tìm tất cả các dòng thuộc dự án này (trả về mảng index dòng)
 */
function findAllProjectRows(sheet, tenDuAn) {
  var rows = [];
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START) return rows;

  var colB = sheet.getRange(DATA_START, 2, lastRow - DATA_START + 1, 1).getValues();

  // Chuẩn hoá: uppercase, bỏ dấu khoảng trắng thừa
  var tenSearch = tenDuAn.toUpperCase().replace(/\s+/g, " ").trim();
  var tenNoDiacritics = removeDiacritics(tenSearch);

  var bestScore = 0;
  var bestMatchStr = "";

  // 1. Quét lần đầu để tìm TÊN KHỚP NHẤT
  for (var i = 0; i < colB.length; i++) {
    var cellVal = String(colB[i][0]).trim().toUpperCase();
    if (cellVal === "" || cellVal === "TÊN DỰ ÁN" || cellVal === "TEN DU AN") continue;
    if (cellVal === "TỔNG" || cellVal.indexOf("TONG") >= 0 ||
        cellVal.indexOf("BINH QUAN") >= 0 || cellVal.indexOf("BÌNH QUÂN") >= 0) continue;

    var cellNoDiacritics = removeDiacritics(cellVal);

    var score = 0;
    if (cellVal === tenSearch || cellNoDiacritics === tenNoDiacritics) {
      score = 100;
    } else if (cellNoDiacritics.indexOf(tenNoDiacritics) >= 0 || tenNoDiacritics.indexOf(cellNoDiacritics) >= 0) {
      score = 85;
    } else {
      var wordsSearch = tenNoDiacritics.split(" ").filter(function(w) { return w.length > 2; });
      var wordsCell   = cellNoDiacritics.split(" ").filter(function(w) { return w.length > 2; });
      var matched = 0;
      for (var s = 0; s < wordsSearch.length; s++) {
        for (var c = 0; c < wordsCell.length; c++) {
          if (wordsCell[c].indexOf(wordsSearch[s]) >= 0 || wordsSearch[s].indexOf(wordsCell[c]) >= 0) {
            matched++;
            break;
          }
        }
      }
      if (wordsSearch.length > 0) {
        score = Math.round((matched / Math.max(wordsSearch.length, wordsCell.length)) * 70);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatchStr = cellVal;
    }
  }

  // 2. Nếu điểm >= 55, lấy TẤT CẢ các dòng ghi exaclty cái tên bestMatch đó
  if (bestScore >= 55) {
    for (var i = 0; i < colB.length; i++) {
      var cellVal = String(colB[i][0]).trim().toUpperCase();
      if (cellVal === bestMatchStr) {
        rows.push(i + DATA_START);
      }
    }
  }

  return rows;
}

/**
 * Bỏ dấu tiếng Việt để so sánh tên không phân biệt dấu
 */
function removeDiacritics(str) {
  var viMap = 'ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝăắặẳẵằấầẩẫậếềểễệốồổỗộớờởỡợơứừửữựưđỉịỳỵỷỹọỏảẹẻẽủụ' +
              'ÁÀÁÂÃÉÈÊÍÌÓÒÔÕÚÙÝĂẮẶẲẴẰẤẦẨẪẬẾỀỂỄỆỐỒỔỖỘỚỜỞỠỢƠỨỪỬỮỰƯĐỈỊỲỴỶỸỌỎẢẸẺẼỦỤ';
  var enMap = 'AAAAEEEIIOOOOUUYaaaaaaaaaaaaeeeeeooooooooouuuuuudioyyyyooaeeeuu' +
              'AAAAEEEIIOOOOUUYaaaaaaaaaaaaeeeeeooooooooouuuuuudioyyyyooaeeeuu';

  // Đơn giản hóa: dùng replace chain thay vì map object
  var result = str
    // Uppercase có dấu
    .replace(/[ÀÁÂÃ]/g, 'A').replace(/[ĂẮẶẲẴẰẤẦẨẪẬ]/g, 'A')
    .replace(/[ÈÉÊẾỀỂỄỆ]/g, 'E')
    .replace(/[ÌÍỈỊ]/g, 'I')
    .replace(/[ÒÓÔÕỐỒỔỖỘỚỜỞỠỢ]/g, 'O').replace(/[Ơ]/g, 'O')
    .replace(/[ÙÚỨỪỬỮỰ]/g, 'U').replace(/[Ư]/g, 'U')
    .replace(/[Ý]/g, 'Y')
    .replace(/Đ/g, 'D')
    // Lowercase có dấu
    .replace(/[àáâã]/g, 'A').replace(/[ăắặẳẵằấầẩẫậ]/g, 'A')
    .replace(/[èéêếềểễệ]/g, 'E')
    .replace(/[ìíỉị]/g, 'I')
    .replace(/[òóôõốồổỗộớờởỡợ]/g, 'O').replace(/[ơ]/g, 'O')
    .replace(/[ùúứừửữự]/g, 'U').replace(/[ư]/g, 'U')
    .replace(/[ý]/g, 'Y')
    .replace(/đ/g, 'D')
    // Các ký tự còn lại
    .replace(/[ỌỎỏọ]/g, 'O').replace(/[ẢảẠạ]/g, 'A')
    .replace(/[ẸẻẼẹẽẻ]/g, 'E').replace(/[ỦủỤụ]/g, 'U')
    .replace(/[ỲỴỶỹỳỵỷ]/g, 'Y');

  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
/**
 * Thêm dòng mới cho dự án mới:
 * - Ưu tiên điền vào dòng trống sẵn có (B = rỗng) từ dòng 3 trở xuống
 * - Nếu không còn dòng trống → chèn dòng mới trước TỔNG/BÌNH QUÂN
 */
function addNewProjectRow(sheet, tenDuAn, data) {
  var lastRow = sheet.getLastRow();

  // ── Bước 1: Tìm dòng trống đầu tiên trong cột B (từ DATA_START) ──
  var targetRow = -1;
  for (var r = DATA_START; r <= lastRow; r++) {
    var bVal = String(sheet.getRange(r, 2).getValue()).trim().toUpperCase();

    // Bỏ qua dòng TỔNG / BÌNH QUÂN
    if (bVal.indexOf("TONG") >= 0 || bVal.indexOf("TỔNG") >= 0 ||
        bVal.indexOf("BINH QUAN") >= 0 || bVal.indexOf("BÌNH QUÂN") >= 0) continue;

    // Dòng trống → dùng dòng này
    if (bVal === "") {
      targetRow = r;
      break;
    }
  }

  // ── Bước 2: Nếu không còn dòng trống → insert trước TỔNG ──
  if (targetRow === -1) {
    var insertRow = lastRow + 1;
    for (var r2 = DATA_START; r2 <= lastRow; r2++) {
      var v = String(sheet.getRange(r2, 2).getValue()).toUpperCase();
      if (v.indexOf("TONG") >= 0 || v.indexOf("TỔNG") >= 0 || v.indexOf("BINH QUAN") >= 0) {
        insertRow = r2;
        break;
      }
    }
    sheet.insertRowBefore(insertRow);
    targetRow = insertRow;
  }

  // ── Bước 3: Ghi thông tin cố định cho dự án mới ──
  var row = targetRow;

  // A = STT (đếm dự án đến dòng TRƯỚC, rồi +1)
  var stt = countProjects(sheet, row - 1) + 1;
  sheet.getRange(row, 1).setValue(stt);

  // B = Tên dự án
  sheet.getRange(row, 2).setValue(tenDuAn);

  // C = KH = 100%
  sheet.getRange(row, 3).setValue(1);
  sheet.getRange(row, 3).setNumberFormat("0%");

  // D = LK HÔM QUA = 0 (dự án mới chưa có lịch sử)
  sheet.getRange(row, 4).setValue(0);
  sheet.getRange(row, 4).setNumberFormat("0.00%");

  // E = HÔM NAY (số) → sẽ được updateRowData viết sau
  sheet.getRange(row, 5).setNumberFormat("0.00%");

  // F = LK HÔM NAY = D+E (công thức, không ghi đè)
  sheet.getRange(row, 6).setFormula("=D" + row + "+E" + row);
  sheet.getRange(row, 6).setNumberFormat("0.00%");

  // J = % SL/HĐ (Sử dụng hàm không chứa dấu phẩy để tránh hoàn toàn lỗi Locale)
  sheet.getRange(row, 10).setFormula("=IFERROR(H" + row + "/G" + row + ")");
  sheet.getRange(row, 10).setNumberFormat("0.00%");

  Logger.log("✨ Thêm dự án mới '" + tenDuAn + "' tại dòng " + row);
  return row;
}

/**
 * Đếm số dự án có tên (để tính STT)
 */
function countProjects(sheet, untilRow) {
  var count = 0;
  var lastRow = sheet.getLastRow();
  for (var r = DATA_START; r <= Math.min(untilRow, lastRow); r++) {
    var bVal = String(sheet.getRange(r, 2).getValue()).trim();
    if (bVal !== "" && bVal.toUpperCase().indexOf("TONG") < 0 && bVal.toUpperCase().indexOf("BINH QUAN") < 0) {
      count++;
    }
  }
  return count;
}


// ─────────────────────────────────────────────────────────────────────────────
/**
 * Cập nhật dữ liệu vào dòng đã có
 * isNew = true khi vừa thêm dòng mới (D=0, cần tính E khác)
 */
function updateRowData(sheet, row, data, isNew) {
  var updated = [];

  // ── Cột D & E: Tính toán Lũy kế ──────────────────────────────────────
  var dNew = 0;
  var overrideD = false;

  if (isNew) {
    // Dự án mới hoàn toàn
    dNew = 0;
  } else {
    // Dự án cũ hoặc dòng mới của ngày mới đã được điền Lũy kế hôm qua vào cột D
    var dCell = sheet.getRange(row, 4).getValue();
    dNew = (typeof dCell === "number" && !isNaN(dCell)) ? dCell : 0;
  }

  // 1. Cập nhật D nếu có override từ App (gửi kèm Lũy kế hôm qua)
  if (data.lkHomQuaOverride) {
    var overrideNum = parsePercent(String(data.lkHomQuaOverride));
    if (overrideNum !== null) {
      dNew = overrideNum;
      overrideD = true;
      sheet.getRange(row, 4).setValue(dNew);
      sheet.getRange(row, 4).setNumberFormat("0.00%");
      updated.push("D←override=" + (dNew * 100).toFixed(2) + "%");
    }
  }

  // 2. Tính toán E
  var lkHomNayStr = data.lkHomNay || "0%";
  var lkHomNayNum = parsePercent(lkHomNayStr);

  // Nếu không nhận diện được Lũy kế hôm nay (PDF), sử dụng % Hôm nay (PDF) (nếu có)
  if (lkHomNayNum === null || lkHomNayNum === 0 || lkHomNayStr === "N/A" || lkHomNayStr === "0%" || lkHomNayStr === "") {
    if (data.homNayPercent && data.homNayPercent !== "N/A") {
      var pct = parsePercent(data.homNayPercent);
      if (pct !== null) {
        sheet.getRange(row, 5).setValue(pct);
        sheet.getRange(row, 5).setNumberFormat("0.00%");
        updated.push("E=" + data.homNayPercent + " (từ % Hôm nay gốc)");
      }
    }
  } else {
    // E = Lũy kế hôm nay (PDF) - Lũy kế hôm qua (D)
    var homNayNum = lkHomNayNum - dNew;
    sheet.getRange(row, 5).setValue(homNayNum);
    sheet.getRange(row, 5).setNumberFormat("0.00%");
    
    if (overrideD) {
      updated.push("E=" + (homNayNum * 100).toFixed(2) + "% [LK HN (PDF) - Override D]");
    } else {
      updated.push("E=" + (homNayNum * 100).toFixed(2) + "% [LK HN (PDF) - D]");
    }
  }


  // ── Cột G: GT HĐ (tỷ) - CHỈ ghi nếu ô đang TRỐNG (không bao giờ overwrite) ──
  if (data.gtHopDong && data.gtHopDong !== "N/A") {
    var currentG = sheet.getRange(row, 7).getValue();
    var isEmpty  = (currentG === "" || currentG === null || currentG === 0 || !currentG);
    if (isEmpty) {
      var gtHD = parseNumber(data.gtHopDong);
      if (gtHD !== null && gtHD > 0) {
        sheet.getRange(row, 7).setValue(gtHD);
        sheet.getRange(row, 7).setNumberFormat("0.000");
        updated.push("G=" + gtHD + " (mới)");
      }
    } else {
      updated.push("G=giữ nguyên " + currentG);
    }
  }

  // ── Cột H: GT Sản Lượng (tỷ) ──
  if (data.gtSanLuong && data.gtSanLuong !== "N/A") {
    var gtSL = parseNumber(data.gtSanLuong);
    if (gtSL !== null) {
      sheet.getRange(row, 8).setValue(gtSL);
      sheet.getRange(row, 8).setNumberFormat("0.000");
      updated.push("H=" + gtSL);
    }
  }

  // ── Cột I: GT Nghiệm Thu (tỷ) ──
  if (data.gtNghiemThu && data.gtNghiemThu !== "N/A") {
    var gtNT = parseNumber(data.gtNghiemThu);
    if (gtNT !== null) {
      sheet.getRange(row, 9).setValue(gtNT);
      sheet.getRange(row, 9).setNumberFormat("0.000");
      updated.push("I=" + gtNT);
    }
  }

  // ── Cột L: Công việc trong ngày ──
  if (data.congViecTrongNgay && data.congViecTrongNgay !== "N/A") {
    sheet.getRange(row, 12).setValue(data.congViecTrongNgay);
    sheet.getRange(row, 12).setWrap(true);
    updated.push("L=cong viec ngay");
  }

  // ── Cột M: Vướng mắc ──
  if (data.vuongMac && data.vuongMac !== "N/A" && data.vuongMac !== "Không có") {
    sheet.getRange(row, 13).setValue(data.vuongMac);
    sheet.getRange(row, 13).setWrap(true);
    updated.push("M=vuong mac");
  }

  // ── Cột K: NGÀY BÁO CÁO (user đổi tên từ "Cảnh Báo") ──
  if (data.ngayBaoCao && data.ngayBaoCao !== "N/A") {
    sheet.getRange(row, 11).setValue("'" + data.ngayBaoCao); // Ép định dạng Text
    updated.push("K=" + data.ngayBaoCao);
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "28.61%" → 0.2861 | "0.5%" → 0.005 | "28" → 0.28
 */
function parsePercent(str) {
  if (!str || str === "N/A") return null;
  var s = String(str).trim().replace(",", ".");
  var isPercent = s.indexOf("%") >= 0;
  s = s.replace(/%/g, "").trim();
  var num = parseFloat(s);
  if (isNaN(num)) return null;
  if (isPercent || num > 1) return num / 100;
  return num;
}

/**
 * "29.551 tỷ" → 29.551 | "29,551" → 29.551
 */
function parseNumber(str) {
  if (!str || str === "N/A") return null;
  var s = String(str).trim()
    .replace(/tỷ|đồng|vnd|vnđ|billion/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, ".");
  }
  var num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function respond(status, extra) {
  var result = { status: status, timestamp: new Date().toISOString() };
  for (var key in extra) result[key] = extra[key];
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────
// HÀM TEST
// ─────────────────────────────────────────────────────────────────────────────

function testUpdateExisting() {
  var testData = {
    action: "updateBaoCao",
    tenDuAn: "XLNT TAY NINH",
    ngayBaoCao: "07/04/2026",
    lkHomNay: "28.80%",
    homNayPercent: "0.19%",
    gtHopDong: "63.199",
    gtSanLuong: "18.200",
    gtNghiemThu: "18.008",
    congViecTrongNgay: "Đổ bê tông hố ga, Thảm BTN đường Hoàng Lê Kha lớp 2\nCung cấp cọc thử 0/292",
    vuongMac: "Không có",
    tenFile: "bao_cao_XLNT_07042026.pdf"
  };
  _runTest(testData);
}

function testInsertNew() {
  var testData = {
    action: "updateBaoCao",
    tenDuAn: "DU AN TEST MOI",
    ngayBaoCao: "07/04/2026",
    lkHomNay: "5.25%",
    homNayPercent: "0.50%",
    gtHopDong: "120.000",
    gtSanLuong: "6.300",
    gtNghiemThu: "N/A",
    congViecTrongNgay: "Thi cong mong, Lap dat ong nuoc",
    vuongMac: "Thời tiết xấu làm chậm tiến độ",
    tenFile: "bao_cao_TEST_07042026.pdf"
  };
  _runTest(testData);
}

function _runTest(testData) {
  var mockEvent = { postData: { contents: JSON.stringify(testData) } };
  var result = doPost(mockEvent);
  Logger.log("=== KẾT QUẢ TEST ===");
  Logger.log(result.getContent());
  try { Browser.msgBox(result.getContent()); } catch(e) {}
}

function listDuAn() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log("Không tìm thấy sheet " + SHEET_NAME); return; }

  var lastRow = sheet.getLastRow();
  var data    = sheet.getRange(DATA_START, 1, lastRow - DATA_START + 1, 2).getValues();

  Logger.log("=== DANH SÁCH DỰ ÁN ===");
  for (var i = 0; i < data.length; i++) {
    var valB = String(data[i][1]).trim();
    if (valB !== "" && valB.length > 2) {
      Logger.log("Dòng " + (i + DATA_START) + ": [" + data[i][0] + "] " + valB);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Tự động chèn công thức AVERAGE / SUM vào dòng TỔNG BÌNH QUÂN
 */
function updateSummaryRow(sheet) {
  var lastRow = sheet.getLastRow();
  var summaryRowIndex = -1;
  
  // Tìm dòng có chữ TỔNG hoặc BÌNH QUÂN ở cột A hoặc B (do có thể bị Merge cell)
  for (var r = lastRow; r >= DATA_START; r--) {
    var aVal = String(sheet.getRange(r, 1).getValue()).trim().toUpperCase();
    var bVal = String(sheet.getRange(r, 2).getValue()).trim().toUpperCase();
    var combinedVal = aVal + " " + bVal;
    
    if (combinedVal.indexOf("TONG") >= 0 || combinedVal.indexOf("TỔNG") >= 0 ||
        combinedVal.indexOf("BINH QUAN") >= 0 || combinedVal.indexOf("BÌNH QUÂN") >= 0) {
      summaryRowIndex = r;
      break;
    }
  }

  // Nếu tìm thấy dòng tổng và có dữ liệu ở trên nó
  if (summaryRowIndex > DATA_START) {
    var rangeStart = DATA_START;
    var rangeEnd = summaryRowIndex - 1;
    
    // Cột F (Lũy kế hôm nay %): AVERAGE
    sheet.getRange(summaryRowIndex, 6).setFormula("=AVERAGE(F" + rangeStart + ":F" + rangeEnd + ")");
    // Cột G (Giá trị HD): SUM
    sheet.getRange(summaryRowIndex, 7).setFormula("=SUM(G" + rangeStart + ":G" + rangeEnd + ")");
    // Cột H (Giá trị Sản lượng): SUM
    sheet.getRange(summaryRowIndex, 8).setFormula("=SUM(H" + rangeStart + ":H" + rangeEnd + ")");
    // Cột I (Giá trị Còn lại / Nghiệm thu): SUM
    sheet.getRange(summaryRowIndex, 9).setFormula("=SUM(I" + rangeStart + ":I" + rangeEnd + ")");
  }
}
