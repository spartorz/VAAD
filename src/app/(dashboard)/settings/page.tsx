'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Building2, CreditCard, Landmark, Save, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface BuildingSettings {
  _id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  settings: {
    currency: string;
    dueDay: number;
    monthlyDueAmount?: number;
  };
  bankInfo?: {
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
    notes?: string;
  };
}

const CURRENCIES = [
  { code: 'ILS', name: 'Israeli Shekel (₪)', symbol: '₪' },
  { code: 'USD', name: 'US Dollar ($)', symbol: '$' },
  { code: 'EUR', name: 'Euro (€)', symbol: '€' },
  { code: 'GBP', name: 'British Pound (£)', symbol: '£' },
];

const TIMEZONES = [
  { value: 'Asia/Jerusalem', label: 'Israel (GMT+2/+3)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Central European' },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const [building, setBuilding] = useState<BuildingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [dueDay, setDueDay] = useState(10);
  const [monthlyDueAmount, setMonthlyDueAmount] = useState<number | ''>('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [bankNotes, setBankNotes] = useState('');

  const userRole = session?.user?.role;
  const canEdit = ['ADMIN', 'BOARD', 'MANAGEMENT'].includes(userRole || '');
  const canEditFinancial = ['ADMIN', 'BOARD', 'MANAGEMENT', 'TREASURER'].includes(userRole || '');

  // Check if there are unsaved changes for each section
  const hasGeneralChanges = building && (
    name !== (building.name || '') ||
    address !== (building.address || '') ||
    city !== (building.city || '') ||
    country !== (building.country || '') ||
    timezone !== (building.timezone || 'Asia/Jerusalem')
  );

  const hasBillingChanges = building && (
    currency !== (building.settings?.currency || 'ILS') ||
    dueDay !== (building.settings?.dueDay || 10) ||
    String(monthlyDueAmount || '') !== String(building.settings?.monthlyDueAmount || '')
  );

  const hasBankChanges = building && (
    bankName !== (building.bankInfo?.bankName || '') ||
    accountNumber !== (building.bankInfo?.accountNumber || '') ||
    routingNumber !== (building.bankInfo?.routingNumber || '') ||
    bankNotes !== (building.bankInfo?.notes || '')
  );

  const fetchBuilding = useCallback(async () => {
    try {
      const response = await fetch('/api/building');
      const result = await response.json();
      
      if (result.success) {
        const data = result.data;
        setBuilding(data);
        setName(data.name || '');
        setAddress(data.address || '');
        setCity(data.city || '');
        setCountry(data.country || '');
        setTimezone(data.timezone || 'Asia/Jerusalem');
        setCurrency(data.settings?.currency || 'ILS');
        setDueDay(data.settings?.dueDay || 10);
        setMonthlyDueAmount(data.settings?.monthlyDueAmount || '');
        setBankName(data.bankInfo?.bankName || '');
        setAccountNumber(data.bankInfo?.accountNumber || '');
        setRoutingNumber(data.bankInfo?.routingNumber || '');
        setBankNotes(data.bankInfo?.notes || '');
      } else {
        toast.error(result.error || 'Failed to fetch building settings');
      }
    } catch (error) {
      toast.error('Failed to fetch building settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuilding();
  }, [fetchBuilding]);

  const handleSaveGeneral = async () => {
    if (!canEdit) return;
    setSaving(true);
    
    try {
      const payload = {
        name,
        address,
        city,
        country,
        timezone,
      };

      const response = await fetch('/api/building', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Building information saved successfully');
        setBuilding(result.data);
        setLastSaved(new Date());
      } else {
        toast.error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBilling = async () => {
    if (!canEditFinancial) return;
    setSaving(true);
    
    try {
      const payload = {
        settings: {
          currency,
          dueDay,
          monthlyDueAmount: monthlyDueAmount || undefined,
        },
      };

      const response = await fetch('/api/building', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Billing settings saved successfully');
        setBuilding(result.data);
        setLastSaved(new Date());
      } else {
        toast.error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBank = async () => {
    if (!canEditFinancial) return;
    setSaving(true);
    
    try {
      const payload = {
        bankInfo: {
          bankName: bankName || undefined,
          accountNumber: accountNumber || undefined,
          routingNumber: routingNumber || undefined,
          notes: bankNotes || undefined,
        },
      };

      const response = await fetch('/api/building', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bank information saved successfully');
        setBuilding(result.data);
        setLastSaved(new Date());
      } else {
        toast.error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Building Settings" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Residents see read-only minimal view
  if (userRole === 'RESIDENT') {
    return (
      <div className="flex flex-col h-full">
        <Header title="Building Information" />
        <div className="flex-1 p-4 lg:p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {building?.name}
              </CardTitle>
              <CardDescription>Your building information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Address</Label>
                  <p className="font-medium">{building?.address}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">City</Label>
                  <p className="font-medium">{building?.city}, {building?.country}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Currency</Label>
                  <p className="font-medium">{building?.settings?.currency || 'ILS'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Payment Due Day</Label>
                  <p className="font-medium">{building?.settings?.dueDay || 10} of each month</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Building Settings" />
      
      <div className="flex-1 p-4 lg:p-6 space-y-6">
        {/* Last saved indicator */}
        {lastSaved && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Last saved: {lastSaved.toLocaleTimeString()}
          </div>
        )}

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              General
              {hasGeneralChanges && <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" />}
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Billing
              {hasBillingChanges && <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" />}
            </TabsTrigger>
            <TabsTrigger value="bank" className="flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Bank Info
              {hasBankChanges && <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" />}
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>Building Information</CardTitle>
                <CardDescription>
                  Basic details about your building
                  {!canEdit && <span className="ml-2 text-amber-600">(Read-only for your role)</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Building Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Sunset Towers"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Main Street"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Tel Aviv"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Israel"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone} disabled={!canEdit}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
              {canEdit && (
                <CardFooter className="border-t pt-6">
                  <Button 
                    onClick={handleSaveGeneral} 
                    disabled={saving || !hasGeneralChanges}
                    className="ml-auto"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {hasGeneralChanges ? 'Save Changes' : 'No Changes'}
                  </Button>
                </CardFooter>
              )}
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Billing Settings</CardTitle>
                <CardDescription>
                  Configure payment and billing preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select value={currency} onValueChange={setCurrency} disabled={!canEditFinancial}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.symbol} {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="dueDay">Due Day of Month</Label>
                      <Select 
                        value={dueDay.toString()} 
                        onValueChange={(v) => setDueDay(parseInt(v))}
                        disabled={!canEditFinancial}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                            <SelectItem key={day} value={day.toString()}>
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Payments are due on this day each month
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="monthlyDueAmount">Default Monthly Amount</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {CURRENCIES.find(c => c.code === currency)?.symbol || '₪'}
                        </span>
                        <Input
                          id="monthlyDueAmount"
                          type="number"
                          className="pl-8"
                          value={monthlyDueAmount}
                          onChange={(e) => setMonthlyDueAmount(e.target.value ? parseFloat(e.target.value) : '')}
                          placeholder="0.00"
                          disabled={!canEditFinancial}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Used when generating monthly charges
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
              {canEditFinancial && (
                <CardFooter className="border-t pt-6">
                  <Button 
                    onClick={handleSaveBilling} 
                    disabled={saving || !hasBillingChanges}
                    className="ml-auto"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {hasBillingChanges ? 'Save Changes' : 'No Changes'}
                  </Button>
                </CardFooter>
              )}
            </Card>
          </TabsContent>

          {/* Bank Info Tab */}
          <TabsContent value="bank">
            <Card>
              <CardHeader>
                <CardTitle>Bank Account Information</CardTitle>
                <CardDescription>
                  Building's bank account for receiving payments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input
                      id="bankName"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g., Bank Hapoalim"
                      disabled={!canEditFinancial}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="accountNumber">Account Number</Label>
                      <Input
                        id="accountNumber"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="123456789"
                        disabled={!canEditFinancial}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="routingNumber">Branch / Routing Number</Label>
                      <Input
                        id="routingNumber"
                        value={routingNumber}
                        onChange={(e) => setRoutingNumber(e.target.value)}
                        placeholder="123"
                        disabled={!canEditFinancial}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="bankNotes">Payment Instructions / Notes</Label>
                    <Textarea
                      id="bankNotes"
                      value={bankNotes}
                      onChange={(e) => setBankNotes(e.target.value)}
                      placeholder="e.g., Please include your apartment number in the transfer reference"
                      rows={3}
                      disabled={!canEditFinancial}
                    />
                    <p className="text-xs text-muted-foreground">
                      These notes will be shown to residents when viewing payment instructions
                    </p>
                  </div>
                </div>
              </CardContent>
              {canEditFinancial && (
                <CardFooter className="border-t pt-6">
                  <Button 
                    onClick={handleSaveBank} 
                    disabled={saving || !hasBankChanges}
                    className="ml-auto"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {hasBankChanges ? 'Save Changes' : 'No Changes'}
                  </Button>
                </CardFooter>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
