'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface FetchOptions extends RequestInit {
  showError?: boolean;
}

export function useApi() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const fetchApi = useCallback(async <T>(
    url: string,
    options: FetchOptions = {}
  ): Promise<{ data: T | null; error: string | null }> => {
    const { showError = true, ...fetchOptions } = options;
    
    setLoading(true);
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const error = result.error || 'An error occurred';
        if (showError) {
          toast.error(error);
        }
        return { data: null, error };
      }

      return { data: result.data as T, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      if (showError) {
        toast.error(message);
      }
      return { data: null, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchApi, loading, session };
}

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useState(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  });

  return debouncedValue;
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

