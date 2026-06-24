'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  Wrench, 
  TrendingUp,
  Home,
  Clock,
  ArrowRight,
  Users,
  BellRing,
  ClipboardCheck,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDateTime } from '@/lib/hooks';

interface DashboardData {
  type: 'resident' | 'management';
  apartment?: {
    _id: string;
    number: string;
    floor?: number;
  };
  balance?: {
    totalCharges: number;
    totalPayments: number;
    balance: number;
    currency: string;
  };
  recentTickets?: Array<{
    _id: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
  }>;
  overview?: {
    totalApartments: number;
    outstandingBalance: number;
    totalOpenCharges: number;
    totalConfirmedPayments: number;
  };
  tickets?: {
    open: number;
    urgent: number;
    byStatus: Record<string, number>;
  };
  paymentsThisMonth?: {
    total: number;
    count: number;
  };
  recentActivity?: Array<{
    _id: string;
    action: string;
    entityType: string;
    actorName: string;
    createdAt: string;
  }>;
}

interface ExecutiveSummaryData {
  period: string;
  currency: string;
  scopes: {
    financialSnapshot: 'period';
    totalOpenBalance: 'all_time';
  };
  currencyContext: {
    buildingCurrency: string;
    periodCurrency: string;
    totalOpenBalanceCurrency: string;
    isPeriodCurrencyDerivedFromCharges: boolean;
  };
  kpis: {
    totalApartments: number;
    activeResidents: number;
    unpaidApartments: number;
    unpaidResidents: number;
    totalOpenBalance: number;
    totalPaidThisMonth: number;
    openTickets: number;
    notificationsSentThisMonth: number;
    notificationsOpenedThisMonth: number;
    notificationDeliveryRatePct: number;
    notificationReadRatePct: number;
    notificationFailureRatePct: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    netPosition: number;
    topExpenseVendorName: string;
    topExpenseVendorAmount: number;
    openTicketsWithoutInvoice: number;
    pendingApprovalBatches: number;
    totalOpenBalanceScope: 'all_time';
  };
  financialSnapshot: {
    scope: 'period';
    totalCharged: number;
    totalPaid: number;
    remainingBalance: number;
    collectionRatePct: number;
    breakdown: {
      paid: number;
      partial: number;
      unpaid: number;
      noCharge: number;
    };
  };
  attentionRequired: {
    unpaidApartments: { count: number; href: string };
    openTickets: { count: number; href: string };
    pendingApprovalBatches: { count: number; href: string };
    failedNotifications: { count: number; href: string };
    openTicketsWithoutInvoice: { count: number; href: string };
    residentsMissingPhone: { count: number; href: string };
    apartmentsWithoutResidents: { count: number; href: string };
  };
  recentActivity: Array<{
    id: string;
    actionLabelHe: string;
    actor: string;
    timestamp: string;
    summary?: string;
    href?: string;
  }>;
  emptyStateHints: Array<{
    key: string;
    title: string;
    description: string;
    href: string;
  }>;
}

