'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/header';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Loader2, DollarSign, Calendar, XCircle, ChevronLeft, ChevronRight, Building2, CheckCircle2, Clock, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/hooks';

// Helper hook for billing translations
function useBillingTranslations() {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tApartments = useTranslations('apartments');
  const tSuccess = useTranslations('success');
  const tErrors = useTranslations('errors');
  return { t, tCommon, tApartments, tSuccess, tErrors };
}

interface Apartment {
  _id: string;
  number: string;
  floor?: number;
}

interface Charge {
  _id: string;
  type: string;
  title: string;
  amount: number;
  currency: string;
  period?: string;
  dueDate: string;
  status: 'open' | 'voided';
  apartmentId: Apartment;
  createdAt: string;
}

interface Payment {
  _id: string;
  amount: number;
  currency: string;
  method: string;
  reference?: string;
  paidAt: string;
  status: 'confirmed' | 'pending' | 'voided';
  apartmentId: Apartment;
  createdAt: string;
}

export default function BillingPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const t = useTranslations('billing');
  const isResident = session?.user?.role === 'RESIDENT';
  const defaultTab = searchParams.get('tab') || (isResident ? 'charges' : 'monthly');
  
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    async function fetchApartments() {
      const response = await fetch('/api/apartments?limit=100');
      const result = await response.json();
      if (result.success) {
        setApartments(result.data.data);
      }
    }
    if (!isResident) {
      fetchApartments();
    }
  }, [isResident]);

  return (
    <div className="flex flex-col h-full">
      <Header title={t('title')} />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            {!isResident && <TabsTrigger value="monthly">{t('monthlyOverview')}</TabsTrigger>}
            <TabsTrigger value="charges">{t('charges')}</TabsTrigger>
            <TabsTrigger value="payments">{t('payments')}</TabsTrigger>
            {!isResident && <TabsTrigger value="generate">{t('generateCharges')}</TabsTrigger>}
            {isResident && <TabsTrigger value="statement">{t('myStatement')}</TabsTrigger>}
          </TabsList>

          {!isResident && (
            <TabsContent value="monthly">
              <MonthlyOverviewTab />
            </TabsContent>
          )}

          <TabsContent value="charges">
            <ChargesTab apartments={apartments} isResident={isResident} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsTab apartments={apartments} isResident={isResident} />
          </TabsContent>

          {!isResident && (
            <TabsContent value="generate">
              <GenerateChargesTab />
            </TabsContent>
          )}

          {isResident && (
            <TabsContent value="statement">
              <StatementTab apartmentId={session?.user?.apartmentId} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function ChargesTab({ apartments, isResident }: { apartments: Apartment[]; isResident: boolean }) {
  const router = useRouter();
  const { t, tCommon, tApartments, tSuccess, tErrors } = useBillingTranslations();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const fetchCharges = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      
      const response = await fetch(`/api/charges?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setCharges(result.data.data);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, tErrors]);

  useEffect(() => {
    fetchCharges();
  }, [fetchCharges]);

  const handleVoid = async (chargeId: string) => {
    try {
      const response = await fetch(`/api/charges/${chargeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'voided' }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(tSuccess('updated'));
        fetchCharges();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    }
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      apartmentId: formData.get('apartmentId'),
      type: formData.get('type'),
      title: formData.get('title'),
      amount: Number(formData.get('amount')),
      dueDate: formData.get('dueDate'),
      period: formData.get('period') || null,
    };

    try {
      const response = await fetch('/api/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(tSuccess('created'));
        setIsCreateOpen(false);
        fetchCharges();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setFormLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'open': t('open'),
      'voided': t('voided'),
    };
    return statusMap[status] || status;
  };

  const columns: ColumnDef<Charge>[] = [
    {
      accessorKey: 'apartmentId',
      header: tApartments('apartmentNumber'),
      cell: ({ row }) => `${tApartments('apartmentNumber')} ${row.original.apartmentId?.number || 'N/A'}`,
    },
    {
      accessorKey: 'title',
      header: tCommon('description'),
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.title}</p>
          <p className="text-xs text-muted-foreground capitalize">{row.original.type.replace('_', ' ')}</p>
        </div>
      ),
    },
    {
      accessorKey: 'amount',
      header: tCommon('amount'),
      cell: ({ row }) => (
        <span className={row.original.status === 'voided' ? 'line-through text-muted-foreground' : 'font-medium'}>
          {formatCurrency(row.original.amount, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'period',
      header: t('period'),
      cell: ({ row }) => row.original.period || '-',
    },
    {
      accessorKey: 'dueDate',
      header: t('dueDate'),
      cell: ({ row }) => formatDate(row.original.dueDate),
    },
    {
      accessorKey: 'status',
      header: tCommon('status'),
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'open' ? 'default' : 'secondary'}>
          {getStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      id: 'invoice',
      header: t('title'),
      cell: ({ row }) => row.original.status === 'open' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/billing/invoice/${row.original._id}`)}
        >
          <FileText className="h-4 w-4 ms-1" />
          {tCommon('view')}
        </Button>
      ),
    },
    ...(!isResident ? [{
      id: 'actions',
      header: tCommon('actions'),
      cell: ({ row }: { row: { original: Charge } }) => row.original.status === 'open' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleVoid(row.original._id)}
        >
          <XCircle className="h-4 w-4 ms-1" />
          {t('voidCharge')}
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      {!isResident && (
        <div className="flex justify-end">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ms-2 h-4 w-4" />
                {t('addCharge')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>{t('addCharge')}</DialogTitle>
                  <DialogDescription>{tApartments('title')}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>{tApartments('apartmentNumber')} *</Label>
                    <Select name="apartmentId" required>
                      <SelectTrigger><SelectValue placeholder={tApartments('apartmentNumber')} /></SelectTrigger>
                      <SelectContent>
                        {apartments.map((apt) => (
                          <SelectItem key={apt._id} value={apt._id}>{tApartments('apartmentNumber')} {apt.number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>{t('chargeType')} *</Label>
                      <Select name="type" required defaultValue="one_time">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly_due">{t('monthlyDue')}</SelectItem>
                          <SelectItem value="one_time">{t('oneTime')}</SelectItem>
                          <SelectItem value="repair">{t('repair')}</SelectItem>
                          <SelectItem value="fund">{t('fund')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>{tCommon('amount')} *</Label>
                      <Input name="amount" type="number" step="0.01" required placeholder="100.00" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>{tCommon('description')} *</Label>
                    <Input name="title" required placeholder={t('monthlyDue')} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>{t('dueDate')} *</Label>
                      <Input name="dueDate" type="date" required />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t('period')} (YYYY-MM)</Label>
                      <Input name="period" placeholder="2024-01" pattern="\d{4}-\d{2}" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>{tCommon('cancel')}</Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                    {tCommon('save')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <DataTable
        columns={columns}
        data={charges}
        loading={loading}
        pagination={pagination}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
      />
    </div>
  );
}

function PaymentsTab({ apartments, isResident }: { apartments: Apartment[]; isResident: boolean }) {
  const { t, tCommon, tApartments, tSuccess, tErrors } = useBillingTranslations();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      
      const response = await fetch(`/api/payments?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setPayments(result.data.data);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, tErrors]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      apartmentId: formData.get('apartmentId'),
      amount: Number(formData.get('amount')),
      method: formData.get('method'),
      reference: formData.get('reference') || undefined,
      paidAt: formData.get('paidAt'),
      status: 'confirmed',
    };

    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(tSuccess('created'));
        setIsCreateOpen(false);
        fetchPayments();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setFormLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'confirmed': t('confirmed'),
      'pending': t('pending'),
      'voided': t('voided'),
    };
    return statusMap[status] || status;
  };

  const getMethodLabel = (method: string) => {
    const methodMap: Record<string, string> = {
      'bank_transfer': t('bankTransfer'),
      'cash': t('cash'),
      'credit_card': t('creditCard'),
      'other': t('other'),
    };
    return methodMap[method] || method;
  };

  const columns: ColumnDef<Payment>[] = [
    {
      accessorKey: 'apartmentId',
      header: tApartments('apartmentNumber'),
      cell: ({ row }) => `${tApartments('apartmentNumber')} ${row.original.apartmentId?.number || 'N/A'}`,
    },
    {
      accessorKey: 'amount',
      header: tCommon('amount'),
      cell: ({ row }) => (
        <span className={`font-medium ${row.original.status === 'voided' ? 'line-through text-muted-foreground' : 'text-green-600'}`}>
          {formatCurrency(row.original.amount, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'method',
      header: t('paymentMethod'),
      cell: ({ row }) => (
        <Badge variant="outline">
          {getMethodLabel(row.original.method)}
        </Badge>
      ),
    },
    {
      accessorKey: 'reference',
      header: t('reference'),
      cell: ({ row }) => row.original.reference || '-',
    },
    {
      accessorKey: 'paidAt',
      header: tCommon('date'),
      cell: ({ row }) => formatDate(row.original.paidAt),
    },
    {
      accessorKey: 'status',
      header: tCommon('status'),
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'confirmed' ? 'default' : row.original.status === 'pending' ? 'outline' : 'secondary'}>
          {getStatusLabel(row.original.status)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {!isResident && (
        <div className="flex justify-end">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ms-2 h-4 w-4" />
                {t('recordPayment')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>{t('recordPayment')}</DialogTitle>
                  <DialogDescription>{t('addPayment')}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>{tApartments('apartmentNumber')} *</Label>
                    <Select name="apartmentId" required>
                      <SelectTrigger><SelectValue placeholder={tApartments('apartmentNumber')} /></SelectTrigger>
                      <SelectContent>
                        {apartments.map((apt) => (
                          <SelectItem key={apt._id} value={apt._id}>{tApartments('apartmentNumber')} {apt.number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>{tCommon('amount')} *</Label>
                      <Input name="amount" type="number" step="0.01" required placeholder="100.00" />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t('paymentMethod')} *</Label>
                      <Select name="method" required defaultValue="bank_transfer">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank_transfer">{t('bankTransfer')}</SelectItem>
                          <SelectItem value="cash">{t('cash')}</SelectItem>
                          <SelectItem value="credit_card">{t('creditCard')}</SelectItem>
                          <SelectItem value="other">{t('other')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>{tCommon('date')} *</Label>
                      <Input name="paidAt" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t('reference')}</Label>
                      <Input name="reference" placeholder={t('reference')} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>{tCommon('cancel')}</Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                    {tCommon('save')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <DataTable
        columns={columns}
        data={payments}
        loading={loading}
        pagination={pagination}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
      />
    </div>
  );
}

function GenerateChargesTab() {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tValidation = useTranslations('validation');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      period: formData.get('period'),
      amount: Number(formData.get('amount')),
      title: formData.get('title') || t('monthlyDue'),
      dueDate: formData.get('dueDate'),
    };

    try {
      const response = await fetch('/api/charges/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(result.data.message);
        setResult({ created: result.data.created, skipped: result.data.skipped });
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(t('failedToGenerate'));
    } finally {
      setLoading(false);
    }
  };

  const currentMonth = new Date().toISOString().slice(0, 7);
  const nextMonth = new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().slice(0, 7);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t('generateMonthlyCharges')}
        </CardTitle>
        <CardDescription>
          {t('generateChargesDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid gap-2">
            <Label>{t('period')} (YYYY-MM) *</Label>
            <Input name="period" required pattern="\d{4}-\d{2}" defaultValue={nextMonth} placeholder="2024-01" />
          </div>
          <div className="grid gap-2">
            <Label>{t('amountPerApartment')} *</Label>
            <Input name="amount" type="number" step="0.01" required placeholder="100.00" />
          </div>
          <div className="grid gap-2">
            <Label>{tCommon('description')}</Label>
            <Input name="title" placeholder={t('monthlyDue')} />
          </div>
          <div className="grid gap-2">
            <Label>{t('dueDate')}</Label>
            <Input name="dueDate" type="date" />
            <p className="text-xs text-muted-foreground">{t('leaveEmptyForDefault')}</p>
          </div>

          {result && (
            <div className="p-4 rounded-lg bg-muted">
              <p className="font-medium">{t('generationComplete')}</p>
              <p className="text-sm text-muted-foreground">
                {t('chargesCreated', { count: result.created })}, {t('chargesSkipped', { count: result.skipped })}
              </p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            <DollarSign className="ml-2 h-4 w-4" />
            {t('generateCharges')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StatementTab({ apartmentId }: { apartmentId?: string }) {
  const router = useRouter();
  const t = useTranslations('billing');
  const tInvoice = useTranslations('invoice');
  const tCommon = useTranslations('common');
  const [statement, setStatement] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatement() {
      if (!apartmentId) return;
      
      try {
        const response = await fetch(`/api/statements/${apartmentId}`);
        const result = await response.json();
        if (result.success) {
          setStatement(result.data);
        }
      } catch (error) {
        toast.error(t('failedToFetch'));
      } finally {
        setLoading(false);
      }
    }

    fetchStatement();
  }, [apartmentId, t]);

  if (!apartmentId) {
    return <p className="text-muted-foreground">{t('noApartmentAssigned')}</p>;
  }

  if (loading) {
    return <p>{tCommon('loading')}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Balance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t('accountSummary')}</CardTitle>
          <CardDescription>{statement?.apartment?.number}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('totalDue')}</p>
              <p className="text-2xl font-bold">{formatCurrency(statement?.balance?.totalCharges || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('totalPaid')}</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(statement?.balance?.totalPayments || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('balance')}</p>
              <p className={`text-2xl font-bold ${(statement?.balance?.balance || 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatCurrency(statement?.balance?.balance || 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('transactionHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {statement?.statement?.map((entry: any) => (
              <div key={entry._id} className="flex items-center justify-between py-3 border-b last:border-0">
                <div className="flex-1">
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
                </div>
                <div className="flex items-center gap-4">
                  {/* View Invoice button for charges only */}
                  {entry.type === 'charge' && entry.status !== 'voided' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/billing/invoice/${entry._id}`)}
                    >
                      <FileText className="h-4 w-4 ml-1" />
                      {tInvoice('invoice')}
                    </Button>
                  )}
                  <div className="text-left min-w-[100px]">
                    <p className={`font-medium ${entry.type === 'payment' ? 'text-green-600' : ''} ${entry.status === 'voided' ? 'line-through text-muted-foreground' : ''}`}>
                      {entry.type === 'payment' ? '-' : '+'}{formatCurrency(Math.abs(entry.amount))}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('balance')}: {formatCurrency(entry.balance)}</p>
                  </div>
                </div>
              </div>
            ))}
            {!statement?.statement?.length && (
              <p className="text-center text-muted-foreground py-4">{t('noTransactions')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
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
  payments: Array<{
    _id: string;
    amount: number;
    method: string;
    paidAt: string;
    reference?: string;
  }>;
}

interface MonthlySummary {
  totalApartments: number;
  totalDue: number;
  totalPaid: number;
  totalRemaining: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  noChargeCount: number;
}

function MonthlyOverviewTab() {
  const { t, tCommon, tApartments, tSuccess, tErrors } = useBillingTranslations();
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    period: string;
    currency: string;
    defaultMonthlyAmount: number;
    summary: MonthlySummary;
    apartments: ApartmentBilling[];
  } | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedApartment, setSelectedApartment] = useState<ApartmentBilling | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/billing/monthly?period=${period}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setLoading(false);
    }
  }, [period, tErrors]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navigateMonth = (delta: number) => {
    const [year, month] = period.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    setPeriod(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const formatMonthDisplay = (periodStr: string) => {
    const [year, month] = periodStr.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  const openPaymentModal = (apt: ApartmentBilling) => {
    setSelectedApartment(apt);
    setIsPaymentOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedApartment) return;
    
    setFormLoading(true);
    const formData = new FormData(e.currentTarget);
    
    const paymentData = {
      apartmentId: selectedApartment.apartmentId,
      amount: Number(formData.get('amount')),
      method: formData.get('method'),
      reference: formData.get('reference') || undefined,
      paidAt: formData.get('paidAt'),
      status: 'confirmed',
    };

    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(tSuccess('created'));
        setIsPaymentOpen(false);
        setSelectedApartment(null);
        fetchData();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setFormLoading(false);
    }
  };

  const getStatusBadge = (status: ApartmentBilling['status']) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-emerald-500 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 ms-1" />{t('paid')}</Badge>;
      case 'partial':
        return <Badge className="bg-amber-500 hover:bg-amber-600"><Clock className="h-3 w-3 ms-1" />{t('partial')}</Badge>;
      case 'unpaid':
        return <Badge className="bg-rose-500 hover:bg-rose-600"><AlertCircle className="h-3 w-3 ms-1" />{t('unpaid')}</Badge>;
      case 'no_charge':
        return <Badge variant="secondary">{t('noCharge')}</Badge>;
    }
  };

  const filteredApartments = data?.apartments.filter((apt) => {
    if (statusFilter === 'all') return true;
    return apt.status === statusFilter;
  }) || [];

  const columns: ColumnDef<ApartmentBilling>[] = [
    {
      accessorKey: 'apartmentNumber',
      header: tApartments('apartmentNumber'),
      cell: ({ row }) => (
        <div className="font-medium">
          <span>{tApartments('apartmentNumber')} {row.original.apartmentNumber}</span>
          {row.original.floor !== undefined && (
            <span className="text-xs text-muted-foreground ms-2">{tApartments('floor')} {row.original.floor}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'monthlyDue',
      header: t('monthlyDue'),
      cell: ({ row }) => (
        <span className="font-medium">
          {formatCurrency(row.original.monthlyDue, data?.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'paidThisMonth',
      header: t('totalPaid'),
      cell: ({ row }) => (
        <span className={row.original.paidThisMonth > 0 ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>
          {formatCurrency(row.original.paidThisMonth, data?.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'remaining',
      header: t('remaining'),
      cell: ({ row }) => (
        <span className={row.original.remaining > 0 ? 'text-rose-600 font-medium' : 'text-muted-foreground'}>
          {formatCurrency(row.original.remaining, data?.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: tCommon('status'),
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openPaymentModal(row.original)}
        >
          <DollarSign className="h-3 w-3 ms-1" />
          {t('recordPayment')}
        </Button>
      ),
    },
  ];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-4 py-2 bg-muted rounded-md min-w-[200px] text-center">
            <span className="font-semibold text-lg">{formatMonthDisplay(period)}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-auto"
        />
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('totalDue')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(data.summary.totalDue, data.currency)}</p>
              <p className="text-xs text-muted-foreground">{data.summary.totalApartments} {tApartments('title')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('totalPaid')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(data.summary.totalPaid, data.currency)}</p>
              <p className="text-xs text-muted-foreground">
                {data.summary.totalDue > 0 
                  ? `${Math.round((data.summary.totalPaid / data.summary.totalDue) * 100)}% ${t('collected')}`
                  : `0% ${t('collected')}`
                }
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('remaining')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-rose-600">{formatCurrency(data.summary.totalRemaining, data.currency)}</p>
              <p className="text-xs text-muted-foreground">{data.summary.unpaidCount + data.summary.partialCount} {t('apartmentsOutstanding')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('collectionStatus')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-emerald-500">{data.summary.paidCount} {t('paid')}</Badge>
                <Badge className="bg-amber-500">{data.summary.partialCount} {t('partial')}</Badge>
                <Badge className="bg-rose-500">{data.summary.unpaidCount} {t('unpaid')}</Badge>
              </div>
              {data.summary.noChargeCount > 0 && (
                <p className="text-xs text-muted-foreground mt-2">{data.summary.noChargeCount} {t('noCharge')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-4">
        <Label>{tCommon('filter')}:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tCommon('all')} {tApartments('title')}</SelectItem>
            <SelectItem value="paid">{t('paid')}</SelectItem>
            <SelectItem value="partial">{t('partial')}</SelectItem>
            <SelectItem value="unpaid">{t('unpaid')}</SelectItem>
            <SelectItem value="no_charge">{t('noCharge')}</SelectItem>
          </SelectContent>
        </Select>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Apartments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {tApartments('title')} - {formatMonthDisplay(period)}
          </CardTitle>
          <CardDescription>
            {t('monthlyOverview')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredApartments}
            loading={loading}
          />
        </CardContent>
      </Card>

      {/* Quick Payment Modal */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent>
          <form onSubmit={handleRecordPayment}>
            <DialogHeader>
              <DialogTitle>{t('recordPayment')} - {tApartments('apartmentNumber')} {selectedApartment?.apartmentNumber}</DialogTitle>
              <DialogDescription>
                {selectedApartment && (
                  <span>
                    {t('monthlyDue')}: {formatCurrency(selectedApartment.monthlyDue, data?.currency)}
                    {selectedApartment.remaining > 0 && (
                      <span className="text-rose-600 ms-2">
                        ({t('remaining')}: {formatCurrency(selectedApartment.remaining, data?.currency)})
                      </span>
                    )}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>{tCommon('amount')} *</Label>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  placeholder={selectedApartment?.remaining.toString() || '0'}
                  defaultValue={selectedApartment?.remaining || ''}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>{t('paymentMethod')} *</Label>
                  <Select name="method" required defaultValue="bank_transfer">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">{t('bankTransfer')}</SelectItem>
                      <SelectItem value="cash">{t('cash')}</SelectItem>
                      <SelectItem value="credit_card">{t('creditCard')}</SelectItem>
                      <SelectItem value="other">{t('other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{tCommon('date')} *</Label>
                  <Input
                    name="paidAt"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>{t('reference')}</Label>
                <Input name="reference" placeholder={t('reference')} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPaymentOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                {t('recordPayment')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

