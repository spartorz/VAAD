'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Building2, Users, Receipt, FileSpreadsheet, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type Step = 1 | 2 | 3 | 4 | 5;

interface ImportPreview {
  apartments: { summary: { totalRows: number; created: number; updated: number; skipped: number; errors: number } };
  residents: { summary: { totalRows: number; created: number; skipped: number; usersCreated: number; errors: number } };
}

export default function SetupWizard() {
  const router = useRouter();
  const t = useTranslations('setup');
  const tCommon = useTranslations('common');

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [committed, setCommitted] = useState(false);

  const [buildingName, setBuildingName] = useState('');
  const [buildingAddress, setBuildingAddress] = useState('');
  const [buildingCity, setBuildingCity] = useState('');
  const [buildingCountry, setBuildingCountry] = useState('Israel');
  const [timezone, setTimezone] = useState('Asia/Jerusalem');
  const [currency, setCurrency] = useState('ILS');

  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminRole, setAdminRole] = useState<'BOARD' | 'ADMIN'>('BOARD');

  const [monthlyDueAmount, setMonthlyDueAmount] = useState('350');
  const [dueDay, setDueDay] = useState('10');
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [bankInstructions, setBankInstructions] = useState('');

  const [skipImport, setSkipImport] = useState(true);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);

  const progress = useMemo(() => (step / 5) * 100, [step]);

  const canProceed = useMemo(() => {
    if (step === 1) return buildingName.trim() && buildingAddress.trim() && buildingCity.trim();
    if (step === 2) return adminName.trim() && adminEmail.trim() && adminPassword.length >= 8;
    if (step === 3) return Number(monthlyDueAmount) >= 0 && Number(dueDay) >= 1 && Number(dueDay) <= 28 && invoicePrefix.trim();
    if (step === 4) return skipImport || !!importFile;
    return true;
  }, [step, buildingName, buildingAddress, buildingCity, adminName, adminEmail, adminPassword, monthlyDueAmount, dueDay, invoicePrefix, skipImport, importFile]);

  const payload = useMemo(() => ({
    building: {
      name: buildingName,
      address: buildingAddress,
      city: buildingCity,
      country: buildingCountry,
      timezone,
      currency,
    },
    admin: {
      fullName: adminName,
      email: adminEmail,
      password: adminPassword,
      role: adminRole,
    },
    billing: {
      monthlyDueAmount: Number(monthlyDueAmount),
      dueDay: Number(dueDay),
      invoicePrefix,
      bankInstructions: bankInstructions || undefined,
    },
    importOptions: {
      skipImport,
    },
  }), [
    buildingName,
    buildingAddress,
    buildingCity,
    buildingCountry,
    timezone,
    currency,
    adminName,
    adminEmail,
    adminPassword,
    adminRole,
    monthlyDueAmount,
    dueDay,
    invoicePrefix,
    bankInstructions,
    skipImport,
  ]);

  const buildRequestBody = () => {
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    if (!skipImport && importFile) {
      formData.append('file', importFile);
    }
    return formData;
  };

  const runImportPreview = async () => {
    if (skipImport) {
      setImportPreview(null);
      return;
    }

    if (!importFile) {
      toast.error(t('selectExcelFile'));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/setup/bootstrap?dryRun=1', {
        method: 'POST',
        body: buildRequestBody(),
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error || t('importPreviewFailed'));
        return;
      }
      setImportPreview(result.data.importPreview);
      toast.success(t('importPreviewReady'));
    } catch {
      toast.error(t('importPreviewFailed'));
    } finally {
      setLoading(false);
    }
  };

  const completeSetup = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/setup/bootstrap?dryRun=0', {
        method: 'POST',
        body: buildRequestBody(),
      });
      const result = await response.json();
      if (!result.success) {
        if (response.status === 409) {
          toast.error(t('alreadyInitialized'));
          router.replace('/login');
          return;
        }
        toast.error(result.error || t('setupFailed'));
        return;
      }

      setCommitted(true);
      setStep(5);
      toast.success(t('setupCompleted'));
    } catch {
      toast.error(t('setupFailed'));
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => setStep((Math.min(5, step + 1) as Step));
  const goBack = () => setStep((Math.max(1, step - 1) as Step));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 lg:p-8">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>{t('title')}</CardTitle>
                <CardDescription>{t('subtitle')}</CardDescription>
              </div>
            </div>
            <div className="space-y-2 pt-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{t('stepLabel', { current: step, total: 5 })}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {step === 1 && (
              <section className="space-y-4">
                <h3 className="text-base font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" />{t('buildingStep')}</h3>
                <div className="grid gap-2">
                  <Label>{t('buildingName')}</Label>
                  <Input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>{t('buildingAddress')}</Label>
                  <Input value={buildingAddress} onChange={(e) => setBuildingAddress(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{t('city')}</Label>
                    <Input value={buildingCity} onChange={(e) => setBuildingCity(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('country')}</Label>
                    <Input value={buildingCountry} onChange={(e) => setBuildingCountry(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{t('timezone')}</Label>
                    <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('currency')}</Label>
                    <Input value={currency} onChange={(e) => setCurrency(e.target.value)} dir="ltr" />
                  </div>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4">
                <h3 className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4" />{t('adminStep')}</h3>
                <div className="grid gap-2">
                  <Label>{t('fullName')}</Label>
                  <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>{t('email')}</Label>
                  <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} type="email" dir="ltr" />
                </div>
                <div className="grid gap-2">
                  <Label>{t('password')}</Label>
                  <Input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} type="password" dir="ltr" />
                </div>
                <div className="grid gap-2">
                  <Label>{t('role')}</Label>
                  <Select value={adminRole} onValueChange={(value: 'BOARD' | 'ADMIN') => setAdminRole(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOARD">{t('roleBoard')}</SelectItem>
                      <SelectItem value="ADMIN">{t('roleAdmin')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-4">
                <h3 className="text-base font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" />{t('billingStep')}</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>{t('monthlyDue')}</Label>
                    <Input value={monthlyDueAmount} onChange={(e) => setMonthlyDueAmount(e.target.value)} type="number" min="0" />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('dueDay')}</Label>
                    <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} type="number" min="1" max="28" />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('invoicePrefix')}</Label>
                    <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} dir="ltr" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>{t('bankInstructions')}</Label>
                  <Textarea value={bankInstructions} onChange={(e) => setBankInstructions(e.target.value)} rows={4} />
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="space-y-4">
                <h3 className="text-base font-semibold flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />{t('importStep')}</h3>
                <div className="flex items-center gap-2">
                  <Button type="button" variant={skipImport ? 'default' : 'outline'} onClick={() => setSkipImport(true)}>{t('skipImport')}</Button>
                  <Button type="button" variant={!skipImport ? 'default' : 'outline'} onClick={() => setSkipImport(false)}>{t('importNow')}</Button>
                </div>

                {!skipImport && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <Label>{t('excelFile')}</Label>
                    <Input
                      type="file"
                      accept=".xlsx"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    />
                    <Button type="button" variant="outline" onClick={runImportPreview} disabled={!importFile || loading}>
                      {loading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                      {t('previewImport')}
                    </Button>
                  </div>
                )}

                {importPreview && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">{t('apartmentsPreview')}</CardTitle></CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <p>{t('totalRows')}: {importPreview.apartments.summary.totalRows}</p>
                        <p>{t('created')}: {importPreview.apartments.summary.created}</p>
                        <p>{t('updated')}: {importPreview.apartments.summary.updated}</p>
                        <p>{t('errors')}: {importPreview.apartments.summary.errors}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">{t('residentsPreview')}</CardTitle></CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <p>{t('totalRows')}: {importPreview.residents.summary.totalRows}</p>
                        <p>{t('created')}: {importPreview.residents.summary.created}</p>
                        <p>{t('usersCreated')}: {importPreview.residents.summary.usersCreated}</p>
                        <p>{t('errors')}: {importPreview.residents.summary.errors}</p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </section>
            )}

            {step === 5 && (
              <section className="space-y-4">
                <h3 className="text-base font-semibold">{t('completionStep')}</h3>
                <div className="rounded-lg border bg-green-50 p-4 text-green-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">{committed ? t('readyToLogin') : t('reviewBeforeFinish')}</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <p><Badge variant="outline">{t('buildingStep')}</Badge> {buildingName}</p>
                  <p><Badge variant="outline">{t('adminStep')}</Badge> {adminName} ({adminEmail})</p>
                  <p><Badge variant="outline">{t('billingStep')}</Badge> {monthlyDueAmount} {currency}</p>
                  <p><Badge variant="outline">{t('importStep')}</Badge> {skipImport ? t('importSkipped') : t('importIncluded')}</p>
                </div>
              </section>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <Button type="button" variant="outline" onClick={goBack} disabled={step === 1 || loading}>
                {tCommon('back')}
              </Button>

              {step < 4 && (
                <Button type="button" onClick={goNext} disabled={!canProceed || loading}>
                  {tCommon('next')}
                </Button>
              )}

              {step === 4 && (
                <Button type="button" onClick={() => setStep(5)} disabled={!canProceed || loading}>
                  {t('continueToSummary')}
                </Button>
              )}

              {step === 5 && !committed && (
                <Button type="button" onClick={completeSetup} disabled={loading}>
                  {loading && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                  {t('finishSetup')}
                </Button>
              )}

              {step === 5 && committed && (
                <Button type="button" onClick={() => router.replace('/login')}>
                  {t('goToLogin')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
