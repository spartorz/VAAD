import { redirect } from 'next/navigation';
import { getSystemInitializationState } from '@/lib/setup/system-init';
import SetupWizard from './setup-wizard';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const state = await getSystemInitializationState();
  if (state.isInitialized) {
    redirect('/login');
  }

  return <SetupWizard />;
}
