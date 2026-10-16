import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Shown for any path no route matches (ux-8). The route in routes.tsx wraps it
 * in Layout for a signed-in user and renders it bare for a signed-out visitor.
 * The link goes to /dashboard, which sends a signed-out visitor on to sign-in.
 */
export default function NotFoundPage() {
  const { isDarkMode } = useTheme();

  return (
    <div
      className={cn(
        'mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center',
        isDarkMode ? 'text-gray-100' : 'text-gray-900',
      )}
    >
      <Compass className="mb-4 h-12 w-12 opacity-70" aria-hidden="true" />
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <p className={cn('mb-6 text-sm', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>
        There is nothing at this address. It may have moved, or the link may be mistyped.
      </p>
      <Link to="/dashboard" className={buttonVariants()}>
        Back to the dashboard
      </Link>
    </div>
  );
}
