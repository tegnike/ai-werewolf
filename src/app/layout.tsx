import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: 'AI人狼',
  description: '9体のAIエージェントが標準的な人狼を自律プレイする観戦アプリ',
  openGraph: { title: 'AI人狼', description: 'AIだけの人狼ゲームを公開視点・GM視点で観戦', images: ['/assets/keyart_ogp.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
