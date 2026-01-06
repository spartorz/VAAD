'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Download,
  Loader2,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Printer,
  Copy,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/hooks';

interface InvoiceData {
  invoice: {
    invoiceNumber: string;
    charge: {
      _id: string;
      type: string;
      title: string;
      amount: number;
      currency: string;
      period?: string;
      dueDate: string;
      status: string;
      createdAt: string;
    };
    paymentStatus: 'paid' | 'partial' | 'unpaid';
    totalPaid: number;
    remaining: number;
  };
  building: {
    name: string;
    address: string;
    city: string;
    country: string;
    bankInfo?: {
      bankName?: string;
      accountNumber?: string;
      routingNumber?: string;
      notes?: string;
    };
    settings: {
      currency: string;
      dueDay: number;
    };
  };
  apartment: {
    _id: string;
    number: string;
    floor?: number;
  };
  residents: Array<{
    _id: string;
    fullName: string;
    email?: string;
    phone?: string;
    type: string;
  }>;
  payments: Array<{
    _id: string;
    amount: number;
    currency: string;
    method: string;
    reference?: string;
    paidAt: string;
  }>;
}

/**
 * Generate payment reference in format: VAAD-{apt}-{period}
 */
function generatePaymentReference(apartmentNumber: string, period?: string): string {
  const periodPart = period || new Date().toISOString().slice(0, 7);
  return `VAAD-${apartmentNumber}-${periodPart}`;
}

