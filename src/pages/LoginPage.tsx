// noinspection JSUnusedLocalSymbols
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { passwordResetFailure, resetSentMessage, signInErrorMessage } from '@/lib/authErrors';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeReturnPath } from '@/lib/returnPath';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
import { readableTextColor } from '@/lib/contrast';
import { Eye, EyeOff, Mail, Lock, Loader2, Volume2 } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  // ux-8: ProtectedRoute leaves the page the visitor asked for in location
  // state. safeReturnPath accepts internal paths only (no open redirect).
  const returnPath = safeReturnPath((location.state as { from?: unknown } | null)?.from);
  const { isDarkMode, getTextColor, primaryColor } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // a11y-7: the password-reset confirmation (never an error), and its request state.
  const [notice, setNotice] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(returnPath, { replace: true });
    } catch (err: unknown) {
      // a11y-7: plain-language copy chosen by err.code, never the raw SDK text.
      setError(signInErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // a11y-7: "Forgot password?" sends Firebase's reset email to the address in
  // the email field. Auth only: nothing is written to Firestore. The success
  // copy is the same whether or not an account exists for the address.
  const handlePasswordReset = async () => {
    setError('');
    setNotice('');
    const address = email.trim();
    if (!address) {
      setError('Enter your email address above, then choose "Forgot password?" again.');
      return;
    }
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, address);
      setNotice(resetSentMessage(address));
    } catch (err: unknown) {
      const outcome = passwordResetFailure(err, address);
      if ('notice' in outcome) {
        setNotice(outcome.notice);
      } else {
        setError(outcome.error);
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  const themeColor = FLUTTER_THEME_COLORS.themeColors[primaryColor as keyof typeof FLUTTER_THEME_COLORS.themeColors];

  // ux-8: a signed-in user has no use for the sign-in form. This also carries a
  // fresh sign-in on to the return path once the auth listener reports the user.
  if (isAuthenticated) {
    return <Navigate to={returnPath} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Beautiful Animated Background */}
      <div className="absolute inset-0">
        {/* Gradient Mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-indigo-900/20" />
        
        {/* Animated Gradient Orbs */}
        <div
          className="absolute top-0 left-1/4 w-64 h-64 md:w-80 md:h-80 rounded-full opacity-15 blur-3xl"
          style={{
            background: `radial-gradient(circle, ${themeColor} 0%, transparent 70%)`,
            animation: 'float 8s ease-in-out infinite',
          }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-64 h-64 md:w-80 md:h-80 rounded-full opacity-15 blur-3xl"
          style={{
            background: `radial-gradient(circle, ${FLUTTER_THEME_COLORS.themeColors.Blue} 0%, transparent 70%)`,
            animation: 'float 10s ease-in-out infinite reverse',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 md:w-[500px] md:h-[500px] rounded-full opacity-10 blur-3xl"
          style={{
            background: `radial-gradient(circle, ${FLUTTER_THEME_COLORS.themeColors.Purple} 0%, transparent 70%)`,
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
        
        {/* Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(${isDarkMode ? '#ffffff' : '#000000'} 1px, transparent 1px),
              linear-gradient(90deg, ${isDarkMode ? '#ffffff' : '#000000'} 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Noise Pattern Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="animate-fade-in-up">
          <Card
            className="backdrop-blur-2xl shadow-2xl border border-white/10"
            style={{
              backgroundColor: isDarkMode ? 'rgba(45, 38, 64, 0.9)' : 'rgba(255, 255, 255, 0.9)',
              boxShadow: `0 25px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)`,
            }}
          >
            <CardHeader className="space-y-3 text-center pb-6">
              {/* Beautiful Custom Logo */}
              <div className="mx-auto">
                <div 
                  className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center shadow-2xl mx-auto relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${themeColor} 0%, ${FLUTTER_THEME_COLORS.themeColors.Blue} 100%)`,
                    boxShadow: `0 12px 40px ${themeColor}50, inset 0 2px 10px rgba(255,255,255,0.2)`,
                  }}
                >
                  {/* Integrated Sound Wave Design */}
                  <div className="relative flex items-center gap-1">
                    <Volume2 className="h-8 w-8 md:h-10 md:w-10 text-white relative z-10" strokeWidth={1.5} />
                    {/* Sound bars - positioned close to icon */}
                    <div className="flex items-end gap-0.5">
                      <div className="w-0.5 md:w-0.75 bg-white/70 rounded-full animate-sound-1" style={{ height: '10px' }} />
                      <div className="w-0.5 md:w-0.75 bg-white/70 rounded-full animate-sound-2" style={{ height: '16px' }} />
                      <div className="w-0.5 md:w-0.75 bg-white/70 rounded-full animate-sound-3" style={{ height: '12px' }} />
                    </div>
                  </div>
                  
                  {/* Animated rings - sized to fit INSIDE the box */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="absolute w-12 h-12 md:w-16 md:h-16 border-2 border-white/30 rounded-full animate-ping" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="absolute w-16 h-16 md:w-20 md:h-20 border border-white/20 rounded-full animate-pulse-inner" />
                  </div>
                </div>
              </div>
              
              {/* a11y-7: the page's one heading (CardTitle itself renders a <div>) */}
              <CardTitle className="text-xl md:text-2xl font-bold" style={{ color: getTextColor() }}>
                <h1>Noise Mapper Dashboard</h1>
              </CardTitle>
              <CardDescription className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} text-xs md:text-sm`}>
                Sign in with your Noise Mapper app account
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4 pb-6">
              <form onSubmit={handleLogin} className="space-y-3.5">
                {/* Email Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className={`${isDarkMode ? 'text-gray-300' : 'text-gray-700'} text-xs font-medium`}>
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="username"
                      placeholder="researcher@example.com"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      disabled={isLoading}
                      required
                      className={`pl-9 h-10 text-sm ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}
                      style={{
                        '--ring-color': themeColor,
                      } as React.CSSProperties}
                    />
                  </div>
                </div>

                {/* Password Field with Show/Hide Toggle */}
                <div className="space-y-1.5">
                  <Label htmlFor="password" className={`${isDarkMode ? 'text-gray-300' : 'text-gray-700'} text-xs font-medium`}>
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      disabled={isLoading}
                      required
                      className={`pl-9 pr-9 h-10 text-sm ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}
                      style={{
                        '--ring-color': themeColor,
                      } as React.CSSProperties}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-800'} transition-colors`}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-controls="password"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Forgot password (a11y-7): Firebase's reset email for the address above */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handlePasswordReset()}
                    disabled={isLoading || isSendingReset}
                    className="text-xs font-medium hover:underline disabled:opacity-50"
                    style={{ color: themeColor }}
                  >
                    {isSendingReset ? 'Sending reset email...' : 'Forgot password?'}
                  </button>
                </div>

                {/* Error Message: role="alert" so screen readers announce it (a11y-7) */}
                {error && (
                  <div role="alert" className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className={`text-sm ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</p>
                  </div>
                )}

                {/* Password-reset confirmation (a11y-7) */}
                {notice && (
                  <div role="status" className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className={`text-xs ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>{notice}</p>
                  </div>
                )}

                {/* Sign In Button */}
                <Button
                  type="submit"
                  className="w-full h-10 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-sm"
                  disabled={isLoading}
                  style={{ 
                    backgroundColor: themeColor,
                    color: readableTextColor(themeColor),
                    boxShadow: `0 4px 14px ${themeColor}40`,
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className={`w-full border-t ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`} />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className={`px-3 ${isDarkMode ? 'bg-[#2D2640] text-gray-400' : 'bg-white text-gray-600'}`}>
                    Secured by Firebase
                  </span>
                </div>
              </div>

              {/* Footer */}
              <p className={`text-center text-xs font-medium tracking-wide ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Nuhaadh Hassan | Paradise Techx
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0) scale(1);
          }
          33% {
            transform: translateY(-30px) translateX(20px) scale(1.1);
          }
          66% {
            transform: translateY(-15px) translateX(-20px) scale(0.9);
          }
        }
        
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes sound-1 {
          0%, 100% { height: 10px; }
          50% { height: 18px; }
        }
        
        @keyframes sound-2 {
          0%, 100% { height: 16px; }
          50% { height: 24px; }
        }
        
        @keyframes sound-3 {
          0%, 100% { height: 12px; }
          50% { height: 20px; }
        }
        
        @keyframes pulse-inner {
          0%, 100% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.1;
          }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }
        
        .animate-sound-1 {
          animation: sound-1 0.8s ease-in-out infinite;
        }
        
        .animate-sound-2 {
          animation: sound-2 0.8s ease-in-out infinite 0.1s;
        }
        
        .animate-sound-3 {
          animation: sound-3 0.8s ease-in-out infinite 0.2s;
        }
      `}</style>
    </div>
  );
}
