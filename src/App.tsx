import React, { useState, useEffect, useCallback } from 'react';
import { Check, Plus, ChevronLeft, ChevronRight, Flame, BarChart3, Settings, Home, Download, Upload, X, Trash2 } from 'lucide-react';

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

type Screen = 'onboarding' | 'home' | 'friend-detail' | 'insights' | 'settings';
type Modal = 'add-friend' | 'edit-friend' | 'log-meeting' | 'import-confirm' | 'delete-confirm' | 'quick-log-confirm' | null;

// ==================== CONSTANTS ====================

const APP_VERSION = '2.3.0';

const COLORS = {
  // Primary (teal)
  primary: '#26A69A',
  primaryLight: '#4DB6AC',
  primaryDark: '#00897B',
  
  // Accent (amber - only for highlights like streaks)
  accent: '#F9A825',
  accentLight: '#FFCA28',
  
  // States
  fresh: '#66BB6A',
  approaching: '#FFA726',
  attention: '#EF5350',
  
  // Light mode
  lightBg: '#FFFFFF',
  lightCard: '#FFFFFF',
  lightText: '#1A1A1A',
  lightTextSecondary: '#666666',
  lightTextMuted: '#999999',
  lightBorder: '#E5E5E5',
  
  // Dark mode
  darkBg: '#0D0D0D',
  darkCard: '#1A1A1A',
  darkText: '#FFFFFF',
  darkTextSecondary: '#AAAAAA',
  darkTextMuted: '#666666',
  darkBorder: '#333333',
};

// ==================== UTILITY FUNCTIONS ====================

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const calculateElapsed = (lastMeeting: number | null): { days: number; hours: number; minutes: number } => {
  if (!lastMeeting) return { days: 0, hours: 0, minutes: 0 };
  const elapsed = Date.now() - lastMeeting;
  const days = Math.floor(elapsed / 86400000);
  const hours = Math.floor((elapsed % 86400000) / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  return { days, hours, minutes };
};

const getTimerColor = (lastMeeting: number | null, cadence: number): string => {
  if (!lastMeeting) return COLORS.fresh;
  const elapsed = Date.now() - lastMeeting;
  const days = elapsed / 86400000;
  const percentage = (days / cadence) * 100;
  if (percentage < 60) return COLORS.fresh;
  if (percentage < 90) return COLORS.approaching;
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
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    const updateTheme = () => {
      let dark = false;
      if (theme === 'auto') {
        dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        dark = theme === 'dark';
      }
      setIsDark(dark);
      document.documentElement.classList.toggle('dark', dark);
    };
    updateTheme();
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', updateTheme);
      return () => mediaQuery.removeEventListener('change', updateTheme);
    }
  }, [theme]);
  
  return isDark;
};

// ==================== COMPONENTS ====================

const WaveDivider = ({ isDark }: { isDark: boolean }) => (
  <svg viewBox="0 0 1440 60" className="w-full h-5" preserveAspectRatio="none">
    <path fill={isDark ? COLORS.darkBg : COLORS.lightBg} d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,40 1440,35 L1440,60 L0,60 Z"/>
  </svg>
);

