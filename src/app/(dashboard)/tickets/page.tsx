'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
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
      toast.error('Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter]);

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
    const data = {
      title: formData.get('title'),
      description: formData.get('description'),
      priority: formData.get('priority') || 'medium',
      apartmentId: formData.get('apartmentId') || undefined,
    };

    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        toast.success('Ticket created');
        setIsCreateOpen(false);
        fetchTickets();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to create ticket');
    } finally {
      setFormLoading(false);
    }
  };

  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
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
      header: 'Apartment',
      cell: ({ row }) => row.original.apartmentId ? `Apt. ${row.original.apartmentId.number}` : 'Building',
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => (
        <Badge className={priorityColors[row.original.priority]}>
          {row.original.priority === 'urgent' && <AlertTriangle className="h-3 w-3 mr-1" />}
          {row.original.priority}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge className={statusColors[row.original.status] || 'bg-gray-100'}>
          {row.original.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdBy',
      header: 'Created By',
      cell: ({ row }) => row.original.createdBy?.name || 'Unknown',
    },
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/tickets/${row.original._id}`}>
            <Eye className="h-4 w-4 mr-1" />
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Maintenance Tickets" />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        {/* Actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 flex-1">
            <Input
              placeholder="Search tickets..."
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
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting_vendor">Waiting Vendor</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Ticket
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Create Ticket</DialogTitle>
                  <DialogDescription>Report a maintenance issue or request.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Title *</Label>
                    <Input name="title" required placeholder="Brief description of the issue" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Description *</Label>
                    <Textarea 
                      name="description" 
                      required 
                      placeholder="Provide details about the issue..."
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Priority</Label>
                      <Select name="priority" defaultValue="medium">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {!isResident && (
                      <div className="grid gap-2">
                        <Label>Apartment</Label>
                        <Select name="apartmentId">
                          <SelectTrigger><SelectValue placeholder="Building-wide" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Building-wide</SelectItem>
                            {apartments.map((apt) => (
                              <SelectItem key={apt._id} value={apt._id}>Apt. {apt.number}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Ticket
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

