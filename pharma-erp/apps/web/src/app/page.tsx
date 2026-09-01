import { redirect } from 'next/navigation';

/**
 * The root always defers to /post-auth, which resolves the session and sends the
 * caller to the right place. Keeping the decision in one server component means
 * sign-in, sign-up and a bare visit to "/" cannot drift apart.
 */
export default function HomePage() {
  redirect('/post-auth');
}