function getCurrentPeriod() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const t = useTranslations('dashboard');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [summary, setSummary] = useState<ExecutiveSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const response = await fetch('/api/dashboard');
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  useEffect(() => {
    async function fetchSummary() {
      if (loading || data?.type !== 'management') return;
      setSummaryLoading(true);
      try {
        const response = await fetch(`/api/dashboard/summary?period=${period}`);
        const result = await response.json();
        if (result.success) {
          setSummary(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch executive summary:', error);
      } finally {
        setSummaryLoading(false);
      }
    }

    fetchSummary();
  }, [loading, data?.type, period]);

  const isResident = data?.type === 'resident';
  const userName = session?.user?.name?.split(' ')[0] || '';

  return (
    <div className="flex flex-col h-full">
      <Header title={t('welcome', { name: userName })} />
      
      <div className="flex-1 p-4 lg:p-6 space-y-6">
        {loading ? (
          <DashboardSkeleton />
        ) : isResident ? (
          <ResidentDashboard data={data} />
        ) : (
          <ManagementDashboard data={data} summary={summary} period={period} onPeriodChange={setPeriod} summaryLoading={summaryLoading} />
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResidentDashboard({ data }: { data: DashboardData | null }) {
  const t = useTranslations('dashboard');
  const tBilling = useTranslations('billing');
  const tTickets = useTranslations('tickets');
  const tApartments = useTranslations('apartments');
  const balance = data?.balance;
  const hasBalance = balance && balance.balance > 0;

  return (
    <div className="space-y-6">
      {/* Apartment Info */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-primary/10">
          <Home className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('yourApartment')}</p>
          <p className="text-lg font-semibold">
            {tApartments('apartmentNumber')} {data?.apartment?.number || 'N/A'}
            {data?.apartment?.floor && ` • ${tApartments('floor')} ${data.apartment.floor}`}
          </p>
        </div>
      </div>

      {/* Balance Card */}
      <Card className={hasBalance ? 'border-amber-200 bg-amber-50/50' : 'border-green-200 bg-green-50/50'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('yourBalance')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${hasBalance ? 'text-amber-700' : 'text-green-700'}`}>
              {formatCurrency(balance?.balance || 0, balance?.currency)}
            </span>
            {!hasBalance && (
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                {t('paidUp')}
              </Badge>
            )}
          </div>
          {hasBalance && (
            <p className="text-sm text-amber-600 mt-2">
              {t('pleasePayBalance')}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button asChild size="sm">
              <Link href="/billing">{tBilling('myStatement')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{tBilling('totalDue')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(balance?.totalCharges || 0, balance?.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{tBilling('totalPaid')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(balance?.totalPayments || 0, balance?.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tickets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t('myTickets')}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/tickets">
                {t('viewAll')} <ArrowRight className="mr-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data?.recentTickets?.length ? (
            <div className="space-y-3">
              {data.recentTickets.map((ticket) => (
                <Link
                  key={ticket._id}
                  href={`/tickets/${ticket._id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{ticket.title}</span>
                  </div>
                  <Badge variant={ticket.priority === 'urgent' ? 'destructive' : 'secondary'}>
                    {ticket.status}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              {t('noOpenTickets')}
            </p>
          )}
          <div className="mt-4">
            <Button asChild variant="outline" className="w-full">
              <Link href="/tickets">{tTickets('addTicket')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ManagementDashboard({
  data,
  summary,
  period,
  onPeriodChange,
  summaryLoading,
}: {
  data: DashboardData | null;
  summary: ExecutiveSummaryData | null;
  period: string;
  onPeriodChange: (value: string) => void;
  summaryLoading: boolean;
}) {
  const t = useTranslations('dashboard');
  const tBilling = useTranslations('billing');
  const tTickets = useTranslations('tickets');
  const executive = summary;
  const periodBillingHref = `/billing?tab=monthly&period=${period}`;
  const periodGenerateHref = `/billing?tab=generate&period=${period}`;
  
  return (
    <div className="space-y-6">
      {/* Executive KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={t('kpiTotalApartments')} value={executive?.kpis.totalApartments ?? data?.overview?.totalApartments ?? 0} icon={<Home className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard title={t('kpiActiveResidents')} value={executive?.kpis.activeResidents ?? 0} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard title={t('kpiUnpaidApartmentsResidents')} value={`${executive?.kpis.unpaidApartments ?? 0} / ${executive?.kpis.unpaidResidents ?? 0}`} icon={<AlertCircle className="h-4 w-4 text-amber-600" />} />
        <KpiCard
          title={t('kpiTotalOpenBalanceAllTime')}
          value={formatCurrency(
            executive?.kpis.totalOpenBalance ?? data?.overview?.outstandingBalance ?? 0,
            executive?.currencyContext.totalOpenBalanceCurrency ?? executive?.currency
          )}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard title={t('kpiPaidThisMonth')} value={formatCurrency(executive?.kpis.totalPaidThisMonth ?? data?.paymentsThisMonth?.total ?? 0, executive?.currency)} icon={<TrendingUp className="h-4 w-4 text-green-600" />} />
        <KpiCard title={t('kpiOpenTickets')} value={executive?.kpis.openTickets ?? data?.tickets?.open ?? 0} icon={<Wrench className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard title={t('kpiNotificationsThisMonth')} value={`${executive?.kpis.notificationsSentThisMonth ?? 0} / ${executive?.kpis.notificationsOpenedThisMonth ?? 0}`} icon={<BellRing className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard title={t('kpiPendingApprovalBatches')} value={executive?.kpis.pendingApprovalBatches ?? 0} icon={<ClipboardCheck className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard title={t('kpiNotificationDeliveryRate')} value={`${(executive?.kpis.notificationDeliveryRatePct ?? 0).toFixed(1)}%`} icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} />
        <KpiCard title={t('kpiNotificationReadRate')} value={`${(executive?.kpis.notificationReadRatePct ?? 0).toFixed(1)}%`} icon={<TrendingUp className="h-4 w-4 text-blue-600" />} />
        <KpiCard title={t('kpiNotificationFailureRate')} value={`${(executive?.kpis.notificationFailureRatePct ?? 0).toFixed(1)}%`} icon={<AlertCircle className="h-4 w-4 text-red-600" />} />
        <KpiCard title={t('kpiMonthlyIncome')} value={formatCurrency(executive?.kpis.monthlyIncome ?? 0, executive?.currency)} icon={<TrendingUp className="h-4 w-4 text-green-600" />} />
        <KpiCard title={t('kpiMonthlyExpenses')} value={formatCurrency(executive?.kpis.monthlyExpenses ?? 0, executive?.currency)} icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard
          title={t('kpiNetPosition')}
          value={formatCurrency(executive?.kpis.netPosition ?? 0, executive?.currency)}
          icon={<DollarSign className={`h-4 w-4 ${(executive?.kpis.netPosition ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />}
        />
        <KpiCard title={t('kpiTopExpenseVendor')} value={executive?.kpis.topExpenseVendorName || '—'} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard title={t('kpiOpenTicketsWithoutInvoice')} value={executive?.kpis.openTicketsWithoutInvoice ?? 0} icon={<AlertCircle className="h-4 w-4 text-amber-600" />} />
      </div>

      {/* Financial snapshot */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{t('financialSnapshotTitle')}</CardTitle>
              <CardDescription>{t('financialSnapshotDesc')}</CardDescription>
            </div>
            <input
              type="month"
              value={period}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('snapshotTotalChargedSelectedPeriod')}</p>
            <p className="text-2xl font-bold">
              {formatCurrency(executive?.financialSnapshot.totalCharged || 0, executive?.currencyContext.periodCurrency || executive?.currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('snapshotTotalPaidSelectedPeriod')}</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(executive?.financialSnapshot.totalPaid || 0, executive?.currencyContext.periodCurrency || executive?.currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('snapshotRemainingSelectedPeriod')}</p>
            <p className="text-2xl font-bold text-amber-600">
              {formatCurrency(executive?.financialSnapshot.remainingBalance || 0, executive?.currencyContext.periodCurrency || executive?.currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('snapshotCollectionRate')}</p>
            <p className="text-2xl font-bold">{(executive?.financialSnapshot.collectionRatePct ?? 0).toFixed(1)}%</p>
          </div>
          <div className="sm:col-span-2 xl:col-span-4">
            <p className="text-xs text-muted-foreground">
              {t('snapshotAllTimeBalanceLabel')}{' '}
              <span className="font-semibold">
                {formatCurrency(
                  executive?.kpis.totalOpenBalance ?? 0,
                  executive?.currencyContext.totalOpenBalanceCurrency ?? executive?.currency
                )}
              </span>
            </p>
          </div>
          <div className="sm:col-span-2 xl:col-span-4 flex flex-wrap gap-2">
            <Badge variant="secondary">{tBilling('paid')}: {executive?.financialSnapshot.breakdown.paid ?? 0}</Badge>
            <Badge className="bg-amber-500 hover:bg-amber-600">{tBilling('partial')}: {executive?.financialSnapshot.breakdown.partial ?? 0}</Badge>
            <Badge variant="destructive">{tBilling('unpaid')}: {executive?.financialSnapshot.breakdown.unpaid ?? 0}</Badge>
            <Badge variant="outline">{tBilling('noCharge')}: {executive?.financialSnapshot.breakdown.noCharge ?? 0}</Badge>
          </div>
          {(executive?.financialSnapshot.totalCharged ?? 0) === 0 && (
            <div className="sm:col-span-2 xl:col-span-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">{t('periodNoChargesTitle')}</p>
              <p className="mt-1 text-xs">{t('periodNoChargesDesc')}</p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href={periodGenerateHref}>{t('goToMonthlyGenerationForPeriod')}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attention + Quick actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('attentionRequiredTitle')}</CardTitle>
            <CardDescription>{t('attentionRequiredDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <AttentionRow label={t('attentionUnpaidApartments')} item={executive?.attentionRequired.unpaidApartments} />
            <AttentionRow label={t('attentionOpenTickets')} item={executive?.attentionRequired.openTickets} />
            <AttentionRow label={t('attentionPendingApproval')} item={executive?.attentionRequired.pendingApprovalBatches} />
            <AttentionRow label={t('attentionFailedNotifications')} item={executive?.attentionRequired.failedNotifications} />
            <AttentionRow label={t('attentionOpenTicketsWithoutInvoice')} item={executive?.attentionRequired.openTicketsWithoutInvoice} />
            <AttentionRow label={t('attentionMissingPhones')} item={executive?.attentionRequired.residentsMissingPhone} />
            <AttentionRow label={t('attentionApartmentsWithoutResidents')} item={executive?.attentionRequired.apartmentsWithoutResidents} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('quickActions')}</CardTitle>
            <CardDescription>{t('commonManagementTasks')}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Button asChild variant="outline" className="h-auto py-4 text-wrap">
              <Link href="/notifications">{t('quickCreateReminderCampaign')}</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 text-wrap">
              <Link href="/residents">{t('quickAddResident')}</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 text-wrap">
              <Link href="/apartments">{t('quickAddApartment')}</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 text-wrap">
              <Link href="/billing?tab=payments">{tBilling('recordPayment')}</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 text-wrap">
              <Link href="/tickets">{tTickets('addTicket')}</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 text-wrap">
              <Link href={periodBillingHref}>{t('quickGoToBillingMonth')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Empty states */}
      {!!executive?.emptyStateHints.length && (
        <Card>
          <CardHeader>
            <CardTitle>{t('emptyStateTitle')}</CardTitle>
            <CardDescription>{t('emptyStateDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {executive.emptyStateHints.map((hint) => (
              <Link
                key={hint.key}
                href={hint.href}
                className="block rounded-lg border p-3 transition-colors hover:bg-muted/40"
              >
                <p className="font-medium">{hint.title}</p>
                <p className="text-sm text-muted-foreground">{hint.description}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('recentActivity')}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/audit-log">
                {t('viewAll')} <ArrowRight className="mr-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {executive?.recentActivity?.length ? (
            <div className="space-y-3">
              {executive.recentActivity.map((activity) => (
                <Link key={activity.id} href={activity.href || '/audit-log'} className="flex items-start gap-3 text-sm rounded-md p-2 hover:bg-muted/40">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {activity.actionLabelHe} • {activity.actor}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(activity.timestamp)}
                    </p>
                    {activity.summary && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {activity.summary}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">{t('noRecentActivity')}</p>
          )}
          {summaryLoading && <p className="text-xs text-muted-foreground mt-3">{t('loadingExecutiveData')}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function AttentionRow({
  label,
  item,
}: {
  label: string;
  item?: { count: number; href: string };
}) {
  const count = item?.count || 0;
  const href = item?.href || '/dashboard';

  return (
    <Link href={href} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/40">
      <span className="text-sm">{label}</span>
      {count > 0 ? (
        <Badge variant="destructive">{count}</Badge>
      ) : (
        <Badge variant="outline" className="text-green-700 border-green-300">
          <CheckCircle2 className="h-3 w-3 me-1" />
          תקין
        </Badge>
      )}
    </Link>
  );
}

