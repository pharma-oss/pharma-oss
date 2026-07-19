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
        {/* 右上はスタッフ選択・通知ベル、右下は受付フォームの送信ボタン・EMRの
            完了/保存バーと重なる(エラートーストが再送信クリックを吸ってしまう)ため、
            クリック対象のない上部中央に表示する */}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
