'use client';

import { MobileNav } from './sidebar';
import { useSession } from 'next-auth/react';
import { Building2 } from 'lucide-react';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      <MobileNav />
      
      <div className="flex items-center gap-2 lg:hidden">
        <Building2 className="h-6 w-6 text-primary" />
        <span className="font-bold">VAAD</span>
      </div>

      <div className="flex-1">
        {title && (
          <h1 className="text-lg font-semibold md:text-xl">{title}</h1>
        )}
      </div>
    </header>
  );
}

