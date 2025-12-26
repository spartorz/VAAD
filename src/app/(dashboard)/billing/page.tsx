'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
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
import { Plus, Loader2, DollarSign, Calendar, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/hooks';

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
  const defaultTab = searchParams.get('tab') || 'charges';
  const isResident = session?.user?.role === 'RESIDENT';
  
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
      <Header title="Billing" />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="charges">Charges</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            {!isResident && <TabsTrigger value="generate">Generate Charges</TabsTrigger>}
            {isResident && <TabsTrigger value="statement">My Statement</TabsTrigger>}
          </TabsList>

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
      toast.error('Failed to fetch charges');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

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
        toast.success('Charge voided');
        fetchCharges();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to void charge');
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
        toast.success('Charge created');
        setIsCreateOpen(false);
        fetchCharges();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to create charge');
    } finally {
      setFormLoading(false);
    }
  };

  const columns: ColumnDef<Charge>[] = [
    {
      accessorKey: 'apartmentId',
      header: 'Apartment',
      cell: ({ row }) => `Apt. ${row.original.apartmentId?.number || 'N/A'}`,
    },
    {
      accessorKey: 'title',
      header: 'Description',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.title}</p>
          <p className="text-xs text-muted-foreground capitalize">{row.original.type.replace('_', ' ')}</p>
        </div>
      ),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className={row.original.status === 'voided' ? 'line-through text-muted-foreground' : 'font-medium'}>
          {formatCurrency(row.original.amount, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'period',
      header: 'Period',
      cell: ({ row }) => row.original.period || '-',
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) => formatDate(row.original.dueDate),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'open' ? 'default' : 'secondary'}>
          {row.original.status}
        </Badge>
      ),
    },
    ...(!isResident ? [{
      id: 'actions',
      cell: ({ row }: { row: { original: Charge } }) => row.original.status === 'open' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleVoid(row.original._id)}
        >
          <XCircle className="h-4 w-4 mr-1" />
          Void
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
                <Plus className="mr-2 h-4 w-4" />
                Add Charge
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Add Charge</DialogTitle>
                  <DialogDescription>Create a new charge for an apartment.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Apartment *</Label>
                    <Select name="apartmentId" required>
                      <SelectTrigger><SelectValue placeholder="Select apartment" /></SelectTrigger>
                      <SelectContent>
                        {apartments.map((apt) => (
                          <SelectItem key={apt._id} value={apt._id}>Apt. {apt.number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Type *</Label>
                      <Select name="type" required defaultValue="one_time">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly_due">Monthly Due</SelectItem>
                          <SelectItem value="one_time">One-time</SelectItem>
                          <SelectItem value="repair">Repair</SelectItem>
                          <SelectItem value="fund">Fund</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Amount *</Label>
                      <Input name="amount" type="number" step="0.01" required placeholder="100.00" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Title *</Label>
                    <Input name="title" required placeholder="Monthly Maintenance Fee" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Due Date *</Label>
                      <Input name="dueDate" type="date" required />
                    </div>
                    <div className="grid gap-2">
                      <Label>Period (YYYY-MM)</Label>
                      <Input name="period" placeholder="2024-01" pattern="\d{4}-\d{2}" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
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
      toast.error('Failed to fetch payments');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

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
        toast.success('Payment recorded');
        setIsCreateOpen(false);
        fetchPayments();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to record payment');
    } finally {
      setFormLoading(false);
    }
  };

  const columns: ColumnDef<Payment>[] = [
    {
      accessorKey: 'apartmentId',
      header: 'Apartment',
      cell: ({ row }) => `Apt. ${row.original.apartmentId?.number || 'N/A'}`,
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className={`font-medium ${row.original.status === 'voided' ? 'line-through text-muted-foreground' : 'text-green-600'}`}>
          {formatCurrency(row.original.amount, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.method.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => row.original.reference || '-',
    },
    {
      accessorKey: 'paidAt',
      header: 'Date',
      cell: ({ row }) => formatDate(row.original.paidAt),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'confirmed' ? 'default' : row.original.status === 'pending' ? 'outline' : 'secondary'}>
          {row.original.status}
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
                <Plus className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Record Payment</DialogTitle>
                  <DialogDescription>Record a payment for an apartment.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Apartment *</Label>
                    <Select name="apartmentId" required>
                      <SelectTrigger><SelectValue placeholder="Select apartment" /></SelectTrigger>
                      <SelectContent>
                        {apartments.map((apt) => (
                          <SelectItem key={apt._id} value={apt._id}>Apt. {apt.number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Amount *</Label>
                      <Input name="amount" type="number" step="0.01" required placeholder="100.00" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Method *</Label>
                      <Select name="method" required defaultValue="bank_transfer">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="credit_card">Credit Card</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Date *</Label>
                      <Input name="paidAt" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Reference</Label>
                      <Input name="reference" placeholder="Transaction ID" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Record
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
      title: formData.get('title') || 'Monthly Maintenance Fee',
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
      toast.error('Failed to generate charges');
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
          Generate Monthly Charges
        </CardTitle>
        <CardDescription>
          Create monthly maintenance charges for all active apartments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid gap-2">
            <Label>Period (YYYY-MM) *</Label>
            <Input name="period" required pattern="\d{4}-\d{2}" defaultValue={nextMonth} placeholder="2024-01" />
          </div>
          <div className="grid gap-2">
            <Label>Amount per Apartment *</Label>
            <Input name="amount" type="number" step="0.01" required placeholder="100.00" />
          </div>
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input name="title" placeholder="Monthly Maintenance Fee" />
          </div>
          <div className="grid gap-2">
            <Label>Due Date</Label>
            <Input name="dueDate" type="date" />
            <p className="text-xs text-muted-foreground">Leave empty to use building default</p>
          </div>

          {result && (
            <div className="p-4 rounded-lg bg-muted">
              <p className="font-medium">Generation Complete</p>
              <p className="text-sm text-muted-foreground">
                Created {result.created} charges, skipped {result.skipped} (already exist)
              </p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <DollarSign className="mr-2 h-4 w-4" />
            Generate Charges
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StatementTab({ apartmentId }: { apartmentId?: string }) {
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
        toast.error('Failed to fetch statement');
      } finally {
        setLoading(false);
      }
    }

    fetchStatement();
  }, [apartmentId]);

  if (!apartmentId) {
    return <p className="text-muted-foreground">No apartment assigned.</p>;
  }

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Balance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Account Summary</CardTitle>
          <CardDescription>Apt. {statement?.apartment?.number}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Charges</p>
              <p className="text-2xl font-bold">{formatCurrency(statement?.balance?.totalCharges || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Payments</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(statement?.balance?.totalPayments || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Balance</p>
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
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {statement?.statement?.map((entry: any) => (
              <div key={entry._id} className="flex items-center justify-between py-3 border-b last:border-0">
                <div>
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${entry.type === 'payment' ? 'text-green-600' : ''} ${entry.status === 'voided' ? 'line-through text-muted-foreground' : ''}`}>
                    {entry.type === 'payment' ? '-' : '+'}{formatCurrency(Math.abs(entry.amount))}
                  </p>
                  <p className="text-xs text-muted-foreground">Balance: {formatCurrency(entry.balance)}</p>
                </div>
              </div>
            ))}
            {!statement?.statement?.length && (
              <p className="text-center text-muted-foreground py-4">No transactions yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

