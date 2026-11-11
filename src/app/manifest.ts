import type { MetadataRoute } from 'next'

/** A lightweight installable shell; no private page or API is cached offline. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ganges Healers',
    short_name: 'Ganges Healers',
    description: 'Explore healing services, sessions, guided audio and your personal wellbeing journey.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4c1d95',
    icons: [
      { src: '/pwa-icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: '/pwa-icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'maskable' },
    ],
  }
}
