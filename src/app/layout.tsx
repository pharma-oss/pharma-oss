import './globals.css';
import type { Metadata } from 'next';
import ClientLayout from './ClientLayout';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'pharma-oss | 薬局業務支援',
  description: 'Local-first high-performance pharmacy management system.',
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
        {/* 右上はスタッフ選択・通知ベルと重なるため右下に表示する */}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