export default function InvoicePage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('invoice');
  const tBilling = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tApartments = useTranslations('apartments');
  const tSuccess = useTranslations('success');
  const chargeId = params.chargeId as string;
  const invoiceRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function fetchInvoice() {
      try {
        const response = await fetch(`/api/invoices/${chargeId}`);
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        } else {
          toast.error(result.error || t('failedToLoad'));
          router.push('/billing');
        }
      } catch (error) {
        toast.error(t('failedToLoad'));
        router.push('/billing');
      } finally {
        setLoading(false);
      }
    }

    if (chargeId) {
      fetchInvoice();
    }
  }, [chargeId, router, t]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Download PDF from server endpoint
      const response = await fetch(`/api/invoices/${chargeId}/pdf`);
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      link.download = filenameMatch?.[1] || `invoice-${chargeId}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success(t('downloadInitiated'));
    } catch (error) {
      console.error('Download error:', error);
      toast.error(t('failedToDownload'));
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyReference = async () => {
    if (!data) return;
    const reference = generatePaymentReference(
      data.apartment.number,
      data.invoice.charge.period
    );
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(tSuccess('copied'));
    } catch {
      toast.error(tCommon('error'));
    }
  };

  const handleCopyInvoiceLink = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      toast.success(tSuccess('copied'));
    } catch {
      toast.error(tCommon('error'));
    }
  };

  const getChargeTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'monthly_due': tBilling('monthlyDue'),
      'one_time': tBilling('oneTime'),
      'repair': tBilling('repair'),
      'fund': tBilling('fund'),
    };
    return typeMap[type] || type;
  };

  const getPaymentMethodLabel = (method: string) => {
    const methodMap: Record<string, string> = {
      'bank_transfer': tBilling('bankTransfer'),
      'cash': tBilling('cash'),
      'credit_card': tBilling('creditCard'),
      'other': tBilling('other'),
    };
    return methodMap[method] || method;
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-lg px-4 py-1">
            <CheckCircle2 className="h-4 w-4 ms-2" />
            {tBilling('paid')}
          </Badge>
        );
      case 'partial':
        return (
          <Badge className="bg-amber-500 hover:bg-amber-600 text-lg px-4 py-1">
            <Clock className="h-4 w-4 ms-2" />
            {tBilling('partial')}
          </Badge>
        );
      case 'unpaid':
        return (
          <Badge className="bg-rose-500 hover:bg-rose-600 text-lg px-4 py-1">
            <AlertCircle className="h-4 w-4 ms-2" />
            {tBilling('unpaid')}
          </Badge>
        );
    }
  };

  const formatPeriod = (period?: string) => {
    if (!period) return null;
    const [year, month] = period.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('title')} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('title')} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{t('notFound')}</p>
        </div>
      </div>
    );
  }

  const { invoice, building, apartment, residents, payments } = data;

  return (
    <div className="flex flex-col h-full">
      <Header title={t('title')} />

      <div className="flex-1 p-4 lg:p-6">
        {/* Actions Bar - Hidden in print */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 ms-2" />
            {tCommon('back')}
          </Button>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="outline" size="sm" onClick={handleCopyReference}>
              <Copy className="h-4 w-4 ms-2" />
              {t('copyReference')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyInvoiceLink}>
              <Link2 className="h-4 w-4 ms-2" />
              {t('copyInvoiceLink')}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 ms-2" />
              {t('print')}
            </Button>
            <Button size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="h-4 w-4 ms-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 ms-2" />
              )}
              {t('downloadPdf')}
            </Button>
          </div>
        </div>

        {/* Invoice Document */}
        <div
          ref={invoiceRef}
          className="max-w-3xl mx-auto bg-white dark:bg-slate-900 rounded-lg shadow-lg print:shadow-none print:rounded-none"
        >
          {/* Header */}
          <div className="p-8 border-b print:border-b-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="h-8 w-8 text-primary" />
                  <h1 className="text-2xl font-bold">{building.name}</h1>
                </div>
                <p className="text-muted-foreground">{building.address}</p>
                <p className="text-muted-foreground">
                  {building.city}, {building.country}
                </p>
              </div>
              <div className="text-left">
                <h2 className="text-3xl font-bold text-primary mb-2">{t('invoice')}</h2>
                <p className="text-lg font-mono font-semibold">{invoice.invoiceNumber}</p>
                {getPaymentStatusBadge(invoice.paymentStatus)}
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="p-8 grid md:grid-cols-2 gap-8">
            {/* Bill To */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {t('billTo')}
              </h3>
              <div className="space-y-1">
                <p className="font-semibold text-lg">{tApartments('apartmentNumber')} {apartment.number}</p>
                {apartment.floor !== undefined && (
                  <p className="text-muted-foreground">{tApartments('floor')} {apartment.floor}</p>
                )}
                {residents.map((resident) => (
                  <div key={resident._id} className="mt-2">
                    <p className="font-medium">{resident.fullName}</p>
                    {resident.email && (
                      <p className="text-sm text-muted-foreground" dir="ltr">{resident.email}</p>
                    )}
                    {resident.phone && (
                      <p className="text-sm text-muted-foreground" dir="ltr">{resident.phone}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invoice Info */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {t('invoiceDetails')}
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('invoiceDate')}:</span>
                  <span className="font-medium">{formatDate(invoice.charge.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tBilling('dueDate')}:</span>
                  <span className="font-medium">{formatDate(invoice.charge.dueDate)}</span>
                </div>
                {invoice.charge.period && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tBilling('period')}:</span>
                    <span className="font-medium">{formatPeriod(invoice.charge.period)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Line Items */}
          <div className="p-8">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {tBilling('charges')}
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{tCommon('description')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{tBilling('chargeType')}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">{tCommon('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-4 py-4">
                      <p className="font-medium">{invoice.charge.title}</p>
                      {invoice.charge.period && (
                        <p className="text-sm text-muted-foreground">
                          {tBilling('period')}: {formatPeriod(invoice.charge.period)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="outline">
                        {getChargeTypeLabel(invoice.charge.type)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-left font-semibold">
                      {formatCurrency(invoice.charge.amount, invoice.charge.currency)}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr className="border-t">
                    <td colSpan={2} className="px-4 py-3 text-left font-semibold">
                      {tBilling('totalDue')}:
                    </td>
                    <td className="px-4 py-3 text-left text-lg font-bold">
                      {formatCurrency(invoice.charge.amount, invoice.charge.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Payments */}
          {payments.length > 0 && (
            <>
              <Separator />
              <div className="p-8">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  {t('paymentsReceived')}
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-right text-sm font-semibold">{tCommon('date')}</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold">{tBilling('paymentMethod')}</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold">{tBilling('reference')}</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">{tCommon('amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment._id} className="border-t">
                          <td className="px-4 py-3">{formatDate(payment.paidAt)}</td>
                          <td className="px-4 py-3">
                            {getPaymentMethodLabel(payment.method)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono" dir="ltr">
                            {payment.reference || '-'}
                          </td>
                          <td className="px-4 py-3 text-left text-emerald-600 font-medium">
                            -{formatCurrency(payment.amount, payment.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30">
                      <tr className="border-t">
                        <td colSpan={3} className="px-4 py-3 text-left font-semibold">
                          {t('totalPaid')}:
                        </td>
                        <td className="px-4 py-3 text-left text-emerald-600 font-bold">
                          {formatCurrency(invoice.totalPaid, invoice.charge.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Balance Summary */}
          <Separator />
          <div className="p-8 bg-muted/20">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">{t('balanceDue')}</h3>
                <p className="text-sm text-muted-foreground">
                  {invoice.paymentStatus === 'paid'
                    ? t('paidInFull')
                    : t('pleasePayBy', { date: formatDate(invoice.charge.dueDate) })}
                </p>
              </div>
              <div className="text-left">
                <p
                  className={`text-3xl font-bold ${
                    invoice.remaining > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {formatCurrency(invoice.remaining, invoice.charge.currency)}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Instructions */}
          {invoice.remaining > 0 && building.bankInfo && (
            <>
              <Separator />
              <div className="p-8">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  {t('paymentInstructions')}
                </h3>
                <Card>
                  <CardContent className="pt-6">
                    {/* Payment Reference - Prominent */}
                    <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">{t('paymentReference')}</p>
                      <div className="flex items-center gap-3">
                        <p className="text-xl font-bold font-mono text-primary" dir="ltr">
                          {generatePaymentReference(apartment.number, invoice.charge.period)}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyReference}
                          className="print:hidden"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {t('includeReference', { reference: generatePaymentReference(apartment.number, invoice.charge.period) })}
                      </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {building.bankInfo.bankName && (
                        <div>
                          <p className="text-sm text-muted-foreground">{t('bankName')}</p>
                          <p className="font-medium">{building.bankInfo.bankName}</p>
                        </div>
                      )}
                      {building.bankInfo.accountNumber && (
                        <div>
                          <p className="text-sm text-muted-foreground">{t('accountNumber')}</p>
                          <p className="font-medium font-mono" dir="ltr">{building.bankInfo.accountNumber}</p>
                        </div>
                      )}
                      {building.bankInfo.routingNumber && (
                        <div>
                          <p className="text-sm text-muted-foreground">{t('branchNumber')}</p>
                          <p className="font-medium font-mono" dir="ltr">{building.bankInfo.routingNumber}</p>
                        </div>
                      )}
                    </div>
                    {building.bankInfo.notes && (
                      <div className="mt-4 p-3 bg-muted rounded-md">
                        <p className="text-sm">{building.bankInfo.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="p-8 border-t text-center text-sm text-muted-foreground">
            <p>{t('thankYou')}</p>
            <p className="mt-1">
              {t('generatedOn', { date: new Date().toLocaleDateString('he-IL', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              }) })}
            </p>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          #invoice-content,
          #invoice-content * {
            visibility: visible;
          }
          #invoice-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