const GradientBackground = ({ isDark, children, className = '' }: { isDark: boolean; children: React.ReactNode; className?: string }) => (
  <div 
    className={`${className}`}
    style={{
      background: isDark 
        ? `linear-gradient(180deg, ${COLORS.darkBg} 0%, #0A1A18 50%, ${COLORS.darkBg} 100%)`
        : `linear-gradient(180deg, ${COLORS.lightBg} 0%, #E8F5F3 50%, ${COLORS.lightBg} 100%)`
    }}
  >
    {children}
  </div>
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
          className="px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 pointer-events-auto animate-slide-down"
          style={{ backgroundColor: COLORS.primary }}
          onClick={() => onDismiss(toast.id)}
        >
          <Check className="w-5 h-5 flex-shrink-0 text-white" />
          <span className="text-sm font-medium font-nunito text-white">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

const TimerDisplay = ({ lastMeeting, cadence, size = 'normal', isDark }: { lastMeeting: number | null; cadence: number; size?: 'normal' | 'large'; isDark: boolean }) => {
  useLiveTimer();
  const elapsed = calculateElapsed(lastMeeting);
  const color = getTimerColor(lastMeeting, cadence);
  const isLarge = size === 'large';
  const textColor = isDark ? COLORS.darkTextMuted : COLORS.lightTextMuted;
  
  if (!lastMeeting) {
    return (
      <div className="text-center">
        <div className={`${isLarge ? 'text-3xl' : 'text-2xl'} font-light font-nunito`} style={{ color: textColor }}>
          No meetings yet
        </div>
        <div className="text-xs mt-1 font-nunito" style={{ color: textColor }}>tap to log your first</div>
      </div>
    );
  }
  
  return (
    <div className="text-center">
      <div className="font-light tracking-tight font-nunito" style={{ color }}>
        <span className={`${isLarge ? 'text-4xl' : 'text-3xl'} tabular-nums`}>{elapsed.days}</span>
        <span className={`${isLarge ? 'text-lg' : 'text-base'} mx-0.5`} style={{ color: textColor }}>d</span>
        <span className={`${isLarge ? 'text-4xl' : 'text-3xl'} tabular-nums`}>{elapsed.hours}</span>
        <span className={`${isLarge ? 'text-lg' : 'text-base'} mx-0.5`} style={{ color: textColor }}>h</span>
        <span className={`${isLarge ? 'text-4xl' : 'text-3xl'} tabular-nums`}>{elapsed.minutes}</span>
        <span className={`${isLarge ? 'text-lg' : 'text-base'} ml-0.5`} style={{ color: textColor }}>m</span>
      </div>
      <div className="text-xs mt-1 font-nunito" style={{ color: textColor }}>since you connected</div>
    </div>
  );
};

const ProgressBar = ({ lastMeeting, cadence, compact = false, isDark }: { lastMeeting: number | null; cadence: number; compact?: boolean; isDark: boolean }) => {
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
    <div className={compact ? 'mt-2' : 'mt-3'}>
      <div className={`${compact ? 'h-1.5' : 'h-2'} rounded-full overflow-hidden`} style={{ backgroundColor: isDark ? COLORS.darkBorder : COLORS.lightBorder }}>
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${percentage}%`, backgroundColor: color }}/>
      </div>
      {!compact && (
        <div className="flex justify-between mt-1.5 text-xs font-nunito" style={{ color: isDark ? COLORS.darkTextMuted : COLORS.lightTextMuted }}>
          <span className="tabular-nums">{Math.round(percentage)}%</span>
          <span className="tabular-nums">{daysUntil > 0 ? `${daysUntil}d left` : 'overdue'}</span>
        </div>
      )}
    </div>
  );
};

const TimerCompact = ({ lastMeeting, cadence, isDark }: { lastMeeting: number | null; cadence: number; isDark: boolean }) => {
  useLiveTimer();
  const elapsed = calculateElapsed(lastMeeting);
  const color = getTimerColor(lastMeeting, cadence);
  const mutedColor = isDark ? COLORS.darkTextMuted : COLORS.lightTextMuted;
  
  if (!lastMeeting) {
    return <span className="text-sm font-nunito" style={{ color: mutedColor }}>New</span>;
  }
  
  return (
    <div className="font-nunito" style={{ color }}>
      <span className="text-lg font-semibold tabular-nums">{elapsed.days}</span>
      <span className="text-xs" style={{ color: mutedColor }}>d </span>
      <span className="text-lg font-semibold tabular-nums">{elapsed.hours}</span>
      <span className="text-xs" style={{ color: mutedColor }}>h</span>
    </div>
  );
};

const FriendCard = ({ 
  friend, 
  onTap,
  onQuickLog,
  onDelete,
  isDark
}: { 
  friend: Friend; 
  onTap: () => void;
  onQuickLog: () => void;
  onDelete: () => void;
  isDark: boolean;
}) => {
  const color = getTimerColor(friend.lastMeetingDate, friend.cadenceDays);
  const cardBg = isDark ? COLORS.darkCard : COLORS.lightCard;
  const textColor = isDark ? COLORS.darkText : COLORS.lightText;
  const mutedColor = isDark ? COLORS.darkTextMuted : COLORS.lightTextMuted;
  const borderColor = isDark ? COLORS.darkBorder : COLORS.lightBorder;
  
  return (
    <div 
      className="rounded-2xl mb-3 overflow-hidden transition-all duration-200 active:scale-[0.98]"
      style={{ 
        backgroundColor: cardBg, 
        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)',
        borderLeft: `4px solid ${color}`
      }}
    >
      <div className="p-4 cursor-pointer" onClick={onTap}>
        <div className="flex items-center gap-3">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg font-nunito flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {friend.name.charAt(0).toUpperCase()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold font-nunito truncate" style={{ color: textColor }}>{friend.name}</span>
              {friend.streakCount > 0 && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${COLORS.accent}20` }}>
                  <Flame className="w-3 h-3" style={{ color: COLORS.accent }} />
                  <span className="text-xs font-semibold font-nunito" style={{ color: COLORS.accent }}>{friend.streakCount}</span>
                </div>
              )}
            </div>
            <div className="text-xs font-nunito mt-0.5" style={{ color: mutedColor }}>
              {friend.relationshipTier} · every {friend.cadenceDays}d
            </div>
          </div>
          
          <div className="text-right flex-shrink-0">
            <TimerCompact lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} isDark={isDark} />
          </div>
        </div>
        
        <ProgressBar lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} compact isDark={isDark} />
      </div>
      
      <div className="flex" style={{ borderTop: `1px solid ${borderColor}` }}>
        <button
          onClick={(e) => { e.stopPropagation(); onQuickLog(); }}
          className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium font-nunito transition-colors"
          style={{ color: COLORS.primary }}
        >
          <Check className="w-4 h-4" />
          Quick Log
        </button>
        
        <div style={{ width: 1, backgroundColor: borderColor }} />
        
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="px-6 py-3 flex items-center justify-center text-sm font-medium font-nunito transition-colors"
          style={{ color: COLORS.attention }}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ==================== ONBOARDING ====================

