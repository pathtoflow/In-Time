import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

interface Theme {
  text: string;
  textSecondary: string;
  textMuted: string;
  card: string;
  bg: string;
  border: string;
  inputBg: string;
  cardShadow: string;
  isDark: boolean;
}

type Screen = 'onboarding' | 'home' | 'friend-detail' | 'insights' | 'settings';
type Modal = 'add-friend' | 'edit-friend' | 'log-meeting' | 'import-confirm' | 'delete-confirm' | 'quick-log-confirm' | null;

// ==================== CONSTANTS ====================

const APP_VERSION = '3.0.0';

const COLORS = {
  primary: '#26A69A',
  primaryLight: '#4DB6AC',
  primaryDark: '#00897B',
  accent: '#F9A825',
  accentLight: '#FFCA28',
  fresh: '#66BB6A',
  approaching: '#FFA726',
  attention: '#EF5350',
  lightBg: '#FFFFFF',
  lightCard: '#FFFFFF',
  lightText: '#1A1A1A',
  lightTextSecondary: '#666666',
  lightTextMuted: '#999999',
  lightBorder: '#E5E5E5',
  darkBg: '#0D0D0D',
  darkCard: '#1A1A1A',
  darkText: '#FFFFFF',
  darkTextSecondary: '#AAAAAA',
  darkTextMuted: '#666666',
  darkBorder: '#333333',
};

// Design tokens — single source of truth
const TOKENS = {
  shadow: {
    card: (isDark: boolean) => isDark ? '0 2px 12px rgba(0,0,0,0.35)' : '0 2px 12px rgba(0,0,0,0.07)',
  },
  header: {
    paddingTop: 'pt-3',
    paddingBottom: 'pb-12',
    paddingX: 'px-5',
    gradient: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)`,
  },
  spacing: {
    screenPadding: 'px-4',
    cardGap: 'mb-3',
    sectionGap: 'mb-4',
  },
};

// Derive full theme from dark mode flag
const getTheme = (isDark: boolean): Theme => ({
  text: isDark ? COLORS.darkText : COLORS.lightText,
  textSecondary: isDark ? COLORS.darkTextSecondary : COLORS.lightTextSecondary,
  textMuted: isDark ? COLORS.darkTextMuted : COLORS.lightTextMuted,
  card: isDark ? COLORS.darkCard : COLORS.lightCard,
  bg: isDark ? COLORS.darkBg : COLORS.lightBg,
  border: isDark ? COLORS.darkBorder : COLORS.lightBorder,
  inputBg: isDark ? COLORS.darkBg : '#F5F5F5',
  cardShadow: TOKENS.shadow.card(isDark),
  isDark,
});

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

// ==================== SHARED COMPONENTS ====================

const WaveDivider = ({ isDark }: { isDark: boolean }) => (
  <svg viewBox="0 0 1440 60" className="w-full h-5 block -mb-px" preserveAspectRatio="none">
    <path fill={isDark ? COLORS.darkBg : COLORS.lightBg} d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,40 1440,35 L1440,60 L0,60 Z"/>
  </svg>
);

const GradientBackground = ({ isDark, children, className = '' }: { isDark: boolean; children: React.ReactNode; className?: string }) => (
  <div
    className={className}
    style={{
      background: isDark
        ? `linear-gradient(180deg, ${COLORS.darkBg} 0%, #0A1A18 50%, ${COLORS.darkBg} 100%)`
        : `linear-gradient(180deg, ${COLORS.lightBg} 0%, #E8F5F3 50%, ${COLORS.lightBg} 100%)`
    }}
  >
    {children}
  </div>
);

// Unified screen header
const ScreenHeader = ({ title, isDark, rightAction, leftAction }: {
  title: string | React.ReactNode;
  isDark: boolean;
  rightAction?: React.ReactNode;
  leftAction?: React.ReactNode;
}) => (
  <div className="relative pt-safe-top" style={{ background: TOKENS.header.gradient }}>
    <div className={`${TOKENS.header.paddingX} ${TOKENS.header.paddingTop} ${TOKENS.header.paddingBottom}`}>
      <div className="flex items-center justify-between">
        {leftAction || <div className="w-9" />}
        {typeof title === 'string' ? (
          <h1 className="text-lg font-bold text-white font-nunito">{title}</h1>
        ) : title}
        {rightAction || <div className="w-9" />}
      </div>
    </div>
    <WaveDivider isDark={isDark} />
  </div>
);

