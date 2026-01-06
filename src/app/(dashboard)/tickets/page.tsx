'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Plus, Loader2, Eye, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/hooks';

interface Apartment {
  _id: string;
  number: string;
}

interface Ticket {
  _id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: string;
  apartmentId?: Apartment;
  createdBy: { name: string };
  createdAt: string;
}

const priorityColors = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
};

const statusColors: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting_vendor: 'bg-purple-100 text-purple-700',
  resolved: 'bg-slate-100 text-slate-700',
  closed: 'bg-gray-100 text-gray-500',
};

export default function TicketsPage() {
  const { data: session } = useSession();
  const t = useTranslations('tickets');
  const tApartments = useTranslations('apartments');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const isResident = session?.user?.role === 'RESIDENT';
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });
      
      const response = await fetch(`/api/tickets?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setTickets(result.data.data);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      toast.error(tErrors('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter, tErrors]);

  useEffect(() => {
    fetchTickets();
    
    if (!isResident) {
      fetch('/api/apartments?limit=100')
        .then((r) => r.json())
        .then((result) => {
          if (result.success) setApartments(result.data.data);
        });
    }
  }, [fetchTickets, isResident]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const apartmentIdValue = formData.get('apartmentId');
    const data = {
      title: formData.get('title'),
      description: formData.get('description'),
      priority: formData.get('priority') || 'medium',
      apartmentId: apartmentIdValue && apartmentIdValue !== 'none' ? apartmentIdValue : undefined,
    };

    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(t('ticketCreated'));
        setIsCreateOpen(false);
        fetchTickets();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(tErrors('createFailed'));
    } finally {
      setFormLoading(false);
    }
  };

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      low: t('low'),
      medium: t('medium'),
      high: t('high'),
      urgent: t('urgent'),
    };
    return labels[priority] || priority;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      open: t('statusOpen'),
      in_progress: t('statusInProgress'),
      waiting_vendor: t('statusWaitingVendor'),
      resolved: t('statusResolved'),
      closed: t('statusClosed'),
    };
    return labels[status] || status;
  };

  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: 'title',
      header: t('subject'),
      cell: ({ row }) => (
        <div>
          <Link href={`/tickets/${row.original._id}`} className="font-medium hover:underline">
            {row.original.title}
          </Link>
          <p className="text-xs text-muted-foreground truncate max-w-xs">
            {row.original.description}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'apartmentId',
      header: tApartments('apartment'),
      cell: ({ row }) => row.original.apartmentId ? `${tApartments('apt')} ${row.original.apartmentId.number}` : t('buildingWide'),
    },
    {
      accessorKey: 'priority',
      header: t('priority'),
      cell: ({ row }) => (
        <Badge className={priorityColors[row.original.priority]}>
          {row.original.priority === 'urgent' && <AlertTriangle className="h-3 w-3 ms-1" />}
          {getPriorityLabel(row.original.priority)}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: tCommon('status'),
      cell: ({ row }) => (
        <Badge className={statusColors[row.original.status] || 'bg-gray-100'}>
          {getStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdBy',
      header: t('createdBy'),
      cell: ({ row }) => row.original.createdBy?.name || '-',
    },
    {
      accessorKey: 'createdAt',
      header: tCommon('date'),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/tickets/${row.original._id}`}>
            <Eye className="h-4 w-4 ms-1" />
            {tCommon('view')}
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title={t('title')} />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        {/* Actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 flex-1">
            <Input
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="max-w-xs"
            />
            <Select value={statusFilter} onValueChange={(v) => {
              setStatusFilter(v === 'all' ? '' : v);
              setPagination((p) => ({ ...p, page: 1 }));
            }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('filterStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tCommon('all')}</SelectItem>
                <SelectItem value="open">{t('statusOpen')}</SelectItem>
                <SelectItem value="in_progress">{t('statusInProgress')}</SelectItem>
                <SelectItem value="waiting_vendor">{t('statusWaitingVendor')}</SelectItem>
                <SelectItem value="resolved">{t('statusResolved')}</SelectItem>
                <SelectItem value="closed">{t('statusClosed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ms-2 h-4 w-4" />
                {t('addTicket')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>{t('addTicket')}</DialogTitle>
                  <DialogDescription>{t('addTicketDesc')}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>{t('subject')} *</Label>
                    <Input name="title" required placeholder={t('subjectPlaceholder')} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{tCommon('description')} *</Label>
                    <Textarea 
                      name="description" 
                      required 
                      placeholder={t('descriptionPlaceholder')}
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>{t('priority')}</Label>
                      <Select name="priority" defaultValue="medium">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{t('low')}</SelectItem>
                          <SelectItem value="medium">{t('medium')}</SelectItem>
                          <SelectItem value="high">{t('high')}</SelectItem>
                          <SelectItem value="urgent">{t('urgent')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {!isResident && (
                      <div className="grid gap-2">
                        <Label>{tApartments('apartment')}</Label>
                        <Select name="apartmentId" defaultValue="none">
                          <SelectTrigger><SelectValue placeholder={t('buildingWide')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('buildingWide')}</SelectItem>
                            {apartments.map((apt) => (
                              <SelectItem key={apt._id} value={apt._id}>{tApartments('apt')} {apt.number}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>{tCommon('cancel')}</Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                    {tCommon('add')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={tickets}
          loading={loading}
          pagination={pagination}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        />
      </div>
    </div>
  );
}

