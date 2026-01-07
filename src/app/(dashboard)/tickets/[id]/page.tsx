'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ArrowLeft, Loader2, Send, User, Clock, CheckCircle2, FileText, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/hooks';

interface Ticket {
  _id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  apartmentId?: { _id: string; number: string };
  createdBy: { _id: string; name: string; email?: string };
  vendorId?: { _id: string; name: string; category: string; phone?: string };
  timeline: Array<{
    _id: string;
    byUserId: { _id: string; name: string };
    byUserName?: string;
    message: string;
    createdAt: string;
  }>;
  createdAt: string;
  resolvedAt?: string;
  closedAt?: string;
  closedByUserId?: { _id: string; name: string };
  resolutionNotes?: string;
  invoiceDocumentId?: { _id: string; title: string; url: string };
  costAmount?: number;
  costCurrency?: string;
}

interface DocumentItem {
  _id: string;
  title: string;
  url: string;
}

interface Vendor {
  _id: string;
  name: string;
  category: string;
}

const priorityColors: Record<string, string> = {
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

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations('tickets');
  const tCommon = useTranslations('common');
  const isManager = ['ADMIN', 'BOARD', 'MANAGEMENT'].includes(session?.user?.role || '');
  
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [comment, setComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeForm, setCloseForm] = useState({
    resolutionNotes: '',
    vendorId: 'none',
    invoiceDocumentId: 'none',
    costAmount: '',
    costCurrency: 'ILS',
    notifyWhatsapp: false,
  });

  useEffect(() => {
    async function fetchTicket() {
      try {
        const response = await fetch(`/api/tickets/${params.id}`);
        const result = await response.json();
        if (result.success) {
          setTicket(result.data);
        } else {
          toast.error('Ticket not found');
          router.push('/tickets');
        }
      } catch (error) {
        toast.error('Failed to fetch ticket');
      } finally {
        setLoading(false);
      }
    }

    async function fetchVendors() {
      const response = await fetch('/api/vendors?limit=100');
      const result = await response.json();
      if (result.success) setVendors(result.data.data);
    }

    async function fetchDocuments() {
      const response = await fetch('/api/documents?limit=100&category=receipt');
      const result = await response.json();
      if (result.success) setDocuments(result.data.data);
    }

    fetchTicket();
    if (isManager) {
      fetchVendors();
      fetchDocuments();
    }
  }, [params.id, router, isManager]);

  const handleStatusChange = async (status: string) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const result = await response.json();
      if (result.success) {
        setTicket(result.data);
        toast.success('Status updated');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleVendorChange = async (vendorId: string) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: vendorId === 'none' ? null : vendorId }),
      });

      const result = await response.json();
      if (result.success) {
        setTicket(result.data);
        toast.success('Vendor assigned');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to assign vendor');
    } finally {
      setUpdating(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    setSendingComment(true);
    try {
      const response = await fetch(`/api/tickets/${params.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: comment }),
      });

      const result = await response.json();
      if (result.success) {
        setTicket(result.data);
        setComment('');
        toast.success('Comment added');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to add comment');
    } finally {
      setSendingComment(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!closeForm.resolutionNotes.trim()) {
      toast.error(t('resolutionSummary') + ' ' + tCommon('required'));
      return;
    }

    setClosing(true);
    try {
      const payload: Record<string, unknown> = {
        resolutionNotes: closeForm.resolutionNotes,
        costCurrency: closeForm.costCurrency,
      };

      if (closeForm.vendorId && closeForm.vendorId !== 'none') {
        payload.vendorId = closeForm.vendorId;
      }

      if (closeForm.invoiceDocumentId && closeForm.invoiceDocumentId !== 'none') {
        payload.invoiceDocumentId = closeForm.invoiceDocumentId;
      }

      if (closeForm.costAmount) {
        payload.costAmount = parseFloat(closeForm.costAmount);
      }

      if (closeForm.notifyWhatsapp && ticket?.apartmentId) {
        payload.notify = {
          channel: 'whatsapp',
          target: 'resident',
          mode: 'open_whatsapp',
        };
      }

      const response = await fetch(`/api/tickets/${params.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.success) {
        setTicket(result.data);
        setIsCloseDialogOpen(false);
        toast.success(t('ticketClosed'));
        
        // If WhatsApp notification was requested, open WhatsApp
        if (closeForm.notifyWhatsapp && ticket?.apartmentId) {
          sendWhatsAppNotification(result.data);
        }
      } else if (response.status === 409) {
        toast.error(t('ticketAlreadyClosed'));
      } else {
        toast.error(result.error || 'Failed to close ticket');
      }
    } catch (error) {
      toast.error('Failed to close ticket');
    } finally {
      setClosing(false);
    }
  };

  const sendWhatsAppNotification = (closedTicket: Ticket) => {
    // Get resident phone from vendor if assigned, or we'd need resident data
    const vendorPhone = closedTicket.vendorId?.phone;
    const buildingName = 'ועד הבית';
    
    const message = `שלום,

בקשת השירות "${closedTicket.title}" טופלה ונסגרה ✅

סיכום הטיפול:
${closedTicket.resolutionNotes || ''}

${closedTicket.costAmount ? `עלות: ₪${closedTicket.costAmount}` : ''}

תודה,
${buildingName}`;

    // For now, just copy the message - we'd need resident phone for WhatsApp
    navigator.clipboard.writeText(message);
    toast.success(tCommon('copiedToClipboard'));
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Loading..." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="flex flex-col h-full">
      <Header title={ticket.title} />
      
      <div className="flex-1 p-4 lg:p-6 space-y-6">
        {/* Back button */}
        <Button variant="ghost" onClick={() => router.push('/tickets')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tickets
        </Button>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{ticket.description}</p>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {ticket.timeline.map((entry, i) => (
                  <div key={entry._id || i} className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{entry.byUserName || entry.byUserId?.name || 'System'}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{entry.message}</p>
                    </div>
                  </div>
                ))}

                <Separator />

                {/* Add Comment */}
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <Button type="submit" disabled={sendingComment || !comment.trim()}>
                    {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  {isManager ? (
                    <Select value={ticket.status} onValueChange={handleStatusChange} disabled={updating}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="waiting_vendor">Waiting Vendor</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className={statusColors[ticket.status]}>{ticket.status.replace('_', ' ')}</Badge>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Priority</p>
                  <Badge className={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Apartment</p>
                  <p>{ticket.apartmentId ? `Apt. ${ticket.apartmentId.number}` : 'Building-wide'}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Created By</p>
                  <p>{ticket.createdBy?.name}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Created At</p>
                  <p className="text-sm">{formatDateTime(ticket.createdAt)}</p>
                </div>

                {ticket.resolvedAt && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Resolved At</p>
                    <p className="text-sm">{formatDateTime(ticket.resolvedAt)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {isManager && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('vendorTechnician')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select 
                    value={ticket.vendorId?._id || 'none'} 
                    onValueChange={handleVendorChange}
                    disabled={updating || ticket.status === 'closed'}
                  >
                    <SelectTrigger><SelectValue placeholder={t('selectVendor')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('noVendor')}</SelectItem>
                      {vendors.map((v) => (
                        <SelectItem key={v._id} value={v._id}>
                          {v.name} ({v.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {ticket.vendorId && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {ticket.vendorId.category}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Closure Details - Show if ticket is closed */}
            {ticket.status === 'closed' && ticket.resolutionNotes && (
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    {t('resolution')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm whitespace-pre-wrap">{ticket.resolutionNotes}</p>
                  
                  {ticket.closedByUserId && (
                    <div className="text-xs text-muted-foreground">
                      {t('closedBy')}: {ticket.closedByUserId.name}
                    </div>
                  )}
                  
                  {ticket.closedAt && (
                    <div className="text-xs text-muted-foreground">
                      {t('closedAt')}: {formatDateTime(ticket.closedAt)}
                    </div>
                  )}
                  
                  {(ticket.costAmount !== undefined && ticket.costAmount > 0) && (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <span className="text-sm font-medium">{t('costDetails')}:</span>
                      <span className="text-sm">₪{ticket.costAmount.toLocaleString()}</span>
                    </div>
                  )}
                  
                  {ticket.invoiceDocumentId && (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={ticket.invoiceDocumentId.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {ticket.invoiceDocumentId.title}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Close Ticket Button */}
            {isManager && ticket.status !== 'closed' && (
              <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" variant="default">
                    <CheckCircle2 className="ms-2 h-4 w-4" />
                    {t('closeTicket')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t('closeAndDocument')}</DialogTitle>
                    <DialogDescription>{t('closeTicketDesc')}</DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>{t('resolutionSummary')} *</Label>
                      <Textarea
                        value={closeForm.resolutionNotes}
                        onChange={(e) => setCloseForm({ ...closeForm, resolutionNotes: e.target.value })}
                        placeholder={t('resolutionPlaceholder')}
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('vendorTechnician')}</Label>
                        <Select 
                          value={closeForm.vendorId} 
                          onValueChange={(v) => setCloseForm({ ...closeForm, vendorId: v })}
                        >
                          <SelectTrigger><SelectValue placeholder={t('selectVendor')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('noVendor')}</SelectItem>
                            {vendors.map((v) => (
                              <SelectItem key={v._id} value={v._id}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>{t('attachInvoice')}</Label>
                        <Select 
                          value={closeForm.invoiceDocumentId} 
                          onValueChange={(v) => setCloseForm({ ...closeForm, invoiceDocumentId: v })}
                        >
                          <SelectTrigger><SelectValue placeholder={t('selectDocument')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('noDocument')}</SelectItem>
                            {documents.map((d) => (
                              <SelectItem key={d._id} value={d._id}>
                                {d.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('costAmount')}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={closeForm.costAmount}
                          onChange={(e) => setCloseForm({ ...closeForm, costAmount: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('costCurrency')}</Label>
                        <Select 
                          value={closeForm.costCurrency} 
                          onValueChange={(v) => setCloseForm({ ...closeForm, costCurrency: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ILS">₪ ILS</SelectItem>
                            <SelectItem value="USD">$ USD</SelectItem>
                            <SelectItem value="EUR">€ EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {ticket.apartmentId && (
                      <div className="flex items-center space-x-2 pt-2 border-t">
                        <Checkbox
                          id="notifyWhatsapp"
                          checked={closeForm.notifyWhatsapp}
                          onCheckedChange={(checked) => setCloseForm({ ...closeForm, notifyWhatsapp: checked === true })}
                        />
                        <Label htmlFor="notifyWhatsapp" className="flex items-center gap-2 cursor-pointer">
                          <MessageSquare className="h-4 w-4" />
                          {t('sendWhatsappNotification')}
                        </Label>
                      </div>
                    )}
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>
                      {tCommon('cancel')}
                    </Button>
                    <Button onClick={handleCloseTicket} disabled={closing || !closeForm.resolutionNotes.trim()}>
                      {closing && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                      {t('closeTicket')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

