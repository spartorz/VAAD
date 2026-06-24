/**
 * Notification message renderer.
 *
 * Isolates all message-building logic from the UI layer.
 * The page previously inlined `buildMessage()` — that logic now lives here
 * so the batch service and the page share a single canonical implementation.
 */

export const TEMPLATE_PAYMENT_REMINDER_WHATSAPP_HE_V1 =
  'payment_reminder_whatsapp_he_v1' as const;

export type NotificationTemplateKey = typeof TEMPLATE_PAYMENT_REMINDER_WHATSAPP_HE_V1;

// ─── Parameter types ──────────────────────────────────────────────────────

export interface PaymentReminderParams {
  residentName: string;
  buildingName: string;
  /** YYYY-MM */
  period: string;
  /** Amount due (remaining for partial, monthlyDue for unpaid) */
  amount: number;
  currency?: string;
  apartmentNumber: string;
  chargeId?: string;
  /** Base URL used to build the invoice link, e.g. https://app.vaad.co.il */
  baseUrl: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatMonthHe(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
  });
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Renderers ───────────────────────────────────────────────────────────

/**
 * Renders the payment reminder WhatsApp message.
 * Matches the exact format previously used in the notifications page.
 */
export function renderPaymentReminder(params: PaymentReminderParams): string {
  const {
    residentName,
    buildingName,
    period,
    amount,
    apartmentNumber,
    chargeId,
    baseUrl,
  } = params;

  const periodDisplay = formatMonthHe(period);
  const reference = `VAAD-${apartmentNumber}-${period}`;
  const invoiceUrl = chargeId
    ? `${baseUrl}/billing/invoice/${chargeId}`
    : `${baseUrl}/billing`;

  return `שלום ${residentName},

תזכורת ידידותית לתשלום ועד בית עבור ${periodDisplay}.

סכום לתשלום: ₪${formatAmount(amount)}
אסמכתא: ${reference}

לצפייה בחשבונית:
${invoiceUrl}

תודה,
${buildingName}`;
}

/**
 * Dispatch to the correct renderer by template key.
 * Extend this switch when new templates are added.
 */
export function renderMessage(
  template: NotificationTemplateKey,
  params: PaymentReminderParams
): string {
  switch (template) {
    case TEMPLATE_PAYMENT_REMINDER_WHATSAPP_HE_V1:
      return renderPaymentReminder(params);
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = template;
      throw new Error(`Unknown notification template: ${_exhaustive}`);
    }
  }
}
