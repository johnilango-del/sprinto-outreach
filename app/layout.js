import { Inter, Inter_Tight } from 'next/font/google';
import Nav from './components/Nav';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-inter-tight', weight: ['500', '600', '700', '800'], display: 'swap' });

export const metadata = {
  title: 'Outreach Desk · Sprinto',
  description: 'Internal research and drafting tool for Sprinto outreach. Every send is a human decision.',
  robots: { index: false, follow: false },
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body>
        <div className="strip">Test mode: every email goes only to your own inbox. Nothing reaches a prospect without your click.</div>
        <Nav />
        <main>{children}</main>
        <footer className="footer">
          <div className="wrap">Research and drafts by the system. Every send is a human decision.</div>
        </footer>
      </body>
    </html>
  );
}
