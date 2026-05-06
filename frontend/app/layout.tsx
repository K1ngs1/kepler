import type { Metadata } from 'next';
import { Inter, Libre_Baskerville } from 'next/font/google';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import { Web3Provider } from '@/components/Web3Provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700', '900'],
});

const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  variable: '--font-baskerville',
  weight: ['400', '700'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Kepler — Pokémon Card Marketplace',
  description: 'The premier marketplace for graded Pokémon cards and vintage TCG collectibles.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Kepler — Pokémon Card Marketplace',
    description: 'The premier marketplace for graded Pokémon cards and vintage TCG collectibles.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${libreBaskerville.variable}`}>
        <Web3Provider>
          <KeyboardShortcuts />
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
