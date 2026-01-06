import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAuditLog } from '@/lib/api-utils';
import Charge from '@/models/Charge';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import Building from '@/models/Building';
import Payment from '@/models/Payment';
import { Types } from 'mongoose';
import puppeteer from 'puppeteer';

// Force Node.js runtime for Puppeteer
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Format invoice number from prefix and sequential number
 */
function formatInvoiceNumber(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(6, '0')}`;
}

/**
 * Generate payment reference in format: VAAD-{apt}-{period}
 */
function generatePaymentReference(apartmentNumber: string, period?: string): string {
  const periodPart = period || new Date().toISOString().slice(0, 7);
  return `VAAD-${apartmentNumber}-${periodPart}`;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number, currency: string = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for display
 */
function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format period (YYYY-MM) to Hebrew month name
 */
function formatPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
  });
}

/**
 * Get charge type label in Hebrew
 */
function getChargeTypeLabel(type: string): string {
  const typeMap: Record<string, string> = {
    'monthly_due': 'תשלום חודשי',
    'one_time': 'חד פעמי',
    'repair': 'תיקון',
    'fund': 'קרן',
  };
  return typeMap[type] || type;
}

/**
 * Get payment method label in Hebrew
 */
function getPaymentMethodLabel(method: string): string {
  const methodMap: Record<string, string> = {
    'bank_transfer': 'העברה בנקאית',
    'cash': 'מזומן',
    'credit_card': 'כרטיס אשראי',
    'other': 'אחר',
  };
  return methodMap[method] || method;
}

/**
 * Get payment status in Hebrew
 */
function getPaymentStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    'paid': 'שולם',
    'partial': 'שולם חלקית',
    'unpaid': 'לא שולם',
  };
  return statusMap[status] || status;
}

/**
 * Get status badge color
 */
function getStatusColor(status: string): { bg: string; text: string } {
  const colors: Record<string, { bg: string; text: string }> = {
    'paid': { bg: '#10b981', text: '#ffffff' },
    'partial': { bg: '#f59e0b', text: '#ffffff' },
    'unpaid': { bg: '#ef4444', text: '#ffffff' },
  };
  return colors[status] || { bg: '#6b7280', text: '#ffffff' };
}

interface InvoiceData {
  invoiceNumber: string;
  charge: {
    type: string;
    title: string;
    amount: number;
    currency: string;
    period?: string;
    dueDate: Date;
    status: string;
    createdAt: Date;
  };
  building: {
    name: string;
    address: string;
    city: string;
    country: string;
    bankInfo?: {
      bankName?: string;
      accountNumber?: string;
      routingNumber?: string;
      notes?: string;
    };
  };
  apartment: {
    number: string;
    floor?: number;
  };
  residents: Array<{
    fullName: string;
    email?: string;
    phone?: string;
  }>;
  payments: Array<{
    amount: number;
    currency: string;
    method: string;
    reference?: string;
    paidAt: Date;
  }>;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  totalPaid: number;
  remaining: number;
}

/**
 * Generate invoice HTML template for PDF rendering
 */
function generateInvoiceHTML(data: InvoiceData): string {
  const statusColor = getStatusColor(data.paymentStatus);
  const paymentReference = generatePaymentReference(data.apartment.number, data.charge.period);
  
  const paymentsHTML = data.payments.length > 0 ? `
    <div class="section">
      <h3>תשלומים שהתקבלו</h3>
      <table>
        <thead>
          <tr>
            <th>תאריך</th>
            <th>אמצעי תשלום</th>
            <th>אסמכתא</th>
            <th class="amount">סכום</th>
          </tr>
        </thead>
        <tbody>
          ${data.payments.map(p => `
            <tr>
              <td>${formatDate(p.paidAt)}</td>
              <td>${getPaymentMethodLabel(p.method)}</td>
              <td class="ltr">${p.reference || '-'}</td>
              <td class="amount paid">-${formatCurrency(p.amount, p.currency)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="total-label">סה"כ שולם:</td>
            <td class="amount paid">${formatCurrency(data.totalPaid, data.charge.currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  ` : '';

  const paymentInstructionsHTML = data.remaining > 0 && data.building.bankInfo ? `
    <div class="section payment-instructions">
      <h3>הוראות תשלום</h3>
      <div class="reference-box">
        <div class="reference-label">אסמכתא לתשלום</div>
        <div class="reference-value">${paymentReference}</div>
        <div class="reference-note">נא לציין את מספר האסמכתא ${paymentReference} כהערה בהעברה</div>
      </div>
      <div class="bank-details">
        ${data.building.bankInfo.bankName ? `
          <div class="bank-item">
            <span class="label">שם הבנק:</span>
            <span class="value">${data.building.bankInfo.bankName}</span>
          </div>
        ` : ''}
        ${data.building.bankInfo.accountNumber ? `
          <div class="bank-item">
            <span class="label">מספר חשבון:</span>
            <span class="value ltr">${data.building.bankInfo.accountNumber}</span>
          </div>
        ` : ''}
        ${data.building.bankInfo.routingNumber ? `
          <div class="bank-item">
            <span class="label">מספר סניף:</span>
            <span class="value ltr">${data.building.bankInfo.routingNumber}</span>
          </div>
        ` : ''}
        ${data.building.bankInfo.notes ? `
          <div class="bank-notes">${data.building.bankInfo.notes}</div>
        ` : ''}
      </div>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>חשבונית ${data.invoiceNumber}</title>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Heebo', 'Arial', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1f2937;
      background: #ffffff;
      direction: rtl;
    }
    
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    
    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 30px;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 30px;
    }
    
    .company-info h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 8px;
    }
    
    .company-info p {
      color: #6b7280;
      font-size: 13px;
    }
    
    .invoice-title {
      text-align: left;
    }
    
    .invoice-title h2 {
      font-size: 32px;
      font-weight: 700;
      color: #3b82f6;
      margin-bottom: 8px;
    }
    
    .invoice-number {
      font-family: monospace;
      font-size: 16px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 12px;
    }
    
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      background-color: ${statusColor.bg};
      color: ${statusColor.text};
    }
    
    /* Details Grid */
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 30px;
    }
    
    .details-section h3 {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    
    .bill-to .apartment-number {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .bill-to .floor {
      color: #6b7280;
      margin-bottom: 12px;
    }
    
    .resident {
      margin-top: 8px;
    }
    
    .resident-name {
      font-weight: 500;
    }
    
    .resident-contact {
      font-size: 12px;
      color: #6b7280;
    }
    
    .invoice-details .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }
    
    .invoice-details .label {
      color: #6b7280;
    }
    
    .invoice-details .value {
      font-weight: 500;
    }
    
    /* Sections */
    .section {
      margin-bottom: 30px;
    }
    
    .section h3 {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }
    
    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    
    thead {
      background: #f9fafb;
    }
    
    th {
      text-align: right;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      border-bottom: 1px solid #e5e7eb;
    }
    
    th.amount {
      text-align: left;
    }
    
    td {
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    td.amount {
      text-align: left;
      font-weight: 600;
    }
    
    td.paid {
      color: #10b981;
    }
    
    .charge-title {
      font-weight: 500;
    }
    
    .charge-period {
      font-size: 12px;
      color: #6b7280;
    }
    
    .charge-type-badge {
      display: inline-block;
      padding: 4px 10px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 12px;
    }
    
    tfoot {
      background: #f3f4f6;
    }
    
    tfoot td {
      font-weight: 600;
    }
    
    .total-label {
      text-align: left;
    }
    
    /* Balance Summary */
    .balance-summary {
      background: #f9fafb;
      padding: 24px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
    }
    
    .balance-label h4 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .balance-label p {
      font-size: 13px;
      color: #6b7280;
    }
    
    .balance-amount {
      font-size: 32px;
      font-weight: 700;
      color: ${data.remaining > 0 ? '#ef4444' : '#10b981'};
    }
    
    /* Payment Instructions */
    .payment-instructions {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 24px;
    }
    
    .reference-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    
    .reference-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    
    .reference-value {
      font-size: 24px;
      font-weight: 700;
      font-family: monospace;
      color: #3b82f6;
      direction: ltr;
      text-align: right;
    }
    
    .reference-note {
      font-size: 12px;
      color: #6b7280;
      margin-top: 8px;
    }
    
    .bank-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    
    .bank-item {
      display: flex;
      flex-direction: column;
    }
    
    .bank-item .label {
      font-size: 12px;
      color: #6b7280;
    }
    
    .bank-item .value {
      font-weight: 500;
    }
    
    .bank-notes {
      grid-column: 1 / -1;
      background: #f3f4f6;
      padding: 12px;
      border-radius: 4px;
      font-size: 13px;
      margin-top: 8px;
    }
    
    /* Footer */
    .footer {
      text-align: center;
      padding-top: 30px;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 13px;
    }
    
    .footer p {
      margin-bottom: 4px;
    }
    
    /* LTR for numbers/emails */
    .ltr {
      direction: ltr;
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="company-info">
        <h1>🏢 ${data.building.name}</h1>
        <p>${data.building.address}</p>
        <p>${data.building.city}, ${data.building.country}</p>
      </div>
      <div class="invoice-title">
        <h2>חשבונית</h2>
        <div class="invoice-number">${data.invoiceNumber}</div>
        <span class="status-badge">${getPaymentStatusLabel(data.paymentStatus)}</span>
      </div>
    </div>
    
    <!-- Details Grid -->
    <div class="details-grid">
      <div class="details-section bill-to">
        <h3>לכבוד</h3>
        <div class="apartment-number">דירה ${data.apartment.number}</div>
        ${data.apartment.floor !== undefined ? `<div class="floor">קומה ${data.apartment.floor}</div>` : ''}
        ${data.residents.map(r => `
          <div class="resident">
            <div class="resident-name">${r.fullName}</div>
            ${r.email ? `<div class="resident-contact ltr">${r.email}</div>` : ''}
            ${r.phone ? `<div class="resident-contact ltr">${r.phone}</div>` : ''}
          </div>
        `).join('')}
      </div>
      
      <div class="details-section invoice-details">
        <h3>פרטי חשבונית</h3>
        <div class="detail-row">
          <span class="label">תאריך חשבונית:</span>
          <span class="value">${formatDate(data.charge.createdAt)}</span>
        </div>
        <div class="detail-row">
          <span class="label">תאריך לתשלום:</span>
          <span class="value">${formatDate(data.charge.dueDate)}</span>
        </div>
        ${data.charge.period ? `
          <div class="detail-row">
            <span class="label">תקופה:</span>
            <span class="value">${formatPeriod(data.charge.period)}</span>
          </div>
        ` : ''}
      </div>
    </div>
    
    <!-- Charges Table -->
    <div class="section">
      <h3>חיובים</h3>
      <table>
        <thead>
          <tr>
            <th>תיאור</th>
            <th>סוג</th>
            <th class="amount">סכום</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="charge-title">${data.charge.title}</div>
              ${data.charge.period ? `<div class="charge-period">תקופה: ${formatPeriod(data.charge.period)}</div>` : ''}
            </td>
            <td>
              <span class="charge-type-badge">${getChargeTypeLabel(data.charge.type)}</span>
            </td>
            <td class="amount">${formatCurrency(data.charge.amount, data.charge.currency)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="total-label">סה"כ לתשלום:</td>
            <td class="amount">${formatCurrency(data.charge.amount, data.charge.currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    
    ${paymentsHTML}
    
    <!-- Balance Summary -->
    <div class="balance-summary">
      <div class="balance-label">
        <h4>יתרה לתשלום</h4>
        <p>${data.paymentStatus === 'paid' ? 'חשבונית זו שולמה במלואה. תודה!' : `נא לשלם עד ${formatDate(data.charge.dueDate)}`}</p>
      </div>
      <div class="balance-amount">${formatCurrency(data.remaining, data.charge.currency)}</div>
    </div>
    
    ${paymentInstructionsHTML}
    
    <!-- Footer -->
    <div class="footer">
      <p>תודה על תשלומכם המהיר</p>
      <p>הונפק בתאריך ${formatDate(new Date())}</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Atomically assign an invoice number if not already assigned
 */
async function ensureInvoiceNumber(
  chargeId: Types.ObjectId,
  buildingId: Types.ObjectId,
  existingInvoiceNumber?: string
): Promise<string> {
  if (existingInvoiceNumber) {
    return existingInvoiceNumber;
  }

  // Atomically increment the building counter
  const updatedBuilding = await Building.findOneAndUpdate(
    { _id: buildingId },
    { $inc: { 'counters.invoiceNextNumber': 1 } },
    { new: false }
  );

  if (!updatedBuilding) {
    throw new Error('Building not found');
  }

  const prefix = updatedBuilding.settings?.invoicePrefix || 'INV';
  const invoiceNum = updatedBuilding.counters?.invoiceNextNumber || 1;
  const invoiceNumber = formatInvoiceNumber(prefix, invoiceNum);

  // Update the charge
  const updateResult = await Charge.updateOne(
    { _id: chargeId, invoiceNumber: { $exists: false } },
    { $set: { invoiceNumber, invoicedAt: new Date() } }
  );

  if (updateResult.matchedCount === 0) {
    const charge = await Charge.findById(chargeId).lean();
    if (charge?.invoiceNumber) {
      return charge.invoiceNumber;
    }
    throw new Error('Failed to assign invoice number');
  }

  return invoiceNumber;
}

// GET /api/invoices/[chargeId]/pdf - Generate and download invoice PDF
export const GET = withAuth(async (request, { user, params }) => {
  const chargeId = params?.chargeId;

  if (!chargeId || !Types.ObjectId.isValid(chargeId)) {
    return new NextResponse('Invalid charge ID', { status: 400 });
  }

  const chargeObjectId = new Types.ObjectId(chargeId);
  const buildingObjectId = new Types.ObjectId(user.buildingId);

  // Fetch the charge
  const charge = await Charge.findOne({
    _id: chargeObjectId,
    buildingId: buildingObjectId,
  }).lean();

  if (!charge) {
    return new NextResponse('Charge not found', { status: 404 });
  }

  // RBAC: Residents can only download their own apartment's invoices
  if (user.role === 'RESIDENT') {
    if (!user.apartmentId || charge.apartmentId.toString() !== user.apartmentId) {
      return new NextResponse('Access denied', { status: 403 });
    }
  }

  // Ensure invoice number is assigned
  const invoiceNumber = await ensureInvoiceNumber(
    chargeObjectId,
    buildingObjectId,
    charge.invoiceNumber
  );

  // Fetch related data
  const [building, apartment, residents, payments] = await Promise.all([
    Building.findById(user.buildingId).lean(),
    Apartment.findById(charge.apartmentId).lean(),
    Resident.find({ apartmentId: charge.apartmentId, isActive: true }).lean(),
    Payment.find({
      buildingId: buildingObjectId,
      apartmentId: charge.apartmentId,
      status: 'confirmed',
      ...(charge.period ? {
        paidAt: {
          $gte: new Date(charge.period + '-01'),
          $lt: new Date(new Date(charge.period + '-01').setMonth(new Date(charge.period + '-01').getMonth() + 1)),
        },
      } : {}),
    }).sort({ paidAt: -1 }).lean(),
  ]);

  if (!building || !apartment) {
    return new NextResponse('Building or apartment not found', { status: 404 });
  }

  // Calculate payment status
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, charge.amount - totalPaid);
  const paymentStatus = remaining <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

  // Prepare invoice data
  const invoiceData: InvoiceData = {
    invoiceNumber,
    charge: {
      type: charge.type,
      title: charge.title,
      amount: charge.amount,
      currency: charge.currency,
      period: charge.period || undefined,
      dueDate: charge.dueDate,
      status: charge.status,
      createdAt: charge.createdAt,
    },
    building: {
      name: building.name,
      address: building.address,
      city: building.city,
      country: building.country,
      bankInfo: building.bankInfo,
    },
    apartment: {
      number: apartment.number,
      floor: apartment.floor,
    },
    residents: residents.map(r => ({
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
    })),
    payments: payments.map(p => ({
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt,
    })),
    paymentStatus: paymentStatus as 'paid' | 'partial' | 'unpaid',
    totalPaid,
    remaining,
  };

  // Generate HTML
  const html = generateInvoiceHTML(invoiceData);

  // Generate PDF with Puppeteer
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    
    // Set content with wait for network idle to load fonts
    await page.setContent(html, { 
      waitUntil: ['networkidle0', 'domcontentloaded'] 
    });

    // Wait a bit extra for fonts to load
    await page.evaluate(() => document.fonts.ready);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm',
      },
    });

    await browser.close();

    // Log audit action
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'invoice_pdf_download',
      entityType: 'charge',
      entityId: chargeId,
      metadata: { invoiceNumber, apartmentNumber: apartment.number },
    });

    // Return PDF response
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoiceNumber}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    if (browser) {
      await browser.close();
    }
    return new NextResponse(
      `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    );
  }
}, { requiredRole: 'RESIDENT' });

