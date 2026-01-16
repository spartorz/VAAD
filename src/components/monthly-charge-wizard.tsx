'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar, DollarSign, Home, Ruler, Building, Edit } from 'lucide-react';
import { toast } from 'sonner';
import {
  MonthlyChargeWizardInput,
  MonthlyChargeType,
  UniformMonthlyChargeInput,
  RoomsBasedMonthlyChargeInput,
  SizeBasedMonthlyChargeInput,
  FloorBasedMonthlyChargeInput,
  ManualMonthlyChargeInput,
} from '@/lib/validations';

interface MonthlyChargeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: MonthlyChargeWizardInput) => Promise<void>;
  buildingId: string;
  currency?: string;
}

type WizardStep = 'type' | 'config' | 'period' | 'summary';

interface WizardState {
  step: WizardStep;
  chargeType: MonthlyChargeType | null;
  data: Partial<MonthlyChargeWizardInput>;
}

export function MonthlyChargeWizard({
  open,
  onOpenChange,
  onSubmit,
  buildingId,
  currency = 'ILS',
}: MonthlyChargeWizardProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');

  const [state, setState] = useState<WizardState>({
    step: 'type',
    chargeType: null,
    data: {},
  });

  const [loading, setLoading] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setState({
        step: 'type',
        chargeType: null,
        data: {},
      });
    }
  }, [open]);

  const handleTypeSelect = (type: MonthlyChargeType) => {
    setState(prev => ({
      ...prev,
      chargeType: type,
      data: { type },
    }));
  };

  const handleNext = () => {
    if (state.step === 'type' && state.chargeType) {
      setState(prev => ({ ...prev, step: 'config' }));
    } else if (state.step === 'config') {
      setState(prev => ({ ...prev, step: 'period' }));
    } else if (state.step === 'period') {
      setState(prev => ({ ...prev, step: 'summary' }));
    }
  };

  const handleBack = () => {
    if (state.step === 'config') {
      setState(prev => ({ ...prev, step: 'type' }));
    } else if (state.step === 'period') {
      setState(prev => ({ ...prev, step: 'config' }));
    } else if (state.step === 'summary') {
      setState(prev => ({ ...prev, step: 'period' }));
    }
  };

  const handleSubmit = async () => {
    if (!state.data) return;

    setLoading(true);
    try {
      await onSubmit(state.data as MonthlyChargeWizardInput);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create monthly charges:', error);
      toast.error(t('monthlyChargeError'));
    } finally {
      setLoading(false);
    }
  };

  const updateData = (updates: Partial<MonthlyChargeWizardInput>) => {
    setState(prev => ({
      ...prev,
      data: { ...prev.data, ...updates },
    }));
  };

  const canProceed = () => {
    switch (state.step) {
      case 'type':
        return !!state.chargeType;
      case 'config':
        return validateConfigStep();
      case 'period':
        return validatePeriodStep();
      default:
        return true;
    }
  };

  const validateConfigStep = (): boolean => {
    if (!state.data) return false;

    switch (state.chargeType) {
      case 'uniform':
        return !!(state.data as UniformMonthlyChargeInput).amount;
      case 'by_rooms':
        return !!((state.data as RoomsBasedMonthlyChargeInput).roomConfigs?.length);
      case 'by_size':
        return !!((state.data as SizeBasedMonthlyChargeInput).baseAmount);
      case 'by_floor':
        return !!((state.data as FloorBasedMonthlyChargeInput).floorConfigs?.length);
      case 'manual':
        return !!((state.data as any).manualConfigs?.length);
      default:
        return false;
    }
  };

  const validatePeriodStep = (): boolean => {
    return !!(state.data as any).startPeriod;
  };

  const renderStepIndicator = () => {
    const steps = [
      { key: 'type', label: 'בחירת סוג חיוב' },
      { key: 'config', label: 'הגדרת פרמטרים' },
      { key: 'period', label: 'תאריך התחלה' },
      { key: 'summary', label: 'סיכום' },
    ];

    return (
      <div className="flex items-center justify-center mb-6">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                state.step === step.key
                  ? 'bg-primary text-primary-foreground'
                  : steps.findIndex(s => s.key === state.step) > index
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-2 ${
                  steps.findIndex(s => s.key === state.step) > index
                    ? 'bg-green-500'
                    : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderTypeStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">בחר סוג חיוב מונטלי</h3>
        <p className="text-muted-foreground">בחר את אופן חישוב החיובים החודשיים</p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="grid grid-cols-1 gap-4">
          <Card 
            className={`p-4 cursor-pointer transition-all hover:shadow-md ${
              state.chargeType === 'uniform' ? 'ring-2 ring-primary shadow-md' : ''
            }`}
            onClick={() => handleTypeSelect('uniform')}
          >
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div>
                <h4 className="font-semibold">חיוב זהה לכל הדיירים</h4>
                <p className="text-sm text-muted-foreground">כל דירה תשלם את אותו הסכום</p>
              </div>
            </div>
          </Card>

          <Card 
            className={`p-4 cursor-pointer transition-all hover:shadow-md ${
              state.chargeType === 'by_rooms' ? 'ring-2 ring-primary shadow-md' : ''
            }`}
            onClick={() => handleTypeSelect('by_rooms')}
          >
            <div className="flex items-center gap-3">
              <Home className="h-8 w-8 text-blue-600" />
              <div>
                <h4 className="font-semibold">חיוב לפי מספר חדרים</h4>
                <p className="text-sm text-muted-foreground">דירות עם יותר חדרים ישלמו יותר</p>
              </div>
            </div>
          </Card>

          <Card 
            className={`p-4 cursor-pointer transition-all hover:shadow-md ${
              state.chargeType === 'by_size' ? 'ring-2 ring-primary shadow-md' : ''
            }`}
            onClick={() => handleTypeSelect('by_size')}
          >
            <div className="flex items-center gap-3">
              <Ruler className="h-8 w-8 text-purple-600" />
              <div>
                <h4 className="font-semibold">חיוב לפי שטח הדירה</h4>
                <p className="text-sm text-muted-foreground">דירות גדולות יותר ישלמו יותר</p>
              </div>
            </div>
          </Card>

          <Card 
            className={`p-4 cursor-pointer transition-all hover:shadow-md ${
              state.chargeType === 'by_floor' ? 'ring-2 ring-primary shadow-md' : ''
            }`}
            onClick={() => handleTypeSelect('by_floor')}
          >
            <div className="flex items-center gap-3">
              <Building className="h-8 w-8 text-orange-600" />
              <div>
                <h4 className="font-semibold">חיוב לפי קומה</h4>
                <p className="text-sm text-muted-foreground">דירות בקומות שונות ישלמו סכומים שונים</p>
              </div>
            </div>
          </Card>

          <Card 
            className={`p-4 cursor-pointer transition-all hover:shadow-md ${
              state.chargeType === 'manual' ? 'ring-2 ring-primary shadow-md' : ''
            }`}
            onClick={() => handleTypeSelect('manual')}
          >
            <div className="flex items-center gap-3">
              <Edit className="h-8 w-8 text-amber-600" />
              <div>
                <h4 className="font-semibold">הגדרה ידנית</h4>
                <p className="text-sm text-muted-foreground">הגדר סכומים ייחודיים לכל דירה בנפרד</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderConfigStep = () => {
    switch (state.chargeType) {
      case 'uniform':
        return <UniformConfigStep data={state.data} updateData={updateData} currency={currency} />;
      case 'by_rooms':
        return <RoomsConfigStep data={state.data} updateData={updateData} currency={currency} />;
      case 'by_size':
        return <SizeConfigStep data={state.data} updateData={updateData} currency={currency} />;
      case 'by_floor':
        return <FloorConfigStep data={state.data} updateData={updateData} currency={currency} />;
      case 'manual':
        return <ManualConfigStep data={state.data} updateData={updateData} currency={currency} buildingId={buildingId} />;
      default:
        return null;
    }
  };

  const renderPeriodStep = () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth(); // 0-11
    const currentYear = currentDate.getFullYear();

    // יצירת רשימת חודשים - 24 חודשים מהחודש הנוכחי
    const months = [];
    for (let i = 0; i < 24; i++) {
      const date = new Date(currentYear, currentMonth + i, 1);
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthYearString = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('he-IL', { month: 'long' });
      const yearLabel = date.toLocaleDateString('he-IL', { year: 'numeric' });

      months.push({
        value: monthYearString,
        monthName,
        yearLabel,
        fullLabel: `${monthName} ${yearLabel}`,
        isCurrent: i === 0
      });
    }

    const startPeriod = (state.data as any).startPeriod || months[0].value;
    const endPeriod = (state.data as any).endPeriod || months[11].value; // ברירת מחדל 12 חודשים

    const handleStartMonthSelect = (monthValue: string) => {
      const startIndex = months.findIndex(m => m.value === monthValue);
      const endIndex = months.findIndex(m => m.value === endPeriod);

      // אם החודש ההתחלה מאוחר מהחודש הסיום, הזז גם את הסיום
      if (startIndex >= endIndex) {
        const newEndIndex = Math.min(months.length - 1, startIndex + 11); // לפחות 12 חודשים
        updateData({
          startPeriod: monthValue,
          endPeriod: months[newEndIndex].value
        });
      } else {
        updateData({ startPeriod: monthValue });
      }
    };

    const handleEndMonthSelect = (monthValue: string) => {
      const startIndex = months.findIndex(m => m.value === startPeriod);
      const endIndex = months.findIndex(m => m.value === monthValue);

      // אם החודש הסיום מוקדם מהחודש ההתחלה, הזז גם את ההתחלה
      if (endIndex <= startIndex) {
        const newStartIndex = Math.max(0, endIndex - 11); // לפחות 12 חודשים
        updateData({
          startPeriod: months[newStartIndex].value,
          endPeriod: monthValue
        });
      } else {
        updateData({ endPeriod: monthValue });
      }
    };

    const startIndex = months.findIndex(m => m.value === startPeriod);
    const endIndex = months.findIndex(m => m.value === endPeriod);

    // חישוב החודשים שיוצגו (6 חודשים לפני ההתחלה ועד 6 חודשים אחרי הסיום)
    const displayStart = Math.max(0, startIndex - 3);
    const displayEnd = Math.min(months.length, endIndex + 4);
    const displayMonths = months.slice(displayStart, displayEnd);

    const getMonthStatus = (monthValue: string) => {
      if (monthValue === startPeriod) return 'start';
      if (monthValue === endPeriod) return 'end';
      const monthIndex = months.findIndex(m => m.value === monthValue);
      return (monthIndex >= startIndex && monthIndex <= endIndex) ? 'selected' : 'unselected';
    };

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">תקופת החיוב</h3>
          <p className="text-muted-foreground">בחר את תקופת החיובים החודשיים</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* Month Range Selector */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <Label className="text-sm font-medium text-green-700">חודש התחלה</Label>
                    <div className="text-lg font-semibold mt-1">
                      {months.find(m => m.value === startPeriod)?.fullLabel}
                    </div>
                  </div>

                  <div className="px-4">
                    <div className="w-8 h-0.5 bg-border"></div>
                  </div>

                  <div className="text-center flex-1">
                    <Label className="text-sm font-medium text-red-700">חודש אחרון</Label>
                    <div className="text-lg font-semibold mt-1">
                      {months.find(m => m.value === endPeriod)?.fullLabel}
                    </div>
                  </div>
                </div>

                {/* Visual Range Indicator */}
                <div className="flex items-center justify-center">
                  <div className="flex items-center space-x-1 bg-muted p-3 rounded-lg">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <div className="text-sm text-muted-foreground">התחלה</div>
                    <div className="w-8 h-0.5 bg-primary mx-2"></div>
                    <div className="text-sm text-muted-foreground">
                      {endIndex - startIndex + 1} חודשים
                    </div>
                    <div className="w-8 h-0.5 bg-primary mx-2"></div>
                    <div className="text-sm text-muted-foreground">סיום</div>
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Month Grid */}
              <div className="space-y-4">
                <Label className="text-center block">בחר חודשים</Label>

                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {displayMonths.map((month) => {
                    const status = getMonthStatus(month.value);

                    return (
                      <div key={month.value} className="space-y-2">
                        <button
                          onClick={() => {
                            if (status === 'start' || status === 'selected') {
                              handleStartMonthSelect(month.value);
                            } else {
                              handleEndMonthSelect(month.value);
                            }
                          }}
                          className={`w-full p-3 rounded-lg border-2 transition-all text-center ${
                            status === 'start'
                              ? 'bg-green-500 text-white border-green-500 shadow-md'
                              : status === 'end'
                              ? 'bg-red-500 text-white border-red-500 shadow-md'
                              : status === 'selected'
                              ? 'bg-blue-100 border-blue-300 text-blue-800'
                              : 'bg-white border-gray-200 hover:border-primary hover:bg-primary/5'
                          }`}
                        >
                          <div className="text-sm font-medium">{month.monthName}</div>
                          <div className="text-xs opacity-75">{month.yearLabel}</div>
                        </button>

                        {status === 'start' && (
                          <div className="text-xs text-center text-green-600 font-medium">התחלה</div>
                        )}
                        {status === 'end' && (
                          <div className="text-xs text-center text-red-600 font-medium">סיום</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-center space-y-2">
                  <div className="flex justify-center space-x-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span>חודש התחלה</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-blue-100 rounded-full border border-blue-300"></div>
                      <span>חודשים נבחרים</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span>חודש אחרון</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    לחץ על חודש כדי להגדיר אותו כחודש התחלה או סיום
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderSummaryStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">סיכום ההגדרות</h3>
        <p className="text-muted-foreground">אנא בדוק את הפרטים לפני האישור</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            פרטי החיוב
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">סוג חיוב:</Label>
            <p className="mt-1">
              {state.chargeType === 'uniform' && 'חיוב זהה לכל הדיירים'}
              {state.chargeType === 'by_rooms' && 'חיוב לפי מספר חדרים'}
              {state.chargeType === 'by_size' && 'חיוב לפי שטח הדירה'}
              {state.chargeType === 'by_floor' && 'חיוב לפי קומה'}
              {state.chargeType === 'manual' && 'הגדרה ידנית'}
            </p>
          </div>

          <Separator />

          {state.chargeType === 'uniform' && (
            <div>
              <Label className="text-sm font-medium">סכום:</Label>
              <p className="mt-1">{(state.data as UniformMonthlyChargeInput).amount} {currency}</p>
            </div>
          )}

          {state.chargeType === 'manual' && (
            <div>
              <Label className="text-sm font-medium">דירות מוגדרות:</Label>
              <p className="mt-1">{((state.data as any).manualConfigs?.length || 0)} דירות</p>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium">חודש התחלה:</Label>
            <p className="mt-1">{(state.data as any).startPeriod}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הגדרת חיובים מונטליים</DialogTitle>
          <DialogDescription>
            צור הגדרות לחיובים החודשיים של הבניין
          </DialogDescription>
        </DialogHeader>

        {renderStepIndicator()}

        <div className="min-h-[400px]">
          {state.step === 'type' && renderTypeStep()}
          {state.step === 'config' && renderConfigStep()}
          {state.step === 'period' && renderPeriodStep()}
          {state.step === 'summary' && renderSummaryStep()}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {state.step !== 'type' && (
              <Button variant="outline" onClick={handleBack} disabled={loading}>
                חזור
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {tCommon('cancel')}
            </Button>

            {state.step === 'summary' ? (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />}
                צור חיובים
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                המשך
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Configuration step components
function UniformConfigStep({
  data,
  updateData,
  currency
}: {
  data: Partial<MonthlyChargeWizardInput>;
  updateData: (updates: Partial<MonthlyChargeWizardInput>) => void;
  currency: string;
}) {
  const getCurrencySymbol = (curr: string) => {
    switch (curr) {
      case 'ILS': return '₪';
      case 'USD': return '$';
      case 'EUR': return '€';
      default: return curr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">הגדרת סכום אחיד</h3>
        <p className="text-muted-foreground">כל הדיירים ישלמו את אותו הסכום</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">סכום חודשי</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                  {getCurrencySymbol(currency)}
                </span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={(data as UniformMonthlyChargeInput).amount || ''}
                  onChange={(e) => updateData({ amount: parseFloat(e.target.value) || 0 })}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="title">כותרת החיוב</Label>
              <Input
                id="title"
                placeholder="דמי ועד חודשיים"
                value={(data as UniformMonthlyChargeInput).title || ''}
                onChange={(e) => updateData({ title: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="description">תיאור</Label>
              <Input
                id="description"
                placeholder="תיאור מפורט של החיוב"
                value={(data as UniformMonthlyChargeInput).description || ''}
                onChange={(e) => updateData({ description: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RoomsConfigStep({
  data,
  updateData,
  currency
}: {
  data: Partial<MonthlyChargeWizardInput>;
  updateData: (updates: Partial<MonthlyChargeWizardInput>) => void;
  currency: string;
}) {
  const config = data as RoomsBasedMonthlyChargeInput;
  const [roomConfigs, setRoomConfigs] = useState(config.roomConfigs || []);

  const addRoomConfig = () => {
    setRoomConfigs([...roomConfigs, { rooms: 1, amount: 0, title: '' }]);
  };

  const updateRoomConfig = (index: number, updates: any) => {
    const newConfigs = [...roomConfigs];
    newConfigs[index] = { ...newConfigs[index], ...updates };
    setRoomConfigs(newConfigs);
    updateData({ roomConfigs: newConfigs });
  };

  const removeRoomConfig = (index: number) => {
    const newConfigs = roomConfigs.filter((_, i) => i !== index);
    setRoomConfigs(newConfigs);
    updateData({ roomConfigs: newConfigs });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">חיוב לפי מספר חדרים</h3>
        <p className="text-muted-foreground">הגדר סכום שונה לכל מספר חדרים</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {roomConfigs.map((config, index) => (
              <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <Label>מספר חדרים</Label>
                  <Input
                    type="number"
                    min="1"
                    value={config.rooms}
                    onChange={(e) => updateRoomConfig(index, { rooms: parseInt(e.target.value) })}
                  />
                </div>
                <div className="flex-1">
                  <Label>סכום</Label>
                  <Input
                    type="number"
                    value={config.amount}
                    onChange={(e) => updateRoomConfig(index, { amount: parseFloat(e.target.value) })}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1">
                  <Label>כותרת</Label>
                  <Input
                    value={config.title}
                    onChange={(e) => updateRoomConfig(index, { title: e.target.value })}
                    placeholder="דירת X חדרים"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removeRoomConfig(index)}
                  className="mt-6"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button onClick={addRoomConfig} variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              הוסף הגדרת חדרים
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SizeConfigStep({
  data,
  updateData,
  currency
}: {
  data: Partial<MonthlyChargeWizardInput>;
  updateData: (updates: Partial<MonthlyChargeWizardInput>) => void;
  currency: string;
}) {
  const config = data as SizeBasedMonthlyChargeInput;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">חיוב לפי שטח הדירה</h3>
        <p className="text-muted-foreground">הגדר חיובים לפי גודל הדירה</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <Label>סוג חישוב</Label>
              <RadioGroup
                value={config.calculationType || 'manual'}
                onValueChange={(value: 'manual' | 'percentage') => updateData({ calculationType: value })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="manual" id="manual" />
                  <Label htmlFor="manual">הגדרה ידנית</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="percentage" />
                  <Label htmlFor="percentage">חישוב לפי אחוזים</Label>
                </div>
              </RadioGroup>
            </div>

            {config.calculationType === 'percentage' ? (
              <div>
                <Label htmlFor="baseAmount">סכום בסיס</Label>
                <Input
                  id="baseAmount"
                  type="number"
                  value={config.baseAmount || ''}
                  onChange={(e) => updateData({ baseAmount: parseFloat(e.target.value) })}
                  placeholder='סכום בסיס למ"ר'
                />
              </div>
            ) : (
              <div className="text-muted-foreground">
                <p>תצטרך להגדיר סכומים ידנית לכל דירה בהתאם לשטחה</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FloorConfigStep({
  data,
  updateData,
  currency
}: {
  data: Partial<MonthlyChargeWizardInput>;
  updateData: (updates: Partial<MonthlyChargeWizardInput>) => void;
  currency: string;
}) {
  const config = data as FloorBasedMonthlyChargeInput;
  const [floorConfigs, setFloorConfigs] = useState(config.floorConfigs || []);

  const addFloorConfig = () => {
    setFloorConfigs([...floorConfigs, { minFloor: 0, maxFloor: 0, amount: 0, title: '' }]);
  };

  const updateFloorConfig = (index: number, updates: any) => {
    const newConfigs = [...floorConfigs];
    newConfigs[index] = { ...newConfigs[index], ...updates };
    setFloorConfigs(newConfigs);
    updateData({ floorConfigs: newConfigs });
  };

  const removeFloorConfig = (index: number) => {
    const newConfigs = floorConfigs.filter((_, i) => i !== index);
    setFloorConfigs(newConfigs);
    updateData({ floorConfigs: newConfigs });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">חיוב לפי קומה</h3>
        <p className="text-muted-foreground">הגדר סכום שונה לכל קומה או טווח קומות</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {floorConfigs.map((config, index) => (
              <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <Label>קומה מינימלית</Label>
                  <Input
                    type="number"
                    value={config.minFloor}
                    onChange={(e) => updateFloorConfig(index, { minFloor: parseInt(e.target.value) })}
                  />
                </div>
                <div className="flex-1">
                  <Label>קומה מקסימלית</Label>
                  <Input
                    type="number"
                    value={config.maxFloor}
                    onChange={(e) => updateFloorConfig(index, { maxFloor: parseInt(e.target.value) })}
                  />
                </div>
                <div className="flex-1">
                  <Label>סכום</Label>
                  <Input
                    type="number"
                    value={config.amount}
                    onChange={(e) => updateFloorConfig(index, { amount: parseFloat(e.target.value) })}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1">
                  <Label>כותרת</Label>
                  <Input
                    value={config.title}
                    onChange={(e) => updateFloorConfig(index, { title: e.target.value })}
                    placeholder="קומה X"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removeFloorConfig(index)}
                  className="mt-6"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button onClick={addFloorConfig} variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              הוסף הגדרת קומה
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ApartmentManualConfig {
  apartmentId: string;
  apartmentNumber: string;
  amount: number;
  title?: string;
}

function ManualConfigStep({
  data,
  updateData,
  currency,
  buildingId
}: {
  data: Partial<MonthlyChargeWizardInput>;
  updateData: (updates: Partial<MonthlyChargeWizardInput>) => void;
  currency: string;
  buildingId: string;
}) {
  const [apartments, setApartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualConfigs, setManualConfigs] = useState<ApartmentManualConfig[]>(
    (data as any).manualConfigs || []
  );

  useEffect(() => {
    async function fetchApartments() {
      try {
        const response = await fetch('/api/apartments?limit=100');
        const result = await response.json();
        if (result.success) {
          setApartments(result.data.data);
        }
      } catch (error) {
        toast.error('שגיאה בטעינת דירות');
      } finally {
        setLoading(false);
      }
    }
    fetchApartments();
  }, []);

  const addApartmentConfig = () => {
    if (apartments.length === 0) return;
    const firstUnused = apartments.find(apt => 
      !manualConfigs.some(config => config.apartmentId === apt._id)
    );
    if (firstUnused) {
      const newConfigs = [
        ...manualConfigs,
        { apartmentId: firstUnused._id, apartmentNumber: firstUnused.number, amount: 0, title: '' }
      ];
      setManualConfigs(newConfigs);
      updateData({ manualConfigs: newConfigs });
    }
  };

  const updateApartmentConfig = (index: number, updates: Partial<ApartmentManualConfig>) => {
    const newConfigs = [...manualConfigs];
    if (updates.apartmentId) {
      const apt = apartments.find(a => a._id === updates.apartmentId);
      if (apt) {
        newConfigs[index] = { ...newConfigs[index], ...updates, apartmentNumber: apt.number };
      }
    } else {
      newConfigs[index] = { ...newConfigs[index], ...updates };
    }
    setManualConfigs(newConfigs);
    updateData({ manualConfigs: newConfigs });
  };

  const removeApartmentConfig = (index: number) => {
    const newConfigs = manualConfigs.filter((_, i) => i !== index);
    setManualConfigs(newConfigs);
    updateData({ manualConfigs: newConfigs });
  };

  const availableApartments = (currentAptId?: string) => {
    return apartments.filter(apt => 
      apt._id === currentAptId || !manualConfigs.some(config => config.apartmentId === apt._id)
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">הגדרה ידנית</h3>
        <p className="text-muted-foreground">הגדר סכום ייחודי לכל דירה בנפרד</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {manualConfigs.map((config, index) => (
              <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <Label>דירה</Label>
                  <Select
                    value={config.apartmentId}
                    onValueChange={(value) => updateApartmentConfig(index, { apartmentId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="בחר דירה" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableApartments(config.apartmentId).map((apt) => (
                        <SelectItem key={apt._id} value={apt._id}>
                          דירה {apt.number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label>סכום</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={config.amount}
                      onChange={(e) => updateApartmentConfig(index, { amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="pr-12"
                    />
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                      {currency}
                    </span>
                  </div>
                </div>
                <div className="flex-1">
                  <Label>כותרת (אופציונלי)</Label>
                  <Input
                    value={config.title || ''}
                    onChange={(e) => updateApartmentConfig(index, { title: e.target.value })}
                    placeholder="דמי ועד חודשיים"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removeApartmentConfig(index)}
                  className="mt-6"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {manualConfigs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                לא הוגדרו דירות עדיין. לחץ על "הוסף דירה" להתחלה.
              </div>
            )}

            <Button 
              onClick={addApartmentConfig} 
              variant="outline" 
              className="w-full"
              disabled={manualConfigs.length >= apartments.length}
            >
              <Plus className="h-4 w-4 mr-2" />
              הוסף דירה
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}