import React, { useState, useEffect, useCallback } from 'react';
import { Check, Plus, ChevronLeft, Flame, BarChart3, Settings, Home, Download, Upload, X, Trash2 } from 'lucide-react';

// ==================== TYPES ====================

interface Friend {
  id: string;
  name: string;
  relationshipTier: 'close' | 'casual';
  cadenceDays: number;
  lastMeetingDate: number | null;
  streakCount: number;
  multiplier: number;
  totalMeetings: number;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Meeting {
  id: string;
  friendId: string;
  timestamp: number;
  note?: string;
  createdAt: number;
}

interface AppSettings {
  theme: 'auto' | 'light' | 'dark';
  notificationsEnabled: boolean;
  dailySummaryInterval: 7 | 15 | 30 | 45 | 60 | 90;
  thresholdAlertsEnabled: boolean;
  hasCompletedOnboarding: boolean;
}

interface AppState {
  friends: Friend[];
  meetings: Meeting[];
  settings: AppSettings;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

interface DataExport {
  version: string;
  exportedAt: number;
  friends: Friend[];
  meetings: Meeting[];
  settings: AppSettings;
}

type Screen = 'home' | 'friend-detail' | 'insights' | 'settings';
type Modal = 'add-friend' | 'edit-friend' | 'log-meeting' | 'import-confirm' | 'delete-confirm' | null;

// ==================== CONSTANTS ====================

const APP_VERSION = '2.1.0';

// SWAPPED COLORS: Teal is now primary (calmer), Amber is accent (warm CTAs)
const COLORS = {
  // Primary (now teal - calmer header)
  primary: '#26A69A',
  primaryLight: '#4DB6AC',
  primaryDark: '#00897B',
  
  // Accent (now amber - warm CTAs)
  accent: '#F9A825',
  accentLight: '#FFCA28',
  accentDark: '#F57F17',
  
  // States
  fresh: '#81C784',
  approaching: '#FFCC80',
  attention: '#FF8A65',
  
  // Backgrounds
  cream: '#FFFBF5',
  pageBg: '#F0F4F3',
  
  // Text
  textPrimary: '#3D3D3D',
  textSecondary: '#757575',
  textMuted: '#9E9E9E',
  
  // Dark mode
  darkBg: '#1C1917',
  darkCard: '#292524',
};

// ==================== HOURGLASS MASCOT COMPONENT ====================

const HourglassMascot = ({ size = 120, className = '' }: { size?: number; className?: string }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 120 120" 
      className={className}
      style={{ filter: 'drop-shadow(0 4px 12px rgba(38, 166, 154, 0.3))' }}
    >
      {/* Hourglass body - warm amber/orange color like Headspace */}
      <defs>
        <linearGradient id="hourglassGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFCA28" />
          <stop offset="100%" stopColor="#F9A825" />
        </linearGradient>
      </defs>
      
      {/* Top bulb */}
      <ellipse cx="60" cy="30" rx="32" ry="24" fill="url(#hourglassGradient)" />
      
      {/* Bottom bulb */}
      <ellipse cx="60" cy="90" rx="32" ry="24" fill="url(#hourglassGradient)" />
      
      {/* Neck/middle connection */}
      <path 
        d="M 40 42 Q 60 60 40 78 L 80 78 Q 60 60 80 42 Z" 
        fill="url(#hourglassGradient)"
      />
      
      {/* Sand inside top (small amount) */}
      <ellipse cx="60" cy="35" rx="18" ry="10" fill="#FFF8E1" opacity="0.6" />
      
      {/* Sand inside bottom (more sand) */}
      <ellipse cx="60" cy="92" rx="22" ry="12" fill="#FFF8E1" opacity="0.4" />
      
      {/* Face - closed happy eyes */}
      <path 
        d="M 45 28 Q 50 24 55 28" 
        stroke="#5D4037" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        fill="none"
      />
      <path 
        d="M 65 28 Q 70 24 75 28" 
        stroke="#5D4037" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        fill="none"
      />
      
      {/* Gentle smile */}
      <path 
        d="M 50 38 Q 60 44 70 38" 
        stroke="#5D4037" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        fill="none"
      />
    </svg>
  );
};

// Small version for inline use
const HourglassMascotSmall = ({ size = 48 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48">
    <defs>
      <linearGradient id="hourglassGradientSmall" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFCA28" />
        <stop offset="100%" stopColor="#F9A825" />
      </linearGradient>
    </defs>
    <ellipse cx="24" cy="12" rx="14" ry="10" fill="url(#hourglassGradientSmall)" />
    <ellipse cx="24" cy="36" rx="14" ry="10" fill="url(#hourglassGradientSmall)" />
    <path d="M 16 18 Q 24 24 16 30 L 32 30 Q 24 24 32 18 Z" fill="url(#hourglassGradientSmall)"/>
    <path d="M 18 11 Q 21 9 24 11" stroke="#5D4037" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <path d="M 24 11 Q 27 9 30 11" stroke="#5D4037" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <path d="M 20 15 Q 24 18 28 15" stroke="#5D4037" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
  </svg>
);

// ==================== UTILITY FUNCTIONS ====================

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const calculateElapsed = (lastMeeting: number | null): { days: number; hours: number; minutes: number; total: number } => {
  if (!lastMeeting) return { days: 0, hours: 0, minutes: 0, total: 0 };
  const elapsed = Date.now() - lastMeeting;
  const totalMinutes = Math.floor(elapsed / 60000);
  const days = Math.floor(elapsed / 86400000);
  const hours = Math.floor((elapsed % 86400000) / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  return { days, hours, minutes, total: totalMinutes };
};

const getTimerColor = (lastMeeting: number | null, cadence: number): string => {
  if (!lastMeeting) return COLORS.fresh;
  const elapsed = Date.now() - lastMeeting;
  const days = elapsed / 86400000;
  const percentage = (days / cadence) * 100;
  if (percentage < 50) return COLORS.fresh;
  if (percentage < 80) return COLORS.fresh;
  if (percentage < 100) return COLORS.approaching;
  return COLORS.attention;
};

const getDaysUntilDue = (lastMeeting: number | null, cadence: number): number => {
  if (!lastMeeting) return cadence;
  const elapsed = Date.now() - lastMeeting;
  const daysElapsed = elapsed / 86400000;
  return Math.max(0, Math.ceil(cadence - daysElapsed));
};

const calculateHealthScore = (friend: Friend, meetings: Meeting[]): number => {
  if (friend.totalMeetings < 2) return 50;
  const friendMeetings = meetings
    .filter(m => m.friendId === friend.id)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-10);
  if (friendMeetings.length < 2) return 50;
  const gaps = friendMeetings.slice(1).map((m, i) => 
    Math.floor((m.timestamp - friendMeetings[i].timestamp) / 86400000)
  );
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
  const consistency = Math.max(0, 100 - (variance / Math.max(avgGap, 1)) * 50);
  const streakStability = Math.min(friend.streakCount * 3, 30);
  const gapScore = Math.max(0, 100 - (Math.abs(avgGap - friend.cadenceDays) / friend.cadenceDays) * 100);
  const multiplierBonus = (friend.multiplier - 1) * 10;
  return Math.round((consistency * 0.4) + (streakStability * 0.3) + (gapScore * 0.2) + multiplierBonus);
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

// ==================== CUSTOM HOOKS ====================

const useLiveTimer = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);
  return tick;
};

const useDarkMode = (theme: 'auto' | 'light' | 'dark') => {
  useEffect(() => {
    const updateTheme = () => {
      if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', prefersDark);
      } else {
        document.documentElement.classList.toggle('dark', theme === 'dark');
      }
    };
    updateTheme();
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', updateTheme);
      return () => mediaQuery.removeEventListener('change', updateTheme);
    }
  }, [theme]);
};

