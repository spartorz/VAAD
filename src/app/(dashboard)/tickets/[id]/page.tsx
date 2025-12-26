'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Send, User, Clock } from 'lucide-react';
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
  vendorId?: { _id: string; name: string; category: string };
  timeline: Array<{
    _id: string;
    byUserId: { _id: string; name: string };
    byUserName?: string;
    message: string;
    createdAt: string;
  }>;
  createdAt: string;
  resolvedAt?: string;
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
  const isManager = ['ADMIN', 'BOARD', 'MANAGEMENT'].includes(session?.user?.role || '');
  
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [comment, setComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

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

    fetchTicket();
    if (isManager) fetchVendors();
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
        body: JSON.stringify({ vendorId: vendorId || undefined }),
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
                  <CardTitle>Vendor</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select 
                    value={ticket.vendorId?._id || ''} 
                    onValueChange={handleVendorChange}
                    disabled={updating}
                  >
                    <SelectTrigger><SelectValue placeholder="Assign vendor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No vendor</SelectItem>
                      {vendors.map((v) => (
                        <SelectItem key={v._id} value={v._id}>
                          {v.name} ({v.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {ticket.vendorId && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Category: {ticket.vendorId.category}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