const OnboardingScreen = ({ onComplete, isDark }: { onComplete: () => void; isDark: boolean }) => {
  const [step, setStep] = useState(0);
  
  const steps = [
    { icon: '⏳', title: 'Welcome to In Time', subtitle: 'Nurture the relationships that matter most', description: 'Life gets busy. In Time helps you stay connected with the people you care about.' },
    { icon: '👥', title: 'Add your people', subtitle: 'Start with just a few close friends', description: 'Add up to 10 meaningful connections. Quality over quantity.' },
    { icon: '⏰', title: 'Set your rhythm', subtitle: 'How often do you want to connect?', description: 'Choose a cadence for each friend. We\'ll gently remind you when it\'s time.' },
    { icon: '✨', title: 'Stay in time', subtitle: 'One tap to log, no pressure', description: 'Quick log meetings from your home screen. Build streaks and flourish.' },
  ];
  
  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div 
      className="h-screen flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)`
      }}
    >
      <div className="pt-safe-top px-5 flex justify-end">
        <button onClick={onComplete} className="py-2 px-4 text-white/70 text-sm font-nunito hover:text-white transition-colors">
          Skip
        </button>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-12">
        <div className="text-8xl mb-8 animate-float">{currentStep.icon}</div>
        <h1 className="text-3xl font-bold text-white text-center font-nunito mb-2">{currentStep.title}</h1>
        <p className="text-lg text-white/80 text-center font-nunito mb-4">{currentStep.subtitle}</p>
        <p className="text-sm text-white/60 text-center font-nunito max-w-xs">{currentStep.description}</p>
      </div>
      
      <div className="px-8 pb-12 safe-area-bottom">
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-white' : 'w-2 bg-white/30'}`} />
          ))}
        </div>
        
        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="flex-1 py-4 rounded-2xl font-semibold font-nunito bg-white/20 text-white">
              Back
            </button>
          )}
          <button
            onClick={() => isLastStep ? onComplete() : setStep(s => s + 1)}
            className="flex-1 py-4 rounded-2xl font-semibold font-nunito flex items-center justify-center gap-2"
            style={{ backgroundColor: 'white', color: COLORS.primaryDark }}
          >
            {isLastStep ? 'Get Started' : 'Next'}
            {!isLastStep && <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== MODALS ====================

// Quick Log Confirmation Modal
const QuickLogConfirmModal = ({ friend, onClose, onConfirmWithNote, onConfirmWithoutNote, isDark }: { 
  friend: Friend; 
  onClose: () => void; 
  onConfirmWithNote: () => void; 
  onConfirmWithoutNote: () => void;
  isDark: boolean;
}) => {
  const cardBg = isDark ? COLORS.darkCard : COLORS.lightCard;
  const textColor = isDark ? COLORS.darkText : COLORS.lightText;
  const mutedColor = isDark ? COLORS.darkTextSecondary : COLORS.lightTextSecondary;
  const buttonBg = isDark ? COLORS.darkBorder : COLORS.lightBorder;
  
  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: cardBg }}>
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">📝</div>
          <h2 className="text-lg font-bold font-nunito mb-1" style={{ color: textColor }}>Add a note?</h2>
          <p className="text-sm font-nunito" style={{ color: mutedColor }}>Would you like to add a note to this meeting with {friend.name}?</p>
        </div>
        <div className="flex flex-col gap-2">
          <button 
            onClick={onConfirmWithNote} 
            className="w-full py-3 rounded-xl font-semibold font-nunito text-sm text-white"
            style={{ backgroundColor: COLORS.primary }}
          >
            Yes, add a note
          </button>
          <button 
            onClick={onConfirmWithoutNote} 
            className="w-full py-3 rounded-xl font-semibold font-nunito text-sm"
            style={{ backgroundColor: buttonBg, color: textColor }}
          >
            No, just log it
          </button>
          <button 
            onClick={onClose} 
            className="w-full py-2 font-nunito text-sm"
            style={{ color: mutedColor }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
};

