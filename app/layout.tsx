import type { Metadata } from 'next';
import './globals.css';
import './styles/post.css';
import './styles/reels.css';
import './styles/deals.css';
import './styles/check.css';
import { PostHogProvider } from '@/components/PostHogProvider';
import { Toaster } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'Manch — your stage, in your language',
  description:
    'One AI app for India’s creators and professionals: LinkedIn posts from a voice note, Reel scripts in 8 Indian languages, brand deals at fair rates, and fact-checks before you forward.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
        <Toaster />
      </body>
    </html>
  );
}
