import './globals.css';
import type { Metadata, Viewport } from 'next';
import ClientLayout from './ClientLayout';
import { Toaster } from 'sonner';
import { BRAND_BACKGROUND_COLOR, BRAND_THEME_COLOR } from './manifest';

export const metadata: Metadata = {
  title: 'pharma-oss | 薬局業務支援',
  description: 'Local-first high-performance pharmacy management system.',
  applicationName: 'pharma-oss',
  // metadata.icons を明示すると src/app/icon.svg のファイル規約による
  // 自動 favicon 注入が上書きされて消えるため、SVG も併せて明示する。
  // Apple のタッチアイコンは SVG 非対応のため PNG を指す。
  // 生成は `npm run brand:icons`（scripts/brandMark.mjs が単一ソース）。
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'pharma-oss',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND_THEME_COLOR },
    { media: '(prefers-color-scheme: dark)', color: BRAND_BACKGROUND_COLOR },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <ClientLayout>{children}</ClientLayout>
        {/* 右上はスタッフ選択・通知ベル、右下は受付フォームの送信ボタン・EMRの
            完了/保存バーと重なる(エラートーストが再送信クリックを吸ってしまう)ため、
            クリック対象のない上部中央に表示する */}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
