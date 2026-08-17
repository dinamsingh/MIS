import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@presentation/auth/AuthContext';
import type { Actor } from '@domain/shared/types';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { OtpInput } from '../components/ui/OtpInput';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, PasswordInput, Alert } from '../components/ui';

export interface TeacherSignInViewProps {
  onSignedIn?: (actor: Actor) => void;
  initialError?: string | null;
}

type Step = 'email' | 'code' | 'password' | 'forgot-password' | 'update-password';

export default function TeacherSignInView({ onSignedIn, initialError = null }: TeacherSignInViewProps) {
  const { sendEmailOtp, verifyEmailOtp, signInTeacherPassword, sendPasswordResetEmail, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      setStep('update-password');
      setInfo('Please enter your new password below.');
    }

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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <Card
        className="w-full max-w-md motion-enter"
        padded
      >
        <div className="text-center mb-8">
          <h1 className="text-page-title font-semibold text-text">Teacher Sign In</h1>
          <p className="mt-2 text-body text-soft">
            Access your academic management dashboard
          </p>
        </div>

        {error && (
          <Alert tone="danger" title="Error" className="mb-6">
            {error}
          </Alert>
        )}

        {info && (
          <Alert tone="info" title="Info" className="mb-6">
            {info}
          </Alert>
        )}

        {/* Step: Password Sign In (Default) */}
        {step === 'password' && (
          <form className="space-y-5" onSubmit={handlePasswordLogin} noValidate>
            <Input
              id="teacher-email"
              type="email"
              autoComplete="email"
              required
              label="Email"
              placeholder="e.g. name@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />

            <PasswordInput
              id="teacher-password"
              autoComplete="current-password"
              required
              label="Password"
              placeholder="••••••••"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              error={error}
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-input bg-surface text-accent focus:ring-accent focus:ring-2 focus:ring-offset-2 focus:ring-offset-background"
                />
                <span className="text-sm text-soft">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => { setStep('forgot-password'); setError(null); setInfo(null); }}
                className="text-sm font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isSubmitting}
              rightIcon={<span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
            >
              Sign In
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-surface px-2 text-muted">Or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => { setStep('email'); setError(null); }}
              leftIcon={<span className="material-symbols-outlined text-[18px]">dialpad</span>}
            >
              One-Time Passcode
            </Button>
          </form>
        )}

        {/* Step: Email (OTP) */}
        {step === 'email' && (
          <form className="space-y-5" onSubmit={handleSendCode} noValidate>
            <Input
              id="otp-email"
              type="email"
              autoComplete="email"
              required
              label="Email"
              placeholder="e.g. name@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isSubmitting}
              rightIcon={<span className="material-symbols-outlined text-[18px]">mark_email_read</span>}
            >
              Send Code
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              size="lg"
              onClick={() => { setStep('password'); setError(null); setInfo(null); }}
              leftIcon={<span className="material-symbols-outlined text-[18px]">arrow_back</span>}
            >
              Back to Sign In
            </Button>
          </form>
        )}

        {/* Step: OTP Verification */}
        {step === 'code' && (
          <form className="space-y-5" onSubmit={handleVerify} noValidate>
            {info && (
              <Alert tone="info" title="Code Sent" className="mb-2">
                {info}
              </Alert>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-text">Enter 6-digit code</label>
              <div className="w-full">
                <OtpInput
                  value={code}
                  onChange={setCode}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isSubmitting}
              disabled={code.length < 6}
              rightIcon={<span className="material-symbols-outlined text-[18px]">verified_user</span>}
            >
              Verify & Sign In
            </Button>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setStep('email'); setCode(''); setError(null); setInfo(null); }}
              >
                Change Email
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setStep('password'); setCode(''); setError(null); setInfo(null); }}
              >
                Back to Password
              </Button>
            </div>
          </form>
        )}

        {/* Step: Forgot Password */}
        {step === 'forgot-password' && (
          <form className="space-y-5" onSubmit={handleSendResetLink} noValidate>
            <p className="text-body text-soft text-center">
              Enter your email and we'll send you a password reset link.
            </p>

            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              label="Email"
              placeholder="e.g. name@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isSubmitting}
              rightIcon={<span className="material-symbols-outlined text-[18px]">mark_email_read</span>}
            >
              Send Reset Link
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              size="lg"
              onClick={() => { setStep('password'); setError(null); setInfo(null); }}
              leftIcon={<span className="material-symbols-outlined text-[18px]">arrow_back</span>}
            >
              Back to Sign In
            </Button>
          </form>
        )}

        {/* Step: Update Password (Recovery) */}
        {step === 'update-password' && (
          <form className="space-y-5" onSubmit={handleUpdatePassword} noValidate>
            {info && (
              <Alert tone="success" title="Success" className="mb-2">
                {info}
              </Alert>
            )}

            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              required
              label="New Password"
              placeholder="••••••••"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              error={error}
              helperText="Must be at least 6 characters"
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isSubmitting}
              rightIcon={<span className="material-symbols-outlined text-[18px]">check_circle</span>}
            >
              Update Password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}