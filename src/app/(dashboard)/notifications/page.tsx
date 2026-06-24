'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  FileText,
  AlertTriangle,
  Send,
  Eye,
  ListChecks,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Clock,
  Settings,
  Pencil,
  ShieldCheck,
  Phone,
  TimerOff,
  Users,
  BellRing,
  CheckCheck,
  ClipboardCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/hooks';
import Link from 'next/link';
import { DEFAULT_PAYMENT_REMINDER_BODY, buildSampleContext, renderTemplateBody } from '@/lib/notifications/template-renderer';

// ─── Domain types ─────────────────────────────────────────────────────────

interface ResidentInfo {
  _id: string;
  fullName: string;
  phone?: string;
  email?: string;
  type: 'owner' | 'tenant';
}

interface ApartmentBilling {
  apartmentId: string;
  apartmentNumber: string;
  floor?: number;
  monthlyDue: number;
  chargeId?: string;
  paidThisMonth: number;
  remaining: number;
  status: 'paid' | 'partial' | 'unpaid' | 'no_charge';
  residents?: ResidentInfo[];
}

interface MonthlyData {
  period: string;
  currency: string;
  buildingName: string;
  apartments: ApartmentBilling[];
}

type BatchStatus =
  | 'draft' | 'ready_for_review' | 'approved' | 'ready'
  | 'processing' | 'completed' | 'failed' | 'cancelled';
type ItemStatus =
  | 'draft'
  | 'pending'
  | 'queued'
  | 'opened_manual'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'retrying'
  | 'failed'
  | 'cancelled';

interface BatchSummary {
  _id: string;
  status: BatchStatus;
  month: string;
  audienceSummary: { total: number; unpaid: number; partial: number };
  stats: { total: number; pending: number; openedManual: number; sent: number; delivered?: number; read?: number; failed: number; cancelled: number };
  skippedCount: number;
  skippedSummary: { noPhone: number; recentlyContacted: number; manuallyExcluded: number; total: number };
  targetingMode?: 'automatic' | 'manual';
  isCustomMessage: boolean;
  createdAt: string;
}

interface BatchItemRecord {
  _id: string;
  status: ItemStatus;
  retryCount: number;
  maxRetries: number;
  failureCode?: string;
  failureReason?: string;
}

interface TemplateSummary {
  _id: string;
  name: string;
  body: string;
  isDefault: boolean;
  channel: string;
}

interface NotificationCandidate {
  apartmentId: string;
  apartmentNumber: string;
  floor?: number;
  residentId?: string;
  residentName: string;
  hasValidPhone: boolean;
  phone?: string;
  residentType?: 'owner' | 'tenant';
  billingStatus: 'unpaid' | 'partial';
  balanceAmount: number;
  chargeId?: string;
  cooldownStatus: 'clear' | 'recently_contacted';
  lastContactAt?: string | null;
  daysSinceContact?: number | null;
}

interface NotificationSettingsSummary {
  cooldownDays: number;
  requireApprovalBeforeSending: boolean;
  skipRecentlyContactedResidents: boolean;
  paymentRemindersEnabled: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatMonthDisplay(periodStr: string) {
  const [year, month] = periodStr.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let n = phone.replace(/[\s\-\(\)]/g, '');
  if (!n.startsWith('+') && !n.startsWith('972')) {
    if (n.startsWith('0')) n = '972' + n.slice(1);
    else return null;
  }
  if (n.startsWith('+')) n = n.slice(1);
  return /^\d{10,15}$/.test(n) ? n : null;
}

// ─── StatusBanner ─────────────────────────────────────────────────────────
//
// Context-aware top card. Tells the user exactly where they are and what
// to do next — without requiring them to parse the page structure first.

interface StatusBannerProps {
  batchLoading: boolean;
  currentBatch: BatchSummary | null;
  period: string;
  candidatesLoading: boolean;
  totalCandidates: number;
  eligibleCandidates: number; // valid phone + clear cooldown
}

function StatusBanner({
  batchLoading,
  currentBatch,
  period,
  candidatesLoading,
  totalCandidates,
  eligibleCandidates,
}: StatusBannerProps) {
  const periodLabel = formatMonthDisplay(period);

  if (batchLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>בודק קמפיין קיים...</span>
      </div>
    );
  }

  const status = currentBatch?.status;

  // ── No active batch ────────────────────────────────────────────────────