const AddEditFriendModal = ({ friend, onClose, onSave, friendCount, isDark }: { friend?: Friend; onClose: () => void; onSave: (data: Partial<Friend>) => void; friendCount: number; isDark: boolean }) => {
  const [name, setName] = useState(friend?.name || '');
  const [tier, setTier] = useState<'close' | 'casual'>(friend?.relationshipTier || 'close');
  const [cadence, setCadence] = useState(friend?.cadenceDays || 14);
  const [cadenceInput, setCadenceInput] = useState(String(friend?.cadenceDays || 14));
  const [error, setError] = useState('');
  const presets = [7, 14, 21, 30, 60, 90];

  const cardBg = isDark ? COLORS.darkCard : COLORS.lightCard;
  const textColor = isDark ? COLORS.darkText : COLORS.lightText;
  const mutedColor = isDark ? COLORS.darkTextSecondary : COLORS.lightTextSecondary;
  const inputBg = isDark ? COLORS.darkBg : '#F5F5F5';
  const borderColor = isDark ? COLORS.darkBorder : COLORS.lightBorder;

  const handleCadenceInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCadenceInput(value);
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1) setCadence(numValue);
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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl max-h-[85vh] overflow-auto animate-slide-up safe-area-bottom" style={{ backgroundColor: cardBg }}>
        <div className="sticky top-0 pb-2" style={{ backgroundColor: cardBg }}>
          <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-4" style={{ backgroundColor: borderColor }} />
          <div className="flex items-center justify-between px-5">
            <h2 className="text-xl font-bold font-nunito" style={{ color: textColor }}>{friend ? 'Edit Friend' : 'Add Friend'}</h2>
            <button onClick={onClose} className="p-2 rounded-full transition-colors" style={{ color: mutedColor }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-5 pb-6 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2 font-nunito" style={{ color: mutedColor }}>Name</label>
            <input
              type="text" value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Friend's name" autoFocus
              className="w-full px-4 py-3 rounded-xl font-nunito border-2 transition-colors focus:outline-none"
              style={{ 
                backgroundColor: inputBg, 
                color: textColor, 
                borderColor: error ? COLORS.attention : 'transparent'
              }}
            />
            {error && <div className="text-sm mt-1 font-nunito" style={{ color: COLORS.attention }}>{error}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 font-nunito" style={{ color: mutedColor }}>Type</label>
            <div className="flex gap-2">
              {/* FIXED: Using PRIMARY color instead of amber */}
              {(['close', 'casual'] as const).map((t) => (
                <button key={t} onClick={() => setTier(t)}
                  className="flex-1 py-3 rounded-xl font-semibold transition-all font-nunito capitalize text-sm"
                  style={{ 
                    backgroundColor: tier === t ? COLORS.primary : 'transparent', 
                    color: tier === t ? 'white' : mutedColor, 
                    border: tier === t ? 'none' : `2px solid ${borderColor}`
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 font-nunito" style={{ color: mutedColor }}>Cadence</label>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-nunito" style={{ color: mutedColor }}>Every</span>
              <input 
                type="number" 
                value={cadenceInput} 
                onChange={handleCadenceInputChange}
                onBlur={handleCadenceInputBlur}
                className="w-16 px-2 py-2 rounded-lg text-center font-medium font-nunito focus:outline-none focus:ring-2 text-sm" 
                style={{ backgroundColor: inputBg, color: textColor }}
                min="1"
                inputMode="numeric"
              />
              <span className="text-sm font-nunito" style={{ color: mutedColor }}>days</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* FIXED: Using PRIMARY color instead of amber */}
              {presets.map(preset => (
                <button key={preset} onClick={() => handlePresetClick(preset)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all font-nunito"
                  style={{ 
                    backgroundColor: cadence === preset ? COLORS.primary : inputBg, 
                    color: cadence === preset ? 'white' : mutedColor 
                  }}>
                  {preset}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3.5 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: inputBg, color: textColor }}>
              Cancel
            </button>
            <button onClick={handleSave} className="flex-1 py-3.5 rounded-xl font-semibold font-nunito text-sm text-white" style={{ backgroundColor: COLORS.primary }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const LogMeetingModal = ({ friend, onClose, onSave, isDark }: { friend: Friend; onClose: () => void; onSave: (note?: string) => void; isDark: boolean }) => {
  const [note, setNote] = useState('');
  
  const cardBg = isDark ? COLORS.darkCard : COLORS.lightCard;
  const textColor = isDark ? COLORS.darkText : COLORS.lightText;
  const mutedColor = isDark ? COLORS.darkTextSecondary : COLORS.lightTextSecondary;
  const inputBg = isDark ? COLORS.darkBg : '#F5F5F5';
  const borderColor = isDark ? COLORS.darkBorder : COLORS.lightBorder;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl animate-slide-up safe-area-bottom" style={{ backgroundColor: cardBg }}>
        <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-4" style={{ backgroundColor: borderColor }} />
        <div className="px-5 pb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold font-nunito" style={{ color: textColor }}>Log Meeting</h2>
            <button onClick={onClose} className="p-2 rounded-full transition-colors" style={{ color: mutedColor }}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ backgroundColor: inputBg }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold font-nunito" style={{ backgroundColor: COLORS.primary }}>
              {friend.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold font-nunito" style={{ color: textColor }}>{friend.name}</div>
              <div className="text-xs font-nunito" style={{ color: mutedColor }}>Logging a connection</div>
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2 font-nunito" style={{ color: mutedColor }}>Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you talk about?" maxLength={200} rows={3}
              className="w-full px-4 py-3 rounded-xl resize-none font-nunito text-sm focus:outline-none focus:ring-2"
              style={{ backgroundColor: inputBg, color: textColor }}
            />
            <div className="text-xs text-right mt-1 tabular-nums font-nunito" style={{ color: mutedColor }}>{note.length}/200</div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3.5 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: inputBg, color: textColor }}>
              Cancel
            </button>
            <button onClick={() => onSave(note.trim() || undefined)} className="flex-1 py-3.5 rounded-xl font-semibold font-nunito text-sm text-white flex items-center justify-center gap-2" style={{ backgroundColor: COLORS.primary }}>
              <Check className="w-4 h-4" />Log
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const DeleteConfirmModal = ({ friend, onClose, onConfirm, isDark }: { friend: Friend; onClose: () => void; onConfirm: () => void; isDark: boolean }) => {
  const cardBg = isDark ? COLORS.darkCard : COLORS.lightCard;
  const textColor = isDark ? COLORS.darkText : COLORS.lightText;
  const mutedColor = isDark ? COLORS.darkTextSecondary : COLORS.lightTextSecondary;
  const buttonBg = isDark ? COLORS.darkBorder : COLORS.lightBorder;
  
  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: cardBg }}>
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">😢</div>
          <h2 className="text-lg font-bold font-nunito mb-1" style={{ color: textColor }}>Delete {friend.name}?</h2>
          <p className="text-sm font-nunito" style={{ color: mutedColor }}>This will remove all meeting history too.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: buttonBg, color: textColor }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm text-white" style={{ backgroundColor: COLORS.attention }}>Delete</button>
        </div>
      </div>
    </>
  );
};

const ImportConfirmModal = ({ data, onClose, onConfirm, isDark }: { data: DataExport; onClose: () => void; onConfirm: () => void; isDark: boolean }) => {
  const cardBg = isDark ? COLORS.darkCard : COLORS.lightCard;
  const textColor = isDark ? COLORS.darkText : COLORS.lightText;
  const mutedColor = isDark ? COLORS.darkTextSecondary : COLORS.lightTextSecondary;
  const inputBg = isDark ? COLORS.darkBg : '#F5F5F5';
  const buttonBg = isDark ? COLORS.darkBorder : COLORS.lightBorder;
  
  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: cardBg }}>
        <h2 className="text-lg font-bold font-nunito mb-3" style={{ color: textColor }}>Import Data?</h2>
        <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: inputBg }}>
          <div className="text-sm space-y-1 font-nunito" style={{ color: textColor }}>
            <p><span className="font-semibold">{data.friends.length}</span> friends</p>
            <p><span className="font-semibold">{data.meetings.length}</span> meetings</p>
          </div>
        </div>
        <p className="text-xs mb-4 font-nunito" style={{ color: COLORS.approaching }}>This will replace all current data.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: buttonBg, color: textColor }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm text-white" style={{ backgroundColor: COLORS.primary }}>Import</button>
        </div>
      </div>
    </>
  );
};

