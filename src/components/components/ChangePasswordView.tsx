import React, { useState } from 'react';
import { User } from '../types';
import { getApiEndpoint } from '../services/api';

interface ChangePasswordViewProps {
  user: User;
  onPasswordChanged: (user: User) => void;
  onCancel: () => void;
}

export const ChangePasswordView: React.FC<ChangePasswordViewProps> = ({ user, onPasswordChanged, onCancel }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = getApiEndpoint();
      const res = await fetch(`${endpoint}?action=change_password&env=live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', userId: user.id, newPassword }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setError(json.error || 'Unable to update password.');
        setIsSubmitting(false);
        return;
      }
      onPasswordChanged({ ...user, mustChangePassword: false });
    } catch (err) {
      setError('Unable to reach Azure SQL. Check your connection.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1f38] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-[#1a3055] text-2xl shadow-lg mx-auto mb-4">
            E
          </div>
          <div className="font-extrabold text-xl text-white tracking-wide">EMDAD SERVICES LLC</div>
          <div className="text-slate-400 text-[11px] mt-1">Set a new password to continue, {user.name}</div>
        </div>

        <div className="bg-white rounded p-6 shadow-2xl border border-[#b8c9db]">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-[#b8c9db] rounded px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-amber-400"
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-[#b8c9db] rounded px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {error && (
              <div className="mb-3 text-[11px] text-rose-700 bg-rose-50 border border-rose-300 rounded px-2.5 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#ffd875] hover:brightness-105 text-[#4a2e00] font-bold py-2 rounded text-xs border border-[#c8860d] shadow-sm transition cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? 'Updating...' : 'Update Password & Continue \u2192'}
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="w-full mt-2 text-slate-500 hover:text-slate-700 font-bold text-[11px] py-1 cursor-pointer"
            >
              Cancel &amp; Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
