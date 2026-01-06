import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // For now, we only support Hebrew. Can expand later.
  const locale = 'he';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});