// ==================== MAIN APP ====================

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [currentModal, setCurrentModal] = useState<Modal>(null);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [importData, setImportData] = useState<DataExport | null>(null);
  const [quickLogFriendId, setQuickLogFriendId] = useState<string | null>(null);
  
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

  const isDark = useDarkMode(appState.settings.theme);

  useEffect(() => {
    if (!appState.settings.hasCompletedOnboarding) setCurrentScreen('onboarding');
  }, [appState.settings.hasCompletedOnboarding]);

  useEffect(() => { localStorage.setItem('in-time-data', JSON.stringify(appState)); }, [appState]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => { setToasts(prev => prev.filter(t => t.id !== id)); }, []);

  const handleOnboardingComplete = () => {
    setAppState(prev => ({ ...prev, settings: { ...prev.settings, hasCompletedOnboarding: true } }));
    setCurrentScreen('home');
  };

  const handleExport = () => {
    const exportData: DataExport = { version: APP_VERSION, exportedAt: Date.now(), friends: appState.friends, meetings: appState.meetings, settings: appState.settings };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `in-time-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported');
  };
  
  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as DataExport;
        if (!data.friends || !data.meetings || !data.settings) { showToast('Invalid file', 'error'); return; }
        setImportData(data); setCurrentModal('import-confirm');
      } catch { showToast('Could not read file', 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  
  const confirmImport = () => {
    if (!importData) return;
    setAppState({ friends: importData.friends, meetings: importData.meetings, settings: { ...importData.settings, hasCompletedOnboarding: true } });
    setImportData(null); setCurrentModal(null);
    showToast('Data imported');
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
    showToast('Updated');
  };

  // Quick log - now shows confirmation first
  const handleQuickLogRequest = (friendId: string) => {
    setQuickLogFriendId(friendId);
    setCurrentModal('quick-log-confirm');
  };

  const handleQuickLogWithoutNote = () => {
    if (!quickLogFriendId) return;
    const friend = appState.friends.find(f => f.id === quickLogFriendId);
    if (!friend) return;
    
    const now = Date.now();
    const newMeeting: Meeting = { id: generateId(), friendId: quickLogFriendId, timestamp: now, createdAt: now };
    const daysSinceLastMeeting = friend.lastMeetingDate ? Math.floor((now - friend.lastMeetingDate) / 86400000) : 0;
    const newStreak = daysSinceLastMeeting <= friend.cadenceDays && friend.lastMeetingDate ? friend.streakCount + 1 : 1;
    const newMultiplier = Math.min(3.0, 1.0 + (newStreak * 0.1));
    
    setAppState(prev => ({
      ...prev,
      meetings: [...prev.meetings, newMeeting],
      friends: prev.friends.map(f => f.id === quickLogFriendId ? { 
        ...f, lastMeetingDate: now, streakCount: newStreak, multiplier: newMultiplier, totalMeetings: f.totalMeetings + 1, updatedAt: now 
      } : f)
    }));
    
    setCurrentModal(null);
    setQuickLogFriendId(null);
    showToast(`Logged with ${friend.name}!${newStreak > 1 ? ` 🔥 ${newStreak} streak` : ''}`);
  };

  const handleQuickLogWithNote = () => {
    if (!quickLogFriendId) return;
    setSelectedFriendId(quickLogFriendId);
    setCurrentModal('log-meeting');
    setQuickLogFriendId(null);
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
    showToast(`Logged with ${friend.name}`);
  };

  const handleDeleteFriend = () => {
    if (!selectedFriendId) return;
    const friend = appState.friends.find(f => f.id === selectedFriendId);
    if (!friend) return;
    setAppState(prev => ({ ...prev, friends: prev.friends.filter(f => f.id !== selectedFriendId), meetings: prev.meetings.filter(m => m.friendId !== selectedFriendId) }));
    setCurrentModal(null); setCurrentScreen('home'); setSelectedFriendId(null);
    showToast(`${friend.name} removed`);
  };

  const selectedFriend = selectedFriendId ? appState.friends.find(f => f.id === selectedFriendId) : null;
  const quickLogFriend = quickLogFriendId ? appState.friends.find(f => f.id === quickLogFriendId) : null;
  const activeFriendCount = appState.friends.filter(f => !f.isArchived).length;
  const activeFriends = appState.friends.filter(f => !f.isArchived).sort((a, b) => getDaysUntilDue(a.lastMeetingDate, a.cadenceDays) - getDaysUntilDue(b.lastMeetingDate, b.cadenceDays));
  const overallHealth = activeFriends.length > 0 ? Math.round(activeFriends.reduce((sum, f) => sum + calculateHealthScore(f, appState.meetings), 0) / activeFriends.length) : 0;
  const friendsNeedingAttention = activeFriends.filter(f => getDaysUntilDue(f.lastMeetingDate, f.cadenceDays) <= 3).length;

  // Colors based on theme
  const textColor = isDark ? COLORS.darkText : COLORS.lightText;
  const mutedColor = isDark ? COLORS.darkTextMuted : COLORS.lightTextMuted;
  const cardBg = isDark ? COLORS.darkCard : COLORS.lightCard;
  const borderColor = isDark ? COLORS.darkBorder : COLORS.lightBorder;

  if (currentScreen === 'onboarding') {
    return <OnboardingScreen onComplete={handleOnboardingComplete} isDark={isDark} />;
  }

  return (
    <GradientBackground isDark={isDark} className="h-screen flex flex-col">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* HOME SCREEN */}
      {currentScreen === 'home' && (
        <div className="flex-1 overflow-auto pb-20">
          <div className="relative pt-safe-top" style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)` }}>
            <div className="px-5 pt-3 pb-10">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white font-nunito">{getGreeting()} ☀️</h1>
                  <p className="text-white/70 text-sm mt-0.5 font-nunito">
                    {friendsNeedingAttention > 0 ? `${friendsNeedingAttention} to catch up with` : activeFriendCount > 0 ? "All caught up!" : "Add your first friend"}
                  </p>
                </div>
                <button onClick={() => setCurrentModal('add-friend')} disabled={activeFriendCount >= 10}
                  className="w-11 h-11 rounded-full text-white flex items-center justify-center disabled:opacity-50 transition-all active:scale-95 shadow-lg"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            <WaveDivider isDark={isDark} />
          </div>
          
          <div className="px-4 -mt-1">
            {activeFriendCount === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">⏳</div>
                <h2 className="text-lg font-bold mb-1 font-nunito" style={{ color: textColor }}>Add your first friend</h2>
                <p className="text-sm max-w-xs mx-auto font-nunito" style={{ color: mutedColor }}>Tap the + button to start tracking meaningful connections</p>
              </div>
            ) : (
              <div>
                {activeFriends.map(friend => (
                  <FriendCard 
                    key={friend.id} 
                    friend={friend} 
                    onTap={() => { setSelectedFriendId(friend.id); setCurrentScreen('friend-detail'); }}
                    onQuickLog={() => handleQuickLogRequest(friend.id)}
                    onDelete={() => { setSelectedFriendId(friend.id); setCurrentModal('delete-confirm'); }}
                    isDark={isDark}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FRIEND DETAIL SCREEN */}
      {currentScreen === 'friend-detail' && selectedFriend && (
        <div className="flex-1 overflow-auto pb-28">
          <div className="relative pt-safe-top" style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)` }}>
            <div className="px-4 pt-2 pb-10">
              <div className="flex items-center justify-between">
                <button onClick={() => { setCurrentScreen('home'); setSelectedFriendId(null); }} className="p-2 -ml-2 hover:bg-white/20 rounded-full transition-colors">
                  <ChevronLeft className="w-5 h-5 text-white" />
                </button>
                <span className="font-semibold text-white font-nunito">{selectedFriend.name}</span>
                <button onClick={() => setCurrentModal('delete-confirm')} className="p-2 -mr-2 hover:bg-white/20 rounded-full transition-colors">
                  <Trash2 className="w-4 h-4 text-white/70" />
                </button>
              </div>
            </div>
            <WaveDivider isDark={isDark} />
          </div>

          <div className="px-4 -mt-1">
            <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: cardBg, boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl font-nunito" style={{ backgroundColor: COLORS.primary }}>
                  {selectedFriend.name.charAt(0).toUpperCase()}
                </div>
              </div>
              
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold font-nunito" style={{ color: textColor }}>{selectedFriend.name}</h2>
                <span className="text-xs font-nunito" style={{ color: mutedColor }}>{selectedFriend.relationshipTier} · every {selectedFriend.cadenceDays} days</span>
              </div>

              <TimerDisplay lastMeeting={selectedFriend.lastMeetingDate} cadence={selectedFriend.cadenceDays} size="large" isDark={isDark} />
              
              <div className="flex justify-center gap-6 mt-4 pt-4" style={{ borderTop: `1px solid ${borderColor}` }}>
                {selectedFriend.streakCount > 0 && (
                  <div className="text-center">
                    <div className="flex items-center gap-1 justify-center mb-0.5">
                      <Flame className="w-4 h-4" style={{ color: COLORS.accent }} />
                      <span className="text-xl font-bold font-nunito" style={{ color: COLORS.accent }}>{selectedFriend.streakCount}</span>
                    </div>
                    <div className="text-xs font-nunito" style={{ color: mutedColor }}>streak</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-xl font-bold font-nunito" style={{ color: textColor }}>{selectedFriend.multiplier.toFixed(1)}×</div>
                  <div className="text-xs font-nunito" style={{ color: mutedColor }}>multiplier</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold font-nunito" style={{ color: textColor }}>{selectedFriend.totalMeetings}</div>
                  <div className="text-xs font-nunito" style={{ color: mutedColor }}>meetings</div>
                </div>
              </div>

              <ProgressBar lastMeeting={selectedFriend.lastMeetingDate} cadence={selectedFriend.cadenceDays} isDark={isDark} />
            </div>

            <div className="mb-4">
              <h3 className="font-semibold mb-3 font-nunito text-sm" style={{ color: textColor }}>History</h3>
              {(() => {
                const friendMeetings = appState.meetings.filter(m => m.friendId === selectedFriend.id).sort((a, b) => b.timestamp - a.timestamp);
                return friendMeetings.length === 0 ? (
                  <div className="text-center py-8 rounded-2xl" style={{ backgroundColor: cardBg }}>
                    <div className="text-3xl mb-2">⏳</div>
                    <div className="text-sm font-nunito" style={{ color: mutedColor }}>No meetings yet</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friendMeetings.slice(0, 10).map(meeting => (
                      <div key={meeting.id} className="rounded-xl p-3" style={{ backgroundColor: cardBg }}>
                        <div className="flex justify-between items-start">
                          <div className="font-medium text-sm font-nunito" style={{ color: textColor }}>
                            {new Date(meeting.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-xs font-nunito" style={{ color: mutedColor }}>
                            {new Date(meeting.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {meeting.note && <div className="text-xs font-nunito mt-1" style={{ color: mutedColor }}>{meeting.note}</div>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="fixed bottom-20 left-0 right-0 p-4 safe-area-bottom" style={{ background: isDark ? `linear-gradient(to top, ${COLORS.darkBg} 70%, transparent)` : `linear-gradient(to top, ${COLORS.lightBg} 70%, transparent)` }}>
            <button onClick={() => setCurrentModal('log-meeting')}
              className="w-full h-12 text-white rounded-xl font-semibold font-nunito flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-sm"
              style={{ backgroundColor: COLORS.primary }}>
              <Check className="w-4 h-4" />Log Meeting with Note
            </button>
          </div>
        </div>
      )}

      {/* INSIGHTS SCREEN */}
      {currentScreen === 'insights' && (
        <div className="flex-1 overflow-auto pb-20">
          <div className="relative pt-safe-top" style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)` }}>
            <div className="px-5 pt-3 pb-10"><h1 className="text-xl font-bold text-white font-nunito">Insights</h1></div>
            <WaveDivider isDark={isDark} />
          </div>
          <div className="px-4 -mt-1">
            <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: cardBg, boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h2 className="text-xs font-medium mb-3 font-nunito uppercase tracking-wide" style={{ color: mutedColor }}>Overall Health</h2>
              <div className="flex items-center justify-center mb-3">
                <div className="relative w-28 h-28">
                  <svg className="transform -rotate-90 w-28 h-28">
                    <circle cx="56" cy="56" r="48" stroke={borderColor} strokeWidth="8" fill="none" />
                    <circle cx="56" cy="56" r="48" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${overallHealth * 3.02} 302`} className="transition-all duration-700" style={{ stroke: COLORS.primary }}/>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold font-nunito" style={{ color: textColor }}>{overallHealth}</span>
                  </div>
                </div>
              </div>
              <p className="text-center text-xs font-nunito" style={{ color: mutedColor }}>{overallHealth >= 80 ? 'Excellent' : overallHealth >= 60 ? 'Good' : overallHealth >= 40 ? 'Needs attention' : 'Getting started'}</p>
            </div>
            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h2 className="text-xs font-medium mb-3 font-nunito uppercase tracking-wide" style={{ color: mutedColor }}>Individual Scores</h2>
              {activeFriends.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">⏳</div>
                  <div className="text-sm font-nunito" style={{ color: mutedColor }}>No friends yet</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeFriends.sort((a, b) => calculateHealthScore(b, appState.meetings) - calculateHealthScore(a, appState.meetings)).map(friend => {
                    const health = calculateHealthScore(friend, appState.meetings);
                    return (
                      <div key={friend.id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium font-nunito" style={{ color: textColor }}>{friend.name}</span>
                          <span className="font-semibold tabular-nums font-nunito" style={{ color: textColor }}>{health}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: borderColor }}>
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
        <div className="flex-1 overflow-auto pb-20">
          <div className="relative pt-safe-top" style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)` }}>
            <div className="px-5 pt-3 pb-10"><h1 className="text-xl font-bold text-white font-nunito">Settings</h1></div>
            <WaveDivider isDark={isDark} />
          </div>
          <div className="px-4 -mt-1">
            <div className="rounded-2xl overflow-hidden mb-3" style={{ backgroundColor: cardBg, boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${borderColor}` }}>
                <h3 className="text-xs font-medium uppercase tracking-wide font-nunito" style={{ color: mutedColor }}>Appearance</h3>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-nunito" style={{ color: textColor }}>Theme</span>
                <select value={appState.settings.theme} onChange={(e) => setAppState(prev => ({ ...prev, settings: { ...prev.settings, theme: e.target.value as 'auto' | 'light' | 'dark' } }))}
                  className="px-3 py-1.5 rounded-lg border-none text-sm font-nunito focus:outline-none"
                  style={{ backgroundColor: isDark ? COLORS.darkBg : '#F5F5F5', color: textColor }}>
                  <option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden mb-3" style={{ backgroundColor: cardBg, boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${borderColor}` }}>
                <h3 className="text-xs font-medium uppercase tracking-wide font-nunito" style={{ color: mutedColor }}>Data</h3>
              </div>
              <button onClick={handleExport} className="w-full px-4 py-3 flex items-center gap-3 transition-colors" style={{ borderBottom: `1px solid ${borderColor}` }}>
                <Download className="w-4 h-4" style={{ color: COLORS.primary }} />
                <span className="text-sm font-nunito" style={{ color: textColor }}>Export</span>
              </button>
              <label className="w-full px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer">
                <Upload className="w-4 h-4" style={{ color: COLORS.primary }} />
                <span className="text-sm font-nunito" style={{ color: textColor }}>Import</span>
                <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
              </label>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-nunito" style={{ color: textColor }}>Version</span>
                <span className="text-xs font-mono" style={{ color: mutedColor }}>{APP_VERSION}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 safe-area-bottom" style={{ backgroundColor: cardBg, borderTop: `1px solid ${borderColor}` }}>
        <div className="flex justify-around py-1.5">
          {[{ screen: 'home' as const, icon: Home, label: 'Home' }, { screen: 'insights' as const, icon: BarChart3, label: 'Insights' }, { screen: 'settings' as const, icon: Settings, label: 'Settings' }].map(({ screen, icon: Icon, label }) => (
            <button key={screen} onClick={() => setCurrentScreen(screen)} className="flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-lg transition-all">
              <Icon className="w-5 h-5" style={{ color: currentScreen === screen ? COLORS.primary : mutedColor }}/>
              <span className="text-xs font-medium font-nunito" style={{ color: currentScreen === screen ? COLORS.primary : mutedColor }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MODALS */}
      {currentModal === 'add-friend' && <AddEditFriendModal onClose={() => setCurrentModal(null)} onSave={handleAddFriend} friendCount={activeFriendCount} isDark={isDark}/>}
      {currentModal === 'edit-friend' && selectedFriend && <AddEditFriendModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onSave={handleEditFriend} friendCount={activeFriendCount} isDark={isDark}/>}
      {currentModal === 'log-meeting' && selectedFriend && <LogMeetingModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onSave={handleLogMeeting} isDark={isDark}/>}
      {currentModal === 'delete-confirm' && selectedFriend && <DeleteConfirmModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onConfirm={handleDeleteFriend} isDark={isDark}/>}
      {currentModal === 'import-confirm' && importData && <ImportConfirmModal data={importData} onClose={() => { setImportData(null); setCurrentModal(null); }} onConfirm={confirmImport} isDark={isDark}/>}
      {currentModal === 'quick-log-confirm' && quickLogFriend && (
        <QuickLogConfirmModal 
          friend={quickLogFriend} 
          onClose={() => { setCurrentModal(null); setQuickLogFriendId(null); }} 
          onConfirmWithNote={handleQuickLogWithNote}
          onConfirmWithoutNote={handleQuickLogWithoutNote}
          isDark={isDark}
        />
      )}

      {/* GLOBAL STYLES */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap');
        .font-nunito { font-family: 'Nunito', -apple-system, sans-serif; }
        .pt-safe-top { padding-top: max(env(safe-area-inset-top), 16px); }
        .safe-area-top { padding-top: env(safe-area-inset-top); }
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
        @keyframes slide-down { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .animate-slide-down { animation: slide-down 0.25s ease-out; }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
        .animate-float { animation: float 3s ease-in-out infinite; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>
    </GradientBackground>
  );
}