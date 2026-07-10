/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', '[::1]'],
  transpilePackages: ['rxdb', 'rxjs', 'tesseract.js'],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };
    return config;
  },
  turbopack: {},
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin'
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            // Allow RxDB and OCR Web Workers to build, run and load scripts/data from trusted CDN (jsdelivr)
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net;"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
