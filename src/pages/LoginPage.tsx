// noinspection JSUnusedLocalSymbols
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { useTheme } from '@/contexts/ThemeContext';
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
import { Eye, EyeOff, Mail, Lock, Loader2, Volume2 } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { isDarkMode, getTextColor, primaryColor } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (rememberMe) {
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('remembered_email');
      }
      navigate('/dashboard');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const themeColor = FLUTTER_THEME_COLORS.themeColors[primaryColor as keyof typeof FLUTTER_THEME_COLORS.themeColors];

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
              
              <CardTitle className="text-xl md:text-2xl font-bold" style={{ color: getTextColor() }}>
                Noise Mapper Dashboard
              </CardTitle>
              <CardDescription className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} text-xs md:text-sm`}>
                Sign in to access your research dashboard
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
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 focus:ring-2 focus:ring-offset-2 cursor-pointer"
                      style={{
                        accentColor: themeColor,
                      }}
                    />
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Remember me
                    </span>
                  </label>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-500">{error}</p>
                  </div>
                )}

                {/* Sign In Button */}
                <Button
                  type="submit"
                  className="w-full h-10 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-sm"
                  disabled={isLoading}
                  style={{ 
                    backgroundColor: themeColor,
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

                {/* Don't have an account */}
                <div className="text-center">
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Don't have an account?{' '}
                    <a 
                      href="mailto:admin@noisemapper.lk?subject=Dashboard Access Request" 
                      className="font-semibold hover:underline transition-colors text-xs"
                      style={{ color: themeColor }}
                    >
                      Request access
                    </a>
                  </p>
                </div>
              </form>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className={`w-full border-t ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`} />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className={`px-3 ${isDarkMode ? 'bg-[#2D2640] text-gray-500' : 'bg-white text-gray-500'}`}>
                    Secured by Firebase
                  </span>
                </div>
              </div>

              {/* Footer */}
              <p className="text-center text-[10px] text-gray-500 font-medium tracking-wide">
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
