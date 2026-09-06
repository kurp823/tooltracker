import React, { useState } from 'react';
import { User } from '../types';
import { USERS } from '../data/initialData';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('ravi');
  const [password, setPassword] = useState('Ravi@2026');
  const [error, setError] = useState('');

  const handleLogin = (u?: string, p?: string) => {
    const userToTry = (u || username).trim().toLowerCase();
    const passToTry = p || password;
    setError('');

    if (!userToTry || !passToTry) {
      setError('Please enter both username and password.');
      return;
    }

    const found = USERS.find(
      (x) => x.username.toLowerCase() === userToTry && x.pass === passToTry
    );

    if (!found) {
      setError('Invalid username or password.');
      return;
    }

    onLoginSuccess(found);
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    handleLogin(u, p);
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-[#b8c9db] rounded px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-amber-400"
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
              className="w-full bg-[#ffd875] hover:brightness-105 text-[#4a2e00] font-bold py-2 rounded text-xs border border-[#c8860d] shadow-sm transition cursor-pointer"
            >
              Sign In &rarr;
            </button>
          </form>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-500 space-y-1">
            <div className="font-bold text-slate-400 uppercase tracking-wider mb-1">Demo Credentials</div>
            <div className="flex items-center justify-between">
              <div>
                <span
                  className="font-mono font-bold text-slate-700 cursor-pointer hover:underline"
                  onClick={() => handleQuickFill('ravi', 'Ravi@2026')}
                >
                  ravi
                </span>{' '}
                (Admin)
              </div>
              <div>
                <span
                  className="font-mono font-bold text-slate-700 cursor-pointer hover:underline"
                  onClick={() => handleQuickFill('azim', 'Azim@2026')}
                >
                  azim
                </span>{' '}
                (Handler)
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span
                  className="font-mono font-bold text-slate-700 cursor-pointer hover:underline"
                  onClick={() => handleQuickFill('nihas', 'Nihas@2026')}
                >
                  nihas
                </span>{' '}
                (QC)
              </div>
              <div>
                <span
                  className="font-mono font-bold text-slate-700 cursor-pointer hover:underline"
                  onClick={() => handleQuickFill('viewer', 'View@2026')}
                >
                  viewer
                </span>{' '}
                (Viewer)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
