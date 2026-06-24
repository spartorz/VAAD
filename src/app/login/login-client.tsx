'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Building2, Loader2, AlertCircle } from 'lucide-react';

const SHOW_DEMO =
  process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === 'true' ||
  process.env.NODE_ENV === 'development';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError(t('invalidCredentials'));
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError(t('invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md relative shadow-xl border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader className="space-y-4 text-center pb-2">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
          <Building2 className="h-7 w-7 text-white" />
        </div>
        <div>
          <CardTitle className="text-2xl font-bold tracking-tight">{t('welcomeBack')}</CardTitle>
          <CardDescription className="mt-1.5">{t('loginSubtitle')}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pt-2 pb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">{t('email')}</Label>
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
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium">{t('password')}</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11"
              disabled={loading}
              dir="ltr"
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full h-11 text-base font-medium mt-1" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                {t('signingIn')}
              </>
            ) : (
              t('signIn')
            )}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            {t('forgotPassword')}
          </Link>
        </div>

        {SHOW_DEMO && (
          <div className="mt-6 pt-5 border-t">
            <p className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              {t('demoUsers')}
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { role: t('boardMember'), email: 'board@demo.com' },
                { role: 'גזבר', email: 'treasurer@demo.com' },
                { role: t('resident'), email: 'resident@demo.com' },
              ].map(({ role, email: demoEmail }) => (
                <button
                  key={demoEmail}
                  type="button"
                  onClick={() => {
                    setEmail(demoEmail);
                    setPassword('demo123');
                  }}
                  className="rounded-lg bg-muted/40 border border-border/40 p-2.5 text-center hover:bg-muted/70 hover:border-border transition-colors cursor-pointer"
                >
                  <p className="font-semibold text-foreground mb-1">{role}</p>
                  <p className="text-muted-foreground leading-tight" dir="ltr">{demoEmail}</p>
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2.5">{t('demoPassword')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginClientPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%239C92AC%22%20fill-opacity%3D%220.03%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />
      <Suspense fallback={
        <div className="w-full max-w-md h-96 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