// ==================== COMPONENTS ====================

// Simplified wave - no overlap issues
const WaveDivider = ({ color = 'currentColor' }: { color?: string }) => (
  <svg viewBox="0 0 1440 80" className="w-full h-6" preserveAspectRatio="none">
    <path fill={color} d="M0,40 C360,80 720,0 1080,40 C1260,60 1380,50 1440,45 L1440,80 L0,80 Z"/>
  </svg>
);

const ToastContainer = ({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) => {
  useEffect(() => {
    toasts.forEach(toast => {
      const timer = setTimeout(() => onDismiss(toast.id), 3000);
      return () => clearTimeout(timer);
    });
  }, [toasts, onDismiss]);

  return (
    <div className="fixed top-14 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4 safe-area-top">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="text-white px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 pointer-events-auto animate-slide-down"
          style={{ backgroundColor: toast.type === 'error' ? COLORS.attention : COLORS.primary }}
          onClick={() => onDismiss(toast.id)}
        >
          <Check className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium font-nunito">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

const TimerDisplay = ({ lastMeeting, cadence, size = 'normal' }: { lastMeeting: number | null; cadence: number; size?: 'normal' | 'large' }) => {
  useLiveTimer();
  const elapsed = calculateElapsed(lastMeeting);
  const color = getTimerColor(lastMeeting, cadence);
  const textSize = size === 'large' ? 'text-5xl' : 'text-4xl';
  const unitSize = size === 'large' ? 'text-xl' : 'text-lg';
  
  if (!lastMeeting) {
    return (
      <div className="text-center py-4">
        <div className={`${textSize} font-light tracking-tight text-gray-400 dark:text-gray-500 font-nunito`}>
          No meetings yet
        </div>
        <div className="text-sm text-gray-400 dark:text-gray-500 mt-1 font-nunito">ready when you are</div>
      </div>
    );
  }
  
  return (
    <div className="text-center py-4">
      <div className="font-light tracking-tight transition-colors duration-700 ease-in-out font-nunito" style={{ color }}>
        <span className={`${textSize} tabular-nums`}>{elapsed.days}</span>
        <span className={`${unitSize} text-gray-400 dark:text-gray-500 mx-1`}>d</span>
        <span className={`${textSize} tabular-nums`}>{elapsed.hours}</span>
        <span className={`${unitSize} text-gray-400 dark:text-gray-500 mx-1`}>h</span>
        <span className={`${textSize} tabular-nums`}>{elapsed.minutes}</span>
        <span className={`${unitSize} text-gray-400 dark:text-gray-500 ml-1`}>m</span>
      </div>
      <div className="text-sm text-gray-400 dark:text-gray-500 mt-1 font-nunito">since you connected</div>
    </div>
  );
};

const ProgressBar = ({ lastMeeting, cadence }: { lastMeeting: number | null; cadence: number }) => {
  useLiveTimer();
  const color = getTimerColor(lastMeeting, cadence);
  const daysUntil = getDaysUntilDue(lastMeeting, cadence);
  let percentage = 0;
  if (lastMeeting) {
    const elapsed = Date.now() - lastMeeting;
    const daysElapsed = elapsed / 86400000;
    percentage = Math.min(100, (daysElapsed / cadence) * 100);
  }
  
  return (
    <div className="mt-4">
      <div className="h-2 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${percentage}%`, backgroundColor: color }}/>
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-400 dark:text-gray-500 font-nunito">
        <span className="tabular-nums">{Math.round(percentage)}% of cycle</span>
        <span className="tabular-nums">{daysUntil > 0 ? `${daysUntil}d left` : 'ready for a catch-up'}</span>
      </div>
    </div>
  );
};

const FriendCard = ({ friend, meetings, onClick }: { friend: Friend; meetings: Meeting[]; onClick: () => void }) => {
  const healthScore = calculateHealthScore(friend, meetings);
  
  return (
    <div 
      onClick={onClick}
      className="rounded-3xl p-5 mb-4 cursor-pointer transition-all duration-300 ease-out hover:shadow-lg active:scale-[0.98]"
      style={{ backgroundColor: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
    >
      <TimerDisplay lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} />
      <div className="border-t border-gray-100 dark:border-gray-700/50 my-4" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-sm font-nunito"
            style={{ background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.accentDark} 100%)`, boxShadow: `0 4px 12px ${COLORS.accent}40` }}
          >
            {friend.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-gray-800 dark:text-gray-100 font-nunito">{friend.name}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 font-nunito">{friend.relationshipTier} · every {friend.cadenceDays}d</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-400 dark:text-gray-500 font-nunito tabular-nums">{healthScore}</div>
          {friend.streakCount > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: `${COLORS.approaching}30` }}>
              <Flame className="w-3.5 h-3.5" style={{ color: COLORS.attention }} />
              <span className="text-xs font-semibold tabular-nums font-nunito" style={{ color: COLORS.attention }}>{friend.streakCount}</span>
            </div>
          )}
        </div>
      </div>
      <ProgressBar lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} />
    </div>
  );
};

// ==================== MODALS ====================

const AddEditFriendModal = ({ friend, onClose, onSave, friendCount }: { friend?: Friend; onClose: () => void; onSave: (data: Partial<Friend>) => void; friendCount: number }) => {
  const [name, setName] = useState(friend?.name || '');
  const [tier, setTier] = useState<'close' | 'casual'>(friend?.relationshipTier || 'close');
  const [cadence, setCadence] = useState(friend?.cadenceDays || 14);
  const [cadenceInput, setCadenceInput] = useState(String(friend?.cadenceDays || 14));
  const [error, setError] = useState('');
  const presets = [7, 14, 21, 30, 60, 90];

  // FIX: Handle custom cadence input properly
  const handleCadenceInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCadenceInput(value);
    
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1) {
      setCadence(numValue);
    }
  };

  const handleCadenceInputBlur = () => {
    const numValue = parseInt(cadenceInput, 10);
    if (isNaN(numValue) || numValue < 1) {
      setCadenceInput(String(cadence));
    } else {
      setCadence(numValue);
      setCadenceInput(String(numValue));
    }
  };

  const handlePresetClick = (preset: number) => {
    setCadence(preset);
    setCadenceInput(String(preset));
  };

  const handleSave = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!friend && friendCount >= 10) { setError('Friend limit reached (10 max)'); return; }
    onSave({ name: name.trim(), relationshipTier: tier, cadenceDays: cadence });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl max-h-[90vh] overflow-auto animate-slide-up safe-area-bottom" style={{ backgroundColor: 'var(--card-bg)' }}>
        <div className="sticky top-0 pb-2" style={{ backgroundColor: 'var(--card-bg)' }}>
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mt-3 mb-4" />
          <div className="flex items-center justify-between px-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 font-nunito">{friend ? 'Edit Friend' : 'Add Friend'}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
        <div className="px-6 pb-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 font-nunito">Name</label>
            <input
              type="text" value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Friend's name" autoFocus
              className={`w-full px-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-100 font-nunito border-2 transition-colors duration-200 ${error ? 'border-red-400' : 'border-transparent'} focus:outline-none focus:border-teal-500`}
            />
            {error && <div className="text-sm text-red-500 mt-2 font-nunito">{error}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 font-nunito">Relationship Type</label>
            <div className="flex gap-3">
              {(['close', 'casual'] as const).map((t) => (
                <button key={t} onClick={() => setTier(t)}
                  className="flex-1 py-3.5 rounded-2xl font-semibold transition-all duration-200 font-nunito capitalize"
                  style={{ backgroundColor: tier === t ? COLORS.accent : 'transparent', color: tier === t ? 'white' : COLORS.textSecondary, border: tier === t ? 'none' : '2px solid #E5E7EB', boxShadow: tier === t ? `0 4px 12px ${COLORS.accent}40` : 'none' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 font-nunito">Ideal Cadence</label>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-gray-500 font-nunito">Every</span>
              {/* FIX: Proper input handling for custom values */}
              <input 
                type="number" 
                value={cadenceInput} 
                onChange={handleCadenceInputChange}
                onBlur={handleCadenceInputBlur}
                className="w-20 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-100 text-center font-medium font-nunito focus:outline-none focus:ring-2 focus:ring-amber-500" 
                min="1"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <span className="text-sm text-gray-500 font-nunito">days</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map(preset => (
                <button key={preset} onClick={() => handlePresetClick(preset)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 font-nunito"
                  style={{ backgroundColor: cadence === preset ? COLORS.accent : '#F3F4F6', color: cadence === preset ? 'white' : COLORS.textSecondary, boxShadow: cadence === preset ? `0 4px 12px ${COLORS.accent}40` : 'none' }}>
                  {preset}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 py-4 rounded-2xl font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-nunito transition-colors">Cancel</button>
            <button onClick={handleSave} className="flex-1 py-4 rounded-2xl font-semibold text-white font-nunito transition-all" style={{ backgroundColor: COLORS.accent, boxShadow: `0 4px 12px ${COLORS.accent}40` }}>Save</button>
          </div>
        </div>
      </div>
    </>
  );
};

const LogMeetingModal = ({ friend, onClose, onSave }: { friend: Friend; onClose: () => void; onSave: (note?: string) => void }) => {
  const [note, setNote] = useState('');

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl animate-slide-up safe-area-bottom" style={{ backgroundColor: 'var(--card-bg)' }}>
        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mt-3 mb-4" />
        <div className="px-6 pb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 font-nunito">Log Meeting</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="flex items-center gap-3 mb-6 p-4 rounded-2xl bg-gray-50 dark:bg-gray-700/50">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold font-nunito" style={{ background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.accentDark} 100%)` }}>
              {friend.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-100 font-nunito">{friend.name}</div>
              <div className="text-sm text-gray-500 font-nunito">Logging a connection</div>
            </div>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 font-nunito">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you talk about?" maxLength={200} rows={3}
              className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-100 resize-none font-nunito focus:outline-none focus:ring-2 focus:ring-amber-500"/>
            <div className="text-xs text-gray-400 text-right mt-2 tabular-nums font-nunito">{note.length}/200</div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-4 rounded-2xl font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-nunito">Cancel</button>
            <button onClick={() => onSave(note.trim() || undefined)} className="flex-1 py-4 rounded-2xl font-semibold text-white font-nunito flex items-center justify-center gap-2" style={{ backgroundColor: COLORS.accent, boxShadow: `0 4px 12px ${COLORS.accent}40` }}>
              <Check className="w-5 h-5" />Log Meeting
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const DeleteConfirmModal = ({ friend, onClose, onConfirm }: { friend: Friend; onClose: () => void; onConfirm: () => void }) => (
  <>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose}/>
    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-3xl p-6 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: 'var(--card-bg)' }}>
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${COLORS.attention}20` }}>
          <Trash2 className="w-8 h-8" style={{ color: COLORS.attention }} />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 font-nunito mb-2">Delete {friend.name}?</h2>
        <p className="text-sm text-gray-500 font-nunito">This will permanently remove {friend.name} and all their meeting history.</p>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-nunito">Cancel</button>
        <button onClick={onConfirm} className="flex-1 py-3.5 rounded-2xl font-semibold text-white font-nunito" style={{ backgroundColor: COLORS.attention }}>Delete</button>
      </div>
    </div>
  </>
);

const ImportConfirmModal = ({ data, onClose, onConfirm }: { data: DataExport; onClose: () => void; onConfirm: () => void }) => (
  <>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose}/>
    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-3xl p-6 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: 'var(--card-bg)' }}>
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 font-nunito mb-4">Import Data?</h2>
      <div className="rounded-2xl p-4 mb-6 bg-gray-50 dark:bg-gray-700/50">
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1 font-nunito">
          <p><span className="font-semibold">{data.friends.length}</span> friends</p>
          <p><span className="font-semibold">{data.meetings.length}</span> meetings</p>
          <p className="text-xs text-gray-400 mt-2">Exported: {new Date(data.exportedAt).toLocaleDateString()}</p>
        </div>
      </div>
      <p className="text-sm mb-6 font-nunito" style={{ color: COLORS.approaching }}>This will replace all your current data.</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-nunito">Cancel</button>
        <button onClick={onConfirm} className="flex-1 py-3.5 rounded-2xl font-semibold text-white font-nunito" style={{ backgroundColor: COLORS.accent }}>Import</button>
      </div>
    </div>
  </>
);

// ==================== MAIN APP ====================

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [currentModal, setCurrentModal] = useState<Modal>(null);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [importData, setImportData] = useState<DataExport | null>(null);
  
  const [appState, setAppState] = useState<AppState>(() => {
    const saved = localStorage.getItem('in-time-data');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fall through */ }
    }
    return {
      friends: [],
      meetings: [],
      settings: { theme: 'auto', notificationsEnabled: true, dailySummaryInterval: 30, thresholdAlertsEnabled: true, hasCompletedOnboarding: false }
    };
  });

  useDarkMode(appState.settings.theme);

  useEffect(() => { localStorage.setItem('in-time-data', JSON.stringify(appState)); }, [appState]);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    root.style.setProperty('--card-bg', isDark ? COLORS.darkCard : COLORS.cream);
    root.style.setProperty('--page-bg', isDark ? COLORS.darkBg : COLORS.pageBg);
  }, [appState.settings.theme]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => { setToasts(prev => prev.filter(t => t.id !== id)); }, []);

  const handleExport = () => {
    const exportData: DataExport = { version: APP_VERSION, exportedAt: Date.now(), friends: appState.friends, meetings: appState.meetings, settings: appState.settings };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `in-time-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported successfully');
  };
  
  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as DataExport;
        if (!data.friends || !data.meetings || !data.settings) { showToast('Invalid backup file', 'error'); return; }
        setImportData(data); setCurrentModal('import-confirm');
      } catch { showToast('Could not read file', 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  
  const confirmImport = () => {
    if (!importData) return;
    setAppState({ friends: importData.friends, meetings: importData.meetings, settings: importData.settings });
    setImportData(null); setCurrentModal(null);
    showToast('Data imported successfully');
  };

  const handleAddFriend = (data: Partial<Friend>) => {
    const newFriend: Friend = {
      id: generateId(), name: data.name!, relationshipTier: data.relationshipTier!, cadenceDays: data.cadenceDays!,
      lastMeetingDate: null, streakCount: 0, multiplier: 1.0, totalMeetings: 0, isArchived: false, createdAt: Date.now(), updatedAt: Date.now()
    };
    setAppState(prev => ({ ...prev, friends: [...prev.friends, newFriend] }));
    setCurrentModal(null);
    showToast(`${newFriend.name} added`);
  };

  const handleEditFriend = (data: Partial<Friend>) => {
    if (!selectedFriendId) return;
    setAppState(prev => ({ ...prev, friends: prev.friends.map(f => f.id === selectedFriendId ? { ...f, ...data, updatedAt: Date.now() } : f) }));
    setCurrentModal(null);
    showToast('Friend updated');
  };

  const handleLogMeeting = (note?: string) => {
    if (!selectedFriendId) return;
    const friend = appState.friends.find(f => f.id === selectedFriendId);
    if (!friend) return;
    const now = Date.now();
    const newMeeting: Meeting = { id: generateId(), friendId: selectedFriendId, timestamp: now, note, createdAt: now };
    const daysSinceLastMeeting = friend.lastMeetingDate ? Math.floor((now - friend.lastMeetingDate) / 86400000) : 0;
    const newStreak = daysSinceLastMeeting <= friend.cadenceDays && friend.lastMeetingDate ? friend.streakCount + 1 : 1;
    const newMultiplier = Math.min(3.0, 1.0 + (newStreak * 0.1));
    setAppState(prev => ({
      ...prev,
      meetings: [...prev.meetings, newMeeting],
      friends: prev.friends.map(f => f.id === selectedFriendId ? { ...f, lastMeetingDate: now, streakCount: newStreak, multiplier: newMultiplier, totalMeetings: f.totalMeetings + 1, updatedAt: now } : f)
    }));
    setCurrentModal(null);
    showToast(`Meeting with ${friend.name} logged`);
  };

  const handleDeleteFriend = () => {
    if (!selectedFriendId) return;
    const friend = appState.friends.find(f => f.id === selectedFriendId);
    if (!friend) return;
    setAppState(prev => ({ ...prev, friends: prev.friends.filter(f => f.id !== selectedFriendId), meetings: prev.meetings.filter(m => m.friendId !== selectedFriendId) }));
    setCurrentModal(null); setCurrentScreen('home'); setSelectedFriendId(null);
    showToast(`${friend.name} deleted`);
  };

  const selectedFriend = selectedFriendId ? appState.friends.find(f => f.id === selectedFriendId) : null;
  const activeFriendCount = appState.friends.filter(f => !f.isArchived).length;
  const activeFriends = appState.friends.filter(f => !f.isArchived).sort((a, b) => getDaysUntilDue(a.lastMeetingDate, a.cadenceDays) - getDaysUntilDue(b.lastMeetingDate, b.cadenceDays));
  const overallHealth = activeFriends.length > 0 ? Math.round(activeFriends.reduce((sum, f) => sum + calculateHealthScore(f, appState.meetings), 0) / activeFriends.length) : 0;
  const friendsNeedingAttention = activeFriends.filter(f => getDaysUntilDue(f.lastMeetingDate, f.cadenceDays) <= 3).length;

  return (
    <div className="h-screen flex flex-col transition-colors duration-300" style={{ backgroundColor: 'var(--page-bg, #F0F4F3)' }}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* HOME SCREEN */}
      {currentScreen === 'home' && (
        <div className="flex-1 overflow-auto pb-24">
          {/* SWAPPED: Teal header (calmer) */}
          <div className="relative pt-safe-top" style={{ backgroundColor: COLORS.primary }}>
            <div className="px-5 pt-4 pb-12">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white font-nunito">{getGreeting()} ☀️</h1>
                  <p className="text-white/80 text-sm mt-1 font-nunito">
                    {friendsNeedingAttention > 0 ? `${friendsNeedingAttention} friend${friendsNeedingAttention > 1 ? 's' : ''} to catch up with` : activeFriendCount > 0 ? "You're all caught up!" : "Add your first friend to get started"}
                  </p>
                </div>
                {/* SWAPPED: Amber CTA button */}
                <button onClick={() => setCurrentModal('add-friend')} disabled={activeFriendCount >= 10}
                  className="w-12 h-12 rounded-full text-white flex items-center justify-center disabled:opacity-50 transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{ backgroundColor: COLORS.accent, boxShadow: `0 4px 12px ${COLORS.accent}60` }}>
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>
            <WaveDivider color={COLORS.pageBg} />
          </div>
          
          <div className="px-5 -mt-1">
            {/* Empty State with Hourglass Mascot */}
            {activeFriendCount === 0 ? (
              <div className="text-center py-12">
                <HourglassMascot size={140} className="mx-auto mb-6" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2 font-nunito">Add your first friend</h2>
                <p className="text-gray-500 max-w-xs mx-auto font-nunito">Start tracking meaningful connections by adding someone you care about</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeFriends.map(friend => (
                  <FriendCard key={friend.id} friend={friend} meetings={appState.meetings} onClick={() => { setSelectedFriendId(friend.id); setCurrentScreen('friend-detail'); }}/>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FRIEND DETAIL SCREEN - FIX: No overlapping avatar */}
      {currentScreen === 'friend-detail' && selectedFriend && (
        <div className="flex-1 overflow-auto pb-32">
          {/* Teal Header - simpler, no overlapping elements */}
          <div className="relative pt-safe-top" style={{ backgroundColor: COLORS.primary }}>
            <div className="px-5 pt-4 pb-12">
              <div className="flex items-center justify-between">
                <button onClick={() => { setCurrentScreen('home'); setSelectedFriendId(null); }} className="p-2 -ml-2 hover:bg-white/20 rounded-full transition-colors">
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <span className="font-bold text-white font-nunito text-lg">{selectedFriend.name}</span>
                <div className="w-10" />
              </div>
            </div>
            <WaveDivider color={COLORS.pageBg} />
          </div>

          {/* FIX: Avatar now inside content area, not overlapping wave */}
          <div className="px-5 -mt-1">
            {/* Profile Card with Avatar */}
            <div className="rounded-3xl p-6 mb-4" style={{ backgroundColor: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              {/* Avatar centered at top of card */}
              <div className="flex justify-center mb-4">
                <div 
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl font-nunito"
                  style={{ background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.accentDark} 100%)`, boxShadow: `0 6px 20px ${COLORS.accent}40` }}
                >
                  {selectedFriend.name.charAt(0).toUpperCase()}
                </div>
              </div>
              
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 font-nunito">{selectedFriend.name}</h2>
                <span className="text-sm text-gray-500 font-nunito">{selectedFriend.relationshipTier} · every {selectedFriend.cadenceDays} days</span>
              </div>

              <TimerDisplay lastMeeting={selectedFriend.lastMeetingDate} cadence={selectedFriend.cadenceDays} size="large" />
              
              <div className="flex justify-center gap-8 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                {selectedFriend.streakCount > 0 && (
                  <div className="text-center">
                    <div className="flex items-center gap-1.5 justify-center mb-1">
                      <Flame className="w-5 h-5" style={{ color: COLORS.attention }} />
                      <span className="text-2xl font-bold font-nunito" style={{ color: COLORS.attention }}>{selectedFriend.streakCount}</span>
                    </div>
                    <div className="text-xs text-gray-400 font-nunito">streak</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-2xl font-bold font-nunito" style={{ color: COLORS.primary }}>{selectedFriend.multiplier.toFixed(1)}×</div>
                  <div className="text-xs text-gray-400 font-nunito">multiplier</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold font-nunito" style={{ color: COLORS.primary }}>{selectedFriend.totalMeetings}</div>
                  <div className="text-xs text-gray-400 font-nunito">meetings</div>
                </div>
              </div>

              <ProgressBar lastMeeting={selectedFriend.lastMeetingDate} cadence={selectedFriend.cadenceDays} />
              
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-500 font-nunito">Health Score</span>
                  <span className="text-lg font-bold font-nunito" style={{ color: COLORS.primary }}>{calculateHealthScore(selectedFriend, appState.meetings)}</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${calculateHealthScore(selectedFriend, appState.meetings)}%`, backgroundColor: COLORS.primary }}/>
                </div>
              </div>
            </div>

            {/* Meeting History */}
            <div className="mb-6">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4 font-nunito">Meeting History</h3>
              {(() => {
                const friendMeetings = appState.meetings.filter(m => m.friendId === selectedFriend.id).sort((a, b) => b.timestamp - a.timestamp);
                return friendMeetings.length === 0 ? (
                  <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: 'var(--card-bg)' }}>
                    <HourglassMascotSmall size={56} />
                    <div className="text-sm text-gray-400 font-nunito mt-3">No meetings yet</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friendMeetings.map(meeting => (
                      <div key={meeting.id} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--card-bg)' }}>
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-medium text-sm text-gray-800 dark:text-gray-100 font-nunito">{new Date(meeting.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div className="text-xs text-gray-400 font-nunito">{new Date(meeting.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        {meeting.note && <div className="text-sm text-gray-500 font-nunito">{meeting.note}</div>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <button onClick={() => setCurrentModal('delete-confirm')} className="w-full py-3 text-sm transition-colors font-nunito rounded-2xl border mb-8" style={{ color: COLORS.attention, borderColor: COLORS.attention }}>
              Delete Friend
            </button>
          </div>

          {/* SWAPPED: Amber Log Meeting button */}
          <div className="fixed bottom-24 left-0 right-0 p-5 safe-area-bottom" style={{ background: 'linear-gradient(to top, var(--page-bg) 80%, transparent)' }}>
            <button onClick={() => setCurrentModal('log-meeting')}
              className="w-full h-14 text-white rounded-2xl font-semibold font-nunito flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: COLORS.accent, boxShadow: `0 4px 16px ${COLORS.accent}50` }}>
              <Check className="w-5 h-5" />Log Meeting
            </button>
          </div>
        </div>
      )}

      {/* INSIGHTS SCREEN */}
      {currentScreen === 'insights' && (
        <div className="flex-1 overflow-auto pb-24">
          <div className="relative pt-safe-top" style={{ backgroundColor: COLORS.primary }}>
            <div className="px-5 pt-4 pb-12"><h1 className="text-2xl font-bold text-white font-nunito">Insights</h1></div>
            <WaveDivider color={COLORS.pageBg} />
          </div>
          <div className="px-5 -mt-1">
            <div className="rounded-3xl p-6 mb-4" style={{ backgroundColor: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h2 className="text-sm font-medium text-gray-500 mb-4 font-nunito">Overall Health</h2>
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-36 h-36">
                  <svg className="transform -rotate-90 w-36 h-36">
                    <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="10" fill="none" className="text-gray-100 dark:text-gray-700/50" />
                    <circle cx="72" cy="72" r="60" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={`${overallHealth * 3.77} 377`} className="transition-all duration-700" style={{ stroke: COLORS.primary }}/>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-bold text-gray-800 dark:text-gray-100 font-nunito">{overallHealth}</span>
                  </div>
                </div>
              </div>
              <p className="text-center text-sm text-gray-400 font-nunito">{overallHealth >= 80 ? 'Excellent' : overallHealth >= 60 ? 'Good' : overallHealth >= 40 ? 'Needs attention' : 'Getting started'}</p>
            </div>
            <div className="rounded-3xl p-6" style={{ backgroundColor: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h2 className="text-sm font-medium text-gray-500 mb-4 font-nunito">Individual Scores</h2>
              {activeFriends.length === 0 ? (
                <div className="text-center py-8">
                  <HourglassMascotSmall size={48} />
                  <div className="text-gray-400 text-sm font-nunito mt-3">No friends yet</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeFriends.sort((a, b) => calculateHealthScore(b, appState.meetings) - calculateHealthScore(a, appState.meetings)).map(friend => {
                    const health = calculateHealthScore(friend, appState.meetings);
                    return (
                      <div key={friend.id}>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium text-gray-800 dark:text-gray-100 font-nunito">{friend.name}</span>
                          <span className="font-semibold tabular-nums font-nunito" style={{ color: COLORS.primary }}>{health}</span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${health}%`, backgroundColor: COLORS.primary }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS SCREEN */}
      {currentScreen === 'settings' && (
        <div className="flex-1 overflow-auto pb-24">
          <div className="relative pt-safe-top" style={{ backgroundColor: COLORS.primary }}>
            <div className="px-5 pt-4 pb-12"><h1 className="text-2xl font-bold text-white font-nunito">Settings</h1></div>
            <WaveDivider color={COLORS.pageBg} />
          </div>
          <div className="px-5 -mt-1">
            <div className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide font-nunito">Appearance</h3>
              </div>
              <div className="px-5 py-4 flex items-center justify-between">
                <span className="text-gray-800 dark:text-gray-100 font-nunito">Theme</span>
                <select value={appState.settings.theme} onChange={(e) => setAppState(prev => ({ ...prev, settings: { ...prev.settings, theme: e.target.value as 'auto' | 'light' | 'dark' } }))}
                  className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-xl border-none text-gray-800 dark:text-gray-100 font-medium font-nunito focus:outline-none">
                  <option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </div>
            </div>
            <div className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide font-nunito">Notifications</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                <div className="px-5 py-4 flex items-center justify-between">
                  <span className="text-gray-800 dark:text-gray-100 font-nunito">Daily summary</span>
                  <input type="checkbox" checked={appState.settings.notificationsEnabled} onChange={(e) => setAppState(prev => ({ ...prev, settings: { ...prev.settings, notificationsEnabled: e.target.checked } }))} className="w-5 h-5 rounded" style={{ accentColor: COLORS.accent }}/>
                </div>
                <div className="px-5 py-4 flex items-center justify-between">
                  <span className="text-gray-800 dark:text-gray-100 font-nunito">Threshold alerts</span>
                  <input type="checkbox" checked={appState.settings.thresholdAlertsEnabled} onChange={(e) => setAppState(prev => ({ ...prev, settings: { ...prev.settings, thresholdAlertsEnabled: e.target.checked } }))} className="w-5 h-5 rounded" style={{ accentColor: COLORS.accent }}/>
                </div>
              </div>
            </div>
            <div className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide font-nunito">Data</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                <button onClick={handleExport} className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-center gap-3"><Download className="w-5 h-5" style={{ color: COLORS.primary }} /><span className="text-gray-800 dark:text-gray-100 font-nunito">Export Data</span></div>
                  <span className="text-sm text-gray-400 font-nunito">Download backup</span>
                </button>
                <label className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3"><Upload className="w-5 h-5" style={{ color: COLORS.primary }} /><span className="text-gray-800 dark:text-gray-100 font-nunito">Import Data</span></div>
                  <span className="text-sm text-gray-400 font-nunito">Restore backup</span>
                  <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
                </label>
              </div>
            </div>
            <div className="rounded-3xl overflow-hidden" style={{ backgroundColor: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide font-nunito">About</h3>
              </div>
              <div className="px-5 py-4 flex items-center justify-between">
                <span className="text-gray-800 dark:text-gray-100 font-nunito">Version</span>
                <span className="text-gray-400 font-mono text-sm">{APP_VERSION}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200/50 dark:border-gray-700/50 safe-area-bottom" style={{ backgroundColor: 'var(--card-bg)' }}>
        <div className="flex justify-around py-2">
          {[{ screen: 'home' as const, icon: Home, label: 'Home' }, { screen: 'insights' as const, icon: BarChart3, label: 'Insights' }, { screen: 'settings' as const, icon: Settings, label: 'Settings' }].map(({ screen, icon: Icon, label }) => (
            <button key={screen} onClick={() => setCurrentScreen(screen)} className="flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all duration-200">
              <Icon className={`w-6 h-6 transition-transform duration-200 ${currentScreen === screen ? 'scale-110' : ''}`} style={{ color: currentScreen === screen ? COLORS.primary : '#9CA3AF' }}/>
              <span className="text-xs font-medium font-nunito" style={{ color: currentScreen === screen ? COLORS.primary : '#9CA3AF' }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MODALS */}
      {currentModal === 'add-friend' && <AddEditFriendModal onClose={() => setCurrentModal(null)} onSave={handleAddFriend} friendCount={activeFriendCount}/>}
      {currentModal === 'edit-friend' && selectedFriend && <AddEditFriendModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onSave={handleEditFriend} friendCount={activeFriendCount}/>}
      {currentModal === 'log-meeting' && selectedFriend && <LogMeetingModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onSave={handleLogMeeting}/>}
      {currentModal === 'delete-confirm' && selectedFriend && <DeleteConfirmModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onConfirm={handleDeleteFriend}/>}
      {currentModal === 'import-confirm' && importData && <ImportConfirmModal data={importData} onClose={() => { setImportData(null); setCurrentModal(null); }} onConfirm={confirmImport}/>}

      {/* GLOBAL STYLES */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700&display=swap');
        .font-nunito { font-family: 'Nunito', sans-serif; }
        .pt-safe-top { padding-top: max(env(safe-area-inset-top), 20px); }
        .safe-area-top { padding-top: env(safe-area-inset-top); }
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
        @keyframes slide-down { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-slide-down { animation: slide-down 0.3s ease-out; }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
        :root { --card-bg: ${COLORS.cream}; --page-bg: ${COLORS.pageBg}; }
        .dark { --card-bg: ${COLORS.darkCard}; --page-bg: ${COLORS.darkBg}; }
      `}</style>
    </div>
  );
}