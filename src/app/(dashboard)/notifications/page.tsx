'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/hooks';
import Link from 'next/link';

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

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/billing/monthly?period=${period}&includeResidents=true`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setSelectedIds(new Set()); // Clear selection on period change
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch {
      toast.error(tErrors('generic'));
    } finally {
      setLoading(false);
    }
  }, [period, tErrors]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter apartments based on filter selection
  const filteredApartments = data?.apartments.filter((apt) => {
    if (filter === 'all') return apt.status === 'unpaid' || apt.status === 'partial';
    return apt.status === filter;
  }) || [];

  // Format period display
  const formatMonthDisplay = (periodStr: string) => {
    const [year, month] = periodStr.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
    });
  };

  // Navigate months
  const navigateMonth = (delta: number) => {
    const [year, month] = period.split('-').map(Number);
    const newDate = new Date(year, month - 1 + delta, 1);
    setPeriod(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  // Get resident display name and phone
  const getResidentInfo = (apt: ApartmentBilling) => {
    if (!apt.residents || apt.residents.length === 0) {
      return { name: 'דייר/ת', phone: null };
    }
    // Prefer owner, then first resident
    const owner = apt.residents.find((r) => r.type === 'owner');
    const resident = owner || apt.residents[0];
    return { name: resident.fullName, phone: resident.phone || null };
  };

  // Normalize phone number for WhatsApp
  const normalizePhone = (phone: string | null): string | null => {
    if (!phone) return null;
    // Remove spaces, dashes, parentheses
    let normalized = phone.replace(/[\s\-\(\)]/g, '');
    // Check if it starts with + or country code
    if (!normalized.startsWith('+') && !normalized.startsWith('972')) {
      // Israeli number without country code
      if (normalized.startsWith('0')) {
        normalized = '972' + normalized.slice(1);
      } else {
        return null; // Invalid format
      }
    }
    // Remove leading + for wa.me
    if (normalized.startsWith('+')) {
      normalized = normalized.slice(1);
    }
    // Validate: should be digits only
    if (!/^\d{10,15}$/.test(normalized)) {
      return null;
    }
    return normalized;
  };

  // Build WhatsApp message
  const buildMessage = (apt: ApartmentBilling) => {
    const { name } = getResidentInfo(apt);
    const buildingName = data?.buildingName || 'ועד הבית';
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
${buildingName}`;
  };

  // Handle single WhatsApp send
  const handleSendWhatsapp = async (apt: ApartmentBilling, source: 'row_action' | 'bulk_send' = 'row_action') => {
    const { name, phone } = getResidentInfo(apt);
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      toast.error(phone ? t('invalidPhone') : t('missingPhone'));
      return false;
    }

    const message = buildMessage(apt);
    const waUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;

    // Open WhatsApp
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    toast.success(t('openWhatsapp'));

    // Log the action (fire-and-forget)
    const invoiceUrl = `${window.location.origin}/billing/invoice/${apt.chargeId}`;
    const reference = `VAAD-${apt.apartmentNumber}-${period}`;
    const amount = apt.remaining > 0 ? apt.remaining : apt.monthlyDue;

    fetch('/api/notifications/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chargeId: apt.chargeId,
        apartmentId: apt.apartmentId,
        apartmentNumber: apt.apartmentNumber,
        period,
        amount,
        reference,
        invoiceUrl,
        residentName: name,
        phone: normalizedPhone,
        source,
      }),
    }).catch((err) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Failed to log notification:', err);
      }
    });

    return true;
  };

  // Handle bulk send
  const handleBulkSend = async () => {
    const selected = filteredApartments.filter((apt) => selectedIds.has(apt.apartmentId));
    if (selected.length === 0) {
      toast.error(t('noSelection'));
      return;
    }

    // Check for missing phones
    const withPhone = selected.filter((apt) => {
      const { phone } = getResidentInfo(apt);
      return normalizePhone(phone) !== null;
    });

    if (withPhone.length === 0) {
      toast.error(t('missingPhone'));
      return;
    }

    setSendingBulk(true);
    setBulkProgress({ current: 0, total: withPhone.length });

    for (let i = 0; i < withPhone.length; i++) {
      const apt = withPhone[i];
      setBulkProgress({ current: i + 1, total: withPhone.length });
      
      const success = await handleSendWhatsapp(apt, 'bulk_send');
      
      if (!success) {
        // If popup blocked, stop
        toast.error(t('allowPopups'));
        break;
      }

      // Delay between opens to avoid popup blocking
      if (i < withPhone.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }

    setSendingBulk(false);
    setSelectedIds(new Set());
  };

  // Toggle selection
  const toggleSelection = (apartmentId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(apartmentId)) {
      newSelected.delete(apartmentId);
    } else {
      newSelected.add(apartmentId);
    }
    setSelectedIds(newSelected);
  };

  // Select all / deselect all
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredApartments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredApartments.map((apt) => apt.apartmentId)));
    }
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'unpaid':
        return <Badge variant="destructive">{tBilling('unpaid')}</Badge>;
      case 'partial':
        return <Badge className="bg-amber-500 hover:bg-amber-600">{tBilling('partial')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Preview data
  const selectedApartments = filteredApartments.filter((apt) => selectedIds.has(apt.apartmentId));
  const apartmentsWithPhone = selectedApartments.filter((apt) => {
    const { phone } = getResidentInfo(apt);
    return normalizePhone(phone) !== null;
  });
  const apartmentsWithoutPhone = selectedApartments.length - apartmentsWithPhone.length;

  return (
    <div className="flex flex-col h-full">
      <Header title={t('title')} />

      <div className="flex-1 p-4 lg:p-6 space-y-6">
        <Tabs defaultValue="payment-reminders">
          <TabsList>
            <TabsTrigger value="payment-reminders">{t('paymentReminders')}</TabsTrigger>
          </TabsList>

          <TabsContent value="payment-reminders" className="space-y-4 mt-4">
            {/* Controls */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Month Navigation */}
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

                  {/* Filter */}
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

                  {/* Selected count & actions */}
                  <div className="flex items-center gap-2 ms-auto">
                    {selectedIds.size > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {t('selected')}: {selectedIds.size}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewOpen(true)}
                      disabled={selectedIds.size === 0}
                    >
                      <Eye className="h-4 w-4 ms-2" />
                      {t('preview')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleBulkSend}
                      disabled={selectedIds.size === 0 || sendingBulk}
                    >
                      {sendingBulk ? (
                        <>
                          <Loader2 className="h-4 w-4 ms-2 animate-spin" />
                          {t('sendingProgress', bulkProgress)}
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 ms-2" />
                          {t('sendSelected')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>{t('paymentReminders')}</CardTitle>
                <CardDescription>
                  {filteredApartments.length} {t('apartment')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredApartments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {tCommon('noData')}
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
                          <TableHead>{t('invoice')}</TableHead>
                          <TableHead>{t('whatsapp')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApartments.map((apt) => {
                          const { name, phone } = getResidentInfo(apt);
                          const hasValidPhone = normalizePhone(phone) !== null;

                          return (
                            <TableRow key={apt.apartmentId}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedIds.has(apt.apartmentId)}
                                  onCheckedChange={() => toggleSelection(apt.apartmentId)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {apt.apartmentNumber}
                                {apt.floor !== undefined && (
                                  <span className="text-xs text-muted-foreground ms-2">
                                    קומה {apt.floor}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span>{name}</span>
                                  {!hasValidPhone && (
                                    <span className="text-xs text-amber-600 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      {t('missingPhone')}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-rose-600 font-medium">
                                {formatCurrency(apt.remaining, data?.currency)}
                              </TableCell>
                              <TableCell>{getStatusBadge(apt.status)}</TableCell>
                              <TableCell>
                                {apt.chargeId && (
                                  <Button variant="ghost" size="sm" asChild>
                                    <Link href={`/billing/invoice/${apt.chargeId}`}>
                                      <FileText className="h-4 w-4 ms-1" />
                                      {t('viewInvoice')}
                                    </Link>
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>
                                {apt.chargeId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSendWhatsapp(apt)}
                                    disabled={!hasValidPhone}
                                  >
                                    <MessageCircle className="h-4 w-4 ms-1" />
                                    {t('sendWhatsapp')}
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('previewTitle')}</DialogTitle>
            <DialogDescription>
              {t('previewCount', { count: selectedApartments.length })}
            </DialogDescription>
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
                    <div
                      key={apt.apartmentId}
                      className="flex items-center justify-between p-2 text-sm"
                    >
                      <span>
                        {t('apartment')} {apt.apartmentNumber} - {name}
                      </span>
                      {!hasValidPhone && (
                        <Badge variant="outline" className="text-amber-600">
                          {t('missingPhone')}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {tCommon('close')}
            </Button>
            <Button
              onClick={() => {
                setPreviewOpen(false);
                handleBulkSend();
              }}
              disabled={apartmentsWithPhone.length === 0}
            >
              <Send className="h-4 w-4 ms-2" />
              {t('sendSelected')} ({apartmentsWithPhone.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

