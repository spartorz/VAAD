'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  AlertTriangle, 
  Wrench, 
  TrendingUp,
  Home,
  Clock,
  ArrowRight,
  FileText
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

export default function DashboardPage() {
  const { data: session } = useSession();
  const t = useTranslations('dashboard');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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
          <ManagementDashboard data={data} />
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

function ManagementDashboard({ data }: { data: DashboardData | null }) {
  const t = useTranslations('dashboard');
  const tBilling = useTranslations('billing');
  const tApartments = useTranslations('apartments');
  const tDocuments = useTranslations('documents');
  
  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalApartments')}</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.overview?.totalApartments || 0}</div>
            <p className="text-xs text-muted-foreground">{t('activeUnits')}</p>
          </CardContent>
        </Card>

        <Card className={data?.overview?.outstandingBalance && data.overview.outstandingBalance > 0 ? 'border-amber-200' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('outstandingBalance')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data?.overview?.outstandingBalance || 0)}
            </div>
            <p className="text-xs text-muted-foreground">{t('acrossAllApartments')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('openTickets')}</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.tickets?.open || 0}</div>
            {data?.tickets?.urgent ? (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {data.tickets.urgent} {t('urgent')}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('noUrgentTickets')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('paymentsThisMonth')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data?.paymentsThisMonth?.total || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {data?.paymentsThisMonth?.count || 0} {tBilling('payments')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('quickActions')}</CardTitle>
            <CardDescription>{t('commonManagementTasks')}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/billing?tab=generate">
                <DollarSign className="h-5 w-5" />
                {tBilling('generateMonthlyCharges')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/billing?tab=payments">
                <TrendingUp className="h-5 w-5" />
                {tBilling('recordPayment')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/apartments?import=true">
                <Home className="h-5 w-5" />
                {t('importApartments')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/documents">
                <FileText className="h-5 w-5" />
                {tDocuments('uploadFile')}
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity */}
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
            {data?.recentActivity?.length ? (
              <div className="space-y-3">
                {data.recentActivity.slice(0, 5).map((activity) => (
                  <div
                    key={activity._id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {activity.actorName} {activity.action} {activity.entityType}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                {t('noRecentActivity')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

