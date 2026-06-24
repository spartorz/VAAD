'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatDateTime } from '@/lib/hooks';
import Link from 'next/link';
import { toast } from 'sonner';

type CampaignStatus =
  | 'draft'
  | 'ready_for_review'
  | 'approved'
  | 'ready'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

type ItemStatus =
  | 'draft'
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'opened_manual'
  | 'retrying'
  | 'failed'
  | 'cancelled';

interface CampaignSummary {
  _id: string;
  month: string;
  status: CampaignStatus;
  title: string;
  createdAt: string;
  stats: {
    total: number;
    pending: number;
    openedManual: number;
    retrying?: number;
    sent: number;
    delivered?: number;
    read?: number;
    failed: number;
    cancelled: number;
  };
  analytics?: {
    deliveryRate: number;
    readRate: number;
    failureRate: number;
  };
}

interface CampaignItem {
  _id: string;
  status: ItemStatus;
  apartmentId?: { _id?: string; number?: string; floor?: number };
  residentId?: { _id?: string; fullName?: string; phone?: string };
  phone?: string;
  retryCount: number;
  maxRetries: number;
  failureCode?: 'invalid_phone' | 'provider_error' | 'rate_limited' | 'blocked_by_user' | 'unknown';
  failureReason?: string;
  queuedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  lastRetryAt?: string;
}

function statusBadge(status: ItemStatus) {
  const map: Record<ItemStatus, { text: string; className: string }> = {
    draft: { text: 'טיוטה', className: 'bg-slate-100 text-slate-700' },
    pending: { text: 'ממתין', className: 'bg-slate-100 text-slate-700' },
    queued: { text: 'בתור', className: 'bg-sky-100 text-sky-700' },
    sent: { text: 'נשלח', className: 'bg-green-100 text-green-700' },
    delivered: { text: 'נמסר', className: 'bg-emerald-100 text-emerald-700' },
    read: { text: 'נקרא', className: 'bg-teal-100 text-teal-700' },
    opened_manual: { text: 'נפתח ידנית', className: 'bg-blue-100 text-blue-700' },
    retrying: { text: 'בניסיון חוזר', className: 'bg-amber-100 text-amber-700' },
    failed: { text: 'נכשל', className: 'bg-red-100 text-red-700' },
    cancelled: { text: 'בוטל', className: 'bg-zinc-100 text-zinc-700' },
  };
  const current = map[status];
  return <Badge className={current.className}>{current.text}</Badge>;
}

