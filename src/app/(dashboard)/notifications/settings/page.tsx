'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  ArrowRight,
  Settings2,
  FileText,
  History,
  Plus,
  Pencil,
  Star,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarClock,
  Play,
  AlertCircle,
  SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  renderTemplateBody,
  buildSampleContext,
} from '@/lib/notifications/template-renderer';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE_VARIABLES = [
  'residentName',
  'apartmentNumber',
  'monthLabel',
  'balanceAmount',
  'buildingName',
  'reference',
  'invoiceUrl',
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp_manual: 'WhatsApp ידני',
  whatsapp_api: 'WhatsApp API',
  email: 'דוא"ל',
  sms: 'SMS',
};

const ALL_CHANNELS = ['whatsapp_manual', 'whatsapp_api', 'email', 'sms'];

const SKIP_REASON_LABELS: Record<string, string> = {
  no_phone: 'ללא טלפון',
  recently_contacted: 'פנייה לאחרונה',
  inactive_resident: 'דייר לא פעיל',
  manually_excluded: 'הוחרג ידנית',
  no_consent: 'ללא הסכמת WhatsApp',
};

const BATCH_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ready_for_review: { label: 'לסקירה', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'אושר', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  ready: { label: 'מוכן', className: 'bg-green-100 text-green-800 border-green-200' },
  processing: { label: 'בעיבוד', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  completed: { label: 'הושלם', className: 'bg-green-100 text-green-800 border-green-200' },
  failed: { label: 'נכשל', className: 'bg-red-100 text-red-800 border-red-200' },
  cancelled: { label: 'בוטל', className: 'bg-gray-100 text-gray-500 border-gray-200' },
  draft: { label: 'טיוטה', className: 'bg-gray-100 text-gray-500 border-gray-200' },
};

// ─── Schedule status config ───────────────────────────────────────────────────

type ScheduleStatus = 'inactive' | 'manual_only' | 'scheduled_review' | 'fully_automatic';

const SCHEDULE_STATUS_CONFIG: Record<ScheduleStatus, { label: string; description: string; className: string }> = {
  inactive: {
    label: 'לא פעיל',
    description: 'תזכורות תשלום מושבתות — לא ייווצרו קמפיינים אוטומטיים',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  manual_only: {
    label: 'ידני בלבד',
    description: 'קמפיינים נוצרים ידנית בלבד — אין תזמון אוטומטי',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  scheduled_review: {
    label: 'בדיקה מתוזמנת',
    description: 'קמפיין ייווצר ביום שנקבע ויחכה לאישורך לפני שליחה',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  fully_automatic: {
    label: 'אוטומטי לחלוטין',
    description: 'קמפיין ייווצר ויאושר אוטומטית ביום שנקבע (לא שולח הודעות עדיין)',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
};

const CRON_ACTION_LABELS: Record<string, { label: string; icon: 'ok' | 'skip' | 'exists' }> = {
  notification_batch_auto_created: { label: 'קמפיין נוצר אוטומטית', icon: 'ok' },
  notification_batch_auto_skipped: { label: 'בניין דולג', icon: 'skip' },
  notification_batch_already_exists: { label: 'קמפיין כבר קיים', icon: 'exists' },
};

const SKIP_REASON_CRON_LABELS: Record<string, string> = {
  reminders_disabled: 'תזכורות מושבתות',
  manual_mode: 'מצב ידני בלבד',
  not_reminder_day: 'לא יום ההפעלה',
  dry_run: 'ריצת בדיקה',
};

// ─── Domain types ─────────────────────────────────────────────────────────────

interface SettingsData {
  _id: string;
  paymentRemindersEnabled: boolean;
  reminderMode: 'manual_only' | 'scheduled_review' | 'fully_automatic';
  reminderDayOfMonth: number;
  gracePeriodDays: number;
  cooldownDays: number;
  requireApprovalBeforeSending: boolean;
  skipRecentlyContactedResidents: boolean;
  activeChannels: string[];
  buildingTimezone: string;
}

interface CronAuditEntry {
  _id: string;
  action: string;
  createdAt: string;
  metadata?: {
    month?: string;
    reminderMode?: string;
    itemCount?: number;
    autoApproved?: boolean;
    reason?: string;
  };
}

interface WhatsAppComponentMappingUI {
  type: 'header' | 'body' | 'button';
  variableNames: string[];
}

interface TemplateData {
  _id: string;
  name: string;
  type: string;
  channel: string;
  body: string;
  subject?: string;
  variables: string[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  // WhatsApp Business API template binding
  whatsappTemplateName?: string;
  whatsappLanguageCode?: string;
  whatsappComponents?: WhatsAppComponentMappingUI[];
}

interface BatchData {
  _id: string;
  month: string;
  status: string;
  targetingMode?: 'automatic' | 'manual';
  audienceSummary: { total: number; unpaid: number; partial: number };
  stats: {
    total: number;
    pending: number;
    openedManual: number;
    sent: number;
    delivered?: number;
    read?: number;
    failed: number;
    cancelled: number;
  };
  skippedCount: number;
  skippedSummary: {
    noPhone: number;
    recentlyContacted: number;
    manuallyExcluded: number;
    total: number;
  };
  isCustomMessage: boolean;
  createdAt: string;
}

interface BatchItemData {
  _id: string;
  apartmentId?: string;
  status: string;
  skipReason?: string;
  lastAttemptAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failureReason?: string;
  provider?: string;
  providerMessageId?: string;
  createdAt: string;
  channel: string;
  metadata?: Record<string, unknown>;
}

interface TemplateForm {
  name: string;
  type: 'payment_reminder';
  channel: 'whatsapp_manual' | 'whatsapp_api' | 'email' | 'sms';
  body: string;
  subject: string;
  isDefault: boolean;
  // WhatsApp Business API template binding
  whatsappTemplateName: string;
  whatsappLanguageCode: string;
  /** Ordered body variable names as comma-separated string — parsed on save */
  whatsappBodyVars: string;
  /** Ordered header variable names as comma-separated string — parsed on save */
  whatsappHeaderVars: string;
}

const EMPTY_TEMPLATE_FORM: TemplateForm = {
  name: '',
  type: 'payment_reminder',
  channel: 'whatsapp_manual',
  body: '',
  subject: '',
  isDefault: false,
  whatsappTemplateName: '',
  whatsappLanguageCode: 'he',
  whatsappBodyVars: '',
  whatsappHeaderVars: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMonthDisplay(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Computes the next date (wall clock in building timezone) on which the cron
 * is expected to fire. Returns null if scheduling is not active.
 */
function computeNextRun(settings: SettingsData): Date | null {
  if (!settings.paymentRemindersEnabled) return null;
  if (settings.reminderMode === 'manual_only') return null;

  const tz = settings.buildingTimezone || 'Asia/Jerusalem';
  const day = settings.reminderDayOfMonth;

  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
    const todayDay = get('day');
    const todayMonth = get('month');
    const todayYear = get('year');

    let targetMonth = todayMonth;
    let targetYear = todayYear;

    // If we're already past the trigger day, advance to next month
    if (todayDay > day) {
      if (todayMonth === 12) {
        targetMonth = 1;
        targetYear++;
      } else {
        targetMonth++;
      }
    }

    // reminderDayOfMonth is capped at 28 — valid in every month
    return new Date(targetYear, targetMonth - 1, day);
  } catch {
    return null;
  }
}

function deriveScheduleStatus(settings: SettingsData): ScheduleStatus {
  if (!settings.paymentRemindersEnabled) return 'inactive';
  return settings.reminderMode as ScheduleStatus;
}

// ─── Mini components ──────────────────────────────────────────────────────────

function BatchStatusBadge({ status }: { status: string }) {
  const config = BATCH_STATUS_CONFIG[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      {config.label}
    </Badge>
  );
}

function ItemStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'opened_manual':
      return (
        <Badge variant="secondary" className="text-blue-700 bg-blue-50 border-blue-200 text-xs">
          נפתח ידנית
        </Badge>
      );
    case 'queued':
      return (
        <Badge variant="outline" className="text-xs text-blue-600 bg-blue-50 border-blue-200">
          בתור
        </Badge>
      );
    case 'sent':
      return (
        <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200 text-xs">
          נשלח ✓
        </Badge>
      );
    case 'delivered':
      return (
        <Badge variant="secondary" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-xs">
          נמסר ✓✓
        </Badge>
      );
    case 'read':
      return (
        <Badge variant="secondary" className="text-teal-700 bg-teal-50 border-teal-200 text-xs">
          נקרא ✓✓
        </Badge>
      );
    case 'failed':
      return <Badge variant="destructive" className="text-xs">נכשל</Badge>;
    case 'cancelled':
      return <Badge variant="outline" className="text-xs text-muted-foreground">בוטל</Badge>;
    case 'pending':
      return <Badge variant="outline" className="text-xs">ממתין</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

interface ScheduleTabProps {
  settings: SettingsData;
  batches: BatchData[];
  cronLogs: CronAuditEntry[];
  cronLogsLoading: boolean;
  runningCron: boolean;
  onRunNow: () => void;
  onViewBatchDetails: (batch: BatchData) => void;
}

function ScheduleTab({
  settings,
  batches,
  cronLogs,
  cronLogsLoading,
  runningCron,
  onRunNow,
  onViewBatchDetails,
}: ScheduleTabProps) {
  const scheduleStatus = deriveScheduleStatus(settings);
  const statusConfig = SCHEDULE_STATUS_CONFIG[scheduleStatus];
  const nextRun = computeNextRun(settings);
  const isActive = scheduleStatus === 'scheduled_review' || scheduleStatus === 'fully_automatic';

  // Most recent batch that was auto-created (has cron context if metadata.trigger exists,
  // but we simply show the newest batch since that's the operational view admins care about)
  const latestBatch = batches[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">סטטוס תזמון</h2>
          <p className="text-sm text-muted-foreground">
            מצב ההפעלה האוטומטית הנוכחי ופעילות אחרונה
          </p>
        </div>
        <Button
          onClick={onRunNow}
          disabled={runningCron}
          size="sm"
          variant="outline"
          className="gap-2 shrink-0"
        >
          {runningCron ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              מפעיל...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              הפעל עכשיו
            </>
          )}
        </Button>
      </div>

      {/* Effective status card */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Status badge + description */}
          <div className="flex items-start gap-3">
            <Badge variant="outline" className={`text-sm px-3 py-1 shrink-0 ${statusConfig.className}`}>
              {scheduleStatus === 'inactive' && <XCircle className="h-3.5 w-3.5 me-1.5 inline" />}
              {scheduleStatus === 'manual_only' && <AlertCircle className="h-3.5 w-3.5 me-1.5 inline" />}
              {scheduleStatus === 'scheduled_review' && <CalendarClock className="h-3.5 w-3.5 me-1.5 inline" />}
              {scheduleStatus === 'fully_automatic' && <CheckCircle2 className="h-3.5 w-3.5 me-1.5 inline" />}
              {statusConfig.label}
            </Badge>
            <p className="text-sm text-muted-foreground leading-relaxed pt-0.5">
              {statusConfig.description}
            </p>
          </div>

          {/* Configuration grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="bg-muted/40 rounded-lg p-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">יום הפעלה</p>
              <p className="text-sm font-semibold">
                {isActive ? `יום ${settings.reminderDayOfMonth}` : '—'}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">אזור זמן</p>
              <p className="text-sm font-semibold truncate" title={settings.buildingTimezone}>
                {settings.buildingTimezone}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">אישור נדרש</p>
              <p className="text-sm font-semibold">
                {settings.requireApprovalBeforeSending ? 'כן' : 'לא'}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">ערוצים</p>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {settings.activeChannels.map((ch) => (
                  <Badge key={ch} variant="outline" className="text-xs px-1.5 py-0">
                    {CHANNEL_LABELS[ch] ?? ch}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Next expected run */}
          <div className="flex items-center gap-2 pt-1 border-t">
            <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">ריצה הבאה צפויה:</span>
            {nextRun ? (
              <span className="text-sm font-medium">
                {nextRun.toLocaleDateString('he-IL', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">לא מתוזמן</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Last cron activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">פעילות תזמון אחרונה</CardTitle>
          <CardDescription className="text-xs">
            רשומות מהאחרונות שנוצרו על ידי מנגנון התזמון האוטומטי
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cronLogsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : cronLogs.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>אין פעילות תזמון רשומה — ייתכן שהמנגנון טרם הופעל</span>
            </div>
          ) : (
            <div className="space-y-1">
              {cronLogs.map((log) => {
                const config = CRON_ACTION_LABELS[log.action];
                const meta = log.metadata ?? {};
                return (
                  <div
                    key={log._id}
                    className="flex items-start gap-3 py-2 border-b last:border-0"
                  >
                    {/* Icon */}
                    <div className="shrink-0 mt-0.5">
                      {config?.icon === 'ok' && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {config?.icon === 'skip' && (
                        <SkipForward className="h-4 w-4 text-amber-500" />
                      )}
                      {config?.icon === 'exists' && (
                        <Clock className="h-4 w-4 text-blue-500" />
                      )}
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-medium leading-tight">
                        {config?.label ?? log.action}
                        {meta.month && (
                          <span className="text-muted-foreground font-normal ms-1.5">
                            — {formatMonthDisplay(meta.month)}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {meta.reason && (
                          <span>{SKIP_REASON_CRON_LABELS[meta.reason] ?? meta.reason}</span>
                        )}
                        {meta.itemCount != null && (
                          <span>{meta.itemCount} נמענים</span>
                        )}
                        {meta.autoApproved && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 text-green-700 bg-green-50 border-green-200">
                            אושר אוטומטית
                          </Badge>
                        )}
                        {meta.reminderMode && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                            {SCHEDULE_STATUS_CONFIG[meta.reminderMode as ScheduleStatus]?.label ?? meta.reminderMode}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <time
                      className="text-xs text-muted-foreground shrink-0 whitespace-nowrap"
                      dateTime={log.createdAt}
                    >
                      {formatDateLong(log.createdAt)}
                    </time>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latest batch summary */}
      {latestBatch && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">קמפיין אחרון</CardTitle>
            <CardDescription className="text-xs">הקמפיין האחרון שנוצר לבניין זה</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">{formatMonthDisplay(latestBatch.month)}</span>
                <BatchStatusBadge status={latestBatch.status} />
                {latestBatch.status === 'ready_for_review' && (
                  <Badge variant="outline" className="text-xs text-amber-700 bg-amber-50 border-amber-200 gap-1">
                    <Clock className="h-3 w-3" />
                    ממתין לאישורך
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {latestBatch.stats.total} נמענים · {formatDateShort(latestBatch.createdAt)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 shrink-0"
                onClick={() => onViewBatchDetails(latestBatch)}
              >
                <Eye className="h-3.5 w-3.5" />
                פרטים
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Run Now info box */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">הפעלה ידנית</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                כפתור <strong>הפעל עכשיו</strong> מפעיל את מנגנון התזמון עבור החודש הנוכחי —
                ניתן להשתמש בו לבדיקה ב-כל יום בחודש, ללא תלות ביום ההפעלה המוגדר.
                הפעולה אידמפוטנטית — לא ייווצרו קמפיינים כפולים.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

interface SettingsTabProps {
  form: SettingsData;
  saving: boolean;
  onChange: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => void;
  onSave: () => void;
}

function SettingsTab({ form, saving, onChange, onSave }: SettingsTabProps) {
  return (
    <div className="space-y-4">
      {/* Payment reminders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">תזכורות תשלום</CardTitle>
          <CardDescription>הגדרות כלליות לשליחת תזכורות חודשיות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="paymentRemindersEnabled"
              checked={form.paymentRemindersEnabled}
              onCheckedChange={(v) => onChange('paymentRemindersEnabled', !!v)}
              className="mt-0.5"
            />
            <div>
              <label
                htmlFor="paymentRemindersEnabled"
                className="text-sm font-medium cursor-pointer"
              >
                הפעל תזכורות תשלום
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                כבה כדי להשהות את כל תהליך שליחת התזכורות
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">מצב שליחה</label>
            <Select
              value={form.reminderMode}
              onValueChange={(v) =>
                onChange('reminderMode', v as SettingsData['reminderMode'])
              }
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_only">ידני בלבד</SelectItem>
                <SelectItem value="scheduled_review">בדיקה מתוזמנת</SelectItem>
                <SelectItem value="fully_automatic">אוטומטי לחלוטין</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <strong>ידני:</strong> שולח בעצמך.{' '}
              <strong>מתוזמן:</strong> המערכת מכינה קמפיין לאישורך ביום שנקבע.{' '}
              <strong>אוטומטי:</strong> נשלח ללא התערבות (מחייב ספק API).
            </p>
          </div>

          {form.reminderMode !== 'manual_only' && (
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">יום בחודש לשליחה</label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={form.reminderDayOfMonth}
                  onChange={(e) =>
                    onChange('reminderDayOfMonth', parseInt(e.target.value) || 5)
                  }
                />
                <p className="text-xs text-muted-foreground">בין 1 ל-28</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">ימי גרייס</label>
                <Input
                  type="number"
                  min={0}
                  value={form.gracePeriodDays}
                  onChange={(e) =>
                    onChange('gracePeriodDays', parseInt(e.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">ימי המתנה אחרי מועד תשלום</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anti-spam */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">הגנת ספאם</CardTitle>
          <CardDescription>מניעת שליחה כפולה לאותם דיירים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="skipRecentlyContacted"
              checked={form.skipRecentlyContactedResidents}
              onCheckedChange={(v) => onChange('skipRecentlyContactedResidents', !!v)}
              className="mt-0.5"
            />
            <div>
              <label
                htmlFor="skipRecentlyContacted"
                className="text-sm font-medium cursor-pointer"
              >
                דלג על דיירים שנפנו לאחרונה
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                דירות שנפנינו אליהן לאחרונה לא יקבלו תזכורת חדשה —
                הן יסומנו כ"דולגו" בסיכום הקמפיין
              </p>
            </div>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <label className="text-sm font-medium">ימי המתנה בין פניות</label>
            <Input
              type="number"
              min={1}
              max={365}
              value={form.cooldownDays}
              onChange={(e) => onChange('cooldownDays', parseInt(e.target.value) || 14)}
              disabled={!form.skipRecentlyContactedResidents}
            />
            <p className="text-xs text-muted-foreground">
              מינימום ימים בין פנייה אחת לשנייה לאותה דירה
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Workflow */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">תהליך שליחה</CardTitle>
          <CardDescription>בקרה על אישור ושיטת השליחה</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="requireApproval"
              checked={form.requireApprovalBeforeSending}
              onCheckedChange={(v) => onChange('requireApprovalBeforeSending', !!v)}
              className="mt-0.5"
            />
            <div>
              <label
                htmlFor="requireApproval"
                className="text-sm font-medium cursor-pointer"
              >
                דרוש אישור לפני שליחה
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                קמפיין שנוצר ייכנס לסקירה ויוצג כ"ממתין לאישור" לפני שמתאפשרת שליחה
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">ערוצי שליחה פעילים</label>
            <div className="space-y-2">
              {ALL_CHANNELS.map((ch) => (
                <div key={ch} className="flex items-center gap-2">
                  <Checkbox
                    id={`channel-${ch}`}
                    checked={form.activeChannels.includes(ch)}
                    onCheckedChange={(v) => {
                      const next = v
                        ? [...form.activeChannels, ch]
                        : form.activeChannels.filter((c) => c !== ch);
                      // At least one channel must stay active
                      onChange('activeChannels', next.length > 0 ? next : [ch]);
                    }}
                  />
                  <label htmlFor={`channel-${ch}`} className="text-sm cursor-pointer">
                    {CHANNEL_LABELS[ch]}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">חובה לבחור ערוץ אחד לפחות</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              שומר...
            </>
          ) : (
            'שמור הגדרות'
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

interface TemplatesTabProps {
  templates: TemplateData[];
  loading: boolean;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onOpenEdit: (t: TemplateData) => void;
  onSetDefault: (id: string) => void;
  onToggleActive: (t: TemplateData) => void;
}

function TemplatesTab({
  templates,
  loading,
  onRefresh,
  onOpenCreate,
  onOpenEdit,
  onSetDefault,
  onToggleActive,
}: TemplatesTabProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">תבניות הודעה</h2>
          <p className="text-sm text-muted-foreground">
            תבניות שניתן לבחור בעת יצירת קמפיין
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            רענן
          </Button>
          <Button onClick={onOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            תבנית חדשה
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">אין תבניות עדיין</p>
            <p className="text-xs text-muted-foreground">
              צור תבנית כדי לשלוח הודעות אחידות לכל הדיירים
            </p>
            <Button variant="outline" size="sm" onClick={onOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              צור תבנית ראשונה
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם</TableHead>
                  <TableHead>ערוץ</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>ברירת מחדל</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>נוצר</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl._id} className={!tpl.isActive ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        {tpl.name}
                        {tpl.channel === 'whatsapp_api' && tpl.isActive && !tpl.whatsappTemplateName && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            תבנית Meta לא מוגדרת — שליחה תיחסם
                          </span>
                        )}
                        {tpl.channel === 'whatsapp_api' && tpl.whatsappTemplateName && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {tpl.whatsappTemplateName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {CHANNEL_LABELS[tpl.channel] ?? tpl.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tpl.type === 'payment_reminder' ? 'תזכורת תשלום' : tpl.type}
                    </TableCell>
                    <TableCell>
                      {tpl.isDefault && (
                        <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                          ★ ברירת מחדל
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {tpl.isActive ? (
                        <Badge
                          variant="secondary"
                          className="text-green-700 bg-green-50 border-green-200 text-xs"
                        >
                          פעיל
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          לא פעיל
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateShort(tpl.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => onOpenEdit(tpl)}
                        >
                          <Pencil className="h-3 w-3" />
                          ערוך
                        </Button>
                        {!tpl.isDefault && tpl.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => onSetDefault(tpl._id)}
                          >
                            <Star className="h-3 w-3" />
                            הגדר
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => onToggleActive(tpl)}
                        >
                          {tpl.isActive ? 'השבת' : 'הפעל'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

interface HistoryTabProps {
  batches: BatchData[];
  loading: boolean;
  onRefresh: () => void;
  onViewDetails: (batch: BatchData) => void;
}

function HistoryTab({ batches, loading, onRefresh, onViewDetails }: HistoryTabProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">היסטוריית קמפיינים</h2>
          <p className="text-sm text-muted-foreground">כל הקמפיינים שנוצרו לבניין זה</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </Button>
      </div>

      {batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <History className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">אין קמפיינים עדיין</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>חודש</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>מיקוד</TableHead>
                  <TableHead className="text-center">נמענים</TableHead>
                  <TableHead className="text-center">נפנו</TableHead>
                  <TableHead className="text-center">דולגו</TableHead>
                  <TableHead>נוצר</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => {
                  const contacted = batch.stats.sent + batch.stats.openedManual;
                  return (
                    <TableRow key={batch._id}>
                      <TableCell className="font-medium">
                        {formatMonthDisplay(batch.month)}
                      </TableCell>
                      <TableCell>
                        <BatchStatusBadge status={batch.status} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            batch.targetingMode === 'manual'
                              ? 'border-primary/30 text-primary'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {batch.targetingMode === 'manual' ? 'ידני' : 'אוטומטי'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        <span className="font-medium">{batch.stats.total}</span>
                        {batch.audienceSummary.total !== batch.stats.total && (
                          <span className="text-muted-foreground text-xs ms-1">
                            / {batch.audienceSummary.total}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        <span
                          className={
                            contacted > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'
                          }
                        >
                          {contacted}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {batch.skippedCount > 0 ? batch.skippedCount : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateShort(batch.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => onViewDetails(batch)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          פרטים
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
  // Settings state
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsForm, setSettingsForm] = useState<SettingsData | null>(null);

  // Templates state
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(EMPTY_TEMPLATE_FORM);
  const [templateSaving, setTemplateSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Batch history state
  const [batches, setBatches] = useState<BatchData[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchData | null>(null);
  const [batchItems, setBatchItems] = useState<BatchItemData[]>([]);
  const [batchItemsLoading, setBatchItemsLoading] = useState(false);
  const [batchDetailsOpen, setBatchDetailsOpen] = useState(false);

  // Schedule tab state
  const [cronLogs, setCronLogs] = useState<CronAuditEntry[]>([]);
  const [cronLogsLoading, setCronLogsLoading] = useState(false);
  const [cronLogsLoaded, setCronLogsLoaded] = useState(false);
  const [runningCron, setRunningCron] = useState(false);

  // ── Data fetching ──

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/notifications/settings');
      const result = await res.json();
      if (result.success) {
        setSettings(result.data);
        setSettingsForm(result.data);
      } else {
        toast.error('שגיאה בטעינת הגדרות');
      }
    } catch {
      toast.error('שגיאה בטעינת הגדרות');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/notifications/templates?all=true');
      const result = await res.json();
      if (result.success) setTemplates(result.data);
    } catch {
      toast.error('שגיאה בטעינת תבניות');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const fetchBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const res = await fetch('/api/notifications/batches?all=true&limit=40');
      const result = await res.json();
      if (result.success) setBatches(result.data);
    } catch {
      /* non-critical */
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  const fetchBatchItems = useCallback(async (batchId: string) => {
    setBatchItemsLoading(true);
    setBatchItems([]);
    try {
      const res = await fetch(`/api/notifications/items?batchId=${batchId}`);
      const result = await res.json();
      if (result.success) setBatchItems(result.data);
    } catch {
      /* non-critical */
    } finally {
      setBatchItemsLoading(false);
    }
  }, []);

  const fetchCronLogs = useCallback(async () => {
    setCronLogsLoading(true);
    try {
      const actions = [
        'notification_batch_auto_created',
        'notification_batch_auto_skipped',
        'notification_batch_already_exists',
      ];

      const results = await Promise.all(
        actions.map((action) =>
          fetch(`/api/audit-logs?action=${action}&limit=5&sortOrder=desc`)
            .then((r) => r.json())
            .then((r) => (r.success ? (r.data?.data ?? []) : []))
            .catch(() => [])
        )
      );

      const merged = (results.flat() as CronAuditEntry[]).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setCronLogs(merged.slice(0, 8));
      setCronLogsLoaded(true);
    } catch {
      /* non-critical */
    } finally {
      setCronLogsLoading(false);
    }
  }, []);

  const handleRunNow = async () => {
    setRunningCron(true);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const res = await fetch(`/api/cron/monthly-reminders?month=${currentMonth}`);
      const result = await res.json();

      if (res.status === 401 || res.status === 403) {
        toast.error('נדרשות הרשאות מנהל להפעלת תזמון ידנית');
        return;
      }

      if (!result.success) {
        toast.error(result.error || 'שגיאה בהפעלת תזמון');
        return;
      }

      const { summary } = result.data as { summary: { generated: number; alreadyExists: number; skipped: number; errors: number } };

      if (summary.errors > 0 && summary.generated === 0) {
        toast.error('הפעלת התזמון נכשלה — בדוק לוגים');
      } else if (summary.generated > 0) {
        toast.success(`קמפיין נוצר בהצלחה`);
      } else if (summary.alreadyExists > 0) {
        toast.info('קמפיין לחודש זה כבר קיים');
      } else {
        toast.info('בניין דולג — בדוק הגדרות תזמון');
      }

      await Promise.all([fetchBatches(), fetchCronLogs()]);
    } catch {
      toast.error('שגיאה בהפעלת תזמון');
    } finally {
      setRunningCron(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchTemplates();
    fetchBatches();
  }, [fetchSettings, fetchTemplates, fetchBatches]);

  // ── Settings handlers ──

  const handleSettingsSave = async () => {
    if (!settingsForm) return;
    setSettingsSaving(true);
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const result = await res.json();
      if (result.success) {
        setSettings(result.data);
        setSettingsForm(result.data);
        toast.success('ההגדרות נשמרו בהצלחה');
      } else {
        toast.error(result.error || 'שגיאה בשמירת הגדרות');
      }
    } catch {
      toast.error('שגיאה בשמירת הגדרות');
    } finally {
      setSettingsSaving(false);
    }
  };

  const setSettingsField = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettingsForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  // ── Template handlers ──

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setTemplateForm(EMPTY_TEMPLATE_FORM);
    setTemplateDialogOpen(true);
  };

  const openEditDialog = (template: TemplateData) => {
    setEditingTemplate(template);
    const bodyMapping = template.whatsappComponents?.find((c) => c.type === 'body');
    const headerMapping = template.whatsappComponents?.find((c) => c.type === 'header');
    setTemplateForm({
      name: template.name,
      type: template.type as 'payment_reminder',
      channel: template.channel as TemplateForm['channel'],
      body: template.body,
      subject: template.subject ?? '',
      isDefault: template.isDefault,
      whatsappTemplateName: template.whatsappTemplateName ?? '',
      whatsappLanguageCode: template.whatsappLanguageCode ?? 'he',
      whatsappBodyVars: bodyMapping?.variableNames.join(', ') ?? '',
      whatsappHeaderVars: headerMapping?.variableNames.join(', ') ?? '',
    });
    setTemplateDialogOpen(true);
  };

  const handleTemplateSave = async () => {
    if (!templateForm.name.trim() || !templateForm.body.trim()) return;
    setTemplateSaving(true);
    try {
      const url = editingTemplate
        ? `/api/notifications/templates/${editingTemplate._id}`
        : '/api/notifications/templates';
      const method = editingTemplate ? 'PUT' : 'POST';

      // Build whatsappComponents from the simplified form fields
      const parseVars = (raw: string) =>
        raw.split(',').map((v) => v.trim()).filter(Boolean);

      const whatsappComponents: WhatsAppComponentMappingUI[] = [];
      const bodyVars = parseVars(templateForm.whatsappBodyVars);
      const headerVars = parseVars(templateForm.whatsappHeaderVars);
      if (headerVars.length > 0) whatsappComponents.push({ type: 'header', variableNames: headerVars });
      if (bodyVars.length > 0) whatsappComponents.push({ type: 'body', variableNames: bodyVars });

      const whatsappFields = templateForm.channel === 'whatsapp_api' ? {
        whatsappTemplateName: templateForm.whatsappTemplateName.trim() || null,
        whatsappLanguageCode: templateForm.whatsappLanguageCode.trim() || 'he',
        whatsappComponents: whatsappComponents.length > 0 ? whatsappComponents : null,
      } : {};

      const payload = editingTemplate
        ? { name: templateForm.name, body: templateForm.body, subject: templateForm.subject || undefined, isActive: true, ...whatsappFields }
        : { ...templateForm, ...whatsappFields };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(editingTemplate ? 'התבנית עודכנה בהצלחה' : 'התבנית נוצרה בהצלחה');
        setTemplateDialogOpen(false);
        await fetchTemplates();
      } else {
        toast.error(result.error || 'שגיאה בשמירת תבנית');
      }
    } catch {
      toast.error('שגיאה בשמירת תבנית');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const res = await fetch(`/api/notifications/templates/${templateId}/set-default`, {
        method: 'POST',
      });
      const result = await res.json();
      if (result.success) {
        toast.success('הוגדרה כברירת מחדל');
        await fetchTemplates();
      } else {
        toast.error(result.error || 'שגיאה');
      }
    } catch {
      toast.error('שגיאה');
    }
  };

  const handleToggleActive = async (template: TemplateData) => {
    try {
      const res = await fetch(`/api/notifications/templates/${template._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(template.isActive ? 'התבנית הושבתה' : 'התבנית הופעלה');
        await fetchTemplates();
      } else {
        toast.error(result.error || 'שגיאה');
      }
    } catch {
      toast.error('שגיאה');
    }
  };

  // Variable chip click → insert at textarea cursor
  const insertVariable = (varName: string) => {
    const insertion = `{{${varName}}}`;
    const textarea = bodyRef.current;
    if (!textarea) {
      setTemplateForm((prev) => ({ ...prev, body: prev.body + insertion }));
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody =
      templateForm.body.substring(0, start) + insertion + templateForm.body.substring(end);
    setTemplateForm((prev) => ({ ...prev, body: newBody }));
    setTimeout(() => {
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
      textarea.focus();
    }, 0);
  };

  // Live preview with sample data
  const templatePreview = useMemo(() => {
    if (!templateForm.body.trim()) return '';
    try {
      const samplePeriod = new Date().toISOString().slice(0, 7);
      return renderTemplateBody(
        templateForm.body,
        buildSampleContext('בניין לדוגמה', samplePeriod)
      );
    } catch {
      return templateForm.body;
    }
  }, [templateForm.body]);

  // ── Batch detail handlers ──

  const handleViewBatchDetails = async (batch: BatchData) => {
    setSelectedBatch(batch);
    setBatchDetailsOpen(true);
    await fetchBatchItems(batch._id);
  };

  // ── Render ──

  if (settingsLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="ניהול התראות" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="ניהול התראות" />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-1.5 text-muted-foreground -ms-2"
        >
          <Link href="/notifications">
            <ArrowRight className="h-4 w-4" />
            חזרה לתזכורות
          </Link>
        </Button>

        <Tabs
          defaultValue="settings"
          onValueChange={(tab) => {
            if (tab === 'schedule' && !cronLogsLoaded) {
              fetchCronLogs();
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings2 className="h-4 w-4" />
              הגדרות
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <FileText className="h-4 w-4" />
              תבניות
              {templates.length > 0 && (
                <span className="ms-1 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0">
                  {templates.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              היסטוריה
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1.5">
              <CalendarClock className="h-4 w-4" />
              תזמון
            </TabsTrigger>
          </TabsList>

          {/* Settings tab */}
          <TabsContent value="settings" className="mt-4">
            {settingsForm ? (
              <SettingsTab
                form={settingsForm}
                saving={settingsSaving}
                onChange={setSettingsField}
                onSave={handleSettingsSave}
              />
            ) : (
              <Card>
                <CardContent className="py-4 text-center text-sm text-muted-foreground">
                  שגיאה בטעינת הגדרות
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Templates tab */}
          <TabsContent value="templates" className="mt-4">
            <TemplatesTab
              templates={templates}
              loading={templatesLoading}
              onRefresh={fetchTemplates}
              onOpenCreate={openCreateDialog}
              onOpenEdit={openEditDialog}
              onSetDefault={handleSetDefault}
              onToggleActive={handleToggleActive}
            />
          </TabsContent>

          {/* History tab */}
          <TabsContent value="history" className="mt-4">
            <HistoryTab
              batches={batches}
              loading={batchesLoading}
              onRefresh={fetchBatches}
              onViewDetails={handleViewBatchDetails}
            />
          </TabsContent>

          {/* Schedule tab */}
          <TabsContent value="schedule" className="mt-4">
            {settingsForm ? (
              <ScheduleTab
                settings={settingsForm}
                batches={batches}
                cronLogs={cronLogs}
                cronLogsLoading={cronLogsLoading}
                runningCron={runningCron}
                onRunNow={handleRunNow}
                onViewBatchDetails={handleViewBatchDetails}
              />
            ) : (
              <Card>
                <CardContent className="py-4 text-center text-sm text-muted-foreground">
                  שגיאה בטעינת הגדרות
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Template create / edit dialog ─────────────────────────────────────── */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? `עריכת תבנית — ${editingTemplate.name}` : 'תבנית חדשה'}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? 'ערוך את גוף ההודעה ואת ההגדרות הבסיסיות'
                : 'הגדר תבנית הודעה עם משתנים דינמיים לשימוש חוזר'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6 min-h-[360px]">
            {/* Left: form */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">שם התבנית *</label>
                <Input
                  value={templateForm.name}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="לדוגמה: תזכורת חודשית — ועד"
                  dir="rtl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">סוג</label>
                  <Select
                    value={templateForm.type}
                    onValueChange={(v) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        type: v as 'payment_reminder',
                      }))
                    }
                    disabled={!!editingTemplate}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="payment_reminder">תזכורת תשלום</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">ערוץ</label>
                  <Select
                    value={templateForm.channel}
                    onValueChange={(v) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        channel: v as TemplateForm['channel'],
                      }))
                    }
                    disabled={!!editingTemplate}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp_manual">WhatsApp ידני</SelectItem>
                      <SelectItem value="whatsapp_api">WhatsApp API</SelectItem>
                      <SelectItem value="email">דוא&quot;ל</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">גוף ההודעה *</label>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    משתנים זמינים — לחץ להוספה בסמן:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded px-1.5 py-0.5 font-mono transition-colors"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea
                  ref={bodyRef}
                  value={templateForm.body}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({ ...prev, body: e.target.value }))
                  }
                  rows={9}
                  className="font-mono text-sm resize-none"
                  dir="rtl"
                  placeholder={`שלום {{residentName}},\n\nתזכורת ידידותית לתשלום ועד בית...`}
                />
              </div>

              {templateForm.channel === 'email' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">כותרת (לאימייל)</label>
                  <Input
                    value={templateForm.subject}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))
                    }
                    dir="rtl"
                    placeholder="תזכורת תשלום — {{monthLabel}}"
                  />
                </div>
              )}

              {templateForm.channel === 'whatsapp_api' && (
                <div className="space-y-3 border rounded-lg p-3 bg-blue-50/40 border-blue-200">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 shrink-0" />
                    <p className="text-xs font-semibold text-blue-800">
                      הגדרות WhatsApp Business API
                    </p>
                  </div>
                  <p className="text-xs text-blue-700">
                    לשליחה דרך Meta Cloud API יש להשתמש בתבנית מאושרת בלבד.
                    הזן את שם התבנית המאושרת ב-Meta Business Manager ואת מיפוי המשתנים.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">שם תבנית Meta *</label>
                      <Input
                        value={templateForm.whatsappTemplateName}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            whatsappTemplateName: e.target.value,
                          }))
                        }
                        placeholder="payment_reminder"
                        className="h-8 text-sm font-mono"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">קוד שפה</label>
                      <Input
                        value={templateForm.whatsappLanguageCode}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            whatsappLanguageCode: e.target.value,
                          }))
                        }
                        placeholder="he"
                        className="h-8 text-sm font-mono"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      פרמטרים לגוף התבנית (לפי סדר הופעה ב-Meta)
                    </label>
                    <Input
                      value={templateForm.whatsappBodyVars}
                      onChange={(e) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          whatsappBodyVars: e.target.value,
                        }))
                      }
                      placeholder="residentName, balanceAmount, monthLabel"
                      className="h-8 text-xs font-mono"
                      dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground">
                      שמות משתנים מופרדים בפסיקים — {'{{1}}'} {'{{2}}'} ...
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      פרמטרים לכותרת (header) — אם רלוונטי
                    </label>
                    <Input
                      value={templateForm.whatsappHeaderVars}
                      onChange={(e) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          whatsappHeaderVars: e.target.value,
                        }))
                      }
                      placeholder="buildingName"
                      className="h-8 text-xs font-mono"
                      dir="ltr"
                    />
                  </div>

                  {!templateForm.whatsappTemplateName.trim() && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      ללא שם תבנית Meta — שליחה דרך WhatsApp API תיחסם
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="tpl-isDefault"
                  checked={templateForm.isDefault}
                  onCheckedChange={(v) =>
                    setTemplateForm((prev) => ({ ...prev, isDefault: !!v }))
                  }
                />
                <label htmlFor="tpl-isDefault" className="text-sm cursor-pointer">
                  הגדר כברירת מחדל לערוץ זה
                </label>
              </div>
            </div>

            {/* Right: live preview */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
                תצוגה מקדימה (נתוני דוגמה)
              </p>
              <div
                className="bg-muted/30 border rounded-lg p-3 whitespace-pre-wrap text-sm leading-relaxed min-h-[300px] font-mono overflow-y-auto"
                dir="rtl"
              >
                {templatePreview ? (
                  templatePreview
                ) : (
                  <span className="text-muted-foreground/40 text-xs">
                    הקלד גוף הודעה לצפייה בתצוגה מקדימה...
                  </span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              ביטול
            </Button>
            <Button
              onClick={handleTemplateSave}
              disabled={
                templateSaving ||
                !templateForm.name.trim() ||
                !templateForm.body.trim()
              }
              className="gap-2"
            >
              {templateSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שומר...
                </>
              ) : editingTemplate ? (
                'שמור שינויים'
              ) : (
                'צור תבנית'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Batch details dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={batchDetailsOpen}
        onOpenChange={(open) => {
          setBatchDetailsOpen(open);
          if (!open) setSelectedBatch(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              פרטי קמפיין —{' '}
              {selectedBatch ? formatMonthDisplay(selectedBatch.month) : ''}
            </DialogTitle>
            {selectedBatch && (
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <BatchStatusBadge status={selectedBatch.status} />
                  <span className="text-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    נפנו:{' '}
                    {selectedBatch.stats.sent + selectedBatch.stats.openedManual}
                  </span>
                  {(selectedBatch.stats.delivered ?? 0) > 0 && (
                    <span className="text-xs flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      נמסר: {selectedBatch.stats.delivered}
                    </span>
                  )}
                  {(selectedBatch.stats.read ?? 0) > 0 && (
                    <span className="text-xs flex items-center gap-1 text-teal-700">
                      <Eye className="h-3.5 w-3.5" />
                      נקרא: {selectedBatch.stats.read}
                    </span>
                  )}
                  <span className="text-xs flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    ממתינים: {selectedBatch.stats.pending}
                  </span>
                  {selectedBatch.skippedCount > 0 && (
                    <span className="text-xs flex items-center gap-1 text-muted-foreground">
                      <XCircle className="h-3.5 w-3.5" />
                      דולגו: {selectedBatch.skippedCount}
                      {selectedBatch.skippedSummary.manuallyExcluded > 0 &&
                        ` (${selectedBatch.skippedSummary.manuallyExcluded} הוחרגו ידנית)`}
                    </span>
                  )}
                  {selectedBatch.targetingMode === 'manual' && (
                    <Badge
                      variant="outline"
                      className="text-xs border-primary/30 text-primary"
                    >
                      מיקוד ידני
                    </Badge>
                  )}
                </div>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {batchItemsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : batchItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">אין פריטים</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>דירה</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>ספק</TableHead>
                    <TableHead>סיבה</TableHead>
                    <TableHead>עדכון אחרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchItems.map((item) => {
                    const aptNum =
                      (item.metadata?.apartmentNumber as string | undefined) ?? null;
                    const latestDate =
                      item.readAt ?? item.deliveredAt ?? item.sentAt ?? item.lastAttemptAt ?? item.createdAt;
                    const providerLabel =
                      item.provider === 'whatsapp_business'
                        ? 'WhatsApp API'
                        : item.provider === 'manual'
                        ? 'ידני'
                        : item.provider
                        ? item.provider
                        : null;
                    return (
                      <TableRow key={item._id}>
                        <TableCell className="font-medium text-sm">
                          {aptNum ? `דירה ${aptNum}` : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <ItemStatusBadge status={item.status} />
                            {item.failureReason && (
                              <p className="text-xs text-red-600 max-w-[160px] truncate" title={item.failureReason}>
                                {item.failureReason}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {providerLabel ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              {providerLabel}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.skipReason
                            ? (SKIP_REASON_LABELS[item.skipReason] ?? item.skipReason)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {latestDate
                            ? new Date(latestDate).toLocaleDateString('he-IL', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter className="pt-2 border-t">
            <p className="text-xs text-muted-foreground me-auto">
              {batchItems.length > 0 && `${batchItems.length} פריטים`}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setBatchDetailsOpen(false);
                setSelectedBatch(null);
              }}
            >
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
