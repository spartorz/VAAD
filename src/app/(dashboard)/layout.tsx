import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { getSystemInitializationState } from '@/lib/setup/system-init';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initState = await getSystemInitializationState();
  if (!initState.isInitialized) {
    redirect('/setup');
  }

  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen bg-muted/30">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}

