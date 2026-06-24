import { redirect } from 'next/navigation';
import { getSystemInitializationState } from '@/lib/setup/system-init';
import LoginClientPage from './login-client';

export default async function LoginPage() {
  const state = await getSystemInitializationState();
  if (!state.isInitialized) {
    redirect('/setup');
  }

  return <LoginClientPage />;
}
