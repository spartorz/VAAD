'use client';

export const dynamic = 'force-dynamic';

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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, MoreHorizontal, Pencil, Upload, Loader2, Users, UserPlus, UserMinus, Calendar, History, Ban, Download, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { formatCurrency } from '@/lib/hooks';

interface Apartment {
  _id: string;
  number: string;
  floor?: number;
  size?: number;
  status: 'active' | 'inactive';
  createdAt: string;
  balance?: number;
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
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function ApartmentsPage() {
  const searchParams = useSearchParams();
  const t = useTranslations('apartments');
  const tResidents = useTranslations('residents');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(searchParams.get('import') === 'true');
  const [isResidentsOpen, setIsResidentsOpen] = useState(false);
  const [isMoveInOpen, setIsMoveInOpen] = useState(false);
  const [isMoveOutOpen, setIsMoveOutOpen] = useState(false);
  const [selectedApartment, setSelectedApartment] = useState<Apartment | null>(null);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [activeResidents, setActiveResidents] = useState<Resident[]>([]);
  const [residentHistory, setResidentHistory] = useState<Resident[]>([]);
  const [residentsLoading, setResidentsLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [moveOutNote, setMoveOutNote] = useState('');
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);

  const fetchApartments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
      });
      
      const response = await fetch(`/api/apartments?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setApartments(result.data.data);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, tErrors]);

  useEffect(() => {
    fetchApartments();
  }, [fetchApartments]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      number: formData.get('number'),
      floor: formData.get('floor') ? Number(formData.get('floor')) : undefined,
      size: formData.get('size') ? Number(formData.get('size')) : undefined,
      status: formData.get('status') || 'active',
    };

    try {
      const response = await fetch('/api/apartments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(t('apartmentCreated'));
        setIsCreateOpen(false);
        fetchApartments();
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
    if (!selectedApartment) return;
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      number: formData.get('number'),
      floor: formData.get('floor') ? Number(formData.get('floor')) : undefined,
      size: formData.get('size') ? Number(formData.get('size')) : undefined,
      status: formData.get('status'),
    };

    try {
      const response = await fetch(`/api/apartments/${selectedApartment._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(t('apartmentUpdated'));
        setIsEditOpen(false);
        setSelectedApartment(null);
        fetchApartments();
      } else {
        toast.error(result.error || tErrors('updateFailed'));
      }
    } catch (error) {
      toast.error(tErrors('updateFailed'));
    } finally {
      setFormLoading(false);
    }
  };

  const fetchApartmentResidents = async (apartmentId: string) => {
    setResidentsLoading(true);
    try {
      const response = await fetch(`/api/apartments/${apartmentId}/residents`);
      const result = await response.json();
      
      if (result.success) {
        setActiveResidents(result.data.activeResidents || []);
        setResidentHistory(result.data.residentHistory || []);
      } else {
        toast.error(result.error || tErrors('loadFailed'));
      }
    } catch (error) {
      toast.error(tErrors('loadFailed'));
    } finally {
      setResidentsLoading(false);
    }
  };

  const handleMoveIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedApartment) return;
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      fullName: formData.get('fullName'),
      email: formData.get('email') || undefined,
      phone: formData.get('phone') || undefined,
      type: formData.get('type') || 'owner',
    };

    try {
      const response = await fetch(`/api/apartments/${selectedApartment._id}/move-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(tResidents('movedIn'));
        setIsMoveInOpen(false);
        fetchApartmentResidents(selectedApartment._id);
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch (error) {
      toast.error(tErrors('generic'));
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
        toast.success(tResidents('movedOut'));
        setIsMoveOutOpen(false);
        setSelectedResident(null);
        setMoveOutNote('');
        if (selectedApartment) {
          fetchApartmentResidents(selectedApartment._id);
        }
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setFormLoading(false);
    }
  };

  const openResidentsPanel = (apartment: Apartment) => {
    setSelectedApartment(apartment);
    setIsResidentsOpen(true);
    fetchApartmentResidents(apartment._id);
  };

  const handleDeactivate = async () => {
    if (!selectedApartment) return;
    setFormLoading(true);

    try {
      const response = await fetch(`/api/apartments/${selectedApartment._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'inactive' }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(t('apartmentDeactivated'));
        setIsDeactivateOpen(false);
        setSelectedApartment(null);
        fetchApartments();
      } else {
        toast.error(result.error || tErrors('generic'));
      }
    } catch (error) {
      toast.error(tErrors('generic'));
    } finally {
      setFormLoading(false);
    }
  };

  const columns: ColumnDef<Apartment>[] = [
    {
      accessorKey: 'number',
      header: t('apartmentNumber'),
      cell: ({ row }) => (
        <span className="font-medium">{t('apt')} {row.original.number}</span>
      ),
    },
    {
      accessorKey: 'floor',
      header: t('floor'),
      cell: ({ row }) => row.original.floor || '-',
    },
    {
      accessorKey: 'size',
      header: t('size'),
      cell: ({ row }) => row.original.size || '-',
    },
    {
      accessorKey: 'status',
      header: tCommon('status'),
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'default' : 'secondary'}>
          {row.original.status === 'active' ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const apartment = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" type="button">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">{tCommon('actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => openResidentsPanel(apartment)}>
                <Users className="ms-2 h-4 w-4" />
                {t('viewResidents')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedApartment(apartment);
                  setIsEditOpen(true);
                }}
              >
                <Pencil className="ms-2 h-4 w-4" />
                {t('editApartment')}
              </DropdownMenuItem>
              {apartment.status === 'active' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedApartment(apartment);
                      setIsDeactivateOpen(true);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Ban className="ms-2 h-4 w-4" />
                    {tCommon('deactivate')}
                  </DropdownMenuItem>
                </>
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
          <div className="flex-1 max-w-sm">
            <Input
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href="/api/import/templates/apartments" download>
                <Download className="ms-2 h-4 w-4" />
                {t('downloadTemplate')}
              </a>
            </Button>
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <FileSpreadsheet className="ms-2 h-4 w-4" />
              {tCommon('import')} Excel
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="ms-2 h-4 w-4" />
                  {t('addApartment')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>{t('addApartment')}</DialogTitle>
                    <DialogDescription>
                      {t('addApartmentDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="number">{t('apartmentNumber')} *</Label>
                      <Input id="number" name="number" required placeholder="לדוגמה: 101" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="floor">{t('floor')}</Label>
                        <Input id="floor" name="floor" type="number" placeholder="לדוגמה: 1" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="size">{t('size')}</Label>
                        <Input id="size" name="size" type="number" placeholder="לדוגמה: 80" />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="status">{tCommon('status')}</Label>
                      <Select name="status" defaultValue="active">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{t('active')}</SelectItem>
                          <SelectItem value="inactive">{t('inactive')}</SelectItem>
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
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={apartments}
          loading={loading}
          pagination={pagination}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
          searchPlaceholder="Search apartments..."
        />

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <form onSubmit={handleEdit}>
              <DialogHeader>
                <DialogTitle>{t('editApartment')}</DialogTitle>
                <DialogDescription>
                  {t('editApartmentDesc')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-number">{t('apartmentNumber')} *</Label>
                  <Input
                    id="edit-number"
                    name="number"
                    required
                    defaultValue={selectedApartment?.number}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-floor">{t('floor')}</Label>
                    <Input
                      id="edit-floor"
                      name="floor"
                      type="number"
                      defaultValue={selectedApartment?.floor}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-size">{t('size')}</Label>
                    <Input
                      id="edit-size"
                      name="size"
                      type="number"
                      defaultValue={selectedApartment?.size}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status">{tCommon('status')}</Label>
                  <Select name="status" defaultValue={selectedApartment?.status}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t('active')}</SelectItem>
                      <SelectItem value="inactive">{t('inactive')}</SelectItem>
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

        {/* Import Dialog */}
        <ImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onSuccess={fetchApartments} />

        {/* Residents Panel Dialog */}
        <Dialog open={isResidentsOpen} onOpenChange={(open) => {
          setIsResidentsOpen(open);
          if (!open) {
            setSelectedApartment(null);
            setActiveResidents([]);
            setResidentHistory([]);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {tResidents('title')} - {t('apt')} {selectedApartment?.number}
              </DialogTitle>
              <DialogDescription>
                {t('manageResidents')}
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="active" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="active">{tResidents('active')} ({activeResidents.length})</TabsTrigger>
                <TabsTrigger value="history">{tResidents('history')} ({residentHistory.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="active" className="flex-1 overflow-auto">
                {residentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : activeResidents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>{tResidents('noActiveResidents')}</p>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    {activeResidents.map((resident) => (
                      <Card key={resident._id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{resident.fullName}</p>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                <Badge variant="outline">{resident.type === 'owner' ? tResidents('owner') : tResidents('tenant')}</Badge>
                                {resident.email && <span dir="ltr">{resident.email}</span>}
                                {resident.phone && <span dir="ltr">{resident.phone}</span>}
                              </div>
                              {resident.moveInAt && (
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {tResidents('moveInDate')}: {new Date(resident.moveInAt).toLocaleDateString('he-IL')}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedResident(resident);
                                setIsMoveOutOpen(true);
                              }}
                            >
                              <UserMinus className="ms-1 h-4 w-4" />
                              {tResidents('moveOut')}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="history" className="flex-1 overflow-auto">
                {residentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : residentHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>{tResidents('noHistory')}</p>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    {residentHistory.map((resident) => (
                      <Card key={resident._id} className="bg-muted/30">
                        <CardContent className="p-4">
                          <div>
                            <p className="font-medium text-muted-foreground">{resident.fullName}</p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                              <Badge variant="secondary">{resident.type === 'owner' ? tResidents('owner') : tResidents('tenant')}</Badge>
                              {resident.email && <span dir="ltr">{resident.email}</span>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2 space-y-1">
                              {resident.moveInAt && (
                                <p className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {tResidents('moveInDate')}: {new Date(resident.moveInAt).toLocaleDateString('he-IL')}
                                </p>
                              )}
                              {resident.moveOutAt && (
                                <p className="flex items-center gap-1">
                                  <UserMinus className="h-3 w-3" />
                                  {tResidents('moveOutDate')}: {new Date(resident.moveOutAt).toLocaleDateString('he-IL')}
                                </p>
                              )}
                              {resident.moveOutNote && (
                                <p className="italic">{tCommon('notes')}: {resident.moveOutNote}</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setIsResidentsOpen(false)}>
                {tCommon('close')}
              </Button>
              <Button onClick={() => setIsMoveInOpen(true)}>
                <UserPlus className="ms-2 h-4 w-4" />
                {tResidents('moveIn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Move In Dialog */}
        <Dialog open={isMoveInOpen} onOpenChange={setIsMoveInOpen}>
          <DialogContent>
            <form onSubmit={handleMoveIn}>
              <DialogHeader>
                <DialogTitle>{tResidents('moveIn')}</DialogTitle>
                <DialogDescription>
                  {tResidents('moveInDesc')} {t('apt')} {selectedApartment?.number}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="movein-fullName">{tResidents('fullName')} *</Label>
                  <Input id="movein-fullName" name="fullName" required placeholder="ישראל ישראלי" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="movein-email">{tResidents('email')}</Label>
                    <Input id="movein-email" name="email" type="email" placeholder="israel@example.com" dir="ltr" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="movein-phone">{tResidents('phone')}</Label>
                    <Input id="movein-phone" name="phone" placeholder="050-1234567" dir="ltr" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="movein-type">{tResidents('type')}</Label>
                  <Select name="type" defaultValue="owner">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">{tResidents('owner')}</SelectItem>
                      <SelectItem value="tenant">{tResidents('tenant')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsMoveInOpen(false)}>
                  {tCommon('cancel')}
                </Button>
                <Button type="submit" disabled={formLoading}>
                  {formLoading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                  {tResidents('moveIn')}
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
              <DialogTitle>{tResidents('moveOut')}</DialogTitle>
              <DialogDescription>
                {tResidents('moveOutConfirm')} {selectedResident?.fullName}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-sm">
                  <p><strong>{tResidents('fullName')}:</strong> {selectedResident?.fullName}</p>
                  <p><strong>{tResidents('type')}:</strong> {selectedResident?.type === 'owner' ? tResidents('owner') : tResidents('tenant')}</p>
                  {selectedResident?.moveInAt && (
                    <p><strong>{tResidents('moveInDate')}:</strong> {new Date(selectedResident.moveInAt).toLocaleDateString('he-IL')}</p>
                  )}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="moveout-note">{tResidents('moveOutNote')} ({tCommon('optional')})</Label>
                <Input
                  id="moveout-note"
                  placeholder="לדוגמה: עבר לעיר אחרת"
                  value={moveOutNote}
                  onChange={(e) => setMoveOutNote(e.target.value)}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                ⚠️ {tResidents('moveOutWarning')}
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

        {/* Deactivate Confirmation Dialog */}
        <Dialog open={isDeactivateOpen} onOpenChange={(open) => {
          setIsDeactivateOpen(open);
          if (!open) {
            setSelectedApartment(null);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('deactivateApartment')}</DialogTitle>
              <DialogDescription>
                {t('deactivateConfirm')} {t('apt')} {selectedApartment?.number}?
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>{tCommon('warning')}:</strong> {t('deactivateNote')}:
                </p>
                <ul className="text-sm text-amber-700 dark:text-amber-400 mt-2 list-disc list-inside space-y-1">
                  <li>{t('deactivateEffect1')}</li>
                  <li>{t('deactivateEffect2')}</li>
                  <li>{t('deactivateEffect3')}</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDeactivateOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDeactivate} 
                disabled={formLoading}
              >
                {formLoading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                {t('deactivateApartment')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

interface ImportResult {
  dryRun: boolean;
  summary: {
    totalRows: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  errors: Array<{ row: number; sheet: string; field: string; message: string }>;
  preview: Array<{
    apartmentNumber: string;
    floor: number | null;
    sizeSqft: number | null;
    status: string;
    notes: string;
    action: 'create' | 'update' | 'skip';
  }>;
}

function ImportDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const t = useTranslations('apartments');
  const tCommon = useTranslations('common');
  const tImport = useTranslations('import');
  const tErrors = useTranslations('errors');
  
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleDryRun = async () => {
    if (!file) return;
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/apartments?dryRun=1', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setPreviewResult(result.data);
        setStep('preview');
      } else {
        toast.error(result.error || tImport('previewFailed'));
      }
    } catch (error) {
      toast.error(tImport('previewFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!file) return;
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/apartments?dryRun=0', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setPreviewResult(result.data);
        setStep('done');
        onSuccess();
        toast.success(tImport('importSuccess', { 
          created: result.data.summary.created, 
          updated: result.data.summary.updated 
        }));
      } else {
        toast.error(result.error || tImport('importFailed'));
      }
    } catch (error) {
      toast.error(tImport('importFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setPreviewResult(null);
    onOpenChange(false);
  };

  const handleDownloadErrorReport = async () => {
    if (!previewResult) return;
    
    try {
      const response = await fetch('/api/import/errors-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errors: previewResult.errors,
          preview: previewResult.preview,
          importType: 'apartments',
        }),
      });

      if (!response.ok) throw new Error('Failed to generate report');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import_error_report_apartments_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(tImport('errorReportDownloaded'));
    } catch {
      toast.error(tErrors('generic'));
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'update': return <AlertCircle className="h-4 w-4 text-blue-600" />;
      case 'skip': return <XCircle className="h-4 w-4 text-gray-400" />;
      default: return null;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'create': return tImport('actionCreate');
      case 'update': return tImport('actionUpdate');
      case 'skip': return tImport('actionSkip');
      default: return action;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {step === 'upload' && tImport('importApartments')}
            {step === 'preview' && tImport('previewImport')}
            {step === 'done' && tImport('importComplete')}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && tImport('uploadExcelDesc')}
            {step === 'preview' && tImport('reviewBeforeCommit')}
            {step === 'done' && tImport('importSuccessDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                  id="excel-upload"
                  disabled={loading}
                />
                <label
                  htmlFor="excel-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  {file ? (
                    <>
                      <FileSpreadsheet className="h-12 w-12 text-green-600" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {tImport('clickToUpload')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {tImport('xlsxOnly')}
                      </span>
                    </>
                  )}
                </label>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Download className="h-4 w-4" />
                <span>{tImport('needTemplate')}</span>
                <a 
                  href="/api/import/templates/apartments" 
                  download 
                  className="text-primary hover:underline"
                >
                  {t('downloadTemplate')}
                </a>
              </div>
            </div>
          )}

          {step === 'preview' && previewResult && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold">{previewResult.summary.totalRows}</p>
                  <p className="text-xs text-muted-foreground">{tImport('totalRows')}</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-center">
                  <p className="text-2xl font-bold text-green-600">{previewResult.summary.created}</p>
                  <p className="text-xs text-green-600">{tImport('toCreate')}</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-center">
                  <p className="text-2xl font-bold text-blue-600">{previewResult.summary.updated}</p>
                  <p className="text-xs text-blue-600">{tImport('toUpdate')}</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-center">
                  <p className="text-2xl font-bold text-amber-600">{previewResult.summary.errors}</p>
                  <p className="text-xs text-amber-600">{tImport('errors')}</p>
                </div>
              </div>

              {/* Errors Table */}
              {previewResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 overflow-hidden">
                  <div className="bg-red-50 dark:bg-red-950/30 px-3 py-2 border-b border-red-200 dark:border-red-800 flex items-center justify-between">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">
                      {tImport('errorsFound', { count: previewResult.errors.length })}
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleDownloadErrorReport}
                      className="h-7 text-xs"
                    >
                      <Download className="ms-1 h-3 w-3" />
                      {tImport('downloadErrorReport')}
                    </Button>
                  </div>
                  <div className="max-h-32 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50/50 dark:bg-red-950/20">
                        <tr>
                          <th className="px-3 py-1 text-start">{tImport('row')}</th>
                          <th className="px-3 py-1 text-start">{tImport('field')}</th>
                          <th className="px-3 py-1 text-start">{tImport('message')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewResult.errors.map((err, i) => (
                          <tr key={i} className="border-t border-red-100 dark:border-red-900">
                            <td className="px-3 py-1">{err.row}</td>
                            <td className="px-3 py-1">{err.field}</td>
                            <td className="px-3 py-1 text-red-600">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {previewResult.preview.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted px-3 py-2 border-b">
                    <p className="text-sm font-medium">{tImport('preview')}</p>
                  </div>
                  <div className="max-h-48 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-start">{tImport('action')}</th>
                          <th className="px-3 py-2 text-start">{t('apartmentNumber')}</th>
                          <th className="px-3 py-2 text-start">{t('floor')}</th>
                          <th className="px-3 py-2 text-start">{t('size')}</th>
                          <th className="px-3 py-2 text-start">{tCommon('status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewResult.preview.map((row, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                {getActionIcon(row.action)}
                                <span className="text-xs">{getActionLabel(row.action)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium">{row.apartmentNumber}</td>
                            <td className="px-3 py-2">{row.floor ?? '-'}</td>
                            <td className="px-3 py-2">{row.sizeSqft ?? '-'}</td>
                            <td className="px-3 py-2">
                              <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>
                                {row.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'done' && previewResult && (
            <div className="py-4">
              <div className="p-6 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-center">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <p className="text-lg font-medium text-green-700 dark:text-green-400">
                  {tImport('importComplete')}!
                </p>
                <p className="text-sm text-green-600 mt-2">
                  {tImport('importSummary', {
                    created: previewResult.summary.created,
                    updated: previewResult.summary.updated,
                  })}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={handleClose}>{tCommon('cancel')}</Button>
              <Button onClick={handleDryRun} disabled={!file || loading}>
                {loading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                {tImport('dryRun')}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>{tCommon('back')}</Button>
              <Button onClick={handleCommit} disabled={loading || previewResult?.summary.errors === previewResult?.summary.totalRows}>
                {loading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                {tImport('commitImport')}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>{tCommon('close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

