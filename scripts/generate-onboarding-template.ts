import ExcelJS from 'exceljs';
import { mkdir } from 'fs/promises';
import path from 'path';

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VAAD';
  workbook.created = new Date();

  // ── Apartments sheet ─────────────────────────────────────────────────────────
  const apartments = workbook.addWorksheet('Apartments');
  apartments.views = [{ state: 'frozen', ySplit: 1 }];
  apartments.columns = [
    { header: 'apartmentNumber', key: 'apartmentNumber', width: 20 },
    { header: 'floor', key: 'floor', width: 12 },
    { header: 'size', key: 'size', width: 12 },
    { header: 'status', key: 'status', width: 14 },
  ];

  apartments.addRows([
    { apartmentNumber: '101', floor: 1, size: 85, status: 'active' },
    { apartmentNumber: '102', floor: 1, size: 90, status: 'active' },
    { apartmentNumber: '201', floor: 2, size: 80, status: 'active' },
  ]);

  const apartmentsHeader = apartments.getRow(1);
  apartmentsHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  apartmentsHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };
  apartmentsHeader.alignment = { horizontal: 'center' };

  // ── Residents sheet ──────────────────────────────────────────────────────────
  const residents = workbook.addWorksheet('Residents');
  residents.views = [{ state: 'frozen', ySplit: 1 }];
  residents.columns = [
    { header: 'apartmentNumber', key: 'apartmentNumber', width: 20 },
    { header: 'fullName', key: 'fullName', width: 24 },
    { header: 'type', key: 'type', width: 12 },
    { header: 'email', key: 'email', width: 30 },
    { header: 'phone', key: 'phone', width: 16 },
    { header: 'createUser', key: 'createUser', width: 14 },
    { header: 'tempPassword', key: 'tempPassword', width: 16 },
    { header: 'moveInAt', key: 'moveInAt', width: 14 },
    { header: 'moveOutAt', key: 'moveOutAt', width: 14 },
  ];

  residents.addRows([
    {
      apartmentNumber: '101',
      fullName: 'ישראל ישראלי',
      type: 'owner',
      email: 'israel@example.com',
      phone: '0501111111',
      createUser: 'yes',
      tempPassword: 'Temp1234',
      moveInAt: '2026-01-01',
      moveOutAt: '',
    },
    {
      apartmentNumber: '102',
      fullName: 'משה כהן',
      type: 'tenant',
      email: 'moshe@example.com',
      phone: '0502222222',
      createUser: 'no',
      tempPassword: '',
      moveInAt: '2026-01-01',
      moveOutAt: '',
    },
  ]);

  const residentsHeader = residents.getRow(1);
  residentsHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  residentsHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };
  residentsHeader.alignment = { horizontal: 'center' };

  // ── Instructions sheet (Hebrew) ─────────────────────────────────────────────
  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [
    { header: 'נושא', key: 'topic', width: 28 },
    { header: 'הסבר', key: 'details', width: 90 },
  ];
  instructions.views = [{ state: 'frozen', ySplit: 1, rightToLeft: true }];

  const header = instructions.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7C3AED' },
  };
  header.alignment = { horizontal: 'center' };

  const rows: Array<{ topic: string; details: string }> = [
    {
      topic: 'מטרת הקובץ',
      details:
        'מלאו קובץ אחד לייבוא דירות ודיירים. תחילה עדכנו את גיליון Apartments ואז את גיליון Residents.',
    },
    {
      topic: 'שדות חובה',
      details:
        'Apartments: apartmentNumber חובה. Residents: apartmentNumber ו-fullName חובה. כאשר createUser=yes יש למלא גם email.',
    },
    {
      topic: 'ערכים מותרים',
      details:
        'status: active או inactive. type: owner או tenant. createUser: yes או no.',
    },
    {
      topic: 'התאמת apartmentNumber',
      details:
        'הערך בעמודת apartmentNumber בגיליון Residents חייב להיות זהה בדיוק לערך בגיליון Apartments (ללא רווחים מיותרים).',
    },
    {
      topic: 'כללי סיסמה זמנית',
      details:
        'tempPassword נדרש רק כאשר createUser=yes. כאשר createUser=no אפשר להשאיר tempPassword ריק.',
    },
    {
      topic: 'פורמט תאריכים',
      details:
        'moveInAt ו-moveOutAt בפורמט מומלץ YYYY-MM-DD (למשל 2026-01-01). moveOutAt יכול להישאר ריק.',
    },
    {
      topic: 'המלצה לטלפון',
      details:
        'מומלץ למלא מספר טלפון ישראלי ללא רווחים או מקפים, לדוגמה 0501234567.',
    },
    {
      topic: 'טעויות נפוצות',
      details:
        '1) שגיאת כתיב בשם עמודה. 2) apartmentNumber שלא קיים בגיליון Apartments. 3) type/status/createUser עם ערך לא חוקי. 4) createUser=yes ללא email.',
    },
    {
      topic: 'חשוב מאוד',
      details:
        'אל תשנו את שמות העמודות באנגלית (technical names), כי ה-API מזהה אותן בדיוק לפי השם.',
    },
  ];
  instructions.addRows(rows);
  instructions.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: 'top', wrapText: true, horizontal: 'right' };
    }
  });

  const outputDir = path.join(process.cwd(), 'public', 'templates');
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'vaad-onboarding-template.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  // eslint-disable-next-line no-console
  console.log(`Created: ${outputPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate onboarding template:', error);
  process.exit(1);
});
