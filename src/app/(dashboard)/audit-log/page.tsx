'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/hooks';

interface AuditLog {
  _id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: { _id: string; name: string; email: string };
  actorName?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  void: 'bg-amber-100 text-amber-700',
  delete: 'bg-red-100 text-red-700',
  login: 'bg-purple-100 text-purple-700',
  generate_charges: 'bg-cyan-100 text-cyan-700',
  import_data: 'bg-indigo-100 text-indigo-700',
};

const entityColors: Record<string, string> = {
  charge: 'bg-amber-50 text-amber-600',
  payment: 'bg-green-50 text-green-600',
  ticket: 'bg-blue-50 text-blue-600',
  document: 'bg-purple-50 text-purple-600',
  resident: 'bg-cyan-50 text-cyan-600',
  apartment: 'bg-pink-50 text-pink-600',
  vendor: 'bg-orange-50 text-orange-600',
  building: 'bg-slate-50 text-slate-600',
  user: 'bg-indigo-50 text-indigo-600',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [actionFilter, setActionFilter] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(actionFilter && { action: actionFilter }),
        ...(entityFilter && { entityType: entityFilter }),
      });
      
      const response = await fetch(`/api/audit-logs?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setLogs(result.data.data);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      toast.error('Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Time',
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <Badge className={actionColors[row.original.action] || 'bg-gray-100'}>
          {row.original.action.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'entityType',
      header: 'Entity',
      cell: ({ row }) => (
        <Badge variant="outline" className={entityColors[row.original.entityType] || ''}>
          {row.original.entityType}
        </Badge>
      ),
    },
    {
      accessorKey: 'actorUserId',
      header: 'User',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.actorName || row.original.actorUserId?.name || 'System'}</p>
          {row.original.actorUserId?.email && (
            <p className="text-xs text-muted-foreground">{row.original.actorUserId.email}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'metadata',
      header: 'Details',
      cell: ({ row }) => {
        const { before, after, metadata } = row.original;
        
        if (metadata) {
          return (
            <div className="text-xs text-muted-foreground max-w-xs truncate">
              {Object.entries(metadata).map(([k, v]) => `${k}: ${v}`).join(', ')}
            </div>
          );
        }
        
        if (row.original.action === 'void') {
          return <span className="text-xs text-amber-600">Record voided</span>;
        }
        
        if (row.original.action === 'create' && after) {
          const title = (after as any).title || (after as any).fullName || (after as any).number || (after as any).name;
          return title ? <span className="text-xs">Created: {title}</span> : null;
        }
        
        return null;
      },
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Audit Log" />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select value={actionFilter} onValueChange={(v) => {
            setActionFilter(v === 'all' ? '' : v);
            setPagination((p) => ({ ...p, page: 1 }));
          }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="void">Void</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="generate_charges">Generate Charges</SelectItem>
              <SelectItem value="import_data">Import Data</SelectItem>
            </SelectContent>
          </Select>

          <Select value={entityFilter} onValueChange={(v) => {
            setEntityFilter(v === 'all' ? '' : v);
            setPagination((p) => ({ ...p, page: 1 }));
          }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="charge">Charge</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
              <SelectItem value="ticket">Ticket</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="resident">Resident</SelectItem>
              <SelectItem value="apartment">Apartment</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={logs}
          loading={loading}
          pagination={pagination}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        />
      </div>
    </div>
  );
}

