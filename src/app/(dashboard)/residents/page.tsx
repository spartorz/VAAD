'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('residents');
  const tApartments = useTranslations('apartments');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
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
      toast.error(tErrors('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter, tErrors]);

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
        toast.success(t('residentCreated'));
        setIsCreateOpen(false);
        fetchResidents();
      } else {
        toast.error(result.error || tErrors('createFailed'));
      }
    } catch (error) {
      toast.error(tErrors('createFailed'));
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
        toast.success(t('residentUpdated'));
        setIsEditOpen(false);
        setSelectedResident(null);
        fetchResidents();
      } else {
        toast.error(result.error || tErrors('updateFailed'));
      }
    } catch (error) {
      toast.error(tErrors('updateFailed'));
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
        toast.success(t('movedOut'));
        setIsMoveOutOpen(false);
        setSelectedResident(null);
        setMoveOutNote('');
        fetchResidents();
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setFormLoading(false);
    }
  };

  const columns: ColumnDef<Resident>[] = [
    {
      accessorKey: 'fullName',
      header: t('fullName'),
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.fullName}</p>
          {row.original.email && (
            <p className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
              <Mail className="h-3 w-3" />
              {row.original.email}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'apartmentId',
      header: t('apartment'),
      cell: ({ row }) => (
        <span>{tApartments('apt')} {row.original.apartmentId?.number || '-'}</span>
      ),
    },
    {
      accessorKey: 'phone',
      header: t('phone'),
      cell: ({ row }) => row.original.phone ? (
        <span className="flex items-center gap-1" dir="ltr">
          <Phone className="h-3 w-3 text-muted-foreground" />
          {row.original.phone}
        </span>
      ) : '-',
    },
    {
      accessorKey: 'type',
      header: t('type'),
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.type === 'owner' ? t('owner') : t('tenant')}
        </Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      header: tCommon('status'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {row.original.isActive ? t('active') : t('movedOutStatus')}
          </Badge>
          {row.original.moveOutAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(row.original.moveOutAt).toLocaleDateString('he-IL')}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const resident = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" type="button">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">{tCommon('actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => {
                  setSelectedResident(resident);
                  setIsEditOpen(true);
                }}
              >
                <Pencil className="ms-2 h-4 w-4" />
                {t('editResident')}
              </DropdownMenuItem>
              {resident.isActive && (
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedResident(resident);
                    setIsMoveOutOpen(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <UserMinus className="ms-2 h-4 w-4" />
                  {t('moveOut')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title={t('title')} />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        {/* Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="max-w-sm flex-1">
              <Input
                placeholder={t('searchPlaceholder')}
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
                <SelectValue placeholder={tCommon('status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tCommon('all')}</SelectItem>
                <SelectItem value="active">{t('active')}</SelectItem>
                <SelectItem value="inactive">{t('movedOutStatus')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ms-2 h-4 w-4" />
                {t('addResident')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>{t('addResident')}</DialogTitle>
                  <DialogDescription>
                    {t('addResidentDesc')}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fullName">{t('fullName')} *</Label>
                    <Input id="fullName" name="fullName" required placeholder="ישראל ישראלי" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="apartmentId">{t('apartment')} *</Label>
                    <Select name="apartmentId" required>
                      <SelectTrigger>
                        <SelectValue placeholder={t('selectApartment')} />
                      </SelectTrigger>
                      <SelectContent>
                        {apartments.map((apt) => (
                          <SelectItem key={apt._id} value={apt._id}>
                            {tApartments('apt')} {apt.number} {apt.floor && `(${tApartments('floor')} ${apt.floor})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">{t('email')}</Label>
                      <Input id="email" name="email" type="email" placeholder="israel@example.com" dir="ltr" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">{t('phone')}</Label>
                      <Input id="phone" name="phone" placeholder="050-1234567" dir="ltr" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type">{t('type')}</Label>
                    <Select name="type" defaultValue="owner">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">{t('owner')}</SelectItem>
                        <SelectItem value="tenant">{t('tenant')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    {tCommon('cancel')}
                  </Button>
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
                <DialogTitle>{t('editResident')}</DialogTitle>
                <DialogDescription>
                  {t('editResidentDesc')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-fullName">{t('fullName')} *</Label>
                  <Input
                    id="edit-fullName"
                    name="fullName"
                    required
                    defaultValue={selectedResident?.fullName}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t('apartment')}</Label>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50 text-sm">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span>{tApartments('apt')} {selectedResident?.apartmentId?.number}</span>
                    {selectedResident?.apartmentId?.floor && (
                      <span className="text-muted-foreground">({tApartments('floor')} {selectedResident.apartmentId.floor})</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('changeApartmentNote')}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-email">{t('email')}</Label>
                    <Input
                      id="edit-email"
                      name="email"
                      type="email"
                      defaultValue={selectedResident?.email}
                      dir="ltr"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-phone">{t('phone')}</Label>
                    <Input
                      id="edit-phone"
                      name="phone"
                      defaultValue={selectedResident?.phone}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-type">{t('type')}</Label>
                  <Select name="type" defaultValue={selectedResident?.type}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">{t('owner')}</SelectItem>
                      <SelectItem value="tenant">{t('tenant')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  {tCommon('cancel')}
                </Button>
                <Button type="submit" disabled={formLoading}>
                  {formLoading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                  {tCommon('save')}
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
              <DialogTitle>{t('moveOut')}</DialogTitle>
              <DialogDescription>
                {t('moveOutConfirm')} {selectedResident?.fullName}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-sm">
                  <p><strong>{t('fullName')}:</strong> {selectedResident?.fullName}</p>
                  <p><strong>{t('apartment')}:</strong> {selectedResident?.apartmentId?.number}</p>
                  <p><strong>{t('type')}:</strong> {selectedResident?.type === 'owner' ? t('owner') : t('tenant')}</p>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="moveOutNote">{t('moveOutNote')} ({tCommon('optional')})</Label>
                <Input
                  id="moveOutNote"
                  placeholder="לדוגמה: עבר לעיר אחרת"
                  value={moveOutNote}
                  onChange={(e) => setMoveOutNote(e.target.value)}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                ⚠️ {t('moveOutWarning')}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsMoveOutOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleMoveOut} 
                disabled={formLoading}
              >
                {formLoading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                {tCommon('confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

