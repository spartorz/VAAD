'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/hooks';
import { toast } from 'sonner';

interface CollectionReport {
  period: string;
  totalCharged: number;
  totalPaid: number;
  outstandingBalance: number;
  collectionRatePct: number;
  paidApartments: number;
  partialApartments: number;
  unpaidApartments: number;
}

interface OutstandingDebtRow {
  apartmentId: string;
  apartmentNumber: string;
  residentName: string;
  currentBalance: number;
  oldestDebtDate?: string;
  totalDebt: number;
  lastPaymentDate?: string;
}

interface PaymentReportRow {
  paymentId: string;
  paymentDate: string;
  apartmentId: string;
  apartmentNumber: string;
  residentId?: string;
  residentName?: string;
  amount: number;
  currency: string;
  method: string;
  reference?: string;
  notes?: string;
}

interface VendorExpenseReport {
  period: string;
  totalExpenses: number;
  topVendor: string;
  averageVendorCost: number;
  rows: Array<{
    vendorId?: string;
    vendor: string;
    ticketId: string;
    ticketTitle: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    amount: number;
    currency: string;
  }>;
}

interface IncomeVsExpenseReport {
  period: string;
  totalCharges: number;
  paymentsCollected: number;
  totalExpenses: number;
  netPosition: number;
}

interface OptionItem {
  _id: string;
  name?: string;
  fullName?: string;
  number?: string;
}

function currentPeriod() {
  const now = new Date();
  return { month: String(now.getMonth() + 1).padStart(2, '0'), year: String(now.getFullYear()) };
}

function methodLabel(method: string) {
  if (method === 'bank_transfer') return 'העברה בנקאית';
  if (method === 'cash') return 'מזומן';
  if (method === 'credit_card') return 'כרטיס אשראי';
  return 'אחר';
}

