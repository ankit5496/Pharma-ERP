import type { SignIn } from '@clerk/nextjs';
import type { ComponentProps } from 'react';

/**
 * Derived from the component's own props rather than imported from
 * '@clerk/types': that package is an internal transitive dependency of
 * @clerk/nextjs and is not resolvable here, and adding it directly would pin a
 * version Clerk is free to change. This shape cannot drift.
 */
type Appearance = NonNullable<ComponentProps<typeof SignIn>['appearance']>;

/**
 * Styling for Clerk's prebuilt <SignIn> / <SignUp> components.
 *
 * Clerk's components are used rather than hand-rolled forms because they carry
 * the parts that are tedious and easy to get subtly wrong — email verification,
 * password reset, rate limiting, bot protection, MFA when it is switched on.
 * The `elements` map below restyles them to match the rest of the app so they do
 * not read as a third-party widget dropped into the page.
 *
 * Styled entirely through Tailwind class strings rather than Clerk's `variables`
 * API. Two reasons: the palette then lives in one place (change a colour in
 * tailwind.config.ts and these follow), and the variable key names have churned
 * across Clerk major versions while class names on `elements` have not.
 *
 * Clerk's `layout` options are likewise left at their defaults: the component's
 * own `appearance` prop is typed as Theme, which does not accept them, and the
 * defaults are sensible once `header` and `footer` are hidden below in favour of
 * our own page headings and links.
 */
export const clerkAppearance: Appearance = {
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none border-none',
    card: 'w-full bg-transparent shadow-none p-0 gap-6',

    // Our own page headings do this job; Clerk's would duplicate them.
    header: 'hidden',

    socialButtonsBlockButton:
      'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 normal-case font-medium',
    socialButtonsBlockButtonText: 'font-medium',

    dividerRow: 'my-5',
    dividerLine: 'bg-slate-200',
    dividerText: 'text-slate-400 text-xs uppercase tracking-wide',

    formFieldLabel: 'text-sm font-medium text-slate-700',
    formFieldInput:
      'border-slate-300 bg-white text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900',
    formFieldInputShowPasswordButton: 'text-slate-400 hover:text-slate-600',
    formFieldHintText: 'text-xs text-slate-500',
    formFieldErrorText: 'text-xs text-red-700',

    formButtonPrimary:
      'bg-slate-900 hover:bg-slate-800 text-white normal-case text-sm font-semibold shadow-none',

    footer: 'hidden',
    footerAction: 'hidden',

    identityPreviewEditButton: 'text-slate-600 hover:text-slate-900',
    formResendCodeLink: 'text-slate-700 hover:text-slate-900',
    otpCodeFieldInput: 'border-slate-300 text-slate-900',

    alert: 'border border-red-200 bg-red-50 text-red-800',
    alertText: 'text-sm',
  },
};
