// 📄 src/routes/__root.tsx

import {
  createRootRoute,
  Outlet,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { AuthProvider } from '../providers/AuthProvider' 
import { useTranslation } from 'react-i18next'

import appCss from '../styles.css?url'
import lightboxCss from 'yet-another-react-lightbox/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'stylesheet', href: '/css/katex.min.css' },
      { rel: 'stylesheet', href: lightboxCss },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  return (
    <html>
      <head>
        <title>{t('appTitle')}</title>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}