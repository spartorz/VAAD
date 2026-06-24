'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Loader2, AlertCircle, ShieldCheck, KeyRound } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   Inner form — wrapped in Suspense so useSearchParams works in RSC pipeline
───────────────────────────────────────────────────────────────────────────── */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  /* ── Invalid / expired token ── */
  if (!token) {
    return (
      <div className="flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-red-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">הקישור אינו תקין</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            קישור האיפוס חסר או פג תוקפו.
            <br />
            בקש קישור חדש מדף שחזור הסיסמה.
          </p>
        </div>
        <div className="w-full space-y-3">
          <Button asChild className="w-full h-11 text-base font-medium">
            <Link href="/forgot-password">בקשת קישור חדש</Link>
          </Button>
          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              חזרה להתחברות
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── Success ── */
  if (success) {
    return (
      <div className="flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center">
          <ShieldCheck className="h-7 w-7 text-green-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            הסיסמה עודכנה בהצלחה
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            כעת תוכל להיכנס למערכת עם הסיסמה החדשה שלך.
          </p>
        </div>
        <Button asChild className="w-full h-11 text-base font-medium">
          <Link href="/login">כניסה למערכת</Link>
        </Button>
      </div>
    );
  }

  /* ── Reset form ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים.');
      return;
    }
    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (res.status === 429) {
        setError('יותר מדי ניסיונות. המתן מספר דקות ונסה שוב.');
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError('קישור האיפוס אינו תקין או שפג תוקפו. בקש קישור חדש.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
          <KeyRound className="h-7 w-7 text-white" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">איפוס סיסמה</h1>
          <p className="text-muted-foreground text-sm">בחר סיסמה חדשה לחשבונך</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium">סיסמה חדשה</Label>
          <Input
            id="password"
            type="password"
            placeholder="לפחות 8 תווים"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="h-11"
            disabled={loading}
            dir="ltr"
            autoComplete="new-password"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">אימות סיסמה</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="הזן שוב את הסיסמה"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="h-11"
            disabled={loading}
            dir="ltr"
            autoComplete="new-password"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 text-base font-medium"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              מעדכן סיסמה...
            </>
          ) : (
            'עדכון סיסמה'
          )}
        </Button>
      </form>

      {/* Back link */}
      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          חזרה להתחברות
        </Link>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Page shell — shared background + card wrapper
───────────────────────────────────────────────────────────────────────────── */
export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%239C92AC%22%20fill-opacity%3D%220.03%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />

      <Card className="w-full max-w-md relative shadow-xl border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="px-8 py-10">
          <Suspense fallback={
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }>
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
