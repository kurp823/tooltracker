import React, { useState } from 'react';
import { User } from '../types';
import { getSystemUsers } from '../services/permissionService';
import { EmdadLogo } from '../constants/branding';
import { Lock, User as UserIcon, Eye, EyeOff, ShieldCheck } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess?: (user: User) => void;
  onLogin?: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const notifyLogin = (user: User) => {
    if (onLogin) onLogin(user);
    if (onLoginSuccess) onLoginSuccess(user);
  };

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const userToTry = username.trim().toLowerCase();
    const passToTry = password;
    setError('');

    if (!userToTry || !passToTry) {
      setError('Please enter both username and password.');
      return;
    }

    const allUsers = getSystemUsers();
    const found = allUsers.find(
      (x) => x.username.toLowerCase() === userToTry && x.pass === passToTry
    );

    if (!found) {
      setError('Invalid username or password.');
      return;
    }

    notifyLogin(found);
  };

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
            Oilfield Tool Tracking, Rental Operations &amp; Azure SQL Sync
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg p-6 shadow-2xl border border-[#b8c9db]">
          <div className="mb-5 pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Sign In to ToolTracker</h2>
              <p className="text-[11px] text-slate-500">Enter your official credentials</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          <form onSubmit={handleLogin} autoComplete="on">
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  autoFocus
                  className="w-full pl-8 pr-2.5 py-2 border border-[#b8c9db] rounded text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full pl-8 pr-9 py-2 border border-[#b8c9db] rounded text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
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
              className="w-full bg-[#ffd875] hover:brightness-105 active:brightness-95 text-[#4a2e00] font-bold py-2 rounded text-xs border border-[#c8860d] shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Sign In</span>
              <span>&rarr;</span>
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
