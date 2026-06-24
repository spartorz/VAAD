'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Loader2, AlertCircle, MailCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setError('יותר מדי בקשות. המתן מספר דקות ונסה שוב.');
        return;
      }
      // Always show success — never reveal whether the address is registered
      setSubmitted(true);
    } catch {
      setError('אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%239C92AC%22%20fill-opacity%3D%220.03%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />

      <Card className="w-full max-w-md relative shadow-xl border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="px-8 py-10">

          {submitted ? (
            /* ────────── Success state ────────── */
            <div className="flex flex-col items-center text-center gap-6">
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center">
                <MailCheck className="h-7 w-7 text-green-600" />
              </div>

              {/* Copy */}
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  הקישור נשלח
                </h1>
                <p className="text-muted-foreground leading-relaxed">
                  בדוק את תיבת הדואר שלך
                </p>
                <p className="text-sm text-muted-foreground/80 leading-relaxed">
                  אם כתובת האימייל קיימת במערכת, שלחנו אליה קישור לאיפוס הסיסמה.
                  הקישור תקף לשעה אחת. לא קיבלת? בדוק את תיקיית הספאם.
                </p>
              </div>

              {/* CTA */}
              <Button asChild className="w-full h-11 text-base font-medium">
                <Link href="/login">חזרה להתחברות</Link>
              </Button>
            </div>

          ) : (
            /* ────────── Request form ────────── */
            <div className="space-y-8">
              {/* Header */}
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                  <Building2 className="h-7 w-7 text-white" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    שכחת סיסמה?
                  </h1>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס הסיסמה
                  </p>
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
                  <Label htmlFor="email" className="text-sm font-medium">כתובת אימייל</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11"
                    disabled={loading}
                    dir="ltr"
                    autoComplete="email"
                    autoFocus
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
                      שולח קישור...
                    </>
                  ) : (
                    'שלח קישור לאיפוס'
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
          )}

        </CardContent>
      </Card>
    </div>
  );
}
