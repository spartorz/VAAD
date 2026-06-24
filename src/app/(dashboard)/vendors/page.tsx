'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, MoreHorizontal, Pencil, Trash2, Loader2, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/hooks';

interface Vendor {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  category: string;
  contractStart?: string;
  contractEnd?: string;
  notes?: string;
  isActive?: boolean;
  serviceTypes?: string[];
  slaTier?: 'standard' | 'priority' | 'critical';
  contactHours?: string;
  rating?: number;
  createdAt: string;
}

const categoryColors: Record<string, string> = {
  cleaning: 'bg-cyan-100 text-cyan-700',
  elevator: 'bg-purple-100 text-purple-700',
  electric: 'bg-amber-100 text-amber-700',
  plumbing: 'bg-blue-100 text-blue-700',
  security: 'bg-red-100 text-red-700',
  landscaping: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [isPerformanceOpen, setIsPerformanceOpen] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performance, setPerformance] = useState<{
    metrics: {
      assignedCount: number;
      openCount: number;
      closedCount: number;
      avgResolutionHours: number;
      slaBreachCount: number;
      slaBreachRate: number;
      totalInvoicedAmount: number;
      invoicesCount: number;
    };
    recentInvoices?: Array<{
      ticketId: string;
      ticketTitle: string;
      invoiceNumber?: string | null;
      invoiceDate?: string | null;
      amount?: number | null;
      currency?: string;
      closedAt?: string | null;
    }>;
  } | null>(null);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
      });
      
      const response = await fetch(`/api/vendors?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setVendors(result.data.data);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      toast.error('Failed to fetch vendors');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      phone: formData.get('phone') || undefined,
      email: formData.get('email') || undefined,
      category: formData.get('category'),
      contractStart: formData.get('contractStart') || undefined,
      contractEnd: formData.get('contractEnd') || undefined,
      notes: formData.get('notes') || undefined,
      isActive: formData.get('isActive') === 'on',
      serviceTypes: String(formData.get('serviceTypes') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      slaTier: formData.get('slaTier') || undefined,
      contactHours: formData.get('contactHours') || undefined,
      rating: formData.get('rating') ? Number(formData.get('rating')) : undefined,
    };

    try {
      const response = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        toast.success('Vendor created');
        setIsCreateOpen(false);
        fetchVendors();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to create vendor');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedVendor) return;
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      phone: formData.get('phone') || undefined,
      email: formData.get('email') || undefined,
      category: formData.get('category'),
      contractStart: formData.get('contractStart') || undefined,
      contractEnd: formData.get('contractEnd') || undefined,
      notes: formData.get('notes') || undefined,
      isActive: formData.get('isActive') === 'on',
      serviceTypes: String(formData.get('serviceTypes') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      slaTier: formData.get('slaTier') || undefined,
      contactHours: formData.get('contactHours') || undefined,
      rating: formData.get('rating') ? Number(formData.get('rating')) : undefined,
    };

    try {
      const response = await fetch(`/api/vendors/${selectedVendor._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        toast.success('Vendor updated');
        setIsEditOpen(false);
        setSelectedVendor(null);
        fetchVendors();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to update vendor');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (vendorId: string) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;

    try {
      const response = await fetch(`/api/vendors/${vendorId}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        toast.success('Vendor deleted');
        fetchVendors();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to delete vendor');
    }
  };

  const handleOpenPerformance = async (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsPerformanceOpen(true);
    setPerformanceLoading(true);
    try {
      const response = await fetch(`/api/vendors/${vendor._id}/performance`);
      const result = await response.json();
      if (result.success) {
        setPerformance(result.data);
      } else {
        toast.error(result.error || 'Failed to fetch performance');
      }
    } catch {
      toast.error('Failed to fetch performance');
    } finally {
      setPerformanceLoading(false);
    }
  };

  const columns: ColumnDef<Vendor>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          {row.original.email && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />{row.original.email}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => (
        <Badge className={categoryColors[row.original.category] || categoryColors.other}>
          {row.original.category}
        </Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isActive === false ? (
          <Badge variant="secondary">Inactive</Badge>
        ) : (
          <Badge variant="outline" className="text-green-700 border-green-300">Active</Badge>
        ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.original.phone ? (
        <span className="flex items-center gap-1">
          <Phone className="h-3 w-3 text-muted-foreground" />{row.original.phone}
        </span>
      ) : '-',
    },
    {
      accessorKey: 'contractEnd',
      header: 'Contract End',
      cell: ({ row }) => row.original.contractEnd ? formatDate(row.original.contractEnd) : '-',
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setSelectedVendor(row.original); setIsEditOpen(true); }}>
              <Pencil className="mr-2 h-4 w-4" />Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOpenPerformance(row.original)}>
              Performance
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(row.original._id)} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Vendors" />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Input
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="max-w-xs"
          />
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Add Vendor</Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Add Vendor</DialogTitle>
                  <DialogDescription>Add a new vendor to the building.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Name *</Label>
                    <Input name="name" required placeholder="Company Name" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input name="isActive" type="checkbox" defaultChecked />
                    <Label>Active</Label>
                  </div>
                  <div className="grid gap-2">
                    <Label>Category *</Label>
                    <Select name="category" required>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cleaning">Cleaning</SelectItem>
                        <SelectItem value="elevator">Elevator</SelectItem>
                        <SelectItem value="electric">Electric</SelectItem>
                        <SelectItem value="plumbing">Plumbing</SelectItem>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="landscaping">Landscaping</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Phone</Label>
                      <Input name="phone" placeholder="+1 234 567 890" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Email</Label>
                      <Input name="email" type="email" placeholder="vendor@company.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Contract Start</Label>
                      <Input name="contractStart" type="date" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Contract End</Label>
                      <Input name="contractEnd" type="date" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Notes</Label>
                    <Textarea name="notes" placeholder="Additional notes..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Service Types</Label>
                      <Input name="serviceTypes" placeholder="elevator, emergency" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Contact Hours</Label>
                      <Input name="contactHours" placeholder="Sun-Thu 08:00-17:00" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>SLA Tier</Label>
                      <Select name="slaTier" defaultValue="standard">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="priority">Priority</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Rating</Label>
                      <Input name="rating" type="number" min="0" max="5" step="0.1" placeholder="4.5" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <DataTable
          columns={columns}
          data={vendors}
          loading={loading}
          pagination={pagination}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        />

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <form onSubmit={handleEdit}>
              <DialogHeader>
                <DialogTitle>Edit Vendor</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Name *</Label>
                  <Input name="name" required defaultValue={selectedVendor?.name} />
                </div>
                <div className="flex items-center gap-2">
                  <input name="isActive" type="checkbox" defaultChecked={selectedVendor?.isActive !== false} />
                  <Label>Active</Label>
                </div>
                <div className="grid gap-2">
                  <Label>Category *</Label>
                  <Select name="category" defaultValue={selectedVendor?.category}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleaning">Cleaning</SelectItem>
                      <SelectItem value="elevator">Elevator</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem>
                      <SelectItem value="plumbing">Plumbing</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="landscaping">Landscaping</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Phone</Label>
                    <Input name="phone" defaultValue={selectedVendor?.phone} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <Input name="email" type="email" defaultValue={selectedVendor?.email} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Contract Start</Label>
                    <Input name="contractStart" type="date" defaultValue={selectedVendor?.contractStart?.split('T')[0]} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Contract End</Label>
                    <Input name="contractEnd" type="date" defaultValue={selectedVendor?.contractEnd?.split('T')[0]} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Textarea name="notes" defaultValue={selectedVendor?.notes} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Service Types</Label>
                    <Input name="serviceTypes" defaultValue={(selectedVendor?.serviceTypes || []).join(', ')} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Contact Hours</Label>
                    <Input name="contactHours" defaultValue={selectedVendor?.contactHours} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>SLA Tier</Label>
                    <Select name="slaTier" defaultValue={selectedVendor?.slaTier || 'standard'}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="priority">Priority</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Rating</Label>
                    <Input name="rating" type="number" min="0" max="5" step="0.1" defaultValue={selectedVendor?.rating} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={formLoading}>
                  {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isPerformanceOpen} onOpenChange={setIsPerformanceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vendor Performance</DialogTitle>
              <DialogDescription>{selectedVendor?.name}</DialogDescription>
            </DialogHeader>
            {performanceLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : performance ? (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>Assigned Tickets</div><div className="font-semibold">{performance.metrics.assignedCount}</div>
                  <div>Open Tickets</div><div className="font-semibold">{performance.metrics.openCount}</div>
                  <div>Closed Tickets</div><div className="font-semibold">{performance.metrics.closedCount}</div>
                  <div>Avg Resolution (hours)</div><div className="font-semibold">{performance.metrics.avgResolutionHours}</div>
                  <div>SLA Breaches</div><div className="font-semibold">{performance.metrics.slaBreachCount}</div>
                  <div>SLA Breach Rate</div><div className="font-semibold">{performance.metrics.slaBreachRate}%</div>
                  <div>Total Invoiced</div><div className="font-semibold">{performance.metrics.totalInvoicedAmount.toLocaleString()} ILS</div>
                  <div>Invoices Count</div><div className="font-semibold">{performance.metrics.invoicesCount}</div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Recent Invoices</p>
                  {performance.recentInvoices?.length ? (
                    <div className="space-y-2">
                      {performance.recentInvoices.map((invoice) => (
                        <div key={invoice.ticketId} className="text-xs rounded border p-2">
                          <p className="font-medium">{invoice.ticketTitle}</p>
                          <p className="text-muted-foreground">
                            #{invoice.invoiceNumber || '-'} | {invoice.amount ?? '-'} {invoice.currency || 'ILS'}
                          </p>
                          <Link href={`/tickets/${invoice.ticketId}`} className="text-blue-600 hover:underline">
                            Open ticket
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No invoices yet</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No performance data</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

