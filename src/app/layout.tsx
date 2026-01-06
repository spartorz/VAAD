import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

// Heebo is a beautiful Hebrew-supporting font
const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  display: 'swap',
  variable: '--font-heebo',
});

export const metadata: Metadata = {
  title: 'ועד בית - מערכת ניהול בניין',
  description: 'מערכת מקצועית לניהול ועד בית ובניינים משותפים',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-screen antialiased font-sans">
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
