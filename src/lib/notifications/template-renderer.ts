/**
 * Template renderer for notification messages.
 *
 * Handles {{variable}} substitution for DB-stored templates.
 * Works alongside message-renderer.ts: the hardcoded renderer serves as
 * the canonical fallback; this module handles all DB-template rendering.
 */

// ─── Allowed variables ────────────────────────────────────────────────────

export const ALLOWED_VARIABLES = [
  'residentName',
  'apartmentNumber',
  'monthLabel',
  'balanceAmount',
  'buildingName',
  'reference',
  'invoiceUrl',
] as const;

export type TemplateVariable = (typeof ALLOWED_VARIABLES)[number];

// ─── Render context ───────────────────────────────────────────────────────

export interface TemplateRenderContext {
  residentName: string;
  apartmentNumber: string;
  monthLabel: string;
  /** Pre-formatted, e.g. "500.00" */
  balanceAmount: string;
  buildingName: string;
  /** e.g. "VAAD-12-2024-12" */
  reference: string;
  /** Full invoice URL */
  invoiceUrl: string;
}

// ─── Core renderer ────────────────────────────────────────────────────────

/**
 * Replace all {{variable}} placeholders in body with values from context.
 * Unknown variables are left as-is (not stripped), so admins can see mistakes.
 */
export function renderTemplateBody(
  body: string,
  context: TemplateRenderContext
): string {
  let result = body;
  for (const key of ALLOWED_VARIABLES) {
    result = result.replaceAll(`{{${key}}}`, context[key]);
  }
  return result;
}

// ─── Validation ───────────────────────────────────────────────────────────

export interface TemplateValidationResult {
  valid: boolean;
  unknownVariables: string[];
  usedVariables: string[];
}

/**
 * Validate that a template body only uses allowed {{variables}}.
 */
export function validateTemplateBody(body: string): TemplateValidationResult {
  const matches = [...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const unique = [...new Set(matches)];
  const unknownVariables = unique.filter(
    (v) => !ALLOWED_VARIABLES.includes(v as TemplateVariable)
  );
  const usedVariables = unique.filter((v) =>
    ALLOWED_VARIABLES.includes(v as TemplateVariable)
  );
  return { valid: unknownVariables.length === 0, unknownVariables, usedVariables };
}

/**
 * Extract the list of allowed variables actually used in a template body.
 * Stored on INotificationTemplate.variables at save time.
 */
export function extractUsedVariables(body: string): string[] {
  const matches = [...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return [...new Set(matches)].filter((v) =>
    ALLOWED_VARIABLES.includes(v as TemplateVariable)
  );
}

// ─── Sample context (for previews) ───────────────────────────────────────

export function buildSampleContext(
  buildingName: string,
  period: string
): TemplateRenderContext {
  const [year, monthNum] = period.split('-').map(Number);
  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
  });
  return {
    residentName: 'ישראל ישראלי',
    apartmentNumber: '12',
    monthLabel,
    balanceAmount: '500.00',
    buildingName,
    reference: `VAAD-12-${period}`,
    invoiceUrl: `https://app.vaad.co.il/billing/invoice/example`,
  };
}

// ─── WhatsApp Business template component builder ─────────────────────────

/**
 * Maps VAAD internal variable names to positional parameters in a Meta-approved
 * WhatsApp Business template component.
 *
 * variableNames[0] → {{1}}, variableNames[1] → {{2}}, etc.
 * Mirror of `WhatsAppComponentMapping` in the Mongoose model.
 */
export interface WhatsAppComponentMapping {
  type: 'header' | 'body' | 'button';
  variableNames: string[];
}

interface BuiltMetaComponent {
  type: string;
  parameters: Array<{ type: 'text'; text: string }>;
}

/**
 * Build the `components` array for a Meta WhatsApp Business template message.
 *
 * Takes the component-variable mapping stored on a NotificationTemplate and a
 * resolved TemplateRenderContext, and returns the Meta API-ready components
 * array with parameter values substituted in.
 *
 * Components with no variableNames are omitted (no parameters to inject).
 * Unknown variable names fall back to an empty string and log a warning.
 */
export function buildWhatsAppComponents(
  componentMappings: WhatsAppComponentMapping[],
  context: TemplateRenderContext
): BuiltMetaComponent[] {
  const result: BuiltMetaComponent[] = [];

  for (const mapping of componentMappings) {
    if (!mapping.variableNames || mapping.variableNames.length === 0) continue;

    const parameters = mapping.variableNames.map((varName) => {
      const value = context[varName as TemplateVariable];
      if (value === undefined) {
        console.warn(
          `[buildWhatsAppComponents] Unknown variable "${varName}" — substituting empty string`
        );
      }
      return { type: 'text' as const, text: value ?? '' };
    });

    result.push({ type: mapping.type, parameters });
  }

  return result;
}

// ─── Default template body ────────────────────────────────────────────────

/** The canonical default Hebrew payment reminder template body.
 *  Mirrors the hardcoded renderPaymentReminder() output exactly. */
export const DEFAULT_PAYMENT_REMINDER_BODY = `שלום {{residentName}},

תזכורת ידידותית לתשלום ועד בית עבור {{monthLabel}}.

סכום לתשלום: ₪{{balanceAmount}}
אסמכתא: {{reference}}

לצפייה בחשבונית:
{{invoiceUrl}}

תודה,
{{buildingName}}`;