// Reusable card wrapper
const Card = ({ theme, children, className = '', style = {} }: {
  theme: Theme;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div
    className={`rounded-2xl ${className}`}
    style={{
      backgroundColor: theme.card,
      boxShadow: theme.cardShadow,
      ...style,
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

// ==================== TIMER COMPONENTS ====================

const TimerDisplay = ({ lastMeeting, cadence, size = 'normal', theme }: { lastMeeting: number | null; cadence: number; size?: 'normal' | 'large'; theme: Theme }) => {
  useLiveTimer();
  const elapsed = calculateElapsed(lastMeeting);
  const color = getTimerColor(lastMeeting, cadence);
  const isLarge = size === 'large';

  if (!lastMeeting) {
    return (
      <div className="text-center">
        <div className={`${isLarge ? 'text-3xl' : 'text-2xl'} font-light font-nunito`} style={{ color: theme.textMuted }}>
          No meetings yet
        </div>
        <div className="text-xs mt-1 font-nunito" style={{ color: theme.textMuted }}>tap to log your first</div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="font-light tracking-tight font-nunito" style={{ color }}>
        <span className={`${isLarge ? 'text-4xl' : 'text-3xl'} tabular-nums`}>{elapsed.days}</span>
        <span className={`${isLarge ? 'text-lg' : 'text-base'} mx-0.5`} style={{ color: theme.textMuted }}>d</span>
        <span className={`${isLarge ? 'text-4xl' : 'text-3xl'} tabular-nums`}>{elapsed.hours}</span>
        <span className={`${isLarge ? 'text-lg' : 'text-base'} mx-0.5`} style={{ color: theme.textMuted }}>h</span>
        <span className={`${isLarge ? 'text-4xl' : 'text-3xl'} tabular-nums`}>{elapsed.minutes}</span>
        <span className={`${isLarge ? 'text-lg' : 'text-base'} ml-0.5`} style={{ color: theme.textMuted }}>m</span>
      </div>
      <div className="text-xs mt-1 font-nunito" style={{ color: theme.textMuted }}>since you connected</div>
    </div>
  );
};

const ProgressBar = ({ lastMeeting, cadence, compact = false, theme }: { lastMeeting: number | null; cadence: number; compact?: boolean; theme: Theme }) => {
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
      <div className={`${compact ? 'h-1.5' : 'h-2'} rounded-full overflow-hidden`} style={{ backgroundColor: theme.border }}>
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${percentage}%`, backgroundColor: color }} />
      </div>
      {!compact && (
        <div className="flex justify-between mt-1.5 text-xs font-nunito" style={{ color: theme.textMuted }}>
          <span className="tabular-nums">{Math.round(percentage)}%</span>
          <span className="tabular-nums">{daysUntil > 0 ? `${daysUntil}d left` : 'overdue'}</span>
        </div>
      )}
    </div>
  );
};

const TimerCompact = ({ lastMeeting, cadence, theme }: { lastMeeting: number | null; cadence: number; theme: Theme }) => {
  useLiveTimer();
  const elapsed = calculateElapsed(lastMeeting);
  const color = getTimerColor(lastMeeting, cadence);

  if (!lastMeeting) {
    return <span className="text-sm font-nunito" style={{ color: theme.textMuted }}>New</span>;
  }

  return (
    <div className="font-nunito" style={{ color }}>
      <span className="text-lg font-semibold tabular-nums">{elapsed.days}</span>
      <span className="text-xs" style={{ color: theme.textMuted }}>d </span>
      <span className="text-lg font-semibold tabular-nums">{elapsed.hours}</span>
      <span className="text-xs" style={{ color: theme.textMuted }}>h</span>
    </div>
  );
};

// ==================== FRIEND CARD ====================

const FriendCard = ({
  friend,
  onTap,
  onQuickLog,
  onDelete,
  theme,
}: {
  friend: Friend;
  onTap: () => void;
  onQuickLog: () => void;
  onDelete: () => void;
  theme: Theme;
}) => {
  const color = getTimerColor(friend.lastMeetingDate, friend.cadenceDays);

  return (
    <div
      className={`rounded-2xl ${TOKENS.spacing.cardGap} overflow-hidden transition-all duration-200 active:scale-[0.98]`}
      style={{
        backgroundColor: theme.card,
        boxShadow: theme.cardShadow,
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
              <span className="font-semibold font-nunito truncate" style={{ color: theme.text }}>{friend.name}</span>
              {friend.streakCount > 0 && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${COLORS.accent}20` }}>
                  <Flame className="w-3 h-3" style={{ color: COLORS.accent }} />
                  <span className="text-xs font-semibold font-nunito" style={{ color: COLORS.accent }}>{friend.streakCount}</span>
                </div>
              )}
            </div>
            <div className="text-xs font-nunito mt-0.5" style={{ color: theme.textMuted }}>
              {friend.relationshipTier} · every {friend.cadenceDays}d
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <TimerCompact lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} theme={theme} />
          </div>
        </div>

        <ProgressBar lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} compact theme={theme} />
      </div>

      <div className="flex" style={{ borderTop: `1px solid ${theme.border}` }}>
        <button
          onClick={(e) => { e.stopPropagation(); onQuickLog(); }}
          className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium font-nunito transition-colors"
          style={{ color: COLORS.primary }}
        >
          <Check className="w-4 h-4" />
          Quick Log
        </button>

        <div style={{ width: 1, backgroundColor: theme.border }} />

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
      style={{ background: TOKENS.header.gradient }}
    >
      <div className={`pt-safe-top ${TOKENS.header.paddingX} ${TOKENS.header.paddingTop} flex justify-end`}>
        <button onClick={onComplete} className="py-2 px-4 text-white/70 text-sm font-nunito hover:text-white transition-colors">
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="text-7xl mb-6 animate-float">{currentStep.icon}</div>
        <h1 className="text-2xl font-bold text-white text-center font-nunito mb-2">{currentStep.title}</h1>
        <p className="text-base text-white/80 text-center font-nunito mb-3">{currentStep.subtitle}</p>
        <p className="text-sm text-white/60 text-center font-nunito max-w-xs leading-relaxed">{currentStep.description}</p>
      </div>

      <div className={`${TOKENS.header.paddingX} pb-8 safe-area-bottom`}>
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-white' : 'w-2 bg-white/30'}`} />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="flex-1 py-4 rounded-2xl font-semibold font-nunito bg-white/20 text-white text-sm">
              Back
            </button>
          )}
          <button
            onClick={() => isLastStep ? onComplete() : setStep(s => s + 1)}
            className="flex-1 py-4 rounded-2xl font-semibold font-nunito flex items-center justify-center gap-2 text-sm"
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

