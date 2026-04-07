
// Quick script to inspect Excel file structure
const path = require('path');
const fs = require('fs');

// Try to find xlsx in node_modules
const xlsxPath = path.join(__dirname, '..', 'node_modules', 'xlsx');
let xlsx;
try {
  xlsx = require(xlsxPath);
  console.log('✅ Found xlsx library');
} catch(e) {
  console.log('❌ xlsx not found, trying sheetjs-ce...');
  try {
    xlsx = require(path.join(__dirname, '..', 'node_modules', 'exceljs'));
  } catch(e2) {
    console.log('❌ exceljs not found either.');
    process.exit(1);
  }
}

const filePath = path.join(__dirname, '..', '2026.03.26 BAO CAO NGAY.xlsx');
if (!fs.existsSync(filePath)) {
  console.log('❌ File not found:', filePath);
  process.exit(1);
}

const workbook = xlsx.readFile(filePath);
console.log('\n📊 SHEET NAMES:', workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 SHEET: "${sheetName}"`);
  console.log('='.repeat(60));
  
  const sheet = workbook.Sheets[sheetName];
  const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1:A1');
  
  console.log(`Range: ${sheet['!ref']}, Rows: ${range.e.r+1}, Cols: ${range.e.c+1}`);
  
  // Read first 5 rows as raw
  console.log('\n--- RAW CELLS (first 10 rows, first 20 cols) ---');
  for (let r = 0; r <= Math.min(9, range.e.r); r++) {
    const rowData = [];
    for (let c = 0; c <= Math.min(19, range.e.c); c++) {
      const cellAddr = xlsx.utils.encode_cell({ r, c });
      const cell = sheet[cellAddr];
      const val = cell ? (cell.v !== undefined ? String(cell.v).substring(0, 30) : '') : '';
      if (val) rowData.push(`[${xlsx.utils.encode_cell({r,c})}]="${val}"`);
    }
    if (rowData.length > 0) console.log(`Row ${r+1}: ${rowData.join(' | ')}`);
  }
  
  // Print as simple array
  console.log('\n--- AS TABLE (first 5 rows) ---');
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', range: 0 });
  for (let i = 0; i < Math.min(5, data.length); i++) {
    console.log(`Row ${i+1}:`, JSON.stringify(data[i]).substring(0, 200));
  }
}
