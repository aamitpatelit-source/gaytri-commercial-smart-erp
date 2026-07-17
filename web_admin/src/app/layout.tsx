"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Clock, 
  Bell, 
  LogOut, 
  Layers,
  Settings,
  ShieldAlert,
  KeyRound,
  Lock,
  CheckCircle,
  User,
  Shield,
  AlertTriangle,
  RefreshCw,
  X
} from 'lucide-react';
import { API_URL } from '../config';
import './globals.css';

// Initials Helper: Generates 2-letter initials (e.g. "Sunny Kumar" -> "SK")
const getInitials = (name: string) => {
  if (!name) return 'A';
  const cleanName = name.trim();
  if (!cleanName) return 'A';
  const parts = cleanName.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [userName, setUserName] = useState('Gaytri Admin');
  const [userRole, setUserRole] = useState('Administrator');
  const [userInitial, setUserInitial] = useState('G');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  // Profile / Security Dropdown states
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'loading'; message: string } | null>(null);

  // Forms states
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const formatTo12Hour = (timeStr: string) => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHour = hours < 10 ? '0' + hours : hours;
    return `${strHour}:${minutes} ${ampm}`;
  };

  const showToastMsg = (type: 'success' | 'error' | 'loading', message: string) => {
    setToast({ type, message });
    if (type !== 'loading') {
      setTimeout(() => setToast(current => current?.message === message ? null : current), 4000);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Real-time Clock
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(clockInterval);
    };
  }, []);

  useEffect(() => {
    const isLoginPage = pathname === '/login';
    if (isLoginPage) return;

    // 1. Client-side route protection & dynamic user profile loading
    const loadProfile = () => {
      const token = localStorage.getItem('access_token');
      const userStr = localStorage.getItem('user');
      
      if (!token || !userStr) {
        router.push('/login');
        return;
      }

      try {
        const user = JSON.parse(userStr);
        // Restruct route guarding: Admins / Super Admins only
        if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
          localStorage.clear();
          router.push('/login');
          return;
        }

        if (user.full_name) {
          setUserName(user.full_name);
          setUserInitial(getInitials(user.full_name));
          setProfileForm(prev => ({ ...prev, full_name: user.full_name }));
        }
        if (user.employee_id) {
          setProfileForm(prev => ({ ...prev, email: user.employee_id }));
        }
        if (user.role) {
          const roleMap: Record<string, string> = {
            'SUPER_ADMIN': 'Super Admin',
            'ADMIN': 'Administrator',
            'HR_MANAGER': 'HR Manager',
            'MANAGER': 'Manager'
          };
          setUserRole(roleMap[user.role] || user.role);
        }
        if (user.must_change_password) {
          setMustChangePassword(true);
        } else {
          setMustChangePassword(false);
        }
      } catch (e) {
        console.error(e);
        localStorage.clear();
        router.push('/login');
      }
    };

    loadProfile();

    window.addEventListener('profileUpdate', loadProfile);

    // 2. Dynamic Notifications Polling
    const token = localStorage.getItem('access_token');
    if (!token) return () => {
      window.removeEventListener('profileUpdate', loadProfile);
    };

    const fetchNotifications = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch(`${API_URL}/attendance/dashboard`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            const feed = data.feed || [];
            setRecentScans(feed);
            if (feed.length > 0) {
              setHasUnread(true);
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    
    return () => {
      window.removeEventListener('profileUpdate', loadProfile);
      clearInterval(interval);
    };
  }, [pathname, router]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    showToastMsg('loading', 'Saving profile details...');

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: profileForm.full_name,
          email: profileForm.email
        })
      });

      const data = await res.json();
      
      if (res.ok && data.success) {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const u = JSON.parse(userStr);
          u.full_name = data.user.full_name;
          u.employee_id = data.user.employee_id;
          localStorage.setItem('user', JSON.stringify(u));
        }
        window.dispatchEvent(new Event('profileUpdate'));
        showToastMsg('success', 'Profile updated successfully.');
        setShowProfileModal(false);
      } else {
        showToastMsg('error', data.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      showToastMsg('error', err.message || 'Failed to connect to backend.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showToastMsg('error', 'New passwords do not match.');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      showToastMsg('error', 'New password must be at least 6 characters.');
      return;
    }

    setPasswordSaving(true);
    showToastMsg('loading', 'Securing account password...');

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          old_password: passwordForm.old_password,
          new_password: passwordForm.new_password
        })
      });

      const data = await res.json();
      
      if (res.ok && data.success) {
        setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
        showToastMsg('success', 'Password updated successfully.');
        
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const u = JSON.parse(userStr);
          u.must_change_password = false;
          localStorage.setItem('user', JSON.stringify(u));
        }
        window.dispatchEvent(new Event('profileUpdate'));
        setShowPasswordModal(false);
      } else {
        showToastMsg('error', data.message || 'Failed to update password.');
      }
    } catch (err: any) {
      showToastMsg('error', err.message || 'Failed to connect to backend.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const isLoginPage = pathname === '/login';

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Employees', icon: Users, path: '/employees' },
    { name: 'Manager Accounts', icon: Shield, path: '/managers' },
    { name: 'Attendance Logs', icon: Clock, path: '/attendance' },
    { name: 'Attendance Audit Logs', icon: ShieldAlert, path: '/attendance-audit-logs' },
    { name: 'Leave Management', icon: Clock, path: '/leaves' },
    { name: 'Leave Balances', icon: Settings, path: '/leave-balances' },
    { name: 'Holidays', icon: LayoutDashboard, path: '/holidays' },
    { name: 'Shifts', icon: Clock, path: '/shifts' },
    { name: 'Departments', icon: Layers, path: '/departments' },
    { name: 'Shift Timings Config', icon: Settings, path: '/settings' },
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

  // Force Password Change Block
  if (mustChangePassword) {
    return (
      <html lang="en">
        <body className="bg-radial-gradient-dark min-h-screen text-slate-100 antialiased flex items-center justify-center p-4 relative">
          <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
          
          <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-800 shadow-glass-shadow p-8 z-10 animate-fade-in">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-amber-400 to-rose-600 flex items-center justify-center shadow-neon-glow mb-4 animate-pulse">
                <ShieldAlert className="w-7 h-7 text-slate-950" />
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-wide">Change Default Password</h1>
              <p className="text-xs text-amber-400 font-bold uppercase tracking-wider mt-1">First Time Setup Verification</p>
            </div>
            
            <ForcePasswordChangeForm 
              onSuccess={() => {
                setMustChangePassword(false);
                const userStr = localStorage.getItem('user');
                if (userStr) {
                  try {
                    const user = JSON.parse(userStr);
                    user.must_change_password = false;
                    localStorage.setItem('user', JSON.stringify(user));
                  } catch (e) {
                    console.error(e);
                  }
                }
              }} 
            />
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="bg-radial-gradient-dark min-h-screen text-slate-100 antialiased flex overflow-hidden">
        {/* Toast Notification HUD */}
        {toast && (
          <div className={`fixed top-6 right-6 z-55 flex items-center space-x-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-semibold transition-all ${
            toast.type === 'success' 
              ? 'bg-emerald-950/90 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
              : toast.type === 'error'
              ? 'bg-rose-950/90 text-rose-450 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]'
              : 'bg-slate-900/95 text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : toast.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            ) : (
              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Sidebar Nav */}
        <aside className="w-64 glass-panel border-r border-slate-800 flex flex-col z-20">
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 font-bold shadow-neon-glow">
              <Layers className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg text-white leading-none tracking-wide">GAYTRI</h2>
              <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">COMMERCIAL</span>
            </div>
          </div>

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

          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>ERP Console v4.0</span>
            <span className="text-cyan-455 font-bold uppercase">Prod Mode</span>
          </div>
        </aside>

        {/* Dashboard Frame Content Area */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Main Top Header Nav */}
          <header className="h-16 border-b border-slate-850 px-8 flex items-center justify-between z-10 glass-panel">
            <h1 className="text-xl font-bold text-slate-100 capitalize">
              {pathname === '/' ? 'Operational Overview' : 
               pathname === '/employees' ? 'Employee Directory' : 
               pathname === '/managers' ? 'Manager Accounts' : 
               pathname === '/attendance' ? 'Attendance Logs' : 
               pathname === '/attendance-audit-logs' ? 'Attendance Audit Logs' : 
               pathname === '/leaves' ? 'Leave Management' : 
               pathname === '/leave-balances' ? 'Leave Balances' : 
               pathname === '/holidays' ? 'Holidays Calendar' : 
               pathname === '/shifts' ? 'Shifts Registry' : 
               pathname === '/departments' ? 'Departments Directory' : 
               pathname === '/settings' ? 'Shift Timings Config' : 
               pathname.replace('/', '').replace(/-/g, ' ')}
            </h1>

            {/* Top Toolbar: Alert, Notifications, System Clock, Dropdown */}
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2 bg-slate-850/60 border border-slate-800 px-3 py-1.5 rounded-lg">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`} />
                <span className="text-[10px] font-bold text-slate-350 uppercase tracking-wider">
                  {isOnline ? 'System Online' : 'System Offline'}
                </span>
              </div>

              <div className="text-right hidden md:block">
                <span className="text-xs text-slate-500 block">System Clock</span>
                <span className="text-sm text-cyan-400 font-bold font-mono tracking-wider">{currentTime || 'Loading...'}</span>
              </div>

              {/* Notifications */}
              <div className="relative">
                <button 
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    setHasUnread(false);
                  }}
                  className="p-2 rounded-lg bg-slate-850/60 border border-slate-800 text-slate-400 hover:text-slate-100 hover:border-cyan-500/25 transition-all relative cursor-pointer"
                >
                  <Bell className="w-5 h-5" />
                  {hasUnread && recentScans.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full neon-glow-emerald" />
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 glass-panel border border-slate-800 rounded-lg shadow-glass-shadow p-4 z-30 max-h-96 overflow-y-auto animate-fade-in">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Notifications</span>
                      <button 
                        onClick={() => {
                          setRecentScans([]);
                          setHasUnread(false);
                        }} 
                        className="text-[10px] text-rose-400 hover:underline font-semibold bg-transparent border-0 cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="space-y-3">
                      {recentScans.length === 0 ? (
                        <p className="text-slate-400 text-xs text-center py-6 font-semibold">No new notifications</p>
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
                              <span className="text-slate-500 text-[9px] font-mono">{formatTo12Hour(scan.check_in_time)}</span>
                            </div>
                            <p className="text-slate-300 font-medium">{scan.full_name} ({scan.employee_id})</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Logged-In User Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center space-x-2.5 bg-slate-850/60 border border-slate-800 hover:border-cyan-500/25 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 transition-all cursor-pointer select-none"
                >
                  <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-extrabold text-cyan-400 text-[10px]">
                    {userInitial}
                  </div>
                  <span className="hidden md:inline-block max-w-[100px] truncate text-slate-200">{userName}</span>
                  <span className="text-slate-500 text-[8px] uppercase tracking-wider hidden lg:inline-block">({userRole})</span>
                </button>

                {showUserDropdown && (
                  <>
                    <div className="fixed inset-0 z-30 bg-transparent" onClick={() => setShowUserDropdown(false)} />
                    <div className="absolute right-0 mt-2 w-48 glass-panel border border-slate-800 rounded-lg shadow-glass-shadow p-1.5 z-40 animate-fade-in text-xs">
                      <div className="px-3 py-2 border-b border-slate-850 mb-1">
                        <p className="font-bold text-white truncate">{userName}</p>
                        <p className="text-[9px] text-cyan-455 truncate font-medium">{userRole}</p>
                      </div>
                      
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          setShowProfileModal(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded hover:bg-slate-800/60 hover:text-cyan-400 font-semibold transition-colors flex items-center space-x-2 bg-transparent border-0 cursor-pointer text-slate-300"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>My Profile</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          setShowPasswordModal(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded hover:bg-slate-800/60 hover:text-cyan-400 font-semibold transition-colors flex items-center space-x-2 bg-transparent border-0 cursor-pointer text-slate-300"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Change Password</span>
                      </button>
                      
                      <hr className="border-slate-850 my-1" />
                      
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          handleLogout();
                        }}
                        className="w-full text-left px-3 py-2 rounded hover:bg-rose-955/20 hover:text-rose-400 font-semibold transition-colors flex items-center space-x-2 bg-transparent border-0 cursor-pointer text-slate-400"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-8 relative">
            {children}
          </main>
        </div>

        {/* 1. Edit Profile Modal */}
        {showProfileModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
              <button 
                onClick={() => setShowProfileModal(false)}
                className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-350 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
                <User className="w-5 h-5 text-cyan-400" />
                <h3 className="font-extrabold text-base text-white">My Profile Details</h3>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                    className="w-full px-3 py-2.5 glass-input text-xs text-white"
                    required
                  />
                </div>
                
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    className="w-full px-3 py-2.5 glass-input text-xs text-white"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={profileSaving}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 disabled:opacity-50 mt-4"
                >
                  {profileSaving ? 'Saving Changes...' : 'Save Profile Changes'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 2. Change Password Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
              <button 
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
                }}
                className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-350 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
                <Lock className="w-5 h-5 text-cyan-400" />
                <h3 className="font-extrabold text-base text-white">Security / Change Password</h3>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Current Password</label>
                  <input
                    type="password"
                    value={passwordForm.old_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 glass-input text-xs text-white"
                    required
                  />
                </div>
                
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">New Secure Password</label>
                  <input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2 glass-input text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] text-cyan-455 font-extrabold uppercase tracking-wider block mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 glass-input text-xs text-white"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 disabled:opacity-50 mt-4"
                >
                  {passwordSaving ? 'Updating...' : 'Change Password'}
                </button>
              </form>
            </div>
          </div>
        )}

      </body>
    </html>
  );
}

// Fullscreen Change Password Form component
function ForcePasswordChangeForm({ onSuccess }: { onSuccess: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update default password.');
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Connecting to server failed.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-6 space-y-4">
        <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
        <h3 className="text-lg font-bold text-white">Password Secured!</h3>
        <p className="text-xs text-slate-400">Default credentials updated. Unlocking ERP console...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-rose-955/30 border border-rose-500/30 text-rose-400 text-xs text-center font-semibold animate-pulse">
          {error}
        </div>
      )}
      <div>
        <label className="text-xs text-slate-350 font-bold uppercase tracking-wider block mb-2">Default Password</label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full pl-10 pr-4 py-2.5 glass-input text-white text-xs"
            required
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-350 font-bold uppercase tracking-wider block mb-2">New Secure Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 6 characters"
            className="w-full pl-10 pr-4 py-2.5 glass-input text-white text-xs"
            required
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-355 font-bold uppercase tracking-wider block mb-2">Confirm New Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full pl-10 pr-4 py-2.5 glass-input text-white text-xs"
            required
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold flex items-center justify-center space-x-2 transition-all duration-300 shadow-neon-glow disabled:opacity-50 mt-6 text-xs"
      >
        <span>{loading ? 'Securing Account...' : 'Save & Unlock Dashboard'}</span>
      </button>
    </form>
  );
}