const QuickLogConfirmModal = ({ friend, onClose, onConfirmWithNote, onConfirmWithoutNote, theme }: {
  friend: Friend;
  onClose: () => void;
  onConfirmWithNote: () => void;
  onConfirmWithoutNote: () => void;
  theme: Theme;
}) => (
  <>
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: theme.card }}>
      <div className="text-center mb-5">
        <div className="text-4xl mb-3">📝</div>
        <h2 className="text-lg font-bold font-nunito mb-1" style={{ color: theme.text }}>Add a note?</h2>
        <p className="text-sm font-nunito" style={{ color: theme.textSecondary }}>Would you like to add a note to this meeting with {friend.name}?</p>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={onConfirmWithNote} className="w-full py-3 rounded-xl font-semibold font-nunito text-sm text-white" style={{ backgroundColor: COLORS.primary }}>
          Yes, add a note
        </button>
        <button onClick={onConfirmWithoutNote} className="w-full py-3 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: theme.border, color: theme.text }}>
          No, just log it
        </button>
        <button onClick={onClose} className="w-full py-2 font-nunito text-sm" style={{ color: theme.textSecondary }}>
          Cancel
        </button>
      </div>
    </div>
  </>
);

const AddEditFriendModal = ({ friend, onClose, onSave, friendCount, theme }: { friend?: Friend; onClose: () => void; onSave: (data: Partial<Friend>) => void; friendCount: number; theme: Theme }) => {
  const [name, setName] = useState(friend?.name || '');
  const [tier, setTier] = useState<'close' | 'casual'>(friend?.relationshipTier || 'close');
  const [cadence, setCadence] = useState(friend?.cadenceDays || 14);
  const [cadenceInput, setCadenceInput] = useState(String(friend?.cadenceDays || 14));
  const [error, setError] = useState('');
  const presets = [7, 14, 21, 30, 60, 90];

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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl max-h-[85vh] overflow-auto animate-slide-up safe-area-bottom" style={{ backgroundColor: theme.card }}>
        <div className="sticky top-0 pb-2" style={{ backgroundColor: theme.card }}>
          <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-4" style={{ backgroundColor: theme.border }} />
          <div className="flex items-center justify-between px-5">
            <h2 className="text-xl font-bold font-nunito" style={{ color: theme.text }}>{friend ? 'Edit Friend' : 'Add Friend'}</h2>
            <button onClick={onClose} className="p-2 rounded-full transition-colors" style={{ color: theme.textSecondary }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-5 pb-6 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2 font-nunito" style={{ color: theme.textSecondary }}>Name</label>
            <input
              type="text" value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Friend's name" autoFocus
              className="w-full px-4 py-3 rounded-xl font-nunito border-2 transition-colors focus:outline-none"
              style={{
                backgroundColor: theme.inputBg,
                color: theme.text,
                borderColor: error ? COLORS.attention : 'transparent'
              }}
            />
            {error && <div className="text-sm mt-1 font-nunito" style={{ color: COLORS.attention }}>{error}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 font-nunito" style={{ color: theme.textSecondary }}>Type</label>
            <div className="flex gap-2">
              {(['close', 'casual'] as const).map((t) => (
                <button key={t} onClick={() => setTier(t)}
                  className="flex-1 py-3 rounded-xl font-semibold transition-all font-nunito capitalize text-sm"
                  style={{
                    backgroundColor: tier === t ? COLORS.primary : 'transparent',
                    color: tier === t ? 'white' : theme.textSecondary,
                    border: tier === t ? 'none' : `2px solid ${theme.border}`
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 font-nunito" style={{ color: theme.textSecondary }}>Cadence</label>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-nunito" style={{ color: theme.textSecondary }}>Every</span>
              <input
                type="number"
                value={cadenceInput}
                onChange={handleCadenceInputChange}
                onBlur={handleCadenceInputBlur}
                className="w-16 px-2 py-2 rounded-lg text-center font-medium font-nunito focus:outline-none focus:ring-2 text-sm"
                style={{ backgroundColor: theme.inputBg, color: theme.text }}
                min="1"
                inputMode="numeric"
              />
              <span className="text-sm font-nunito" style={{ color: theme.textSecondary }}>days</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map(preset => (
                <button key={preset} onClick={() => handlePresetClick(preset)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all font-nunito"
                  style={{
                    backgroundColor: cadence === preset ? COLORS.primary : theme.inputBg,
                    color: cadence === preset ? 'white' : theme.textSecondary
                  }}>
                  {preset}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3.5 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: theme.inputBg, color: theme.text }}>
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

const LogMeetingModal = ({ friend, onClose, onSave, theme }: { friend: Friend; onClose: () => void; onSave: (note?: string) => void; theme: Theme }) => {
  const [note, setNote] = useState('');

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl animate-slide-up safe-area-bottom" style={{ backgroundColor: theme.card }}>
        <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-4" style={{ backgroundColor: theme.border }} />
        <div className="px-5 pb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold font-nunito" style={{ color: theme.text }}>Log Meeting</h2>
            <button onClick={onClose} className="p-2 rounded-full transition-colors" style={{ color: theme.textSecondary }}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ backgroundColor: theme.inputBg }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold font-nunito" style={{ backgroundColor: COLORS.primary }}>
              {friend.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold font-nunito" style={{ color: theme.text }}>{friend.name}</div>
              <div className="text-xs font-nunito" style={{ color: theme.textSecondary }}>Logging a connection</div>
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2 font-nunito" style={{ color: theme.textSecondary }}>Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you talk about?" maxLength={200} rows={3}
              className="w-full px-4 py-3 rounded-xl resize-none font-nunito text-sm focus:outline-none focus:ring-2"
              style={{ backgroundColor: theme.inputBg, color: theme.text }}
            />
            <div className="text-xs text-right mt-1 tabular-nums font-nunito" style={{ color: theme.textSecondary }}>{note.length}/200</div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3.5 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: theme.inputBg, color: theme.text }}>
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

const DeleteConfirmModal = ({ friend, onClose, onConfirm, theme }: { friend: Friend; onClose: () => void; onConfirm: () => void; theme: Theme }) => (
  <>
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: theme.card }}>
      <div className="text-center mb-5">
        <div className="text-4xl mb-3">😢</div>
        <h2 className="text-lg font-bold font-nunito mb-1" style={{ color: theme.text }}>Delete {friend.name}?</h2>
        <p className="text-sm font-nunito" style={{ color: theme.textSecondary }}>This will remove all meeting history too.</p>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: theme.border, color: theme.text }}>Cancel</button>
        <button onClick={onConfirm} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm text-white" style={{ backgroundColor: COLORS.attention }}>Delete</button>
      </div>
    </div>
  </>
);

const ImportConfirmModal = ({ data, onClose, onConfirm, theme }: { data: DataExport; onClose: () => void; onConfirm: () => void; theme: Theme }) => (
  <>
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: theme.card }}>
      <h2 className="text-lg font-bold font-nunito mb-3" style={{ color: theme.text }}>Import Data?</h2>
      <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: theme.inputBg }}>
        <div className="text-sm space-y-1 font-nunito" style={{ color: theme.text }}>
          <p><span className="font-semibold">{data.friends.length}</span> friends</p>
          <p><span className="font-semibold">{data.meetings.length}</span> meetings</p>
        </div>
      </div>
      <p className="text-xs mb-4 font-nunito" style={{ color: COLORS.approaching }}>This will replace all current data.</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: theme.border, color: theme.text }}>Cancel</button>
        <button onClick={onConfirm} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm text-white" style={{ backgroundColor: COLORS.primary }}>Import</button>
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
  const theme = useMemo(() => getTheme(isDark), [isDark]);

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

  if (currentScreen === 'onboarding') {
    return <OnboardingScreen onComplete={handleOnboardingComplete} isDark={isDark} />;
  }

  return (
    <GradientBackground isDark={isDark} className="h-screen flex flex-col">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* HOME SCREEN */}
      {currentScreen === 'home' && (
        <div className="flex-1 overflow-auto pb-20">
          <ScreenHeader
            isDark={isDark}
            title={
              <div className="flex-1 ml-2">
                <h1 className="text-lg font-bold text-white font-nunito">{getGreeting()} ☀️</h1>
                <p className="text-white/70 text-xs mt-0.5 font-nunito">
                  {friendsNeedingAttention > 0 ? `${friendsNeedingAttention} to catch up with` : activeFriendCount > 0 ? "All caught up!" : "Add your first friend"}
                </p>
              </div>
            }
            leftAction={<div className="w-9" />}
            rightAction={
              <button onClick={() => setCurrentModal('add-friend')} disabled={activeFriendCount >= 10}
                className="w-10 h-10 rounded-full text-white flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <Plus className="w-5 h-5" />
              </button>
            }
          />

          <div className={`${TOKENS.spacing.screenPadding} -mt-1`}>
            {activeFriendCount === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">⏳</div>
                <h2 className="text-lg font-bold mb-1 font-nunito" style={{ color: theme.text }}>Add your first friend</h2>
                <p className="text-sm max-w-xs mx-auto font-nunito" style={{ color: theme.textMuted }}>Tap the + button to start tracking meaningful connections</p>
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
                    theme={theme}
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
          <ScreenHeader
            isDark={isDark}
            title={selectedFriend.name}
            leftAction={
              <button onClick={() => { setCurrentScreen('home'); setSelectedFriendId(null); }} className="p-2 -ml-2 hover:bg-white/20 rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            }
            rightAction={
              <button onClick={() => setCurrentModal('delete-confirm')} className="p-2 -mr-2 hover:bg-white/20 rounded-full transition-colors">
                <Trash2 className="w-4 h-4 text-white/70" />
              </button>
            }
          />

          <div className={`${TOKENS.spacing.screenPadding} -mt-1`}>
            <Card theme={theme} className={`p-5 ${TOKENS.spacing.sectionGap}`}>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl font-nunito" style={{ backgroundColor: COLORS.primary }}>
                  {selectedFriend.name.charAt(0).toUpperCase()}
                </div>
              </div>

              <div className="text-center mb-4">
                <h2 className="text-lg font-bold font-nunito" style={{ color: theme.text }}>{selectedFriend.name}</h2>
                <span className="text-xs font-nunito" style={{ color: theme.textMuted }}>{selectedFriend.relationshipTier} · every {selectedFriend.cadenceDays} days</span>
              </div>

              <TimerDisplay lastMeeting={selectedFriend.lastMeetingDate} cadence={selectedFriend.cadenceDays} size="large" theme={theme} />

              <div className="flex justify-center gap-6 mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                {selectedFriend.streakCount > 0 && (
                  <div className="text-center">
                    <div className="flex items-center gap-1 justify-center mb-0.5">
                      <Flame className="w-4 h-4" style={{ color: COLORS.accent }} />
                      <span className="text-xl font-bold font-nunito" style={{ color: COLORS.accent }}>{selectedFriend.streakCount}</span>
                    </div>
                    <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>streak</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-xl font-bold font-nunito" style={{ color: theme.text }}>{selectedFriend.multiplier.toFixed(1)}×</div>
                  <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>multiplier</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold font-nunito" style={{ color: theme.text }}>{selectedFriend.totalMeetings}</div>
                  <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>meetings</div>
                </div>
              </div>

              <ProgressBar lastMeeting={selectedFriend.lastMeetingDate} cadence={selectedFriend.cadenceDays} theme={theme} />
            </Card>

            <div className={TOKENS.spacing.sectionGap}>
              <h3 className="font-semibold mb-3 font-nunito text-sm" style={{ color: theme.text }}>History</h3>
              {(() => {
                const friendMeetings = appState.meetings.filter(m => m.friendId === selectedFriend.id).sort((a, b) => b.timestamp - a.timestamp);
                return friendMeetings.length === 0 ? (
                  <Card theme={theme} className="text-center py-8">
                    <div className="text-3xl mb-2">⏳</div>
                    <div className="text-sm font-nunito" style={{ color: theme.textMuted }}>No meetings yet</div>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {friendMeetings.slice(0, 10).map(meeting => (
                      <Card theme={theme} key={meeting.id} className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="font-medium text-sm font-nunito" style={{ color: theme.text }}>
                            {new Date(meeting.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>
                            {new Date(meeting.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {meeting.note && <div className="text-xs font-nunito mt-1" style={{ color: theme.textMuted }}>{meeting.note}</div>}
                      </Card>
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
          <ScreenHeader isDark={isDark} title="Insights" />

          <div className={`${TOKENS.spacing.screenPadding} -mt-1`}>
            <Card theme={theme} className={`p-5 ${TOKENS.spacing.sectionGap}`}>
              <h2 className="text-xs font-medium mb-3 font-nunito uppercase tracking-wide" style={{ color: theme.textMuted }}>Overall Health</h2>
              <div className="flex items-center justify-center mb-3">
                <div className="relative w-28 h-28">
                  <svg className="transform -rotate-90 w-28 h-28">
                    <circle cx="56" cy="56" r="48" stroke={theme.border} strokeWidth="8" fill="none" />
                    <circle cx="56" cy="56" r="48" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${overallHealth * 3.02} 302`} className="transition-all duration-700" style={{ stroke: COLORS.primary }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold font-nunito" style={{ color: theme.text }}>{overallHealth}</span>
                  </div>
                </div>
              </div>
              <p className="text-center text-xs font-nunito" style={{ color: theme.textMuted }}>{overallHealth >= 80 ? 'Excellent' : overallHealth >= 60 ? 'Good' : overallHealth >= 40 ? 'Needs attention' : 'Getting started'}</p>
            </Card>

            <Card theme={theme} className="p-5">
              <h2 className="text-xs font-medium mb-3 font-nunito uppercase tracking-wide" style={{ color: theme.textMuted }}>Individual Scores</h2>
              {activeFriends.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">⏳</div>
                  <div className="text-sm font-nunito" style={{ color: theme.textMuted }}>No friends yet</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeFriends.sort((a, b) => calculateHealthScore(b, appState.meetings) - calculateHealthScore(a, appState.meetings)).map(friend => {
                    const health = calculateHealthScore(friend, appState.meetings);
                    return (
                      <div key={friend.id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium font-nunito" style={{ color: theme.text }}>{friend.name}</span>
                          <span className="font-semibold tabular-nums font-nunito" style={{ color: theme.text }}>{health}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${health}%`, backgroundColor: COLORS.primary }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* SETTINGS SCREEN */}
      {currentScreen === 'settings' && (
        <div className="flex-1 overflow-auto pb-20">
          <ScreenHeader isDark={isDark} title="Settings" />

          <div className={`${TOKENS.spacing.screenPadding} -mt-1`}>
            <Card theme={theme} className={`overflow-hidden ${TOKENS.spacing.cardGap}`}>
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <h3 className="text-xs font-medium uppercase tracking-wide font-nunito" style={{ color: theme.textMuted }}>Appearance</h3>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-nunito" style={{ color: theme.text }}>Theme</span>
                <select value={appState.settings.theme} onChange={(e) => setAppState(prev => ({ ...prev, settings: { ...prev.settings, theme: e.target.value as 'auto' | 'light' | 'dark' } }))}
                  className="px-3 py-1.5 rounded-lg border-none text-sm font-nunito focus:outline-none"
                  style={{ backgroundColor: theme.inputBg, color: theme.text }}>
                  <option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </div>
            </Card>

            <Card theme={theme} className={`overflow-hidden ${TOKENS.spacing.cardGap}`}>
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <h3 className="text-xs font-medium uppercase tracking-wide font-nunito" style={{ color: theme.textMuted }}>Data</h3>
              </div>
              <button onClick={handleExport} className="w-full px-4 py-3 flex items-center gap-3 transition-colors" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <Download className="w-4 h-4" style={{ color: COLORS.primary }} />
                <span className="text-sm font-nunito" style={{ color: theme.text }}>Export</span>
              </button>
              <label className="w-full px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer">
                <Upload className="w-4 h-4" style={{ color: COLORS.primary }} />
                <span className="text-sm font-nunito" style={{ color: theme.text }}>Import</span>
                <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
              </label>
            </Card>

            <Card theme={theme} className="overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-nunito" style={{ color: theme.text }}>Version</span>
                <span className="text-xs font-mono" style={{ color: theme.textMuted }}>{APP_VERSION}</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 safe-area-bottom" style={{ backgroundColor: theme.card, borderTop: `1px solid ${theme.border}` }}>
        <div className="flex justify-around py-1.5">
          {[{ screen: 'home' as const, icon: Home, label: 'Home' }, { screen: 'insights' as const, icon: BarChart3, label: 'Insights' }, { screen: 'settings' as const, icon: Settings, label: 'Settings' }].map(({ screen, icon: Icon, label }) => (
            <button key={screen} onClick={() => setCurrentScreen(screen)} className="flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-lg transition-all">
              <Icon className="w-5 h-5" style={{ color: currentScreen === screen ? COLORS.primary : theme.textMuted }} />
              <span className="text-xs font-medium font-nunito" style={{ color: currentScreen === screen ? COLORS.primary : theme.textMuted }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MODALS */}
      {currentModal === 'add-friend' && <AddEditFriendModal onClose={() => setCurrentModal(null)} onSave={handleAddFriend} friendCount={activeFriendCount} theme={theme} />}
      {currentModal === 'edit-friend' && selectedFriend && <AddEditFriendModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onSave={handleEditFriend} friendCount={activeFriendCount} theme={theme} />}
      {currentModal === 'log-meeting' && selectedFriend && <LogMeetingModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onSave={handleLogMeeting} theme={theme} />}
      {currentModal === 'delete-confirm' && selectedFriend && <DeleteConfirmModal friend={selectedFriend} onClose={() => setCurrentModal(null)} onConfirm={handleDeleteFriend} theme={theme} />}
      {currentModal === 'import-confirm' && importData && <ImportConfirmModal data={importData} onClose={() => { setImportData(null); setCurrentModal(null); }} onConfirm={confirmImport} theme={theme} />}
      {currentModal === 'quick-log-confirm' && quickLogFriend && (
        <QuickLogConfirmModal
          friend={quickLogFriend}
          onClose={() => { setCurrentModal(null); setQuickLogFriendId(null); }}
          onConfirmWithNote={handleQuickLogWithNote}
          onConfirmWithoutNote={handleQuickLogWithoutNote}
          theme={theme}
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