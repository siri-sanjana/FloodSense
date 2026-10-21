import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FloodSense — Autonomous Multimodal Flood Assessment & SITREP Ops',
  description: 'Precision aerial drone segmentation, hydrological impact assessment, and grounded situation reporting for disaster response forces.',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400;1,700&family=Roboto+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white text-slate-900 antialiased selection:bg-cyan-100 selection:text-cyan-900 font-sans">
        {children}
      </body>
    </html>
  );
}
