import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@presentation/auth/AuthContext';
import type { Actor } from '@domain/shared/types';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { OtpInput } from '../components/ui/OtpInput';
import { useNavigate } from 'react-router-dom';

export interface TeacherSignInViewProps {
  onSignedIn?: (actor: Actor) => void;
  initialError?: string | null;
}

type Step = 'email' | 'code' | 'password' | 'forgot-password' | 'update-password';

export default function TeacherSignInView({ onSignedIn, initialError = null }: TeacherSignInViewProps) {
  const { sendEmailOtp, verifyEmailOtp, signInTeacherPassword, sendPasswordResetEmail, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('password'); // Default to password
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    // Check if we are in a recovery flow
    if (window.location.hash.includes('type=recovery')) {
      setStep('update-password');
      setInfo('Please enter your new password below.');
    }
    
    // Load remembered email
    const savedEmail = localStorage.getItem('mis_teacher_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    try {
      const result = await sendEmailOtp(email);
      if (result.ok) {
        setStep('code');
        setInfo(`We sent a 6-digit code to ${email.trim()}. Enter it below.`);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await verifyEmailOtp(email, code);
      if (result.ok) {
        onSignedIn?.(result.value);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signInTeacherPassword(email, passwordValue);
      if (result.ok) {
        if (rememberMe) {
          localStorage.setItem('mis_teacher_email', email);
        } else {
          localStorage.removeItem('mis_teacher_email');
        }
        onSignedIn?.(result.value);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendResetLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    try {
      const result = await sendPasswordResetEmail(email);
      if (result.ok) {
        setInfo(`A password reset link has been sent to ${email.trim()}. Check your inbox.`);
        // Don't change step, just show info
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await updatePassword(passwordValue);
      if (result.ok) {
        setInfo('Password updated successfully! Redirecting...');
        // Clear hash and navigate to dashboard
        window.history.replaceState(null, '', window.location.pathname);
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1500);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Helper styles for premium inputs
  const inputClass = "block w-full pl-11 pr-4 py-4 border border-white/20 dark:border-white/10 rounded-xl bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl text-[#0d1c2e] dark:text-[#ffffff] font-medium placeholder:text-[#777683]/60 dark:placeholder:text-[#94a3b8]/60 focus:border-[#15157d] dark:border-[#818cf8] focus:ring-0 transition-colors shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73]";
  const btnClass = "w-full bg-[#15157d] dark:bg-[#818cf8] hover:bg-[#04006d] dark:hover:bg-[#6366f1] text-white font-semibold py-4 rounded-xl shadow-[4px_4px_10px_rgba(21,21,125,0.3),-4px_-4px_10px_rgba(255,255,255,0.5)] dark:shadow-[4px_4px_10px_rgba(2,6,23,0.5),-4px_-4px_10px_rgba(30,41,59,0.5)] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 hover:-translate-y-0.5 active:translate-y-0";

  return (
    <div className="min-h-screen flex flex-col font-['Inter'] antialiased bg-transparent text-[#0d1c2e] dark:text-[#ffffff] transition-colors duration-500 relative overflow-hidden">
      {/* Background ambient glowing orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#818cf8]/20 dark:bg-[#6366f1]/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#c7d2fe]/30 dark:bg-[#3730a3]/30 blur-[120px] pointer-events-none" />

      <header className="w-full top-0 z-50 sticky px-6 py-4 flex justify-end">
        <ThemeToggle />
      </header>

      <main className="flex-grow flex flex-col items-center justify-center p-4 w-full mx-auto z-10 relative">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div className="text-center space-y-3 mb-4">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/40 dark:bg-[#1e293b]/60 backdrop-blur-xl rounded-3xl mb-2 shadow-[8px_8px_16px_#d1d9e6,-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_#020617,-8px_-8px_16px_#1e293b] border border-white/40 dark:border-white/10 transform transition-transform hover:scale-105 duration-500">
              <span className="material-symbols-outlined text-[40px] text-[#15157d] dark:text-[#818cf8] drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" style={{ fontVariationSettings: "'FILL' 1" }}>
                {step === 'password' ? 'admin_panel_settings' : step === 'update-password' ? 'key' : step === 'forgot-password' ? 'lock_reset' : 'shield_person'}
              </span>
            </div>
            <h1 className="text-[28px] leading-tight font-extrabold text-[#0d1c2e] dark:text-[#ffffff] tracking-tight drop-shadow-sm">
              {step === 'update-password' ? 'Set New Password' : 'Admin Portal'}
            </h1>
            <p className="text-[15px] font-medium text-[#464652] dark:text-[#cbd5e1]">
              {step === 'password' && 'Enter your credentials to access the dashboard.'}
              {step === 'email' && 'Sign in with your registered college email.'}
              {step === 'code' && 'Enter the code we emailed you.'}
              {step === 'forgot-password' && 'Enter your email to receive a reset link.'}
              {step === 'update-password' && 'Please type a secure new password.'}
            </p>
          </div>

          <div className="bg-white/40 dark:bg-[#0f172a]/40 backdrop-blur-2xl rounded-[32px] p-6 md:p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05),0_0_0_1px_rgba(255,255,255,0.4)_inset] dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.1)_inset] border border-white/20 dark:border-white/5 flex flex-col gap-6 relative overflow-hidden">
            
            {/* Soft inner glow top edge */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 dark:via-white/20 to-transparent"></div>

            {/* Step 3 — Password (Default) */}
            {step === 'password' && (
              <form className="flex flex-col gap-6 relative z-10" onSubmit={handlePasswordLogin} noValidate>
                <div className="flex flex-col gap-5">
                  <div className="relative group-input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#15157d] dark:text-[#818cf8]">
                      <span className="material-symbols-outlined text-[20px]">mail</span>
                    </div>
                    <input
                      id="pw-email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      placeholder="College Email"
                    />
                  </div>

                  <div className="relative group-input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#15157d] dark:text-[#818cf8]">
                      <span className="material-symbols-outlined text-[20px]">lock</span>
                    </div>
                    <input
                      id="pw-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={passwordValue}
                      onChange={(e) => setPasswordValue(e.target.value)}
                      className={inputClass}
                      placeholder="Password"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#777683] hover:text-[#15157d] dark:text-[#94a3b8] dark:hover:text-[#818cf8] transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                {error && <p role="alert" className="text-sm font-semibold text-[#ba1a1a] bg-[#ba1a1a]/10 px-4 py-3 rounded-xl border border-[#ba1a1a]/20">{error}</p>}

                <div className="flex justify-between items-center px-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={rememberMe} 
                      onChange={(e) => setRememberMe(e.target.checked)} 
                      className="hidden" 
                    />
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${rememberMe ? 'bg-[#15157d] dark:bg-[#818cf8] border-[#15157d] dark:border-[#818cf8]' : 'border-[#15157d]/30 dark:border-[#818cf8]/30 bg-white/50 dark:bg-black/20 group-hover:bg-[#15157d]/10 dark:group-hover:bg-[#818cf8]/20'}`}>
                       <span className={`material-symbols-outlined text-[12px] ${rememberMe ? 'text-white dark:text-[#0f172a]' : 'text-transparent'}`}>check</span>
                    </div>
                    <span className="text-[13px] font-medium text-[#464652] dark:text-[#cbd5e1]">Remember me</span>
                  </label>
                  <button type="button" className="text-[13px] font-semibold text-[#15157d] dark:text-[#818cf8] hover:text-[#04006d] dark:hover:text-white transition-colors" onClick={() => setStep('forgot-password')}>
                    Forgot Password?
                  </button>
                </div>

                <button type="submit" className={btnClass} disabled={isSubmitting}>
                  {isSubmitting ? 'Signing in...' : 'Sign In'}
                  {!isSubmitting && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
                </button>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-[#15157d]/10 dark:border-white/10"></div>
                  <span className="flex-shrink-0 mx-4 text-xs font-semibold text-[#777683] dark:text-[#94a3b8] uppercase tracking-wider">or sign in with</span>
                  <div className="flex-grow border-t border-[#15157d]/10 dark:border-white/10"></div>
                </div>

                <button type="button" className="w-full text-center text-[14px] font-semibold text-[#464652] dark:text-[#cbd5e1] hover:text-[#15157d] dark:hover:text-[#818cf8] transition-colors py-2 flex items-center justify-center gap-2" onClick={() => { setStep('email'); setError(null); }}>
                  <span className="material-symbols-outlined text-[18px]">dialpad</span>
                  One-Time Passcode
                </button>
              </form>
            )}

            {/* Step 1 — Email (OTP) */}
            {step === 'email' && (
              <form className="flex flex-col gap-6 relative z-10" onSubmit={handleSendCode} noValidate>
                <div className="relative group-input">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#15157d] dark:text-[#818cf8]">
                    <span className="material-symbols-outlined text-[20px]">mail</span>
                  </div>
                  <input
                    id="teacher-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="College Email"
                  />
                </div>

                {error && <p role="alert" className="text-sm font-semibold text-[#ba1a1a] bg-[#ba1a1a]/10 px-4 py-3 rounded-xl border border-[#ba1a1a]/20">{error}</p>}

                <button type="submit" className={btnClass} disabled={isSubmitting}>
                  {isSubmitting ? 'Sending code...' : 'Send Login Code'}
                  {!isSubmitting && <span className="material-symbols-outlined text-[18px]">send</span>}
                </button>

                <button type="button" className="w-full text-center text-[14px] font-semibold text-[#464652] dark:text-[#cbd5e1] hover:text-[#15157d] dark:hover:text-[#818cf8] transition-colors py-2 flex items-center justify-center gap-2" onClick={() => { setStep('password'); setError(null); }}>
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Back to Password Login
                </button>
              </form>
            )}

            {/* Step 2 — OTP */}
            {step === 'code' && (
              <form className="flex flex-col gap-6 relative z-10" onSubmit={handleVerify} noValidate>
                {info && (
                  <p className="bg-[#15157d]/10 dark:bg-[#818cf8]/10 border border-[#15157d]/20 dark:border-[#818cf8]/20 rounded-xl px-4 py-3 text-sm font-medium text-[#15157d] dark:text-[#818cf8] text-center">
                    {info}
                  </p>
                )}

                <div className="flex flex-col gap-4 items-center w-full">
                  <OtpInput 
                    value={code}
                    onChange={setCode}
                    disabled={isSubmitting}
                  />
                </div>

                {error && <p role="alert" className="text-sm font-semibold text-[#ba1a1a] bg-[#ba1a1a]/10 px-4 py-3 rounded-xl border border-[#ba1a1a]/20">{error}</p>}

                <button type="submit" className={btnClass} disabled={isSubmitting || code.length < 6}>
                  {isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
                  {!isSubmitting && <span className="material-symbols-outlined text-[18px]">verified_user</span>}
                </button>

                <div className="flex justify-between w-full px-2">
                  <button type="button" className="text-[13px] font-semibold text-[#464652] dark:text-[#cbd5e1] hover:text-[#15157d] dark:hover:text-[#818cf8] transition-colors" onClick={() => { setStep('email'); setCode(''); setError(null); setInfo(null); }}>
                    Change Email
                  </button>
                  <button type="button" className="text-[13px] font-semibold text-[#464652] dark:text-[#cbd5e1] hover:text-[#15157d] dark:hover:text-[#818cf8] transition-colors" onClick={() => { setStep('password'); setCode(''); setError(null); setInfo(null); }}>
                    Use Password
                  </button>
                </div>
              </form>
            )}

            {/* Forgot Password Step */}
            {step === 'forgot-password' && (
              <form className="flex flex-col gap-6 relative z-10" onSubmit={handleSendResetLink} noValidate>
                {info && (
                  <p className="bg-[#15157d]/10 dark:bg-[#818cf8]/10 border border-[#15157d]/20 dark:border-[#818cf8]/20 rounded-xl px-4 py-3 text-sm font-medium text-[#15157d] dark:text-[#818cf8] text-center">
                    {info}
                  </p>
                )}
                <div className="relative group-input">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#15157d] dark:text-[#818cf8]">
                    <span className="material-symbols-outlined text-[20px]">mail</span>
                  </div>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="Enter your college email"
                  />
                </div>

                {error && <p role="alert" className="text-sm font-semibold text-[#ba1a1a] bg-[#ba1a1a]/10 px-4 py-3 rounded-xl border border-[#ba1a1a]/20">{error}</p>}

                <button type="submit" className={btnClass} disabled={isSubmitting}>
                  {isSubmitting ? 'Sending Link...' : 'Send Reset Link'}
                  {!isSubmitting && <span className="material-symbols-outlined text-[18px]">mark_email_read</span>}
                </button>

                <button type="button" className="w-full text-center text-[14px] font-semibold text-[#464652] dark:text-[#cbd5e1] hover:text-[#15157d] dark:hover:text-[#818cf8] transition-colors py-2 flex items-center justify-center gap-2" onClick={() => { setStep('password'); setError(null); setInfo(null); }}>
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Back to Sign In
                </button>
              </form>
            )}

            {/* Update Password Step (from recovery link) */}
            {step === 'update-password' && (
              <form className="flex flex-col gap-6 relative z-10" onSubmit={handleUpdatePassword} noValidate>
                {info && (
                  <p className="bg-[#15157d]/10 dark:bg-[#818cf8]/10 border border-[#15157d]/20 dark:border-[#818cf8]/20 rounded-xl px-4 py-3 text-sm font-medium text-[#15157d] dark:text-[#818cf8] text-center">
                    {info}
                  </p>
                )}
                <div className="relative group-input">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#15157d] dark:text-[#818cf8]">
                    <span className="material-symbols-outlined text-[20px]">lock_reset</span>
                  </div>
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={6}
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    className={inputClass}
                    placeholder="New Password"
                  />
                </div>

                {error && <p role="alert" className="text-sm font-semibold text-[#ba1a1a] bg-[#ba1a1a]/10 px-4 py-3 rounded-xl border border-[#ba1a1a]/20">{error}</p>}

                <button type="submit" className={btnClass} disabled={isSubmitting || passwordValue.length < 6}>
                  {isSubmitting ? 'Updating...' : 'Update Password'}
                  {!isSubmitting && <span className="material-symbols-outlined text-[18px]">check_circle</span>}
                </button>
              </form>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
