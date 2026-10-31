import React, { useEffect, useState } from 'react';
import { UserProfile, Wallet } from '../types';
import { registerAccount, loginAccount } from '../lib/engineService';
import { X, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserProfile, wallet: Wallet) => void;
  onOpenTerms: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  onOpenTerms,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetFields = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setDateOfBirth('');
    setTermsAccepted(false);
    setError(null);
  };

  useEffect(() => {
    if (isOpen) {
      resetFields();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Live client-side preview check for age
  let calculatedAge: number | null = null;
  let isUnderage = false;
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      calculatedAge = age;
      if (age < 18) {
        isUnderage = true;
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Please enter your full legal name.');
        return;
      }
      if (!phone.trim()) {
        setError('Please enter your Kenyan mobile phone number.');
        return;
      }
      if (!dateOfBirth) {
        setError('Please select your Date of Birth for 18+ verification.');
        return;
      }
      if (isUnderage || (calculatedAge !== null && calculatedAge < 18)) {
        setError('Registration denied: Kenyan BCLB strictly prohibits persons under 18 from real-money gaming.');
        return;
      }
      if (!termsAccepted) {
        setError('Please check the confirmation box to accept the 18+ Terms & Conditions.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'register') {
        const { user, wallet } = await registerAccount({
          email,
          password,
          fullName,
          phone,
          dateOfBirth,
          termsAccepted,
        });
        onAuthSuccess(user, wallet);
        onClose();
      } else {
        const { user, wallet } = await loginAccount(email, password);
        onAuthSuccess(user, wallet);
        onClose();
      }
    } catch (err: any) {
  const message = err?.message || 'An error occurred during authentication.';

  if (message.toLowerCase().includes('already exists')) {
    setError('This email is already registered. Please switch to LOGIN instead.');
  } else {
    setError(message);
  }
} finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        className="relative w-full max-w-md bg-[#0e1626] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] max-h-[92dvh] my-auto"
      >
        {/* Header with prominent Back (X) navigation */}
        <div className="bg-[#121c30] px-3.5 sm:px-6 py-3 sm:py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-white">
              {mode === 'register' ? 'Register Account' : 'Sign In'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <span className="font-semibold text-emerald-400">FLYJET KENYA</span>
            </div>
          </div>

          {/* Back (X) button to navigate back to the main website */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 hover:bg-rose-500/20 active:bg-rose-500/30 text-slate-300 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/40 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Mode Toggle Switch (LOGIN / REGISTER) */}
        <div className="px-3.5 sm:px-6 pt-3 shrink-0">
          <div className="grid grid-cols-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                resetFields();
              }}
              className={`py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              LOGIN
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                resetFields();
              }}
              className={`py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              REGISTER
            </button>
          </div>
        </div>

        {/* Form Body - Scrollable direct child */}
        <div className="p-3.5 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0 flex flex-col gap-3">
          {error && (
            <div className="p-2.5 sm:p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-start gap-2 shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'register' && (
            <>
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Full Legal Name
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  placeholder=""
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 sm:py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Kenyan Phone Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Kenyan Mobile Number (M-Pesa / Airtel)
                </label>
                <input
                  type="tel"
                  required
                  autoComplete="off"
                  placeholder=""
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 sm:py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Date of Birth with live 18+ check */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Date of Birth 
                  </label>
                  {calculatedAge !== null && (
                    <span
                      className={`text-[11px] font-bold ${
                        isUnderage ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      Age: {calculatedAge} yrs ({isUnderage ? 'UNDER 18' : 'VERIFIED 18+'})
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  required
                  autoComplete="off"
                  placeholder=""
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={`w-full px-3 py-2 sm:py-2.5 bg-slate-900 border rounded-lg text-sm text-white focus:outline-none ${
                    isUnderage
                      ? 'border-rose-500 focus:border-rose-500'
                      : 'border-slate-700 focus:border-emerald-500'
                  }`}
                />
              </div>
            </>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              required
              autoComplete="off"
              placeholder=""
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 sm:py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder=""
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 sm:py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Terms & Conditions Checkbox */}
          {mode === 'register' && (
            <div className="pt-1">
              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 w-4 h-4 cursor-pointer accent-emerald-500 shrink-0"
                />
                <span className="leading-tight text-[11px] sm:text-xs">
                  I confirm I am <strong className="text-emerald-400">18 years or older</strong> and agree to the{' '}
                  <button
                    type="button"
                    onClick={onOpenTerms}
                    className="text-emerald-400 underline hover:text-emerald-300 inline cursor-pointer font-semibold"
                  >
                    Terms & Conditions
                  </button>
                  .
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="bg-[#121c30] p-3.5 sm:p-4 border-t border-slate-800 shrink-0">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 sm:py-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-98 disabled:opacity-50 text-slate-950 font-black rounded-xl text-sm sm:text-base tracking-wide transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
            <span>
              {isLoading
                ? 'Verifying...'
                : mode === 'register'
                ? 'REGISTER ACCOUNT'
                : 'SIGN IN'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
