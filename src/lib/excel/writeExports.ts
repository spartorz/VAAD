import ExcelJS from 'exceljs';

export interface ColumnConfig {
  header: string;
  key: string;
  width: number;
  style?: Partial<ExcelJS.Style>;
}

export interface ExportOptions {
  sheetName: string;
  columns: ColumnConfig[];
  data: Record<string, unknown>[];
  title?: string;
  headerColor?: string;
  rtl?: boolean;
}

/**
 * Creates a styled Excel workbook with the given data
 */
export async function createExportWorkbook(options: ExportOptions): Promise<ExcelJS.Workbook> {
  const {
    sheetName,
    columns,
    data,
    title,
    headerColor = '4472C4',
    rtl = true,
  } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VAAD Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    properties: { tabColor: { argb: headerColor } },
    views: [{ rightToLeft: rtl }],
  });

  // Set columns
  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width,
    style: col.style,
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: headerColor },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 25;

  // Add title row if provided
  if (title) {
    sheet.insertRow(1, [title]);
    const titleRow = sheet.getRow(1);
    titleRow.font = { bold: true, size: 14 };
    titleRow.height = 30;
    sheet.mergeCells(1, 1, 1, columns.length);
    
    // Re-style header row (now row 2)
    const newHeaderRow = sheet.getRow(2);
    newHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    newHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerColor },
    };
    newHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
    newHeaderRow.height = 25;
  }

  // Add data rows
  data.forEach((row) => {
    sheet.addRow(row);
  });

  // Add borders to all cells with data
  const lastRow = sheet.lastRow?.number || 1;
  for (let i = title ? 2 : 1; i <= lastRow; i++) {
    const row = sheet.getRow(i);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'CCCCCC' } },
        left: { style: 'thin', color: { argb: 'CCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
        right: { style: 'thin', color: { argb: 'CCCCCC' } },
      };
    });
  }

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: title ? 2 : 1, rightToLeft: rtl }];

  return workbook;
}

/**
 * Generates a buffer from a workbook for HTTP response
 */
export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * Common column configurations for reuse
 */
export const commonColumns = {
  apartmentNumber: { header: 'מספר דירה', key: 'apartmentNumber', width: 15 },
  residentName: { header: 'שם דייר', key: 'residentName', width: 25 },
  fullName: { header: 'שם מלא', key: 'fullName', width: 25 },
  email: { header: 'אימייל', key: 'email', width: 25 },
  phone: { header: 'טלפון', key: 'phone', width: 15 },
  floor: { header: 'קומה', key: 'floor', width: 10 },
  status: { header: 'סטטוס', key: 'status', width: 12 },
  amount: { header: 'סכום', key: 'amount', width: 12 },
  date: { header: 'תאריך', key: 'date', width: 15 },
  notes: { header: 'הערות', key: 'notes', width: 30 },
};

/**
 * Format date for Excel display
 */
export function formatExcelDate(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('he-IL');
}

/**
 * Format currency for Excel display
 */
export function formatExcelCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '';
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

