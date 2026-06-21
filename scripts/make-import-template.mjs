import ExcelJS from 'exceljs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const outDir = path.join(process.cwd(), 'import')
await mkdir(outDir, { recursive: true })
await mkdir(path.join(outDir, 'images'), { recursive: true })

const wb = new ExcelJS.Workbook()
wb.creator = 'HELD'
wb.created = new Date()

// ---- Sheet 1: products ----
const ws = wb.addWorksheet('מוצרים', {
  views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
})

ws.columns = [
  { header: 'שם המוצר', key: 'name', width: 32 },
  { header: 'ברקוד', key: 'barcode', width: 20 },
  { header: 'קטגוריה', key: 'category', width: 22 },
  { header: 'שם קובץ התמונה', key: 'image', width: 28 },
]

// header style
const header = ws.getRow(1)
header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
header.height = 26
header.alignment = { vertical: 'middle', horizontal: 'center' }
header.eachCell((cell) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  }
})

// example rows (grey italic) — user can delete or overwrite
const examples = [
  { name: 'כרית קנבס ריבוע', barcode: '7290000020099', category: 'קנבסים', image: '7290000020099.jpg' },
  { name: 'בלוק עץ דקורטיבי', barcode: '7290000020001', category: 'בלוקים מעץ', image: '7290000020001.jpg' },
]
for (const ex of examples) {
  const row = ws.addRow(ex)
  row.font = { color: { argb: 'FF9CA3AF' }, italic: true }
  row.alignment = { vertical: 'middle' }
}

// keep barcode as TEXT so long numbers don't turn into 7.29E+12
ws.getColumn('barcode').numFmt = '@'
ws.getColumn('barcode').alignment = { horizontal: 'left' }

// ---- Sheet 2: instructions ----
const help = wb.addWorksheet('הוראות', { views: [{ rightToLeft: true }] })
help.getColumn(1).width = 100
const lines = [
  ['איך למלא את הקובץ — קרא לפני שמתחילים'],
  [''],
  ['1. מלאו שורה אחת לכל מוצר בגיליון "מוצרים".'],
  ['2. שם המוצר — חובה. ייכתב גדול וברור לזכיין.'],
  ['3. ברקוד — חובה, ייחודי לכל מוצר (אסור שני מוצרים עם אותו ברקוד).'],
  ['4. קטגוריה — חובה. כתבו שם קטגוריה. אם הקטגוריה לא קיימת במערכת — היא תיווצר אוטומטית.'],
  ['5. שם קובץ התמונה — שם הקובץ בתיקיית images כולל הסיומת (לדוגמה: 7290000020099.jpg).'],
  ['   הכי פשוט: תנו לכל תמונה שם זהה לברקוד (7290000020099.jpg) — ואז קל לא להתבלבל.'],
  [''],
  ['תמונות:'],
  ['• שימו את כל קובצי התמונות בתיקייה בשם images שליד הקובץ הזה.'],
  ['• פורמטים נתמכים: JPG, PNG, WEBP. גודל מומלץ עד 5MB לתמונה.'],
  ['• אל תדביקו תמונות בתוך תאי האקסל — רק שם הקובץ בעמודה, והקובץ עצמו בתיקיית images.'],
  ['• מוצר בלי תמונה זה בסדר — פשוט השאירו את העמודה ריקה.'],
  [''],
  ['מחיר:'],
  ['• אין צורך בעמודת מחיר בשלב זה. הזכיינים לא יראו מחירים.'],
  [''],
  ['כשמסיימים:'],
  ['• מחקו את שתי שורות הדוגמה האפורות.'],
  ['• שלחו לי את הקובץ הזה + תיקיית images, ואני מטמיע הכול במערכת.'],
]
lines.forEach((l, i) => {
  const row = help.addRow(l)
  if (i === 0) row.font = { bold: true, size: 14 }
  else if (l[0].endsWith(':')) row.font = { bold: true, size: 12 }
})

const outPath = path.join(outDir, 'HELD-תבנית-מוצרים.xlsx')
await wb.xlsx.writeFile(outPath)
console.log('WROTE', outPath)
