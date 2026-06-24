/**
 * Provider factory — returns the correct NotificationProvider implementation
 * for a given channel, driven purely by runtime configuration.
 *
 * Usage:
 *   const provider = getProviderForChannel('whatsapp_api');
 *   if (!provider) throw new Error('No provider configured for this channel');
 */

import type { NotificationChannel } from '@/lib/types';
import type { NotificationProvider } from './types';
import { WhatsAppBusinessProvider } from './whatsapp-business';

/**
 * Returns a configured provider for the given channel, or null when:
 *   - the channel doesn't have an API-based provider (e.g. whatsapp_manual)
 *   - required env vars are not set
 *   - NOTIFICATIONS_PROVIDER_ENABLED is 'false'
 */
export function getProviderForChannel(
  channel: NotificationChannel
): NotificationProvider | null {
  if (process.env.NOTIFICATIONS_PROVIDER_ENABLED === 'false') {
    return null;
  }

  switch (channel) {
    case 'whatsapp_api':
      return WhatsAppBusinessProvider.fromEnv();

    // Manual channel — no provider needed
    case 'whatsapp_manual':
      return null;

    // Placeholder for future providers
    case 'email':
    case 'sms':
      return null;

    default:
      return null;
  }
}
