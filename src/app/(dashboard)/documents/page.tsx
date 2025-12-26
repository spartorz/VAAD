'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
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
import { Plus, MoreHorizontal, Trash2, Loader2, FileText, Download, Upload, Eye, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/hooks';

interface Document {
  _id: string;
  title: string;
  category: string;
  visibility: 'public' | 'residents_only' | 'board_only';
  file: {
    url: string;
    name: string;
    mimeType: string;
    size: number;
  };
  createdBy: { name: string };
  createdAt: string;
}

const categoryColors: Record<string, string> = {
  insurance: 'bg-blue-100 text-blue-700',
  protocol: 'bg-purple-100 text-purple-700',
  receipt: 'bg-green-100 text-green-700',
  contract: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-700',
};

const visibilityIcons: Record<string, React.ReactNode> = {
  public: <Eye className="h-3 w-3" />,
  residents_only: <Eye className="h-3 w-3" />,
  board_only: <Lock className="h-3 w-3" />,
};

export default function DocumentsPage() {
  const { data: session } = useSession();
  const isManager = ['ADMIN', 'BOARD', 'MANAGEMENT'].includes(session?.user?.role || '');
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ url: string; name: string; mimeType: string; size: number } | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
      });
      
      const response = await fetch(`/api/documents?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setDocuments(result.data.data);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      toast.error('Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setUploadedFile(result.data);
        toast.success('File uploaded');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadedFile) {
      toast.error('Please upload a file first');
      return;
    }
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get('title'),
      category: formData.get('category'),
      visibility: formData.get('visibility'),
      file: uploadedFile,
    };

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
        toast.success('Document created');
        setIsUploadOpen(false);
        setUploadedFile(null);
        fetchDocuments();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to create document');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const response = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        toast.success('Document deleted');
        fetchDocuments();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const columns: ColumnDef<Document>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.file.name}</p>
          </div>
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
      accessorKey: 'visibility',
      header: 'Visibility',
      cell: ({ row }) => (
        <Badge variant="outline" className="flex items-center gap-1 w-fit">
          {visibilityIcons[row.original.visibility]}
          {row.original.visibility.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'file.size',
      header: 'Size',
      cell: ({ row }) => formatFileSize(row.original.file.size),
    },
    {
      accessorKey: 'createdAt',
      header: 'Uploaded',
      cell: ({ row }) => (
        <div>
          <p className="text-sm">{formatDate(row.original.createdAt)}</p>
          <p className="text-xs text-muted-foreground">by {row.original.createdBy?.name}</p>
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={row.original.file.url} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />Download
              </a>
            </DropdownMenuItem>
            {isManager && (
              <DropdownMenuItem onClick={() => handleDelete(row.original._id)} className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Documents" />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="max-w-xs"
          />
          {isManager && (
            <Dialog open={isUploadOpen} onOpenChange={(open) => {
              setIsUploadOpen(open);
              if (!open) setUploadedFile(null);
            }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Upload Document</Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Upload Document</DialogTitle>
                    <DialogDescription>Upload a document to the building.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    {/* File Upload */}
                    <div className="grid gap-2">
                      <Label>File *</Label>
                      {uploadedFile ? (
                        <div className="p-3 rounded-lg bg-muted flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm">{uploadedFile.name}</span>
                            <span className="text-xs text-muted-foreground">({formatFileSize(uploadedFile.size)})</span>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setUploadedFile(null)}>
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed rounded-lg p-6 text-center">
                          <input
                            type="file"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="doc-upload"
                            disabled={uploadingFile}
                          />
                          <label htmlFor="doc-upload" className="cursor-pointer flex flex-col items-center gap-2">
                            {uploadingFile ? (
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            ) : (
                              <Upload className="h-6 w-6 text-muted-foreground" />
                            )}
                            <span className="text-sm text-muted-foreground">
                              {uploadingFile ? 'Uploading...' : 'Click to upload'}
                            </span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label>Title *</Label>
                      <Input name="title" required placeholder="Document title" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Category *</Label>
                        <Select name="category" required>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="insurance">Insurance</SelectItem>
                            <SelectItem value="protocol">Protocol</SelectItem>
                            <SelectItem value="receipt">Receipt</SelectItem>
                            <SelectItem value="contract">Contract</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Visibility *</Label>
                        <Select name="visibility" required defaultValue="board_only">
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="public">Public</SelectItem>
                            <SelectItem value="residents_only">Residents Only</SelectItem>
                            <SelectItem value="board_only">Board Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={formLoading || !uploadedFile}>
                      {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Upload
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <DataTable
          columns={columns}
          data={documents}
          loading={loading}
          pagination={pagination}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        />
      </div>
    </div>
  );
}

