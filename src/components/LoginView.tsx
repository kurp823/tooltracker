import React, { useState } from 'react';
import { User } from '../types';
import { getApiEndpoint } from '../services/api';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const userToTry = username.trim().toLowerCase();
    setError('');

    if (!userToTry || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = getApiEndpoint();
      const res = await fetch(`${endpoint}?action=login&env=live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username: userToTry, password }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setError(json.error || 'Invalid username or password.');
        setIsSubmitting(false);
        return;
      }
      onLoginSuccess(json.data || json);
    } catch (err) {
      setError('Unable to reach Azure SQL login service. Check your connection.');
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
          <div className="text-slate-400 text-[11px] mt-1">
            Oilfield Tool Tracking, Rental Operations &amp; Azure SQL Sync
          </div>
        </div>

        <div className="bg-white rounded p-6 shadow-2xl border border-[#b8c9db]">
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-[#b8c9db] rounded px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-amber-400"
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {isSubmitting ? 'Signing in...' : 'Sign In \u2192'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
