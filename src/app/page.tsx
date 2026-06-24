import { redirect } from 'next/navigation';
import { getSystemInitializationState } from '@/lib/setup/system-init';

export default async function Home() {
  const state = await getSystemInitializationState();
  if (!state.isInitialized) {
    redirect('/setup');
  }

  redirect('/dashboard');
}
