"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Clock, 
  CreditCard, 
  Boxes, 
  Bell, 
  ShieldAlert, 
  User, 
  LogOut, 
  Layers 
} from 'lucide-react';
import { API_URL } from '../config';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [userName, setUserName] = useState('Gaytri Admin');
  const [userInitial, setUserInitial] = useState('G');
  const [recentScans, setRecentScans] = useState<any[]>([]);

  useEffect(() => {
    // 1. Dynamic User Profile Loading
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.full_name) {
          setUserName(user.full_name);
          setUserInitial(user.full_name.charAt(0).toUpperCase());
        }
      } catch (e) {
        console.error(e);
      }
    }

    // 2. Dynamic Notifications Polling
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetch(`${API_URL}/attendance/dashboard`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setRecentScans(data.feed || []);
          }
        }
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Skip layout on login screen
  const isLoginPage = pathname === '/login';

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Employees', icon: Users, path: '/employees' },
    { name: 'Attendance Logs', icon: Clock, path: '/attendance' },
  ];

  if (isLoginPage) {
    return (
      <html lang="en">
        <body className="bg-radial-gradient-dark min-h-screen text-slate-100 antialiased">
          {children}
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="bg-radial-gradient-dark min-h-screen text-slate-100 antialiased flex overflow-hidden">
        {/* Background Decorative Ambient Radial Glow */}
        <div className="absolute top-[-300px] left-[10%] w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none animate-pulse-glow" />
        <div className="absolute bottom-[-200px] right-[5%] w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none animate-pulse-glow" />

        {/* Sidebar Nav */}
        <aside className="w-64 glass-panel border-r border-slate-800 flex flex-col z-20">
          {/* Logo Brand Title */}
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 font-bold shadow-neon-glow">
              <Layers className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg text-white leading-none tracking-wide">GAYTRI</h2>
              <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">COMMERCIAL</span>
            </div>
          </div>

          {/* Navigation Links list */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    isActive 
                      ? 'bg-gradient-to-r from-cyan-950/40 to-blue-950/20 text-cyan-400 border border-cyan-500/20 shadow-neon-glow'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-100 hover:border hover:border-slate-800'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer logout profile action block */}
          <div className="p-4 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-cyan-400">
                {userInitial}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">{userName}</p>
                <p className="text-[10px] text-cyan-400 font-medium tracking-wide uppercase">Admin Profile</p>
              </div>
            </div>
            <Link href="/login" onClick={() => localStorage.clear()} className="p-2 rounded-lg text-slate-400 hover:bg-rose-950/20 hover:text-rose-400 transition-colors">
              <LogOut className="w-5 h-5" />
            </Link>
          </div>
        </aside>

        {/* Dashboard Frame Content Area */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Main Top Header Nav */}
          <header className="h-16 border-b border-slate-850 px-8 flex items-center justify-between z-10 glass-panel">
            <h1 className="text-xl font-bold text-slate-100 capitalize">
              {pathname === '/' ? 'Operational Overview' : pathname.replace('/', '').replace('-', ' ') + ' Dashboard'}
            </h1>

            {/* Top Toolbar: Alert, Notifications, System Clock */}
            <div className="flex items-center space-x-6">
              <div className="text-right hidden md:block">
                <span className="text-xs text-slate-500 block">Shift Timing Status</span>
                <span className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Morning Shift • ACTIVE</span>
              </div>

              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 rounded-lg bg-slate-850/60 border border-slate-800 text-slate-400 hover:text-slate-100 hover:border-cyan-500/25 transition-all relative"
                >
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full neon-glow-emerald" />
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 glass-panel border border-slate-800 rounded-lg shadow-glass-shadow p-4 z-50 max-h-96 overflow-y-auto">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Recent Check-ins</span>
                      <button onClick={() => setShowNotifications(false)} className="text-[10px] text-cyan-400 hover:underline">Dismiss</button>
                    </div>
                    <div className="space-y-3">
                      {recentScans.length === 0 ? (
                        <p className="text-slate-400 text-xs text-center py-4 font-semibold">No recent activity today.</p>
                      ) : (
                        recentScans.slice(0, 5).map((scan, idx) => (
                          <div key={idx} className={`p-2.5 rounded bg-slate-900/40 border text-[11px] ${
                            scan.status === 'PRESENT'
                              ? 'border-emerald-500/10'
                              : 'border-amber-500/10'
                          }`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className={`font-bold ${
                                scan.status === 'PRESENT' ? 'text-emerald-400' : 'text-amber-450'
                              }`}>
                                {scan.status}
                              </span>
                              <span className="text-slate-500 text-[9px] font-mono">{scan.check_in_time}</span>
                            </div>
                            <p className="text-slate-300 font-medium">{scan.full_name} ({scan.employee_id})</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-2 rounded-lg bg-slate-850/60 border border-slate-800 text-slate-400 flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <span className="text-xs font-bold text-slate-300 hidden sm:inline">GPS Verification Required</span>
              </div>
            </div>
          </header>

          {/* Scrollable Shell Dashboard Grid */}
          <main className="flex-1 overflow-y-auto p-8 relative">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