  if (!currentBatch || status === 'cancelled') {
    if (candidatesLoading) {
      return (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary/60 shrink-0" />
            <div>
              <p className="text-sm font-medium">טוען נתוני חיוב עבור {periodLabel}...</p>
              <p className="text-xs text-muted-foreground">בדיקה מי עדיין לא שילם</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (totalCandidates === 0) {
      return (
        <Card className="border-green-200 bg-green-50/60">
          <CardContent className="py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">כל הדיירים שילמו החודש 🎉</p>
              <p className="text-xs text-green-700">אין חיובים פתוחים עבור {periodLabel}</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-primary/30 bg-gradient-to-l from-primary/5 to-transparent">
        <CardContent className="py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <BellRing className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {totalCandidates} דיירים שלא שילמו ב{periodLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {eligibleCandidates > 0
                  ? `${eligibleCandidates} עם מספר טלפון תקין — בחרו נמענים מטה ולחצו "צור קמפיין"`
                  : 'בחרו נמענים בחלונית מטה ולחצו "צור קמפיין"'}
              </p>
            </div>
          </div>
          {status === 'cancelled' && (
            <Badge variant="outline" className="text-xs shrink-0">
              קמפיין קודם בוטל
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Batch waiting for approval ─────────────────────────────────────────

  if (status === 'ready_for_review') {
    return (
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-amber-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              קמפיין ממתין לאישורך — {currentBatch.stats.total} נמענים מוכנים
            </p>
            <p className="text-xs text-amber-700">
              סקרו את הפרטים בחלונית מטה ולחצו <strong>אשר קמפיין</strong> כדי לאפשר שליחה
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Ready to send ──────────────────────────────────────────────────────

  if (status === 'ready' || status === 'approved') {
    const contacted = currentBatch.stats.sent + currentBatch.stats.openedManual;
    const pending = currentBatch.stats.pending;
    return (
      <Card className="border-green-300 bg-green-50">
        <CardContent className="py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center shrink-0">
            <Send className="h-4 w-4 text-green-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-900">
              מוכן לשליחה
              {pending > 0 && ` — ${pending} נמענים ממתינים`}
              {contacted > 0 && ` · ${contacted} כבר נפנו`}
            </p>
            <p className="text-xs text-green-700">
              לחצו <strong>שלח WhatsApp</strong> עבור כל דייר בטבלה מטה לשלוח את ההודעה
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Completed ──────────────────────────────────────────────────────────

  if (status === 'completed') {
    const contacted = currentBatch.stats.sent + currentBatch.stats.openedManual;
    const hasFailed = currentBatch.stats.failed > 0;
    return (
      <Card className={hasFailed ? 'border-amber-200 bg-amber-50/50' : 'border-blue-200 bg-blue-50/40'}>
        <CardContent className="py-3 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${hasFailed ? 'bg-amber-100' : 'bg-blue-100'}`}>
            <CheckCheck className={`h-4 w-4 ${hasFailed ? 'text-amber-600' : 'text-blue-600'}`} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${hasFailed ? 'text-amber-900' : 'text-blue-900'}`}>
              {hasFailed
                ? `קמפיין הסתיים — ${contacted} נפנו, ${currentBatch.stats.failed} נכשלו`
                : `קמפיין הושלם — נפנו ${contacted} מתוך ${currentBatch.stats.total} דיירים ✓`}
            </p>
            <p className={`text-xs ${hasFailed ? 'text-amber-700' : 'text-blue-700'}`}>
              {hasFailed
                ? 'לחצו "נסה שוב" ליד הפריטים הנכשלים בטבלה'
                : `כל ההודעות נשלחו בהצלחה עבור ${periodLabel}`}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Processing ─────────────────────────────────────────────────────────

  if (status === 'processing') {
    return (
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="py-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
          <p className="text-sm text-blue-800 font-medium">הקמפיין בעיבוד...</p>
        </CardContent>
      </Card>
    );
  }

  // ── Failed batch ───────────────────────────────────────────────────────

  if (status === 'failed') {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-3 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              שליחה נכשלה — {currentBatch.stats.failed} פריטים לא נשלחו
            </p>
            <p className="text-xs text-muted-foreground">
              לחצו <strong>נסה שוב</strong> ליד כל פריט נכשל בטבלה מטה
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

// ─── ComposePanel ─────────────────────────────────────────────────────────

interface ComposePanelProps {
  period: string;
  buildingName: string;
  templates: TemplateSummary[];
  settings: NotificationSettingsSummary | null;
  selectedTemplateId: string | null;
  customMessage: string;
  showEditor: boolean;
  onTemplateChange: (id: string | null) => void;
  onCustomMessageChange: (v: string) => void;
  onToggleEditor: () => void;
}

function ComposePanel({
  period, buildingName, templates, settings, selectedTemplateId,
  customMessage, showEditor,
  onTemplateChange, onCustomMessageChange, onToggleEditor,
}: ComposePanelProps) {
  const t = useTranslations('notifications');

  const activeBody = customMessage.trim()
    ? customMessage
    : (templates.find((tpl) => tpl._id === selectedTemplateId)?.body ?? DEFAULT_PAYMENT_REMINDER_BODY);

  const preview = renderTemplateBody(activeBody, buildSampleContext(buildingName, period));

  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary/70" />
            <CardTitle className="text-base">{t('composeTitle')}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground text-xs gap-1">
            <Link href="/notifications/settings">
              <Settings className="h-3.5 w-3.5" />
              {t('settingsLink')}
            </Link>
          </Button>
        </div>
        {settings && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
            {settings.skipRecentlyContactedResidents && (
              <span className="flex items-center gap-1">
                <TimerOff className="h-3.5 w-3.5" />
                {t('cooldownLabel', { days: settings.cooldownDays })}
              </span>
            )}
            {settings.requireApprovalBeforeSending && (
              <span className="flex items-center gap-1 text-amber-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('approvalRequired')}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {templates.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium shrink-0">{t('templateLabel')}:</span>
            <Select
              value={selectedTemplateId ?? '__default__'}
              onValueChange={(v) => onTemplateChange(v === '__default__' ? null : v)}
            >
              <SelectTrigger className="flex-1 max-w-xs h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">{t('templateDefault')}</SelectItem>
                {templates.map((tpl) => (
                  <SelectItem key={tpl._id} value={tpl._id}>
                    {tpl.name}
                    {tpl.isDefault && ' ★'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={onToggleEditor} className="gap-1 text-xs shrink-0">
              <Pencil className="h-3.5 w-3.5" />
              {showEditor ? t('hideEditor') : t('editMessage')}
            </Button>
          </div>
        )}

        {showEditor && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{t('editorHint')}</p>
            <Textarea
              value={customMessage || activeBody}
              onChange={(e) => onCustomMessageChange(e.target.value)}
              rows={7}
              className="font-mono text-sm resize-none"
              dir="rtl"
              placeholder={DEFAULT_PAYMENT_REMINDER_BODY}
            />
          </div>
        )}

        {!showEditor && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t('previewSample')}</p>
            <div className="bg-background border rounded-lg p-3 whitespace-pre-wrap text-sm leading-relaxed" dir="rtl">
              {preview}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── TargetingPanel ───────────────────────────────────────────────────────

interface TargetingPanelProps {
  candidates: NotificationCandidate[];
  loading: boolean;
  generating: boolean;
  onGenerate: (selectedIds: string[], bypassCooldown: boolean) => void;
}

function TargetingPanel({ candidates, loading, generating, onGenerate }: TargetingPanelProps) {
  const t = useTranslations('notifications');

  const [search, setSearch] = useState('');
  const [billingFilter, setBillingFilter] = useState<'all' | 'unpaid' | 'partial'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'owner' | 'tenant'>('all');
  const [phoneFilter, setPhoneFilter] = useState<'all' | 'valid_only'>('all');
  const [cooldownFilter, setCooldownFilter] = useState<'all' | 'clear_only'>('all');
  const [bypassCooldown, setBypassCooldown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const hasRecentlyContacted = candidates.some((c) => c.cooldownStatus === 'recently_contacted');

  // Auto-initialise selection when candidates load: default to valid phone + clear cooldown
  useEffect(() => {
    const autoSelected = candidates
      .filter((c) => c.hasValidPhone && c.cooldownStatus === 'clear')
      .map((c) => c.apartmentId);
    setSelectedIds(new Set(autoSelected));
  }, [candidates]);

  // Sync bypass-cooldown toggle with selection
  useEffect(() => {
    if (bypassCooldown) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        candidates
          .filter((c) => c.hasValidPhone && c.cooldownStatus === 'recently_contacted')
          .forEach((c) => next.add(c.apartmentId));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        candidates
          .filter((c) => c.cooldownStatus === 'recently_contacted')
          .forEach((c) => next.delete(c.apartmentId));
        return next;
      });
    }
  }, [bypassCooldown, candidates]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (billingFilter !== 'all' && c.billingStatus !== billingFilter) return false;
      if (typeFilter !== 'all' && c.residentType !== typeFilter) return false;
      if (phoneFilter === 'valid_only' && !c.hasValidPhone) return false;
      if (cooldownFilter === 'clear_only' && c.cooldownStatus !== 'clear') return false;
      if (q && !c.apartmentNumber.toLowerCase().includes(q) && !c.residentName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [candidates, billingFilter, typeFilter, phoneFilter, cooldownFilter, search]);

  const selectedCount = selectedIds.size;
  const excludedCount = candidates.filter((c) => !selectedIds.has(c.apartmentId)).length;
  const warningCount = candidates.filter(
    (c) => selectedIds.has(c.apartmentId) && (!c.hasValidPhone || c.cooldownStatus === 'recently_contacted')
  ).length;
  const noPhoneCount = candidates.filter((c) => !c.hasValidPhone).length;
  const cooldownCount = candidates.filter((c) => c.cooldownStatus === 'recently_contacted').length;
  const readyCount = candidates.filter((c) => c.hasValidPhone && c.cooldownStatus === 'clear').length;

  const allFilteredSelected =
    filteredCandidates.length > 0 && filteredCandidates.every((c) => selectedIds.has(c.apartmentId));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredCandidates.forEach((c) => next.delete(c.apartmentId));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredCandidates.forEach((c) => next.add(c.apartmentId));
        return next;
      });
    }
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t('targetingLoading')}</span>
        </CardContent>
      </Card>
    );
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {t('targetingNoCandidates')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-primary/70" />
            {t('targetingTitle')}
          </CardTitle>
          {/* Candidate breakdown — at a glance */}
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="flex items-center gap-1 text-primary font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {readyCount} מוכנים
            </span>
            {noPhoneCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600 text-xs">
                <Phone className="h-3.5 w-3.5" />
                {noPhoneCount} ללא טלפון
              </span>
            )}
            {cooldownCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                <TimerOff className="h-3.5 w-3.5" />
                {cooldownCount} בצינון
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('targetingWarnings', { count: warningCount })} נבחרו עם אזהרה
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder={t('targetingSearchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[180px] text-sm"
            dir="rtl"
          />
          <Select value={billingFilter} onValueChange={(v) => setBillingFilter(v as typeof billingFilter)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('targetingFilterAllStatus')}</SelectItem>
              <SelectItem value="unpaid">{t('filterUnpaid')}</SelectItem>
              <SelectItem value="partial">{t('filterPartial')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('targetingFilterAllTypes')}</SelectItem>
              <SelectItem value="owner">{t('targetingResidentOwner')}</SelectItem>
              <SelectItem value="tenant">{t('targetingResidentTenant')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={phoneFilter} onValueChange={(v) => setPhoneFilter(v as typeof phoneFilter)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('targetingFilterAllPhone')}</SelectItem>
              <SelectItem value="valid_only">{t('targetingFilterValidPhone')}</SelectItem>
            </SelectContent>
          </Select>
          {hasRecentlyContacted && (
            <Select value={cooldownFilter} onValueChange={(v) => setCooldownFilter(v as typeof cooldownFilter)}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('targetingFilterWithRecent')}</SelectItem>
                <SelectItem value="clear_only">{t('targetingFilterClearOnly')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Bypass cooldown toggle */}
        {hasRecentlyContacted && (
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="bypass-cooldown"
              checked={bypassCooldown}
              onCheckedChange={(v) => setBypassCooldown(!!v)}
            />
            <label htmlFor="bypass-cooldown" className="cursor-pointer text-muted-foreground">
              {t('targetingBypassCooldown')}
            </label>
          </div>
        )}

        {/* Candidates table */}
        <div className="max-h-72 overflow-y-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] py-2">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleAll}
                    aria-label={t('selectAll')}
                  />
                </TableHead>
                <TableHead className="py-2 text-xs">{t('apartment')}</TableHead>
                <TableHead className="py-2 text-xs">{t('resident')}</TableHead>
                <TableHead className="py-2 text-xs">{t('targetingTypeCol')}</TableHead>
                <TableHead className="py-2 text-xs">{t('remaining')}</TableHead>
                <TableHead className="py-2 text-xs">{t('status')}</TableHead>
                <TableHead className="py-2 text-xs">{t('targetingWarningsCol')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCandidates.map((c) => {
                const isSelected = selectedIds.has(c.apartmentId);
                return (
                  <TableRow
                    key={c.apartmentId}
                    className={isSelected ? '' : 'opacity-40'}
                    onClick={() => toggle(c.apartmentId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(c.apartmentId)}
                      />
                    </TableCell>
                    <TableCell className="py-2 font-medium text-sm">
                      {c.apartmentNumber}
                      {c.floor != null && (
                        <span className="text-xs text-muted-foreground ms-1">({c.floor})</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-sm">{c.residentName}</TableCell>
                    <TableCell className="py-2">
                      {c.residentType === 'owner' ? (
                        <Badge variant="secondary" className="text-xs">{t('targetingResidentOwner')}</Badge>
                      ) : c.residentType === 'tenant' ? (
                        <Badge variant="outline" className="text-xs">{t('targetingResidentTenant')}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-sm font-medium text-rose-600 tabular-nums">
                      ₪{c.balanceAmount.toLocaleString('he-IL', { minimumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="py-2">
                      {c.billingStatus === 'unpaid' ? (
                        <Badge variant="destructive" className="text-xs">{t('filterUnpaid')}</Badge>
                      ) : (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-xs">{t('filterPartial')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-0.5">
                        {!c.hasValidPhone && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <Phone className="h-3 w-3" />
                            {t('targetingNoPhone')}
                          </span>
                        )}
                        {c.cooldownStatus === 'recently_contacted' && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <TimerOff className="h-3 w-3" />
                            {c.daysSinceContact != null
                              ? t('targetingRecentDays', { days: c.daysSinceContact })
                              : t('targetingRecentContact')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {filteredCandidates.length < candidates.length && (
          <p className="text-xs text-muted-foreground">
            {t('targetingShowingFiltered', {
              shown: filteredCandidates.length,
              total: candidates.length,
            })}
          </p>
        )}

        {/* Generate action */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p>
              {selectedCount > 0
                ? `${selectedCount} נמענים נבחרו`
                : t('targetingNoneSelected')}
              {excludedCount > 0 && (
                <span className="ms-2 text-xs opacity-70">· {excludedCount} לא נכללו</span>
              )}
            </p>
            {selectedCount > 0 && warningCount > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {warningCount} מהנבחרים עלולים לא לקבל את ההודעה
              </p>
            )}
          </div>
          <Button
            onClick={() => onGenerate([...selectedIds], bypassCooldown)}
            disabled={selectedCount === 0 || generating}
            className="gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('batchGenerating')}
              </>
            ) : (
              <>
                <ClipboardCheck className="h-4 w-4" />
                {`צור קמפיין ל-${selectedCount} נמענים`}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ReviewPanel ──────────────────────────────────────────────────────────

interface ReviewPanelProps {
  batch: BatchSummary;
  period: string;
  approving: boolean;
  onApprove: () => void;
  onCancel: () => void;
}

function ReviewPanel({ batch, period, approving, onApprove, onCancel }: ReviewPanelProps) {
  const t = useTranslations('notifications');
  const { stats, skippedSummary } = batch;

  return (
    <Card className="border-amber-300 bg-amber-50/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base text-amber-900">{t('reviewTitle')}</CardTitle>
            </div>
            <CardDescription className="text-amber-700 mt-1">
              {t('reviewSubtitle', { period: formatMonthDisplay(period) })}
            </CardDescription>
          </div>
          {/* Primary CTA at top-right so it's immediately visible */}
          <Button onClick={onApprove} disabled={approving} className="gap-2 shrink-0">
            {approving ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{t('approving')}</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" />{t('approveBatch')}</>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Audience summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-background rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">{t('reviewRecipients')}</p>
          </div>
          <div className="bg-background rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{batch.audienceSummary.unpaid}</p>
            <p className="text-xs text-muted-foreground">{t('reviewUnpaid')}</p>
          </div>
          <div className="bg-background rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{batch.audienceSummary.partial}</p>
            <p className="text-xs text-muted-foreground">{t('reviewPartial')}</p>
          </div>
          {skippedSummary.total > 0 && (
            <div className="bg-background rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{skippedSummary.total}</p>
              <p className="text-xs text-muted-foreground">{t('reviewSkipped')}</p>
            </div>
          )}
        </div>

        {/* Skip breakdown */}
        {skippedSummary.total > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">לא נכללו בקמפיין:</p>
            <div className="flex flex-wrap gap-2">
              {skippedSummary.noPhone > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background border rounded-md px-2 py-1">
                  <Phone className="h-3.5 w-3.5" />
                  {`${skippedSummary.noPhone} ללא מספר טלפון`}
                </div>
              )}
              {skippedSummary.recentlyContacted > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background border rounded-md px-2 py-1">
                  <TimerOff className="h-3.5 w-3.5" />
                  {`${skippedSummary.recentlyContacted} נפנו לאחרונה (צינון)`}
                </div>
              )}
              {skippedSummary.manuallyExcluded > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background border rounded-md px-2 py-1">
                  <XCircle className="h-3.5 w-3.5" />
                  {`${skippedSummary.manuallyExcluded} הוצאו ידנית`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Instructional note + secondary cancel */}
        <div className="flex items-center justify-between pt-1 border-t border-amber-200">
          <p className="text-xs text-amber-700">
            לאחר האישור תוכלו לשלוח ידנית לכל דייר בטבלה מטה
          </p>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground text-xs gap-1">
            <XCircle className="h-3.5 w-3.5" />
            {t('batchCancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── BatchStatusPanel ─────────────────────────────────────────────────────

interface BatchStatusPanelProps {
  batch: BatchSummary;
  period: string;
  loading: boolean;
  onCancel: () => void;
  onRefresh: () => void;
}

function BatchStatusPanel({ batch, period, loading, onCancel, onRefresh }: BatchStatusPanelProps) {
  const t = useTranslations('notifications');
  const { stats } = batch;

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t('batchChecking')}</span>
        </CardContent>
      </Card>
    );
  }

  const periodLabel = formatMonthDisplay(period);

  // State-specific guidance text for the user
  const guidanceText = (() => {
    switch (batch.status) {
      case 'ready':
      case 'approved':
        return 'לחצו "שלח WhatsApp" ליד כל דייר בטבלה מטה לשלוח את ההודעה';
      case 'processing':
        return 'הקמפיין בעיבוד — ניתן לרענן לאחר מספר שניות';
      case 'completed':
        return stats.failed > 0
          ? `הסתיים עם ${stats.failed} כשלונות — לחצו "נסה שוב" בטבלה מטה`
          : 'כל ההודעות נשלחו — ניתן ליצור קמפיין חדש לחודש הבא';
      case 'failed':
        return 'השליחה נכשלה — לחצו "נסה שוב" ליד כל פריט נכשל בטבלה';
      default:
        return null;
    }
  })();

  return (
    <Card className="bg-muted/30">
      <CardContent className="py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary/70" />
            <div>
              <p className="text-sm font-semibold">
                {t('batchTitle')} — {periodLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('batchAudience', { total: batch.audienceSummary.total })}
                {batch.skippedCount > 0 && (
                  <span className="ms-2 text-muted-foreground/70">
                    · {t('batchSkippedShort', { count: batch.skippedCount })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onRefresh} title={t('batchRefresh')}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {batch.status !== 'cancelled' && batch.status !== 'completed' && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onCancel}
              >
                <XCircle className="h-4 w-4 ms-1" />
                {t('batchCancel')}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {t('statPending')}: {stats.pending}
          </span>
          <span className="flex items-center gap-1 text-blue-600">
            <MessageCircle className="h-3.5 w-3.5" />
            {t('statOpened')}: {stats.openedManual}
          </span>
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('statSent')}: {stats.sent}
          </span>
          {(stats.delivered ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCheck className="h-3.5 w-3.5" />
              נמסר: {stats.delivered}
            </span>
          )}
          {stats.failed > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <XCircle className="h-3.5 w-3.5" />
              {t('statFailed')}: {stats.failed}
            </span>
          )}
        </div>

        {/* State-specific guidance */}
        {guidanceText && (
          <p className="text-xs text-muted-foreground border-t pt-2 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            {guidanceText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Item status badge ────────────────────────────────────────────────────

function ItemStatusBadge({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'draft':
      return <Badge variant="outline" className="text-xs text-muted-foreground">טיוטה</Badge>;
    case 'queued':
      return <Badge variant="secondary" className="text-sky-700 bg-sky-50 border-sky-200 text-xs">בתור</Badge>;
    case 'opened_manual':
      return <Badge variant="secondary" className="text-blue-700 bg-blue-50 border-blue-200 text-xs">נפתח</Badge>;
    case 'retrying':
      return <Badge variant="secondary" className="text-amber-700 bg-amber-50 border-amber-200 text-xs">בניסיון חוזר</Badge>;
    case 'sent':
      return <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200 text-xs">נשלח ✓</Badge>;
    case 'delivered':
      return <Badge variant="secondary" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-xs">נמסר ✓✓</Badge>;
    case 'read':
      return <Badge variant="secondary" className="text-teal-700 bg-teal-50 border-teal-200 text-xs">נקרא</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="text-xs">נכשל</Badge>;
    case 'cancelled':
      return <Badge variant="outline" className="text-xs text-muted-foreground">בוטל</Badge>;
    default:
      return <Badge variant="outline" className="text-xs text-muted-foreground">ממתין</Badge>;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const tBilling = useTranslations('billing');
  const tErrors = useTranslations('errors');

  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partial'>('unpaid');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  // Batch state
  const [currentBatch, setCurrentBatch] = useState<BatchSummary | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [approvingBatch, setApprovingBatch] = useState(false);
  const [batchItemMap, setBatchItemMap] = useState<Record<string, BatchItemRecord>>({});

  // Compose state
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsSummary | null>(null);

  // Targeting state
  const [candidates, setCandidates] = useState<NotificationCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const buildingName = data?.buildingName ?? '';

  // ── Initialise default template selection when templates load ──
  const didInitTemplate = useRef(false);
  useEffect(() => {
    if (!didInitTemplate.current && templates.length > 0) {
      const def = templates.find((t) => t.isDefault);
      if (def) setSelectedTemplateId(def._id);
      didInitTemplate.current = true;
    }
  }, [templates]);

  // ── Fetch billing data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/monthly?period=${period}&includeResidents=true`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setSelectedIds(new Set());
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch { toast.error(tErrors('generic')); }
    finally { setLoading(false); }
  }, [period, tErrors]);

  // ── Fetch batch for current month ──
  const fetchBatch = useCallback(async () => {
    setBatchLoading(true);
    try {
      const res = await fetch(`/api/notifications/batches?month=${period}`);
      const result = await res.json();
      if (result.success && result.data.length > 0) {
        const batch: BatchSummary = result.data[0];
        setCurrentBatch(batch);

        const itemsRes = await fetch(`/api/notifications/items?batchId=${batch._id}`);
        const itemsResult = await itemsRes.json();
        if (itemsResult.success) {
          const map: Record<string, BatchItemRecord> = {};
          for (const item of itemsResult.data) {
            const apartmentId =
              typeof item.apartmentId === 'string'
                ? item.apartmentId
                : item.apartmentId?._id;
            if (apartmentId) {
              map[apartmentId] = {
                _id: item._id,
                status: item.status,
                retryCount: item.retryCount,
                maxRetries: item.maxRetries,
                failureCode: item.failureCode,
                failureReason: item.failureReason,
              };
            }
          }
          setBatchItemMap(map);
        }
      } else {
        setCurrentBatch(null);
        setBatchItemMap({});
      }
    } catch { /* non-critical */ }
    finally { setBatchLoading(false); }
  }, [period]);

  // ── Fetch templates + settings (once) ──
  const fetchComposeData = useCallback(async () => {
    try {
      const [tplRes, settingsRes] = await Promise.all([
        fetch('/api/notifications/templates?type=payment_reminder&channel=whatsapp_manual'),
        fetch('/api/notifications/settings'),
      ]);
      const [tplData, settingsData] = await Promise.all([tplRes.json(), settingsRes.json()]);
      if (tplData.success) setTemplates(tplData.data);
      if (settingsData.success) setNotificationSettings(settingsData.data);
    } catch { /* non-critical */ }
  }, []);

  // ── Fetch targeting candidates ──
  const fetchCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    setCandidates([]);
    try {
      const res = await fetch(`/api/notifications/candidates?month=${period}`);
      const result = await res.json();
      if (result.success) setCandidates(result.data);
    } catch { /* non-critical */ }
    finally { setCandidatesLoading(false); }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchBatch(); }, [fetchBatch]);
  useEffect(() => { fetchComposeData(); }, [fetchComposeData]);
  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  // ── Generate batch (called by TargetingPanel with explicit selection) ──
  const handleGenerateBatch = async (
    includeApartmentIds: string[],
    bypassCooldown: boolean
  ) => {
    setGeneratingBatch(true);
    try {
      const body: Record<string, unknown> = { month: period, channel: 'whatsapp_manual' };
      if (selectedTemplateId) body.templateId = selectedTemplateId;
      if (customMessage.trim()) body.customMessage = customMessage.trim();
      if (includeApartmentIds.length > 0) body.includeApartmentIds = includeApartmentIds;
      if (bypassCooldown) body.bypassCooldown = true;

      const res = await fetch('/api/notifications/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(
          result.data.created
            ? t('batchCreated', { count: result.data.itemCount })
            : t('batchAlreadyExists')
        );
        await fetchBatch();
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch { toast.error(tErrors('generic')); }
    finally { setGeneratingBatch(false); }
  };

  // ── Approve batch ──
  const handleApproveBatch = async () => {
    if (!currentBatch) return;
    setApprovingBatch(true);
    try {
      const res = await fetch(`/api/notifications/batches/${currentBatch._id}/approve`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        toast.success(t('batchApproved'));
        await fetchBatch();
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch { toast.error(tErrors('generic')); }
    finally { setApprovingBatch(false); }
  };

  // ── Cancel batch ──
  const handleCancelBatch = async () => {
    if (!currentBatch) return;
    try {
      const res = await fetch(`/api/notifications/batches/${currentBatch._id}/cancel`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        toast.success(t('batchCancelled'));
        await fetchBatch();
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch { toast.error(tErrors('generic')); }
  };

  // ── Retry item ──
  const handleRetryItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/notifications/items/${itemId}/retry`, { method: 'POST' });
      const result = await res.json();
      if (result.success) { toast.success(t('itemRetried')); await fetchBatch(); }
      else toast.error(result.error || tErrors('generic'));
    } catch { toast.error(tErrors('generic')); }
  };

  // ── Filter / helpers ──
  const filteredApartments = data?.apartments.filter((apt) => {
    if (filter === 'all') return apt.status === 'unpaid' || apt.status === 'partial';
    return apt.status === filter;
  }) || [];

  const navigateMonth = (delta: number) => {
    const [year, month] = period.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const getResidentInfo = (apt: ApartmentBilling) => {
    if (!apt.residents?.length) return { name: 'דייר/ת', phone: null };
    const owner = apt.residents.find((r) => r.type === 'owner');
    const resident = owner || apt.residents[0];
    return { name: resident.fullName, phone: resident.phone || null };
  };

  // ── Build WhatsApp message (preserved exactly from Phase 2) ──
  const buildMessage = (apt: ApartmentBilling) => {
    const { name } = getResidentInfo(apt);
    const building = data?.buildingName || 'ועד הבית';
    const amount = apt.remaining > 0 ? apt.remaining : apt.monthlyDue;
    const reference = `VAAD-${apt.apartmentNumber}-${period}`;
    const invoiceUrl = `${window.location.origin}/billing/invoice/${apt.chargeId}`;
    const periodDisplay = formatMonthDisplay(period);

    return `שלום ${name},

תזכורת ידידותית לתשלום ועד בית עבור ${periodDisplay}.

סכום לתשלום: ₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
אסמכתא: ${reference}

לצפייה בחשבונית:
${invoiceUrl}

תודה,
${building}`;
  };

  // ── Send WhatsApp (preserved exactly + optional item tracking) ──
  const handleSendWhatsapp = async (
    apt: ApartmentBilling,
    source: 'row_action' | 'bulk_send' = 'row_action'
  ) => {
    const { name, phone } = getResidentInfo(apt);
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      toast.error(phone ? t('invalidPhone') : t('missingPhone'));
      return false;
    }

    const message = buildMessage(apt);
    window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    toast.success(t('openWhatsapp'));

    const invoiceUrl = `${window.location.origin}/billing/invoice/${apt.chargeId}`;
    const reference = `VAAD-${apt.apartmentNumber}-${period}`;
    const amount = apt.remaining > 0 ? apt.remaining : apt.monthlyDue;

    // Original fire-and-forget audit (preserved, unchanged)
    fetch('/api/notifications/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId: apt.chargeId, apartmentId: apt.apartmentId, apartmentNumber: apt.apartmentNumber, period, amount, reference, invoiceUrl, residentName: name, phone: normalizedPhone, source }),
    }).catch((err) => { if (process.env.NODE_ENV === 'development') console.warn('Failed to log notification:', err); });

    // Track against NotificationItem if a batch exists
    if (currentBatch && ['ready', 'approved', 'processing'].includes(currentBatch.status)) {
      fetch('/api/notifications/items/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: currentBatch._id, apartmentId: apt.apartmentId }),
      })
        .then(async (res) => {
          if (res.ok) {
            setBatchItemMap((prev) => {
              const existing = prev[apt.apartmentId];
              if (existing && ['pending', 'queued', 'failed'].includes(existing.status)) {
                return { ...prev, [apt.apartmentId]: { ...existing, status: 'opened_manual' } };
              }
              return prev;
            });
          }
        })
        .catch(() => { /* non-critical */ });
    }

    return true;
  };

  const handleBulkSend = async () => {
    const selected = filteredApartments.filter((a) => selectedIds.has(a.apartmentId));
    if (!selected.length) { toast.error(t('noSelection')); return; }
    const withPhone = selected.filter((a) => normalizePhone(getResidentInfo(a).phone) !== null);
    if (!withPhone.length) { toast.error(t('missingPhone')); return; }

    setSendingBulk(true);
    setBulkProgress({ current: 0, total: withPhone.length });
    for (let i = 0; i < withPhone.length; i++) {
      setBulkProgress({ current: i + 1, total: withPhone.length });
      const ok = await handleSendWhatsapp(withPhone[i], 'bulk_send');
      if (!ok) { toast.error(t('allowPopups')); break; }
      if (i < withPhone.length - 1) await new Promise((r) => setTimeout(r, 750));
    }
    setSendingBulk(false);
    setSelectedIds(new Set());
  };

  const toggleSelection = (id: string) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === filteredApartments.length ? new Set() : new Set(filteredApartments.map((a) => a.apartmentId)));
  };

  const getBillingStatusBadge = (status: string) => {
    if (status === 'unpaid') return <Badge variant="destructive">{tBilling('unpaid')}</Badge>;
    if (status === 'partial') return <Badge className="bg-amber-500 hover:bg-amber-600">{tBilling('partial')}</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  const selectedApartments = filteredApartments.filter((a) => selectedIds.has(a.apartmentId));
  const apartmentsWithPhone = selectedApartments.filter((a) => normalizePhone(getResidentInfo(a).phone) !== null);
  const apartmentsWithoutPhone = selectedApartments.length - apartmentsWithPhone.length;
  const hasBatchItems = Object.keys(batchItemMap).length > 0;

  // An active batch is one that isn't cancelled — cancelled batches should let
  // the user start a new campaign just like having no batch at all.
  const isActiveBatch = currentBatch && currentBatch.status !== 'cancelled';

  // Determine which top panel to show
  const showCompose = !batchLoading && !isActiveBatch;
  const showReview = !batchLoading && currentBatch?.status === 'ready_for_review';
  const showStatus = !batchLoading && isActiveBatch && currentBatch!.status !== 'ready_for_review';

  // Candidate eligibility counts for the StatusBanner
  const eligibleCandidates = candidates.filter(
    (c) => c.hasValidPhone && c.cooldownStatus === 'clear'
  ).length;

  return (
    <div className="flex flex-col h-full">
      <Header title={t('title')} />

      <div className="flex-1 p-4 lg:p-6 space-y-4">

        {/* ── Context banner: always visible, tells user their current state ── */}
        <StatusBanner
          batchLoading={batchLoading}
          currentBatch={currentBatch}
          period={period}
          candidatesLoading={candidatesLoading}
          totalCandidates={candidates.length}
          eligibleCandidates={eligibleCandidates}
        />

        {/* ── Compose + targeting panels (no active batch) ── */}
        {showCompose && (
          <>
            <ComposePanel
              period={period}
              buildingName={buildingName}
              templates={templates}
              settings={notificationSettings}
              selectedTemplateId={selectedTemplateId}
              customMessage={customMessage}
              showEditor={showEditor}
              onTemplateChange={setSelectedTemplateId}
              onCustomMessageChange={setCustomMessage}
              onToggleEditor={() => setShowEditor((v) => !v)}
            />
            <TargetingPanel
              candidates={candidates}
              loading={candidatesLoading}
              generating={generatingBatch}
              onGenerate={handleGenerateBatch}
            />
          </>
        )}

        {/* ── Review panel (ready_for_review) ── */}
        {showReview && currentBatch && (
          <ReviewPanel
            batch={currentBatch}
            period={period}
            approving={approvingBatch}
            onApprove={handleApproveBatch}
            onCancel={handleCancelBatch}
          />
        )}

        {/* ── Batch status panel (ready / approved / processing / completed / failed) ── */}
        {showStatus && currentBatch && (
          <BatchStatusPanel
            batch={currentBatch}
            period={period}
            loading={false}
            onCancel={handleCancelBatch}
            onRefresh={fetchBatch}
          />
        )}

        {/* ── Controls: month navigation + table filters ── */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('month')}:</span>
                <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="px-4 py-2 bg-muted rounded-md min-w-[180px] text-center">
                  <span className="font-semibold">{formatMonthDisplay(period)}</span>
                </div>
                <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('filter')}:</span>
                <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">{t('filterUnpaid')}</SelectItem>
                    <SelectItem value="partial">{t('filterPartial')}</SelectItem>
                    <SelectItem value="all">{t('filterAll')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 ms-auto">
                {selectedIds.size > 0 && (
                  <span className="text-sm text-muted-foreground">{t('selected')}: {selectedIds.size}</span>
                )}
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={selectedIds.size === 0}>
                  <Eye className="h-4 w-4 ms-2" />
                  {t('preview')}
                </Button>
                <Button size="sm" onClick={handleBulkSend} disabled={selectedIds.size === 0 || sendingBulk}>
                  {sendingBulk ? (
                    <><Loader2 className="h-4 w-4 ms-2 animate-spin" />{t('sendingProgress', bulkProgress)}</>
                  ) : (
                    <><Send className="h-4 w-4 ms-2" />{t('sendSelected')}</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Table ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">{t('paymentReminders')}</CardTitle>
                <CardDescription>
                  {filteredApartments.length > 0
                    ? `${filteredApartments.length} ${t('apartment')}`
                    : null}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredApartments.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">
                  {filter === 'unpaid'
                    ? 'אין דיירים עם חיוב פתוח מלא לחודש זה'
                    : filter === 'partial'
                      ? 'אין דיירים עם תשלום חלקי לחודש זה'
                      : 'אין חיובים פתוחים לחודש זה'}
                </p>
                <p className="text-xs text-muted-foreground">
                  נסו לבחור חודש אחר או לשנות את הסינון
                </p>
              </div>
            ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">
                            <Checkbox
                              checked={selectedIds.size === filteredApartments.length && filteredApartments.length > 0}
                              onCheckedChange={toggleSelectAll}
                              aria-label={t('selectAll')}
                            />
                          </TableHead>
                          <TableHead>{t('apartment')}</TableHead>
                          <TableHead>{t('resident')}</TableHead>
                          <TableHead>{t('remaining')}</TableHead>
                          <TableHead>{t('status')}</TableHead>
                          {hasBatchItems && <TableHead>{t('notificationStatus')}</TableHead>}
                          <TableHead>{t('invoice')}</TableHead>
                          <TableHead>{t('whatsapp')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApartments.map((apt) => {
                          const { name, phone } = getResidentInfo(apt);
                          const hasValidPhone = normalizePhone(phone) !== null;
                          const itemRecord = batchItemMap[apt.apartmentId];

                          return (
                            <TableRow key={apt.apartmentId}>
                              <TableCell>
                                <Checkbox checked={selectedIds.has(apt.apartmentId)} onCheckedChange={() => toggleSelection(apt.apartmentId)} />
                              </TableCell>
                              <TableCell className="font-medium">
                                {apt.apartmentNumber}
                                {apt.floor !== undefined && <span className="text-xs text-muted-foreground ms-2">קומה {apt.floor}</span>}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span>{name}</span>
                                  {!hasValidPhone && (
                                    <span className="text-xs text-amber-600 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />{t('missingPhone')}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-rose-600 font-medium">
                                {formatCurrency(apt.remaining, data?.currency)}
                              </TableCell>
                              <TableCell>{getBillingStatusBadge(apt.status)}</TableCell>
                              {hasBatchItems && (
                                <TableCell>
                                  {itemRecord ? (
                                    <div className="flex items-center gap-2">
                                      <ItemStatusBadge status={itemRecord.status} />
                                      {itemRecord.status === 'failed' && itemRecord.retryCount < itemRecord.maxRetries && (
                                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleRetryItem(itemRecord._id)}>
                                          <RefreshCw className="h-3 w-3 ms-1" />{t('retry')}
                                        </Button>
                                      )}
                                      {itemRecord.status === 'failed' && itemRecord.failureCode && (
                                        <span className="text-[11px] text-destructive">{itemRecord.failureCode}</span>
                                      )}
                                    </div>
                                  ) : <span className="text-xs text-muted-foreground">—</span>}
                                </TableCell>
                              )}
                              <TableCell>
                                {apt.chargeId && (
                                  <Button variant="ghost" size="sm" asChild>
                                    <Link href={`/billing/invoice/${apt.chargeId}`}>
                                      <FileText className="h-4 w-4 ms-1" />{t('viewInvoice')}
                                    </Link>
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>
                                {apt.chargeId && (
                                  <Button variant="outline" size="sm" onClick={() => handleSendWhatsapp(apt)} disabled={!hasValidPhone}>
                                    <MessageCircle className="h-4 w-4 ms-1" />{t('sendWhatsapp')}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
      </div>

      {/* ── Preview Dialog ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('previewTitle')}</DialogTitle>
            <DialogDescription>{t('previewCount', { count: selectedApartments.length })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {apartmentsWithoutPhone > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 rounded-lg">
                <AlertTriangle className="h-5 w-5" />
                <span>{t('warningMissingPhones', { count: apartmentsWithoutPhone })}</span>
              </div>
            )}
            <div>
              <h4 className="font-medium mb-2">{t('messagePreview')}</h4>
              <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm font-mono" dir="rtl">
                {selectedApartments.length > 0 ? buildMessage(selectedApartments[0]) : ''}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">{t('selected')} ({apartmentsWithPhone.length})</h4>
              <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                {selectedApartments.map((apt) => {
                  const { name, phone } = getResidentInfo(apt);
                  const hasValidPhone = normalizePhone(phone) !== null;
                  return (
                    <div key={apt.apartmentId} className="flex items-center justify-between p-2 text-sm">
                      <span>{t('apartment')} {apt.apartmentNumber} - {name}</span>
                      {!hasValidPhone && <Badge variant="outline" className="text-amber-600">{t('missingPhone')}</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>{tCommon('close')}</Button>
            <Button onClick={() => { setPreviewOpen(false); handleBulkSend(); }} disabled={apartmentsWithPhone.length === 0}>
              <Send className="h-4 w-4 ms-2" />
              {t('sendSelected')} ({apartmentsWithPhone.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