export default function CommunicationsPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [failureOnly, setFailureOnly] = useState(false);
  const [retryOnly, setRetryOnly] = useState(false);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign._id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const response = await fetch('/api/notifications/batches?all=true&limit=50');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to load campaigns');
      const rows: CampaignSummary[] = result.data;
      setCampaigns(rows);
      if (!selectedCampaignId && rows.length > 0) {
        setSelectedCampaignId(rows[0]._id);
      } else if (selectedCampaignId && !rows.some((row) => row._id === selectedCampaignId)) {
        setSelectedCampaignId(rows[0]?._id || '');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load communication campaigns');
    } finally {
      setLoadingCampaigns(false);
    }
  }, [selectedCampaignId]);

  const fetchItems = useCallback(async () => {
    if (!selectedCampaignId) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    try {
      const params = new URLSearchParams({
        batchId: selectedCampaignId,
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(failureOnly ? { failureOnly: 'true' } : {}),
        ...(retryOnly ? { retryOnly: 'true' } : {}),
      });
      const response = await fetch(`/api/notifications/items?${params.toString()}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to load recipients');
      setItems(result.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load recipient tracking');
    } finally {
      setLoadingItems(false);
    }
  }, [failureOnly, retryOnly, search, selectedCampaignId, statusFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <div className="flex flex-col h-full">
      <Header title="מרכז תקשורת" />
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">קמפיינים</CardTitle>
              <Button variant="outline" size="sm" onClick={fetchCampaigns}>
                <RefreshCw className="h-4 w-4 ms-1" />
                רענון
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingCampaigns ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוען קמפיינים...
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא נמצאו קמפיינים</p>
            ) : (
              <div className="space-y-2">
                <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר קמפיין" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign._id} value={campaign._id}>
                        {campaign.month} · {campaign.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedCampaign && (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Delivery Rate</p>
                      <p className="text-xl font-semibold">{(selectedCampaign.analytics?.deliveryRate ?? 0).toFixed(1)}%</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Read Rate</p>
                      <p className="text-xl font-semibold">{(selectedCampaign.analytics?.readRate ?? 0).toFixed(1)}%</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Failure Rate</p>
                      <p className="text-xl font-semibold">{(selectedCampaign.analytics?.failureRate ?? 0).toFixed(1)}%</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">מעקב נמענים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-4">
              <Input
                placeholder="חיפוש לפי דירה / דייר / טלפון"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסטטוסים</SelectItem>
                  <SelectItem value="pending">ממתין</SelectItem>
                  <SelectItem value="queued">בתור</SelectItem>
                  <SelectItem value="sent">נשלח</SelectItem>
                  <SelectItem value="delivered">נמסר</SelectItem>
                  <SelectItem value="read">נקרא</SelectItem>
                  <SelectItem value="failed">נכשל</SelectItem>
                  <SelectItem value="retrying">בניסיון חוזר</SelectItem>
                  <SelectItem value="cancelled">בוטל</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={failureOnly ? 'default' : 'outline'}
                onClick={() => setFailureOnly((value) => !value)}
              >
                כשלים בלבד
              </Button>
              <Button
                variant={retryOnly ? 'default' : 'outline'}
                onClick={() => setRetryOnly((value) => !value)}
              >
                עם ניסיונות חוזרים
              </Button>
            </div>

            {loadingItems ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוען מעקב נמענים...
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא נמצאו נתונים בתנאים שנבחרו.</p>
            ) : (
              <div className="max-h-[520px] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-start p-2">דירה/דייר</th>
                      <th className="text-start p-2">סטטוס</th>
                      <th className="text-start p-2">כשל</th>
                      <th className="text-start p-2">ניסיונות</th>
                      <th className="text-start p-2">זמנים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item._id} className="border-t">
                        <td className="p-2 align-top">
                          <div className="font-medium">
                            דירה {item.apartmentId?.number || '—'}
                            {item.apartmentId?.floor != null ? ` (קומה ${item.apartmentId.floor})` : ''}
                          </div>
                          <div className="text-muted-foreground">{item.residentId?.fullName || '—'}</div>
                          <div className="text-xs text-muted-foreground">{item.phone || item.residentId?.phone || 'ללא טלפון'}</div>
                        </td>
                        <td className="p-2 align-top">{statusBadge(item.status)}</td>
                        <td className="p-2 align-top">
                          {item.failureCode ? (
                            <div>
                              <Badge variant="destructive">{item.failureCode}</Badge>
                              {item.failureReason ? (
                                <p className="text-xs text-muted-foreground mt-1">{item.failureReason}</p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 align-top">
                          <div>{item.retryCount}/{item.maxRetries}</div>
                          {item.lastRetryAt ? (
                            <p className="text-xs text-muted-foreground">{formatDateTime(item.lastRetryAt)}</p>
                          ) : null}
                        </td>
                        <td className="p-2 align-top text-xs text-muted-foreground space-y-1">
                          {item.queuedAt && <p>Queued: {formatDateTime(item.queuedAt)}</p>}
                          {item.sentAt && <p>Sent: {formatDateTime(item.sentAt)}</p>}
                          {item.deliveredAt && <p>Delivered: {formatDateTime(item.deliveredAt)}</p>}
                          {item.readAt && <p>Read: {formatDateTime(item.readAt)}</p>}
                          {item.failedAt && <p>Failed: {formatDateTime(item.failedAt)}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pt-2">
              <Button asChild variant="outline">
                <Link href="/notifications">למסך ההתראות</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
