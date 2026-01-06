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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, MoreHorizontal, Pencil, Upload, Loader2, Users, UserPlus, UserMinus, Calendar, History, Ban } from 'lucide-react';
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
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <Upload className="ms-2 h-4 w-4" />
              {tCommon('import')}
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

function ImportDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [data, setData] = useState<any[]>([]);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    
    try {
      // For CSV files, parse client-side
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const parsedData = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });
        return {
          apartmentNumber: row['apartment'] || row['number'] || row['apt'] || row['unit'] || '',
          floor: row['floor'] || '',
          size: row['size'] || row['sqft'] || '',
          residentName: row['resident'] || row['name'] || row['owner'] || '',
          residentEmail: row['email'] || '',
          residentPhone: row['phone'] || '',
          residentType: row['type'] || 'owner',
        };
      }).filter(row => row.apartmentNumber);

      setData(parsedData);

      // Preview the import
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsedData, mode: 'preview' }),
      });

      const result = await response.json();
      if (result.success) {
        setPreviewResult(result.data);
        setStep('preview');
      } else {
        toast.error(result.error || 'Failed to preview import');
      }
    } catch (error) {
      toast.error('Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, mode: 'import' }),
      });

      const result = await response.json();
      if (result.success) {
        setPreviewResult(result.data);
        setStep('done');
        onSuccess();
        toast.success(`Imported ${result.data.created.apartments} apartments and ${result.data.created.residents} residents`);
      } else {
        toast.error(result.error || 'Failed to import');
      }
    } catch (error) {
      toast.error('Failed to import');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setData([]);
    setPreviewResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Import Apartments & Residents'}
            {step === 'preview' && 'Preview Import'}
            {step === 'done' && 'Import Complete'}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV file with apartment and resident data.'}
            {step === 'preview' && 'Review the data before importing.'}
            {step === 'done' && 'Your data has been imported successfully.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={loading}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">
                  {loading ? 'Processing...' : 'Click to upload CSV file'}
                </span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              CSV should have columns: apartment/number, floor, size, resident/name, email, phone, type (owner/tenant)
            </p>
          </div>
        )}

        {step === 'preview' && previewResult && (
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm font-medium text-green-700">To Create</p>
                <p className="text-2xl font-bold text-green-600">
                  {previewResult.created.apartments} apartments
                </p>
                <p className="text-sm text-green-600">
                  {previewResult.created.residents} residents
                </p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-sm font-medium text-amber-700">To Skip</p>
                <p className="text-2xl font-bold text-amber-600">
                  {previewResult.skipped.apartments} existing
                </p>
              </div>
            </div>
            {previewResult.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-medium text-red-700">
                  {previewResult.errors.length} rows with errors
                </p>
                <ul className="text-xs text-red-600 mt-1 list-disc list-inside">
                  {previewResult.errors.slice(0, 3).map((err: any, i: number) => (
                    <li key={i}>Row {err.row}: {err.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === 'done' && previewResult && (
          <div className="py-4">
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-center">
              <p className="text-lg font-medium text-green-700">Success!</p>
              <p className="text-sm text-green-600 mt-1">
                Created {previewResult.created.apartments} apartments and{' '}
                {previewResult.created.residents} residents
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleImport} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import Data
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

