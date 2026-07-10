import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'pharma-oss',
    short_name: 'pharma-oss',
    description: '次世代 電子薬歴・薬局業務支援システム',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0f19',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