export default function ReportsPage() {
  const { data: session } = useSession();
  const allowed = ['ADMIN', 'BOARD', 'MANAGEMENT', 'TREASURER'].includes(session?.user?.role || '');
  const period = currentPeriod();

  const [month, setMonth] = useState(period.month);
  const [year, setYear] = useState(period.year);
  const [collection, setCollection] = useState<CollectionReport | null>(null);

  const [outstandingSort, setOutstandingSort] = useState<'highest_debt' | 'oldest_debt'>('highest_debt');
  const [outstandingRows, setOutstandingRows] = useState<OutstandingDebtRow[]>([]);

  const [from, setFrom] = useState(`${period.year}-${period.month}-01`);
  const [to, setTo] = useState(`${period.year}-${period.month}-${String(new Date(Number(period.year), Number(period.month), 0).getDate()).padStart(2, '0')}`);
  const [paymentApartment, setPaymentApartment] = useState('all');
  const [paymentResident, setPaymentResident] = useState('all');
  const [paymentRows, setPaymentRows] = useState<PaymentReportRow[]>([]);
  const [paymentTotal, setPaymentTotal] = useState(0);

  const [vendorFilter, setVendorFilter] = useState('all');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [vendorExpense, setVendorExpense] = useState<VendorExpenseReport | null>(null);

  const [incomeVsExpense, setIncomeVsExpense] = useState<IncomeVsExpenseReport | null>(null);

  const [apartments, setApartments] = useState<OptionItem[]>([]);
  const [residents, setResidents] = useState<OptionItem[]>([]);
  const [vendors, setVendors] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const commonPeriodQuery = useMemo(() => `month=${month}&year=${year}`, [month, year]);

  const fetchOptions = useCallback(async () => {
    const [aptRes, residentRes, vendorRes] = await Promise.all([
      fetch('/api/apartments?limit=200'),
      fetch('/api/residents?limit=200'),
      fetch('/api/vendors?limit=200'),
    ]);
    const [aptJson, residentJson, vendorJson] = await Promise.all([aptRes.json(), residentRes.json(), vendorRes.json()]);
    if (aptJson.success) setApartments(aptJson.data.data);
    if (residentJson.success) setResidents(residentJson.data.data);
    if (vendorJson.success) setVendors(vendorJson.data.data);
  }, []);

  const fetchReports = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const collectionReq = fetch(`/api/reports/collection?${commonPeriodQuery}`);
      const outstandingReq = fetch(`/api/reports/outstanding-debt?sortBy=${outstandingSort}`);
      const paymentsParams = new URLSearchParams({
        from,
        to,
        ...(paymentApartment !== 'all' ? { apartmentId: paymentApartment } : {}),
        ...(paymentResident !== 'all' ? { residentId: paymentResident } : {}),
      });
      const paymentsReq = fetch(`/api/reports/payments?${paymentsParams.toString()}`);
      const vendorParams = new URLSearchParams({
        month,
        year,
        ...(vendorFilter !== 'all' ? { vendorId: vendorFilter } : {}),
        ...(amountMin ? { amountMin } : {}),
        ...(amountMax ? { amountMax } : {}),
      });
      const vendorReq = fetch(`/api/reports/vendor-expenses?${vendorParams.toString()}`);
      const incomeReq = fetch(`/api/reports/income-vs-expense?${commonPeriodQuery}`);

      const [collectionRes, outstandingRes, paymentsRes, vendorRes, incomeRes] = await Promise.all([
        collectionReq,
        outstandingReq,
        paymentsReq,
        vendorReq,
        incomeReq,
      ]);
      const [collectionJson, outstandingJson, paymentsJson, vendorJson, incomeJson] = await Promise.all([
        collectionRes.json(),
        outstandingRes.json(),
        paymentsRes.json(),
        vendorRes.json(),
        incomeRes.json(),
      ]);

      if (collectionJson.success) setCollection(collectionJson.data);
      if (outstandingJson.success) setOutstandingRows(outstandingJson.data.rows);
      if (paymentsJson.success) {
        setPaymentRows(paymentsJson.data.rows);
        setPaymentTotal(Number(paymentsJson.data.totals?.totalAmount || 0));
      }
      if (vendorJson.success) setVendorExpense(vendorJson.data);
      if (incomeJson.success) setIncomeVsExpense(incomeJson.data);
    } catch (error) {
      toast.error('טעינת הדוחות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [allowed, amountMax, amountMin, commonPeriodQuery, from, month, outstandingSort, paymentApartment, paymentResident, to, vendorFilter, year]);

  useEffect(() => {
    if (!allowed) return;
    fetchOptions();
  }, [allowed, fetchOptions]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleExport = async (report: string, format: 'xlsx' | 'csv') => {
    try {
      const params = new URLSearchParams({ report, format, month, year, from, to, sortBy: outstandingSort });
      if (paymentApartment !== 'all') params.set('apartmentId', paymentApartment);
      if (paymentResident !== 'all') params.set('residentId', paymentResident);
      if (vendorFilter !== 'all') params.set('vendorId', vendorFilter);
      if (amountMin) params.set('amountMin', amountMin);
      if (amountMax) params.set('amountMax', amountMax);

      const response = await fetch(`/api/reports/export?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      a.href = url;
      a.download = `${report}_${month}-${year}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('הדוח יוצא בהצלחה');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ייצוא נכשל');
    }
  };

  if (!allowed) {
    return (
      <div className="flex flex-col h-full">
        <Header title="דוחות כספיים" />
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">אין הרשאה לצפות בדוחות כספיים.</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="דוחות כספיים" />
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>סינון תקופה</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
            <div className="grid gap-1">
              <Label>חודש</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, index) => {
                    const value = String(index + 1).padStart(2, '0');
                    return <SelectItem key={value} value={value}>{value}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>שנה</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 6 }).map((_, index) => {
                    const value = String(new Date().getFullYear() - index);
                    return <SelectItem key={value} value={value}>{value}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={fetchReports} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'רענון'}
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="income-expense" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="collection">דוח גבייה</TabsTrigger>
            <TabsTrigger value="outstanding">חובות פתוחים</TabsTrigger>
            <TabsTrigger value="payments">דוח תשלומים</TabsTrigger>
            <TabsTrigger value="vendor-expenses">הוצאות ספקים</TabsTrigger>
            <TabsTrigger value="income-expense">הכנסות מול הוצאות</TabsTrigger>
          </TabsList>

          <TabsContent value="collection" className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExport('collection', 'xlsx')}>
                <Download className="h-4 w-4 ms-1" /> Excel
              </Button>
              <Button variant="outline" onClick={() => handleExport('collection', 'csv')}>
                <Download className="h-4 w-4 ms-1" /> CSV
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardDescription>סה"כ חויב</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(collection?.totalCharged || 0, 'ILS')}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>סה"כ שולם</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-green-700">{formatCurrency(collection?.totalPaid || 0, 'ILS')}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>יתרה פתוחה</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-amber-700">{formatCurrency(collection?.outstandingBalance || 0, 'ILS')}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>אחוז גבייה</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{(collection?.collectionRatePct || 0).toFixed(1)}%</p></CardContent></Card>
            </div>
            <Card>
              <CardContent className="pt-6 flex gap-2 flex-wrap">
                <Badge className="bg-emerald-500">שולם: {collection?.paidApartments || 0}</Badge>
                <Badge className="bg-amber-500">חלקי: {collection?.partialApartments || 0}</Badge>
                <Badge className="bg-rose-500">לא שולם: {collection?.unpaidApartments || 0}</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="outstanding" className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={outstandingSort} onValueChange={(v) => setOutstandingSort(v as 'highest_debt' | 'oldest_debt')}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="highest_debt">החוב הגבוה ביותר</SelectItem>
                  <SelectItem value="oldest_debt">החוב הוותיק ביותר</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => handleExport('outstanding_debt', 'xlsx')}><Download className="h-4 w-4 ms-1" />Excel</Button>
              <Button variant="outline" onClick={() => handleExport('outstanding_debt', 'csv')}><Download className="h-4 w-4 ms-1" />CSV</Button>
            </div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-start p-2">דירה</th>
                    <th className="text-start p-2">דייר</th>
                    <th className="text-start p-2">יתרה נוכחית</th>
                    <th className="text-start p-2">תאריך חוב ישן</th>
                    <th className="text-start p-2">סה"כ חוב</th>
                    <th className="text-start p-2">תשלום אחרון</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingRows.map((row) => (
                    <tr key={row.apartmentId} className="border-t">
                      <td className="p-2">{row.apartmentNumber}</td>
                      <td className="p-2">{row.residentName}</td>
                      <td className="p-2">{formatCurrency(row.currentBalance, 'ILS')}</td>
                      <td className="p-2">{row.oldestDebtDate ? formatDate(row.oldestDebtDate) : '-'}</td>
                      <td className="p-2 font-semibold">{formatCurrency(row.totalDebt, 'ILS')}</td>
                      <td className="p-2">{row.lastPaymentDate ? formatDate(row.lastPaymentDate) : '-'}</td>
                    </tr>
                  ))}
                  {!outstandingRows.length && (
                    <tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>אין חובות פתוחים להצגה.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="grid gap-1"><Label>מתאריך</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="grid gap-1"><Label>עד תאריך</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <div className="grid gap-1">
                <Label>דירה</Label>
                <Select value={paymentApartment} onValueChange={setPaymentApartment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {apartments.map((apt) => (
                      <SelectItem key={apt._id} value={apt._id}>דירה {apt.number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>דייר</Label>
                <Select value={paymentResident} onValueChange={setPaymentResident}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {residents.map((resident) => (
                      <SelectItem key={resident._id} value={resident._id}>{resident.fullName || resident.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 items-end">
                <Button variant="outline" onClick={() => handleExport('payments', 'xlsx')}><Download className="h-4 w-4 ms-1" />Excel</Button>
                <Button variant="outline" onClick={() => handleExport('payments', 'csv')}><Download className="h-4 w-4 ms-1" />CSV</Button>
              </div>
            </div>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">סה"כ תשלומים</p><p className="text-2xl font-bold">{formatCurrency(paymentTotal, 'ILS')}</p></CardContent></Card>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-start p-2">תאריך תשלום</th>
                    <th className="text-start p-2">דירה</th>
                    <th className="text-start p-2">דייר</th>
                    <th className="text-start p-2">סכום</th>
                    <th className="text-start p-2">אמצעי</th>
                    <th className="text-start p-2">אסמכתא</th>
                    <th className="text-start p-2">הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((row) => (
                    <tr key={row.paymentId} className="border-t">
                      <td className="p-2">{formatDate(row.paymentDate)}</td>
                      <td className="p-2">{row.apartmentNumber}</td>
                      <td className="p-2">{row.residentName || '-'}</td>
                      <td className="p-2">{formatCurrency(row.amount, row.currency)}</td>
                      <td className="p-2">{methodLabel(row.method)}</td>
                      <td className="p-2">{row.reference || '-'}</td>
                      <td className="p-2">{row.notes || '-'}</td>
                    </tr>
                  ))}
                  {!paymentRows.length && <tr><td className="p-6 text-center text-muted-foreground" colSpan={7}>אין תשלומים להצגה.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="vendor-expenses" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="grid gap-1">
                <Label>ספק</Label>
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor._id} value={vendor._id}>{vendor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1"><Label>סכום מינימלי</Label><Input type="number" min="0" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} /></div>
              <div className="grid gap-1"><Label>סכום מקסימלי</Label><Input type="number" min="0" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} /></div>
              <div className="flex gap-2 items-end md:col-span-2">
                <Button variant="outline" onClick={() => handleExport('vendor_expenses', 'xlsx')}><Download className="h-4 w-4 ms-1" />Excel</Button>
                <Button variant="outline" onClick={() => handleExport('vendor_expenses', 'csv')}><Download className="h-4 w-4 ms-1" />CSV</Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardHeader className="pb-2"><CardDescription>סה"כ הוצאות</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(vendorExpense?.totalExpenses || 0, 'ILS')}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>ספק מוביל</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{vendorExpense?.topVendor || '—'}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>ממוצע הוצאה לספק</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(vendorExpense?.averageVendorCost || 0, 'ILS')}</p></CardContent></Card>
            </div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-start p-2">ספק</th>
                    <th className="text-start p-2">קריאה</th>
                    <th className="text-start p-2">מספר חשבונית</th>
                    <th className="text-start p-2">תאריך חשבונית</th>
                    <th className="text-start p-2">סכום</th>
                    <th className="text-start p-2">מטבע</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorExpense?.rows.map((row) => (
                    <tr key={`${row.ticketId}-${row.invoiceNumber || 'na'}`} className="border-t">
                      <td className="p-2">{row.vendor}</td>
                      <td className="p-2">{row.ticketTitle}</td>
                      <td className="p-2">{row.invoiceNumber || '-'}</td>
                      <td className="p-2">{row.invoiceDate ? formatDate(row.invoiceDate) : '-'}</td>
                      <td className="p-2">{formatCurrency(row.amount, row.currency)}</td>
                      <td className="p-2">{row.currency}</td>
                    </tr>
                  ))}
                  {!vendorExpense?.rows.length && <tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>אין הוצאות ספק להצגה.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="income-expense" className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExport('income_vs_expense', 'xlsx')}><Download className="h-4 w-4 ms-1" />Excel</Button>
              <Button variant="outline" onClick={() => handleExport('income_vs_expense', 'csv')}><Download className="h-4 w-4 ms-1" />CSV</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardHeader className="pb-2"><CardDescription>סה"כ הכנסות (שולם)</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-green-700">{formatCurrency(incomeVsExpense?.paymentsCollected || 0, 'ILS')}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>סה"כ הוצאות</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-amber-700">{formatCurrency(incomeVsExpense?.totalExpenses || 0, 'ILS')}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>מצב נטו</CardDescription></CardHeader><CardContent><p className={`text-2xl font-bold ${(incomeVsExpense?.netPosition || 0) >= 0 ? 'text-green-700' : 'text-rose-700'}`}>{formatCurrency(incomeVsExpense?.netPosition || 0, 'ILS')}</p></CardContent></Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>סיכום תקופתי</CardTitle>
                <CardDescription>{incomeVsExpense?.period || `${year}-${month}`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p>חיובים לתקופה: {formatCurrency(incomeVsExpense?.totalCharges || 0, 'ILS')}</p>
                <p>תשלומים שנגבו: {formatCurrency(incomeVsExpense?.paymentsCollected || 0, 'ILS')}</p>
                <p>הוצאות תחזוקה: {formatCurrency(incomeVsExpense?.totalExpenses || 0, 'ILS')}</p>
                <p className="font-semibold">נטו = תשלומים שנגבו - הוצאות</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
