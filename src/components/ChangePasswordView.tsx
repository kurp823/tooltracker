import React, { useState } from 'react';
import { User } from '../types';
import { getApiEndpoint, getApiKey } from '../services/api';
import { getSystemUsers, saveSystemUsers } from '../services/permissionService';
import { EmdadLogo } from '../constants/branding';
import { Lock, Eye, EyeOff, ShieldCheck, KeyRound, CheckCircle2 } from 'lucide-react';

interface ChangePasswordViewProps {
  user: User;
  onPasswordChanged: (user: User) => void;
  onCancel: () => void;
  isVoluntary?: boolean;
}

export const ChangePasswordView: React.FC<ChangePasswordViewProps> = ({
  user,
  onPasswordChanged,
  onCancel,
  isVoluntary = false,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }

    setIsSubmitting(true);

    // 1. Attempt Azure SQL synchronization
    try {
      const endpoint = getApiEndpoint();
      const apiKey = getApiKey();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['x-functions-key'] = apiKey;
      }
      await fetch(
        `${endpoint}?action=change_password&env=live${apiKey ? `&code=${encodeURIComponent(apiKey)}` : ''}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'change_password',
            userId: user.id,
            username: user.username,
            newPassword,
          }),
        }
      );
    } catch (err) {
      console.warn('Azure SQL password change call offline, persisting locally:', err);
    }

    // 2. Always persist new password in local user registry
    try {
      const allUsers = getSystemUsers();
      const updatedUsers = allUsers.map((u) =>
        u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase()
          ? { ...u, pass: newPassword, mustChangePassword: false }
          : u
      );
      saveSystemUsers(updatedUsers);
    } catch (e) {
      console.warn('Failed to update local user storage:', e);
    }

    const updatedUser: User = {
      ...user,
      pass: newPassword,
      mustChangePassword: false,
    };

    setIsSubmitting(false);
    onPasswordChanged(updatedUser);
  };

  const isMinLength = newPassword.length >= 8;
  const isMatching = newPassword && newPassword === confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1f38] px-4 select-none">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="text-center mb-7">
          <div className="bg-white rounded-lg p-3 shadow-lg mx-auto mb-4 inline-flex items-center justify-center border border-slate-200">
            <EmdadLogo className="h-11 w-auto object-contain" />
          </div>
          <div className="font-extrabold text-xl text-white tracking-wide">EMDAD SERVICES LLC</div>
          <div className="text-slate-400 text-xs mt-1">
            {isVoluntary ? 'Account Security & Password Management' : `First-Time Login Setup for ${user.name}`}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg p-6 shadow-2xl border border-[#b8c9db]">
          <div className="mb-5 pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {isVoluntary ? 'Change Your Password' : 'Set Your Personal Password'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {isVoluntary
                  ? 'Choose a new password for your account'
                  : 'As this is your first login, please choose your personal password.'}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>

          <form onSubmit={handleSubmit} autoComplete="off">
            {/* New Password */}
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter minimum 8 characters"
                  autoFocus
                  autoComplete="new-password"
                  className="w-full pl-8 pr-9 py-2 border border-[#b8c9db] rounded text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  autoComplete="new-password"
                  className="w-full pl-8 pr-9 py-2 border border-[#b8c9db] rounded text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Password Validation Checklist */}
            <div className="mb-4 bg-slate-50 border border-slate-200 rounded p-2 text-[11px] space-y-1">
              <div className={`flex items-center gap-1.5 ${isMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                <span>{isMinLength ? '✓' : '○'}</span>
                <span>At least 8 characters in length</span>
              </div>
              <div className={`flex items-center gap-1.5 ${isMatching ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                <span>{isMatching ? '✓' : '○'}</span>
                <span>Passwords match</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 text-[11px] text-rose-700 bg-rose-50 border border-rose-300 rounded px-2.5 py-2 flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !isMinLength || !isMatching}
              className="w-full bg-[#ffd875] hover:brightness-105 active:brightness-95 text-[#4a2e00] font-bold py-2 rounded text-xs border border-[#c8860d] shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? 'Updating...' : 'Save Password & Continue'}</span>
              <span>&rarr;</span>
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="w-full mt-2.5 text-slate-500 hover:text-slate-700 font-bold text-[11px] py-1 cursor-pointer transition text-center"
            >
              {isVoluntary ? 'Cancel & Return to Dashboard' : 'Cancel & Sign Out'}
            </button>
          </form>

          <div className="mt-5 pt-3 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-400">
              Authorized Personnel Only • EMDAD Services LLC
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
