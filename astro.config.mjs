// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import sentry from '@sentry/astro';

// https://astro.build/config
export default defineConfig({
  site: 'https://smallbizcalc.com',
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [
    sentry({
      dsn: 'https://40ec1f5d0c72ee8ca5e58421624a4ada@o4510827630231552.ingest.de.sentry.io/4511031100244048',
      enabled: { client: false, server: true },
      sourceMapsUploadOptions: {
        enabled: false,
      },
    }),sitemap()]
});
