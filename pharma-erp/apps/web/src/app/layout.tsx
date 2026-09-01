import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { clerkAppearance } from '@/lib/clerk-appearance';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Pharma ERP',
    template: '%s · Pharma ERP',
  },
  description: 'Manufacturing, quality and compliance ERP for pharmaceutical manufacturers.',
  // An internal ERP has no business being indexed.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // ClerkProvider wraps the whole tree so `useAuth`, <SignOutButton> and the
    // rest work anywhere. The sign-in/sign-up URLs are declared here rather than
    // via env vars so the routes and this configuration cannot drift apart.
    <ClerkProvider
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/post-auth"
      signUpFallbackRedirectUrl="/onboarding"
    >
      <html lang="en">
        <body className="min-h-screen font-sans">{children}</body>
      </html>
    </ClerkProvider>
  );
}
