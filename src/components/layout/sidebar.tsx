'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Building2,
  LayoutDashboard,
  Users,
  Home,
  CreditCard,
  Wrench,
  Truck,
  FileText,
  ClipboardList,
  LogOut,
  ChevronDown,
  Menu,
  Settings,
  Bell,
} from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface NavItem {
  titleKey: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

const navigation: NavItem[] = [
  { titleKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { titleKey: 'apartments', href: '/apartments', icon: Home, roles: ['ADMIN', 'BOARD', 'TREASURER', 'MANAGEMENT'] },
  { titleKey: 'residents', href: '/residents', icon: Users, roles: ['ADMIN', 'BOARD', 'TREASURER', 'MANAGEMENT'] },
  { titleKey: 'billing', href: '/billing', icon: CreditCard },
  { titleKey: 'notifications', href: '/notifications', icon: Bell, roles: ['ADMIN', 'BOARD', 'TREASURER', 'MANAGEMENT'] },
  { titleKey: 'tickets', href: '/tickets', icon: Wrench },
  { titleKey: 'vendors', href: '/vendors', icon: Truck, roles: ['ADMIN', 'BOARD', 'MANAGEMENT'] },
  { titleKey: 'documents', href: '/documents', icon: FileText },
  { titleKey: 'auditLog', href: '/audit-log', icon: ClipboardList, roles: ['ADMIN', 'BOARD', 'MANAGEMENT'] },
  { titleKey: 'settings', href: '/settings', icon: Settings, roles: ['ADMIN', 'BOARD', 'TREASURER', 'MANAGEMENT'] },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <item.icon className="h-4 w-4" />
      {t(item.titleKey)}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = useSession();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const userRole = session?.user?.role;

  const filteredNavigation = navigation.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
  );

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <Building2 className="h-7 w-7 text-primary" />
        <span className="text-xl font-bold tracking-tight">{tCommon('appName')}</span>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {filteredNavigation.map((item) => (
            <NavLink key={item.href} item={item} onClick={onNavigate} />
          ))}
        </nav>
      </ScrollArea>

      {/* User Menu */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 px-2"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {session?.user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col items-start text-right">
                <span className="text-sm font-medium truncate max-w-[140px]">
                  {session?.user?.name || 'משתמש'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {session?.user?.role}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{session?.user?.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {session?.user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-red-600 focus:text-red-600"
            >
              <LogOut className="ms-2 h-4 w-4" />
              {t('signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex h-screen w-64 flex-col border-s bg-card">
      <SidebarContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">תפריט</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-64 p-0">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
