'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, MoreHorizontal, Pencil, Loader2, Mail, Phone, UserMinus, Calendar, Home } from 'lucide-react';
import { toast } from 'sonner';

interface Apartment {
  _id: string;
  number: string;
  floor?: number;
}

interface Resident {
  _id: string;
  fullName: string;
  email?: string;
  phone?: string;
  type: 'owner' | 'tenant';
  isActive: boolean;
  moveInAt?: string;
  moveOutAt?: string;
  moveOutNote?: string;
  apartmentId: Apartment;
  createdAt: string;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function ResidentsPage() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMoveOutOpen, setIsMoveOutOpen] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [moveOutNote, setMoveOutNote] = useState('');

  const fetchResidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(statusFilter !== 'all' && { isActive: statusFilter === 'active' ? 'true' : 'false' }),
      });
      
      const response = await fetch(`/api/residents?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setResidents(result.data.data);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      toast.error('Failed to fetch residents');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter]);

  const fetchApartments = async () => {
    try {
      const response = await fetch('/api/apartments?limit=100');
      const result = await response.json();
      if (result.success) {
        setApartments(result.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch apartments');
    }
  };

  useEffect(() => {
    fetchResidents();
    fetchApartments();
  }, [fetchResidents]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      fullName: formData.get('fullName'),
      email: formData.get('email') || undefined,
      phone: formData.get('phone') || undefined,
      apartmentId: formData.get('apartmentId'),
      type: formData.get('type') || 'owner',
      isActive: true,
    };

    try {
      const response = await fetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Resident created successfully');
        setIsCreateOpen(false);
        fetchResidents();
      } else {
        toast.error(result.error || 'Failed to create resident');
      }
    } catch (error) {
      toast.error('Failed to create resident');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedResident) return;
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    // Only send editable fields (not apartmentId)
    const data = {
      fullName: formData.get('fullName'),
      email: formData.get('email') || undefined,
      phone: formData.get('phone') || undefined,
      type: formData.get('type'),
    };

    try {
      const response = await fetch(`/api/residents/${selectedResident._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Resident updated successfully');
        setIsEditOpen(false);
        setSelectedResident(null);
        fetchResidents();
      } else {
        toast.error(result.error || 'Failed to update resident');
      }
    } catch (error) {
      toast.error('Failed to update resident');
    } finally {
      setFormLoading(false);
    }
  };

  const handleMoveOut = async () => {
    if (!selectedResident) return;
    setFormLoading(true);

    try {
      const response = await fetch(`/api/residents/${selectedResident._id}/move-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: moveOutNote || undefined }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Resident moved out successfully');
        setIsMoveOutOpen(false);
        setSelectedResident(null);
        setMoveOutNote('');
        fetchResidents();
      } else {
        toast.error(result.error || 'Failed to move out resident');
      }
    } catch (error) {
      toast.error('Failed to move out resident');
    } finally {
      setFormLoading(false);
    }
  };

  const columns: ColumnDef<Resident>[] = [
    {
      accessorKey: 'fullName',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.fullName}</p>
          {row.original.email && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {row.original.email}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'apartmentId',
      header: 'Apartment',
      cell: ({ row }) => (
        <span>Apt. {row.original.apartmentId?.number || 'N/A'}</span>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.original.phone ? (
        <span className="flex items-center gap-1">
          <Phone className="h-3 w-3 text-muted-foreground" />
          {row.original.phone}
        </span>
      ) : '-',
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {row.original.isActive ? 'Active' : 'Moved Out'}
          </Badge>
          {row.original.moveOutAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(row.original.moveOutAt).toLocaleDateString()}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setSelectedResident(row.original);
                setIsEditOpen(true);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            {row.original.isActive && (
              <DropdownMenuItem
                onClick={() => {
                  setSelectedResident(row.original);
                  setIsMoveOutOpen(true);
                }}
                className="text-destructive focus:text-destructive"
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Move Out
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Residents" />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        {/* Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="max-w-sm flex-1">
              <Input
                placeholder="Search by name, email, or phone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value: 'all' | 'active' | 'inactive') => {
                setStatusFilter(value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Moved Out</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Resident
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Add Resident</DialogTitle>
                  <DialogDescription>
                    Add a new resident to the building.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input id="fullName" name="fullName" required placeholder="John Doe" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="apartmentId">Apartment *</Label>
                    <Select name="apartmentId" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select apartment" />
                      </SelectTrigger>
                      <SelectContent>
                        {apartments.map((apt) => (
                          <SelectItem key={apt._id} value={apt._id}>
                            Apt. {apt.number} {apt.floor && `(Floor ${apt.floor})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" placeholder="john@example.com" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" name="phone" placeholder="+1 234 567 890" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type">Type</Label>
                    <Select name="type" defaultValue="owner">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="tenant">Tenant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={residents}
          loading={loading}
          pagination={pagination}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        />

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <form onSubmit={handleEdit}>
              <DialogHeader>
                <DialogTitle>Edit Resident</DialogTitle>
                <DialogDescription>
                  Update resident contact details and type.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-fullName">Full Name *</Label>
                  <Input
                    id="edit-fullName"
                    name="fullName"
                    required
                    defaultValue={selectedResident?.fullName}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Apartment</Label>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50 text-sm">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span>Apt. {selectedResident?.apartmentId?.number}</span>
                    {selectedResident?.apartmentId?.floor && (
                      <span className="text-muted-foreground">(Floor {selectedResident.apartmentId.floor})</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    To change apartments, use the Move-out / Move-in flow
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      name="email"
                      type="email"
                      defaultValue={selectedResident?.email}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input
                      id="edit-phone"
                      name="phone"
                      defaultValue={selectedResident?.phone}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-type">Type</Label>
                  <Select name="type" defaultValue={selectedResident?.type}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="tenant">Tenant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={formLoading}>
                  {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Move Out Dialog */}
        <Dialog open={isMoveOutOpen} onOpenChange={(open) => {
          setIsMoveOutOpen(open);
          if (!open) {
            setMoveOutNote('');
            setSelectedResident(null);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move Out Resident</DialogTitle>
              <DialogDescription>
                This will mark {selectedResident?.fullName} as moved out and disable their account access.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-sm">
                  <p><strong>Name:</strong> {selectedResident?.fullName}</p>
                  <p><strong>Apartment:</strong> {selectedResident?.apartmentId?.number}</p>
                  <p><strong>Type:</strong> {selectedResident?.type}</p>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="moveOutNote">Reason / Note (optional)</Label>
                <Input
                  id="moveOutNote"
                  placeholder="e.g., Relocated to another city"
                  value={moveOutNote}
                  onChange={(e) => setMoveOutNote(e.target.value)}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                ⚠️ If this resident has a user account, it will be disabled and they will no longer be able to log in.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsMoveOutOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleMoveOut} 
                disabled={formLoading}
              >
                {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Move Out
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

