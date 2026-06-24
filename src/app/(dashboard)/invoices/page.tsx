'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/hooks';

type FileStatus = 'invoice_attached' | 'missing_invoice_file' | 'broken_file_reference';

interface InvoiceRow {
  ticketId: string;
  ticketTitle: string;
  vendorId?: string;
  vendorName?: string;
  invoiceNumber?: string;
  amount: number;
  currency: string;
  invoiceDate?: string;
  uploadedDate?: string;
  fileStatus: FileStatus;
  fileUrl?: string;
  fileName?: string;
}

interface InvoiceCenterResponse {
  period: string;
  kpis: {
    invoicesThisMonth: number;
    totalExpensesThisMonth: number;
    totalExpensesSelectedPeriod: number;
    vendorsInvoiced: number;
    invoicesMissingFiles: number;
  };
  rows: InvoiceRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface InvoiceExpensesResponse {
  period: string;
  currentMonthExpenses: number;
  totalExpensesSelectedPeriod: number;
  last12MonthsTrend: Array<{ period: string; total: number }>;
  topVendors: Array<{ vendorId?: string; vendorName: string; total: number; count: number }>;
  expenseByVendor: Array<{ vendorId?: string; vendorName: string; total: number; count: number }>;
  expenseByCategory: Array<{ category: string; total: number; count: number }>;
}

function getCurrentPeriod() {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1).padStart(2, '0'),
    year: String(now.getFullYear()),
    period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  };
}

function statusBadge(status: FileStatus, t: ReturnType<typeof useTranslations<'invoiceCenter'>>) {
  if (status === 'invoice_attached') {
    return <Badge className="bg-green-100 text-green-700">{t('statusAttached')}</Badge>;
  }
  if (status === 'broken_file_reference') {
    return <Badge className="bg-red-100 text-red-700">{t('statusBrokenReference')}</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-700">{t('statusMissingFile')}</Badge>;
}

export default function InvoiceCenterPage() {
  const t = useTranslations('invoiceCenter');
  const tCommon = useTranslations('common');
  const { data: session } = useSession();
  const canAccess = ['ADMIN', 'BOARD', 'MANAGEMENT', 'TREASURER'].includes(session?.user?.role || '');

  const current = getCurrentPeriod();
  const [month, setMonth] = useState(current.month);
  const [year, setYear] = useState(current.year);
  const [vendorId, setVendorId] = useState('all');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [fileFilter, setFileFilter] = useState<'all' | 'has' | 'missing'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InvoiceCenterResponse | null>(null);
  const [expenses, setExpenses] = useState<InvoiceExpensesResponse | null>(null);

  const params = useMemo(() => {
    const q = new URLSearchParams({
      month,
      year,
      page: String(page),
      limit: String(limit),
    });
    if (vendorId !== 'all') q.set('vendorId', vendorId);
    if (amountMin.trim()) q.set('amountMin', amountMin.trim());
    if (amountMax.trim()) q.set('amountMax', amountMax.trim());
    if (search.trim()) q.set('search', search.trim());
    if (fileFilter === 'has') q.set('hasFile', 'true');
    if (fileFilter === 'missing') q.set('missingFile', 'true');
    return q.toString();
  }, [amountMax, amountMin, fileFilter, limit, month, page, search, vendorId, year]);

  const expenseParams = useMemo(() => {
    const q = new URLSearchParams({ month, year });
    return q.toString();
  }, [month, year]);

  const fetchData = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const [tableRes, expenseRes] = await Promise.all([
        fetch(`/api/invoice-center?${params}`),
        fetch(`/api/invoice-center/expenses?${expenseParams}`),
      ]);
      const [tableJson, expenseJson] = await Promise.all([tableRes.json(), expenseRes.json()]);
      if (!tableJson.success) throw new Error(tableJson.error || t('loadError'));
      if (!expenseJson.success) throw new Error(expenseJson.error || t('loadError'));
      setSummary(tableJson.data);
      setExpenses(expenseJson.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [canAccess, expenseParams, params, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [month, year, vendorId, amountMin, amountMax, fileFilter, search]);

  const vendorOptions = expenses?.expenseByVendor || [];
  const years = Array.from({ length: 6 }).map((_, index) => String(new Date().getFullYear() - index));

  if (!canAccess) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('title')} />
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">{t('accessDenied')}</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('title')} />
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('kpiInvoicesThisMonth')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{summary?.kpis.invoicesThisMonth ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('kpiExpensesThisMonth')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(summary?.kpis.totalExpensesThisMonth ?? 0, 'ILS')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('kpiExpensesSelectedPeriod')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(summary?.kpis.totalExpensesSelectedPeriod ?? 0, 'ILS')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('kpiVendorsInvoiced')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{summary?.kpis.vendorsInvoiced ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('kpiMissingFiles')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-700">{summary?.kpis.invoicesMissingFiles ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{t('filtersTitle')}</CardTitle>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 ms-1" />
                {t('refresh')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1">
              <Label>{t('filterMonth')}</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, index) => {
                    const val = String(index + 1).padStart(2, '0');
                    return <SelectItem key={val} value={val}>{val}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t('filterYear')}</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t('filterVendor')}</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tCommon('all')}</SelectItem>
                  {vendorOptions.map((vendor) => (
                    <SelectItem key={vendor.vendorId || vendor.vendorName} value={vendor.vendorId || vendor.vendorName}>
                      {vendor.vendorName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t('filterAmountMin')}</Label>
              <Input value={amountMin} onChange={(e) => setAmountMin(e.target.value)} type="number" min="0" />
            </div>
            <div className="space-y-1">
              <Label>{t('filterAmountMax')}</Label>
              <Input value={amountMax} onChange={(e) => setAmountMax(e.target.value)} type="number" min="0" />
            </div>
            <div className="space-y-1">
              <Label>{t('filterFile')}</Label>
              <Select value={fileFilter} onValueChange={(v) => setFileFilter(v as 'all' | 'has' | 'missing')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tCommon('all')}</SelectItem>
                  <SelectItem value="has">{t('filterHasFile')}</SelectItem>
                  <SelectItem value="missing">{t('filterMissingFile')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3 xl:col-span-6 space-y-1">
              <Label>{t('searchLabel')}</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('tableTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('loading')}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-start p-2">{t('colInvoiceNumber')}</th>
                        <th className="text-start p-2">{t('colVendor')}</th>
                        <th className="text-start p-2">{t('colTicket')}</th>
                        <th className="text-start p-2">{t('colAmount')}</th>
                        <th className="text-start p-2">{t('colCurrency')}</th>
                        <th className="text-start p-2">{t('colInvoiceDate')}</th>
                        <th className="text-start p-2">{t('colUploadedDate')}</th>
                        <th className="text-start p-2">{t('colFileStatus')}</th>
                        <th className="text-start p-2">{tCommon('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary?.rows.length ? (
                        summary.rows.map((row) => (
                          <tr key={row.ticketId} className="border-t">
                            <td className="p-2">{row.invoiceNumber || '-'}</td>
                            <td className="p-2">{row.vendorName || '-'}</td>
                            <td className="p-2">{row.ticketTitle}</td>
                            <td className="p-2">{row.amount.toLocaleString('he-IL')}</td>
                            <td className="p-2">{row.currency}</td>
                            <td className="p-2">{row.invoiceDate ? formatDate(row.invoiceDate) : '-'}</td>
                            <td className="p-2">{row.uploadedDate ? formatDate(row.uploadedDate) : '-'}</td>
                            <td className="p-2">{statusBadge(row.fileStatus, t)}</td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                {row.fileStatus === 'invoice_attached' && row.fileUrl ? (
                                  <>
                                    <Button variant="outline" size="sm" asChild>
                                      <a href={row.fileUrl} target="_blank" rel="noopener noreferrer">
                                        <Eye className="h-4 w-4 ms-1" />
                                        {tCommon('view')}
                                      </a>
                                    </Button>
                                    <Button variant="outline" size="sm" asChild>
                                      <a href={row.fileUrl} download={row.fileName}>
                                        <Download className="h-4 w-4 ms-1" />
                                        {tCommon('download')}
                                      </a>
                                    </Button>
                                  </>
                                ) : null}
                                <Button variant="ghost" size="sm" asChild>
                                  <Link href={`/tickets/${row.ticketId}`}>
                                    <ExternalLink className="h-4 w-4 ms-1" />
                                    {t('openTicket')}
                                  </Link>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-6 text-center text-muted-foreground" colSpan={9}>
                            {t('emptyTable')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t('paginationSummary', {
                      from: Math.min(((summary?.pagination.page || 1) - 1) * (summary?.pagination.limit || limit) + 1, summary?.pagination.total || 0),
                      to: Math.min((summary?.pagination.page || 1) * (summary?.pagination.limit || limit), summary?.pagination.total || 0),
                      total: summary?.pagination.total || 0,
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={(summary?.pagination.page || 1) <= 1}
                    >
                      {t('prev')}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {summary?.pagination.page || 1} / {summary?.pagination.totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={(summary?.pagination.page || 1) >= (summary?.pagination.totalPages || 1)}
                    >
                      {t('next')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
