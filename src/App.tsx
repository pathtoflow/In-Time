import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Check, Plus, ChevronLeft, ChevronRight, Flame, BarChart3, Settings, Home, Download, Upload, X, Trash2, TrendingUp, TrendingDown, Award, AlertTriangle, Calendar, Edit3 } from 'lucide-react';

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
  action?: { label: string; onAction: () => void };
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
type Modal = 'add-friend' | 'edit-friend' | 'log-meeting' | 'import-confirm' | 'delete-confirm' | 'quick-log-confirm' | 'reset-confirm' | null;

// ==================== CONSTANTS ====================

const APP_VERSION = '4.3.0';

// App icon — single continuous hourglass path (viewBox 0 0 512 512)
const HOURGLASS_PATH = 'M 190 120 L 322 120 C 334 120, 342 128, 342 140 L 342 160 C 342 208, 312 244, 276 260 L 264 266 L 264 270 L 276 276 C 312 292, 342 328, 342 376 L 342 392 C 342 404, 334 412, 322 412 L 190 412 C 178 412, 170 404, 170 392 L 170 376 C 170 328, 200 292, 236 276 L 248 270 L 248 266 L 236 260 C 200 244, 170 208, 170 160 L 170 140 C 170 128, 178 120, 190 120 Z';

const COLORS = {
  primary: '#26A69A',
  primaryLight: '#4DB6AC',
  primaryDark: '#00897B',
  accent: '#F9A825',
  accentLight: '#FFCA28',
  fresh: '#66BB6A',
  approaching: '#FFA726',
  attention: '#EF5350',
  lightBg: '#FAF7F2',
  lightCard: '#FFFFFF',
  lightText: '#2D2418',
  lightTextSecondary: '#7A7267',
  lightTextMuted: '#B5AFA7',
  lightBorder: '#E8E3DC',
  darkBg: '#151210',
  darkCard: '#2A2318',
  darkText: '#F5F1EB',
  darkTextSecondary: '#A89E94',
  darkTextMuted: '#6B6158',
  darkBorder: '#3D3630',
};

// Design tokens — single source of truth
const TOKENS = {
  shadow: {
    card: (isDark: boolean) => isDark ? '0 1px 8px rgba(0,0,0,0.3)' : '0 1px 8px rgba(45,36,24,0.06)',
  },
  header: {
    paddingTop: 'pt-3',
    paddingBottom: 'pb-4',
    paddingX: 'px-5',
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
  inputBg: isDark ? '#1F1A14' : '#F0ECE5',
  cardShadow: TOKENS.shadow.card(isDark),
  isDark,
});

// ==================== UTILITY FUNCTIONS ====================

const generateId = () => crypto.randomUUID();

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
  return Math.ceil(cadence - daysElapsed);  // negative = overdue
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

const getGreeting = (friendCount: number, needsAttention: number): { title: string; subtitle: string } => {
  if (friendCount === 0) return { title: 'In Time', subtitle: 'Your circle is empty — start with someone you miss.' };
  if (needsAttention === 0) {
    const variants = [
      { title: 'All in time', subtitle: `${friendCount} connection${friendCount > 1 ? 's' : ''} on track.` },
      { title: 'Everyone\'s close', subtitle: 'Your circle is in good shape.' },
      { title: 'Nothing to worry about', subtitle: 'All connections are on cadence.' },
    ];
    return variants[Math.floor(Date.now() / 86400000) % variants.length];
  }
  if (needsAttention === 1) return { title: 'One\'s drifting', subtitle: 'A quick catch-up goes a long way.' };
  return { title: `${needsAttention} drifting`, subtitle: 'Some connections could use your attention.' };
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

const GradientBackground = ({ isDark, children, className = '' }: { isDark: boolean; children: React.ReactNode; className?: string }) => (
  <div
    className={className}
    style={{
      background: isDark
        ? `linear-gradient(180deg, ${COLORS.darkBg} 0%, #1E1A14 50%, ${COLORS.darkBg} 100%)`
        : `linear-gradient(180deg, ${COLORS.lightBg} 0%, #F3EEE6 50%, ${COLORS.lightBg} 100%)`
    }}
  >
    {children}
  </div>
);

// Unified screen header — flat, no gradient bar
const ScreenHeader = ({ title, isDark, rightAction, leftAction, theme }: {
  title: string | React.ReactNode;
  isDark: boolean;
  rightAction?: React.ReactNode;
  leftAction?: React.ReactNode;
  theme?: Theme;
}) => {
  const t = theme || getTheme(isDark);
  return (
    <div className="pt-safe-top">
      <div className={`${TOKENS.header.paddingX} ${TOKENS.header.paddingTop} ${TOKENS.header.paddingBottom}`}>
        <div className="flex items-center justify-between">
          {leftAction || <div className="w-9" />}
          {typeof title === 'string' ? (
            <h1 className="text-lg font-bold font-nunito" style={{ color: t.text }}>{title}</h1>
          ) : title}
          {rightAction || <div className="w-9" />}
        </div>
      </div>
    </div>
  );
};

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
    const timers = toasts.map(toast => setTimeout(() => onDismiss(toast.id), toast.action ? 5000 : 3000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);

  return (
    <div className="fixed top-14 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4 safe-area-top">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 pointer-events-auto animate-slide-down"
          style={{ backgroundColor: COLORS.primary }}
          onClick={() => !toast.action && onDismiss(toast.id)}
        >
          <Check className="w-5 h-5 flex-shrink-0 text-white" />
          <span className="text-sm font-medium font-nunito text-white flex-1">{toast.message}</span>
          {toast.action && (
            <button onClick={(e) => { e.stopPropagation(); toast.action!.onAction(); onDismiss(toast.id); }}
              className="text-sm font-bold font-nunito underline text-white ml-2 flex-shrink-0">
              {toast.action.label}
            </button>
          )}
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
        <div className="text-xs mt-1 font-nunito" style={{ color: theme.textMuted }}>start the clock</div>
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
          <span className="tabular-nums">{daysUntil > 0 ? `${daysUntil}d left` : daysUntil === 0 ? 'due today' : 'overdue'}</span>
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

// ==================== HEALTH SCORE MINI RING ====================

const HealthRing = ({ score, size = 32, strokeWidth = 3, theme }: { score: number; size?: number; strokeWidth?: number; theme: Theme }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const scoreColor = score >= 70 ? COLORS.fresh : score >= 40 ? COLORS.approaching : COLORS.attention;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.border} strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={scoreColor} strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold tabular-nums font-nunito" style={{ color: theme.text, fontSize: size * 0.3 }}>{score}</span>
      </div>
    </div>
  );
};

// ==================== FRIEND CARD ====================

const FriendCard = ({
  friend,
  healthScore,
  onTap,
  onQuickLog,
  onDelete,
  theme,
}: {
  friend: Friend;
  healthScore: number;
  onTap: () => void;
  onQuickLog: () => void;
  onDelete: () => void;
  theme: Theme;
}) => {
  const color = getTimerColor(friend.lastMeetingDate, friend.cadenceDays);
  const daysLeft = getDaysUntilDue(friend.lastMeetingDate, friend.cadenceDays);
  const isOverdue = daysLeft < 0 && friend.lastMeetingDate !== null;
  const isDueToday = daysLeft === 0 && friend.lastMeetingDate !== null;

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
        {/* Row 1: Avatar + Name/Meta + Health Ring */}
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-base font-nunito flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {friend.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold font-nunito truncate text-sm" style={{ color: theme.text }}>{friend.name}</span>
              {friend.streakCount > 0 && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${COLORS.accent}15` }}>
                  <Flame className="w-3 h-3" style={{ color: COLORS.accent }} />
                  <span className="text-xs font-bold font-nunito" style={{ color: COLORS.accent }}>{friend.streakCount}</span>
                </div>
              )}
            </div>
            <div className="text-xs font-nunito mt-0.5" style={{ color: theme.textMuted }}>
              {friend.relationshipTier} · every {friend.cadenceDays}d
            </div>
          </div>

          <HealthRing score={healthScore} theme={theme} />
        </div>

        {/* Row 2: Timer + Days Left Badge */}
        <div className="flex items-end justify-between mt-3">
          <TimerCompact lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} theme={theme} />
          <div
            className="px-2 py-0.5 rounded-full text-xs font-semibold font-nunito"
            style={{
              backgroundColor: `${color}18`,
              color: color,
            }}
          >
            {!friend.lastMeetingDate ? 'new' : isOverdue ? 'overdue' : isDueToday ? 'due today' : `${daysLeft}d left`}
          </div>
        </div>

        {/* Row 3: Progress Bar */}
        <ProgressBar lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} compact theme={theme} />
      </div>

      <div className="flex" style={{ borderTop: `1px solid ${theme.border}` }}>
        <button
          onClick={(e) => { e.stopPropagation(); onQuickLog(); }}
          className="flex-1 py-2.5 flex items-center justify-center gap-2 text-sm font-medium font-nunito transition-colors"
          style={{ color: COLORS.primary }}
        >
          <Check className="w-4 h-4" />
          Quick Log
        </button>

        <div style={{ width: 1, backgroundColor: theme.border }} />

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="px-6 py-2.5 flex items-center justify-center text-sm font-medium font-nunito transition-colors"
          style={{ color: COLORS.attention }}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ==================== ONBOARDING ====================

// Decorative visual for Slide 1 — animated timer ring
// App icon component — reusable across onboarding, settings, etc.
const AppIcon = ({ size = 120, withBackground = true, isDark = false }: { size?: number; withBackground?: boolean; isDark?: boolean }) => (
  <svg viewBox="0 0 512 512" width={size} height={size} style={withBackground ? { borderRadius: `${size * 0.22}px` } : undefined}>
    {withBackground && (
      <>
        <defs>
          <linearGradient id={`icon-bg-${size}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isDark ? COLORS.darkBg : '#FBF8F3'} />
            <stop offset="100%" stopColor={isDark ? COLORS.darkCard : '#F0EBE3'} />
          </linearGradient>
          <linearGradient id={`icon-teal-${size}`} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#30C9BA" />
            <stop offset="45%" stopColor={COLORS.primary} />
            <stop offset="100%" stopColor="#1E8F82" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" fill={`url(#icon-bg-${size})`} />
      </>
    )}
    <path d={HOURGLASS_PATH} fill={withBackground ? `url(#icon-teal-${size})` : COLORS.primary} />
  </svg>
);

const OnboardingTimerVisual = ({ theme }: { theme: Theme }) => (
  <div className="relative mx-auto" style={{ width: 200, height: 120 }}>
    {/* Left avatar */}
    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold font-nunito onboard-fade-in"
      style={{ backgroundColor: COLORS.fresh }}>A</div>
    {/* Right avatar */}
    <div className="absolute right-2 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold font-nunito onboard-fade-in"
      style={{ backgroundColor: COLORS.primary, animationDelay: '0.15s' }}>B</div>
    {/* Pulsing connection line */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 onboard-fade-in" style={{ animationDelay: '0.3s' }}>
      <svg width="72" height="24" viewBox="0 0 72 24">
        <line x1="0" y1="12" x2="72" y2="12" stroke={theme.border} strokeWidth="2" strokeDasharray="4 4" />
        <line x1="0" y1="12" x2="72" y2="12" stroke={COLORS.primary} strokeWidth="2" strokeDasharray="4 4" className="onboard-line-draw" />
      </svg>
    </div>
    {/* Counter between */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-4 onboard-fade-in" style={{ animationDelay: '0.5s' }}>
      <div className="text-xs font-nunito tabular-nums font-semibold px-2 py-0.5 rounded-full" style={{ color: COLORS.primary, backgroundColor: `${COLORS.primary}15` }}>
        3d 14h
      </div>
    </div>
  </div>
);

// Decorative visual for Slide 2 — mini friend cards
const OnboardingCardsVisual = ({ theme }: { theme: Theme }) => {
  const people = [
    { name: 'Sarah', color: COLORS.fresh, days: '3d 12h' },
    { name: 'James', color: COLORS.approaching, days: '11d 4h' },
    { name: 'Priya', color: COLORS.primary, days: '1d 8h' },
  ];
  return (
    <div className="w-full max-w-[240px] mx-auto space-y-2">
      {people.map((p, i) => (
        <div
          key={p.name}
          className="rounded-xl p-3 flex items-center gap-3 onboard-card-enter"
          style={{
            backgroundColor: theme.card,
            boxShadow: theme.cardShadow,
            borderLeft: `3px solid ${p.color}`,
            animationDelay: `${i * 0.15}s`,
          }}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold font-nunito flex-shrink-0"
            style={{ backgroundColor: p.color }}>
            {p.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold font-nunito truncate" style={{ color: theme.text }}>{p.name}</div>
            <div className="h-1 rounded-full mt-1.5 w-3/4" style={{ backgroundColor: `${p.color}30` }}>
              <div className="h-full rounded-full" style={{ width: '60%', backgroundColor: p.color }} />
            </div>
          </div>
          <div className="font-nunito tabular-nums text-sm font-semibold flex-shrink-0" style={{ color: p.color }}>{p.days}</div>
        </div>
      ))}
    </div>
  );
};

// Decorative visual for Slide 3 — cadence ring with ticking timer
const OnboardingCadenceVisual = ({ theme }: { theme: Theme }) => (
  <div className="relative w-32 h-32 mx-auto">
    <svg className="w-full h-full transform -rotate-90">
      <circle cx="64" cy="64" r="56" stroke={theme.border} strokeWidth="5" fill="none" />
      <circle cx="64" cy="64" r="56" strokeWidth="5" fill="none" strokeLinecap="round"
        strokeDasharray="352" strokeDashoffset="105" style={{ stroke: COLORS.approaching }} className="transition-all duration-700" />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div className="text-xs font-nunito font-semibold uppercase tracking-wider mb-0.5" style={{ color: COLORS.approaching }}>5d left</div>
      <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>every 14 days</div>
    </div>
  </div>
);

// Decorative visual for Slide 4 — quick-log tap animation
const OnboardingDoneVisual = ({ theme }: { theme: Theme }) => (
  <div className="w-full max-w-[220px] mx-auto">
    <div className="rounded-xl p-3 flex items-center gap-3 onboard-card-enter"
      style={{ backgroundColor: theme.card, boxShadow: theme.cardShadow, borderLeft: `3px solid ${COLORS.fresh}` }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold font-nunito flex-shrink-0"
        style={{ backgroundColor: COLORS.fresh }}>S</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold font-nunito" style={{ color: theme.text }}>Sarah</div>
        <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>0d 0h 0m</div>
      </div>
      <div className="w-7 h-7 rounded-full flex items-center justify-center onboard-check-pop"
        style={{ backgroundColor: COLORS.primary }}>
        <Check className="w-4 h-4 text-white" />
      </div>
    </div>
    <div className="flex items-center justify-center gap-1.5 mt-3 onboard-fade-in" style={{ animationDelay: '0.4s' }}>
      <Flame className="w-4 h-4" style={{ color: COLORS.accent }} />
      <span className="text-sm font-bold font-nunito" style={{ color: COLORS.accent }}>4 streak</span>
    </div>
  </div>
);

const OnboardingScreen = ({ onComplete, isDark }: { onComplete: () => void; isDark: boolean }) => {
  const [step, setStep] = useState(0);
  const theme = getTheme(isDark);

  const steps = [
    {
      visual: <OnboardingTimerVisual theme={theme} />,
      title: 'In Time',
      subtitle: 'Time passes. Connection is a choice.',
    },
    {
      visual: <OnboardingCardsVisual theme={theme} />,
      title: 'Your circle',
      subtitle: 'Pick the 10 people you\'d actually notice losing touch with.',
    },
    {
      visual: <OnboardingCadenceVisual theme={theme} />,
      title: 'Your rhythm',
      subtitle: 'Set how often you want to see each person. A live timer does the rest.',
    },
    {
      visual: <OnboardingDoneVisual theme={theme} />,
      title: 'That\'s it',
      subtitle: 'One tap when you connect. That\'s it.',
    },
  ];

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div
      className="h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? `linear-gradient(180deg, ${COLORS.darkBg} 0%, #1E1A14 50%, ${COLORS.darkBg} 100%)`
          : `linear-gradient(180deg, ${COLORS.lightBg} 0%, #F3EEE6 50%, ${COLORS.lightBg} 100%)`
      }}
    >
      {/* Subtle ambient glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full opacity-20 blur-[80px] pointer-events-none"
        style={{ background: `radial-gradient(circle, ${COLORS.primary} 0%, transparent 70%)` }} />
      {/* Top bar */}
      <div className={`pt-safe-top ${TOKENS.header.paddingX} ${TOKENS.header.paddingTop} flex items-center justify-between`}>
        <div className="text-xs font-semibold font-nunito tracking-wide uppercase" style={{ color: theme.textMuted }}>
          {step + 1} / {steps.length}
        </div>
        <button onClick={onComplete} className="py-2 px-3 text-sm font-nunito transition-colors rounded-lg"
          style={{ color: theme.textMuted }}>
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Visual — keyed to force re-mount and replay animations on step change */}
        <div key={step} className="mb-8 w-full onboard-fade-in">
          {currentStep.visual}
        </div>

        <h1 key={`t-${step}`} className="text-2xl font-bold text-center font-nunito mb-3 onboard-fade-in"
          style={{ color: theme.text, animationDelay: '0.1s' }}>
          {currentStep.title}
        </h1>
        <p key={`s-${step}`} className="text-sm text-center font-nunito max-w-[280px] leading-relaxed onboard-fade-in"
          style={{ color: theme.textSecondary, animationDelay: '0.2s' }}>
          {currentStep.subtitle}
        </p>
      </div>

      {/* Bottom controls */}
      <div className={`${TOKENS.header.paddingX} pb-8 safe-area-bottom`}>
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div key={i} className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === step ? 24 : 8,
                backgroundColor: i === step ? COLORS.primary : theme.border,
              }} />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3.5 rounded-2xl font-semibold font-nunito text-sm transition-colors"
              style={{ backgroundColor: theme.inputBg, color: theme.text }}>
              Back
            </button>
          )}
          <button
            onClick={() => isLastStep ? onComplete() : setStep(s => s + 1)}
            className="flex-1 py-3.5 rounded-2xl font-semibold font-nunito flex items-center justify-center gap-2 text-sm text-white transition-all active:scale-[0.98]"
            style={{ backgroundColor: COLORS.primary }}
          >
            {isLastStep ? 'Get Started' : 'Next'}
            {!isLastStep && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Onboarding-specific styles (this component returns before global styles) */}
      <style>{`
        .font-nunito { font-family: 'Nunito', -apple-system, sans-serif; }
        .pt-safe-top { padding-top: max(env(safe-area-inset-top), 16px); }
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }

        @keyframes onboard-fade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .onboard-fade-in { animation: onboard-fade 0.4s ease-out both; }

        @keyframes onboard-card-slide { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
        .onboard-card-enter { animation: onboard-card-slide 0.35s ease-out both; }

        @keyframes onboard-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        .onboard-pulse-ring { animation: onboard-pulse 2.5s ease-in-out infinite; }

        @keyframes onboard-line-draw { from { stroke-dashoffset: 72; } to { stroke-dashoffset: 0; } }
        .onboard-line-draw { animation: onboard-line-draw 1.5s ease-out 0.5s both; }

        @keyframes onboard-pop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
        .onboard-check-pop { animation: onboard-pop 0.4s ease-out 0.15s both; }
      `}</style>
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
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 365) setCadence(numValue);
  };

  const handleCadenceInputBlur = () => {
    const numValue = parseInt(cadenceInput, 10);
    if (isNaN(numValue) || numValue < 1) {
      setCadenceInput(String(cadence));
    } else {
      const clamped = Math.min(365, numValue);
      setCadence(clamped);
      setCadenceInput(String(clamped));
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
  const [historyLimit, setHistoryLimit] = useState(10);

  // Reset history pagination when switching friends
  useEffect(() => { setHistoryLimit(10); }, [selectedFriendId]);

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

  useEffect(() => {
    try { localStorage.setItem('in-time-data', JSON.stringify(appState)); }
    catch { /* storage full or unavailable — state persists in memory only */ }
  }, [appState]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success', action?: Toast['action']) => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message, type, action }]);
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
    if (file.size > 5 * 1024 * 1024) { showToast('File too large (5MB max)', 'error'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!Array.isArray(data?.friends) || !Array.isArray(data?.meetings) || !data?.settings) { showToast('Invalid file format', 'error'); return; }
        const validFriends = data.friends.every((f: any) => typeof f?.id === 'string' && typeof f?.name === 'string' && typeof f?.cadenceDays === 'number' && f.cadenceDays > 0);
        const validMeetings = data.meetings.every((m: any) => typeof m?.id === 'string' && typeof m?.friendId === 'string' && typeof m?.timestamp === 'number');
        if (!validFriends || !validMeetings) { showToast('Corrupted data in file', 'error'); return; }
        setImportData(data as DataExport); setCurrentModal('import-confirm');
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

  const handleResetData = () => {
    setAppState({
      friends: [],
      meetings: [],
      settings: { theme: appState.settings.theme, notificationsEnabled: true, dailySummaryInterval: 30, thresholdAlertsEnabled: true, hasCompletedOnboarding: true }
    });
    setCurrentModal(null); setCurrentScreen('home'); setSelectedFriendId(null);
    showToast('All data cleared');
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
    const deletedMeetings = appState.meetings.filter(m => m.friendId === selectedFriendId);

    // Remove immediately from state
    setAppState(prev => ({ ...prev, friends: prev.friends.filter(f => f.id !== selectedFriendId), meetings: prev.meetings.filter(m => m.friendId !== selectedFriendId) }));
    setCurrentModal(null); setCurrentScreen('home'); setSelectedFriendId(null);

    // Show undo toast
    showToast(`${friend.name} removed`, 'success', {
      label: 'Undo',
      onAction: () => {
        setAppState(prev => ({
          ...prev,
          friends: [...prev.friends, friend],
          meetings: [...prev.meetings, ...deletedMeetings],
        }));
      }
    });
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
        <div className="flex-1 overflow-auto pb-20 animate-screen-enter">
          <ScreenHeader
            isDark={isDark}
            theme={theme}
            title={
              <div className="flex-1 ml-3">
                <h1 className="text-xl font-bold font-nunito" style={{ color: theme.text }}>{getGreeting(activeFriendCount, friendsNeedingAttention).title}</h1>
                <p className="text-sm mt-0.5 font-nunito" style={{ color: theme.textMuted }}>
                  {getGreeting(activeFriendCount, friendsNeedingAttention).subtitle}
                </p>
              </div>
            }
            leftAction={
              activeFriendCount > 0 ? (
                <div className="relative w-10 h-10 flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="20" cy="20" r="16" stroke={theme.border} strokeWidth="3" fill="none" />
                    <circle cx="20" cy="20" r="16" stroke={COLORS.primary} strokeWidth="3" fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${overallHealth * 1.005} 100.5`}
                      className="transition-all duration-700" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold tabular-nums font-nunito" style={{ color: COLORS.primary }}>{overallHealth}</span>
                  </div>
                </div>
              ) : <div className="w-10" />
            }
            rightAction={
              <button onClick={() => setCurrentModal('add-friend')} disabled={activeFriendCount >= 10}
                className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
                style={{ backgroundColor: COLORS.primary }}>
                <Plus className="w-5 h-5 text-white" />
              </button>
            }
          />

          <div className={`${TOKENS.spacing.screenPadding}`}>
            {activeFriendCount === 0 ? (
              <Card theme={theme} className="text-center py-12 mt-4">
                <div className="text-5xl mb-4 animate-float">⏳</div>
                <h2 className="text-lg font-bold mb-2 font-nunito" style={{ color: theme.text }}>No connections yet</h2>
                <p className="text-sm max-w-[240px] mx-auto font-nunito leading-relaxed" style={{ color: theme.textMuted }}>
                  Add up to 10 people you want to stay connected with. We'll help you keep track.
                </p>
                <button
                  onClick={() => setCurrentModal('add-friend')}
                  className="mt-5 px-6 py-2.5 rounded-xl text-white text-sm font-semibold font-nunito inline-flex items-center gap-2 transition-all active:scale-95"
                  style={{ backgroundColor: COLORS.primary }}
                >
                  <Plus className="w-4 h-4" />Add First Friend
                </button>
              </Card>
            ) : (
              <div>
                {/* Overdue / Needs Attention Section */}
                {(() => {
                  const overdue = activeFriends.filter(f => getDaysUntilDue(f.lastMeetingDate, f.cadenceDays) <= 3 && f.lastMeetingDate !== null);
                  const onTrack = activeFriends.filter(f => !overdue.includes(f));

                  return (
                    <>
                      {overdue.length > 0 && (
                        <div className="mb-2">
                          <div className="flex items-center gap-2 mb-2 mt-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.attention }} />
                            <span className="text-xs font-semibold uppercase tracking-wider font-nunito" style={{ color: COLORS.attention }}>
                              Needs attention · {overdue.length}
                            </span>
                          </div>
                          {overdue.map(friend => (
                            <FriendCard
                              key={friend.id}
                              friend={friend}
                              healthScore={calculateHealthScore(friend, appState.meetings)}
                              onTap={() => { setSelectedFriendId(friend.id); setCurrentScreen('friend-detail'); }}
                              onQuickLog={() => handleQuickLogRequest(friend.id)}
                              onDelete={() => { setSelectedFriendId(friend.id); setCurrentModal('delete-confirm'); }}
                              theme={theme}
                            />
                          ))}
                        </div>
                      )}

                      {onTrack.length > 0 && (
                        <div className="mb-2">
                          {overdue.length > 0 && (
                            <div className="flex items-center gap-2 mb-2 mt-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.fresh }} />
                              <span className="text-xs font-semibold uppercase tracking-wider font-nunito" style={{ color: COLORS.fresh }}>
                                On track · {onTrack.length}
                              </span>
                            </div>
                          )}
                          {onTrack.map(friend => (
                            <FriendCard
                              key={friend.id}
                              friend={friend}
                              healthScore={calculateHealthScore(friend, appState.meetings)}
                              onTap={() => { setSelectedFriendId(friend.id); setCurrentScreen('friend-detail'); }}
                              onQuickLog={() => handleQuickLogRequest(friend.id)}
                              onDelete={() => { setSelectedFriendId(friend.id); setCurrentModal('delete-confirm'); }}
                              theme={theme}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FRIEND DETAIL SCREEN */}
      {currentScreen === 'friend-detail' && selectedFriend && (
        <div className="flex-1 overflow-auto pb-28 animate-screen-slide">
          <ScreenHeader
            isDark={isDark}
            theme={theme}
            title={selectedFriend.name}
            leftAction={
              <button onClick={() => { setCurrentScreen('home'); setSelectedFriendId(null); }} className="p-2 -ml-2 rounded-full transition-colors" style={{ color: theme.text }}>
                <ChevronLeft className="w-5 h-5" />
              </button>
            }
            rightAction={
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentModal('edit-friend')} className="p-2 rounded-full transition-colors" style={{ color: theme.textMuted }}>
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => setCurrentModal('delete-confirm')} className="p-2 -mr-2 rounded-full transition-colors" style={{ color: theme.textMuted }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            }
          />

          <div className={`${TOKENS.spacing.screenPadding}`}>
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

              <div className="flex justify-center mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                <div className="text-center">
                  <div className="text-xl font-bold font-nunito" style={{ color: theme.text }}>{selectedFriend.totalMeetings}</div>
                  <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>meetings</div>
                  {selectedFriend.lastMeetingDate && (
                    <div className="text-xs font-nunito mt-1" style={{ color: theme.textMuted }}>
                      last: {new Date(selectedFriend.lastMeetingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
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
                    <div className="text-sm font-nunito" style={{ color: theme.textMuted }}>You haven't connected yet — start the clock.</div>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {friendMeetings.slice(0, historyLimit).map((meeting, idx) => {
                      // Determine if this meeting was on-cadence by gap to previous
                      let borderColor = COLORS.fresh;
                      const nextMeeting = friendMeetings[idx + 1];
                      if (nextMeeting) {
                        const gapDays = (meeting.timestamp - nextMeeting.timestamp) / 86400000;
                        const ratio = gapDays / selectedFriend.cadenceDays;
                        if (ratio > 1) borderColor = COLORS.attention;
                        else if (ratio > 0.75) borderColor = COLORS.approaching;
                      }
                      return (
                        <Card theme={theme} key={meeting.id} className="p-3" style={{ borderLeft: `3px solid ${borderColor}` }}>
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
                      );
                    })}
                    {friendMeetings.length > historyLimit && (
                      <button onClick={() => setHistoryLimit(prev => prev + 10)}
                        className="w-full py-2.5 text-sm font-medium font-nunito rounded-xl transition-colors"
                        style={{ color: COLORS.primary, backgroundColor: `${COLORS.primary}10` }}>
                        Show more ({friendMeetings.length - historyLimit} remaining)
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="fixed bottom-20 left-0 right-0 p-4 safe-area-bottom" style={{ background: isDark ? `linear-gradient(to top, ${COLORS.darkBg} 70%, transparent)` : `linear-gradient(to top, ${COLORS.lightBg} 70%, transparent)` }}>
            <button onClick={() => setCurrentModal('log-meeting')}
              className="w-full h-12 text-white rounded-xl font-semibold font-nunito flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-sm"
              style={{ backgroundColor: COLORS.primary }}>
              <Check className="w-4 h-4" />Log connection
            </button>
          </div>
        </div>
      )}

      {/* INSIGHTS SCREEN */}
      {currentScreen === 'insights' && (
        <div className="flex-1 overflow-auto pb-20 animate-screen-enter">
          <ScreenHeader isDark={isDark} title="Insights" />

          <div className={`${TOKENS.spacing.screenPadding}`}>

            {activeFriends.length === 0 ? (
              <Card theme={theme} className="text-center py-12">
                <div className="text-4xl mb-3">📊</div>
                <h2 className="text-base font-bold font-nunito mb-1" style={{ color: theme.text }}>No data yet</h2>
                <p className="text-sm font-nunito" style={{ color: theme.textMuted }}>Add friends and log meetings to see insights.</p>
              </Card>
            ) : (() => {
              // Compute all insights data once
              const allMeetings = appState.meetings;
              const now = Date.now();

              // Weekly activity — last 4 weeks
              const weeklyData: { label: string; count: number }[] = [];
              for (let i = 3; i >= 0; i--) {
                const weekStart = now - (i + 1) * 7 * 86400000;
                const weekEnd = now - i * 7 * 86400000;
                const count = allMeetings.filter(m => m.timestamp >= weekStart && m.timestamp < weekEnd).length;
                const d = new Date(weekEnd);
                weeklyData.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count });
              }
              const maxWeekly = Math.max(...weeklyData.map(w => w.count), 1);

              // Overall stats
              const totalMeetings = allMeetings.length;
              const longestStreak = Math.max(...activeFriends.map(f => f.streakCount), 0);
              const avgAdherence = activeFriends.length > 0
                ? Math.round(activeFriends.reduce((sum, f) => {
                    if (!f.lastMeetingDate || f.totalMeetings < 1) return sum + 100;
                    const elapsed = (now - f.lastMeetingDate) / 86400000;
                    const ratio = Math.min(1, f.cadenceDays / Math.max(elapsed, 1));
                    return sum + ratio * 100;
                  }, 0) / activeFriends.length)
                : 0;

              // Spotlights
              const withScores = activeFriends.map(f => ({ friend: f, score: calculateHealthScore(f, allMeetings) }));
              const strongest = withScores.reduce((best, curr) => curr.score > best.score ? curr : best, withScores[0]);
              const mostNeglected = activeFriends
                .filter(f => f.lastMeetingDate !== null)
                .sort((a, b) => getDaysUntilDue(a.lastMeetingDate, a.cadenceDays) - getDaysUntilDue(b.lastMeetingDate, b.cadenceDays))[0];

              // Trend per friend (compare recent 4 meetings avg gap vs prior 4)
              const getTrend = (friend: Friend): 'up' | 'down' | 'stable' => {
                const fm = allMeetings.filter(m => m.friendId === friend.id).sort((a, b) => a.timestamp - b.timestamp);
                if (fm.length < 5) return 'stable';
                const gaps = fm.slice(1).map((m, i) => (m.timestamp - fm[i].timestamp) / 86400000);
                const recent = gaps.slice(-4);
                const prior = gaps.slice(-8, -4);
                if (prior.length === 0) return 'stable';
                const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
                const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
                const diff = (recentAvg - priorAvg) / priorAvg;
                if (diff < -0.15) return 'up'; // shorter gaps = improving
                if (diff > 0.15) return 'down'; // longer gaps = declining
                return 'stable';
              };

              // Streak leaderboard (top 5 with streaks)
              const streakBoard = activeFriends
                .filter(f => f.streakCount > 0)
                .sort((a, b) => b.streakCount - a.streakCount)
                .slice(0, 5);

              return (
                <>
                  {/* Overall Health Ring */}
                  <Card theme={theme} className={`p-5 ${TOKENS.spacing.sectionGap}`}>
                    <h2 className="text-xs font-medium mb-3 font-nunito uppercase tracking-wide" style={{ color: theme.textMuted }}>How you're doing</h2>
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
                    <p className="text-center text-xs font-nunito" style={{ color: theme.textMuted }}>
                      {overallHealth >= 80 ? 'Excellent' : overallHealth >= 60 ? 'Good' : overallHealth >= 40 ? 'Fair' : 'Needs attention'}
                    </p>
                  </Card>

                  {/* Color Legend */}
                  <div className={`flex items-center justify-center gap-4 ${TOKENS.spacing.sectionGap}`}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.fresh }} />
                      <span className="text-xs font-nunito" style={{ color: theme.textMuted }}>On track</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.approaching }} />
                      <span className="text-xs font-nunito" style={{ color: theme.textMuted }}>Approaching</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.attention }} />
                      <span className="text-xs font-nunito" style={{ color: theme.textMuted }}>Overdue</span>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className={`grid grid-cols-3 gap-2 ${TOKENS.spacing.sectionGap}`}>
                    <Card theme={theme} className="p-3 text-center">
                      <Calendar className="w-4 h-4 mx-auto mb-1" style={{ color: COLORS.primary }} />
                      <div className="text-lg font-bold tabular-nums font-nunito" style={{ color: theme.text }}>{totalMeetings}</div>
                      <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>meetings</div>
                    </Card>
                    <Card theme={theme} className="p-3 text-center">
                      <Flame className="w-4 h-4 mx-auto mb-1" style={{ color: COLORS.accent }} />
                      <div className="text-lg font-bold tabular-nums font-nunito" style={{ color: theme.text }}>{longestStreak}</div>
                      <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>best streak</div>
                    </Card>
                    <Card theme={theme} className="p-3 text-center">
                      <TrendingUp className="w-4 h-4 mx-auto mb-1" style={{ color: COLORS.fresh }} />
                      <div className="text-lg font-bold tabular-nums font-nunito" style={{ color: theme.text }}>{avgAdherence}%</div>
                      <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>on cadence</div>
                    </Card>
                  </div>

                  {/* Weekly Activity Chart */}
                  <Card theme={theme} className={`p-5 ${TOKENS.spacing.sectionGap}`}>
                    <h2 className="text-xs font-medium mb-4 font-nunito uppercase tracking-wide" style={{ color: theme.textMuted }}>This month</h2>
                    <div className="flex items-end gap-1.5" style={{ height: 80 }}>
                      {weeklyData.map((week, i) => {
                        const height = maxWeekly > 0 ? Math.max(4, (week.count / maxWeekly) * 72) : 4;
                        const isLatest = i === weeklyData.length - 1;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-xs tabular-nums font-nunito font-semibold" style={{ color: week.count > 0 ? theme.text : 'transparent', fontSize: 10 }}>
                              {week.count}
                            </span>
                            <div
                              className="w-full rounded-t-md transition-all duration-500"
                              style={{
                                height,
                                backgroundColor: isLatest ? COLORS.primary : week.count > 0 ? `${COLORS.primary}60` : theme.border,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      {weeklyData.map((week, i) => (
                        <div key={i} className="flex-1 text-center">
                          <span className="font-nunito tabular-nums" style={{ color: theme.textMuted, fontSize: 9 }}>{week.label}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Spotlight Cards */}
                  {(strongest || mostNeglected) && (
                    <div className={`grid grid-cols-2 gap-2 ${TOKENS.spacing.sectionGap}`}>
                      {strongest && (
                        <Card theme={theme} className="p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Award className="w-3.5 h-3.5" style={{ color: COLORS.fresh }} />
                            <span className="text-xs font-semibold font-nunito uppercase tracking-wide" style={{ color: COLORS.fresh }}>Strongest</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold font-nunito flex-shrink-0"
                              style={{ backgroundColor: COLORS.fresh }}>{strongest.friend.name.charAt(0).toUpperCase()}</div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm font-nunito truncate" style={{ color: theme.text }}>{strongest.friend.name}</div>
                              <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>Score: {strongest.score}</div>
                            </div>
                          </div>
                        </Card>
                      )}
                      {mostNeglected && (
                        <Card theme={theme} className="p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <AlertTriangle className="w-3.5 h-3.5" style={{ color: COLORS.attention }} />
                            <span className="text-xs font-semibold font-nunito uppercase tracking-wide" style={{ color: COLORS.attention }}>Needs love</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold font-nunito flex-shrink-0"
                              style={{ backgroundColor: COLORS.attention }}>{mostNeglected.name.charAt(0).toUpperCase()}</div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm font-nunito truncate" style={{ color: theme.text }}>{mostNeglected.name}</div>
                              <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>
                                {getDaysUntilDue(mostNeglected.lastMeetingDate, mostNeglected.cadenceDays) < 0 ? 'Overdue' : getDaysUntilDue(mostNeglected.lastMeetingDate, mostNeglected.cadenceDays) === 0 ? 'Due today' : `${getDaysUntilDue(mostNeglected.lastMeetingDate, mostNeglected.cadenceDays)}d left`}
                              </div>
                            </div>
                          </div>
                        </Card>
                      )}
                    </div>
                  )}

                  {/* Streak Leaderboard */}
                  {streakBoard.length > 0 && (
                    <Card theme={theme} className={`p-5 ${TOKENS.spacing.sectionGap}`}>
                      <h2 className="text-xs font-medium mb-3 font-nunito uppercase tracking-wide" style={{ color: theme.textMuted }}>Streak Leaderboard</h2>
                      <div className="space-y-2.5">
                        {streakBoard.map((friend, i) => (
                          <div key={friend.id} className="flex items-center gap-3">
                            <span className="text-sm font-bold tabular-nums font-nunito w-5 text-center" style={{ color: i === 0 ? COLORS.accent : theme.textMuted }}>
                              {i + 1}
                            </span>
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold font-nunito flex-shrink-0"
                              style={{ backgroundColor: COLORS.primary }}
                            >
                              {friend.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium font-nunito truncate block" style={{ color: theme.text }}>{friend.name}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Flame className="w-3.5 h-3.5" style={{ color: COLORS.accent }} />
                              <span className="text-sm font-bold tabular-nums font-nunito" style={{ color: COLORS.accent }}>{friend.streakCount}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Individual Scores with Trends */}
                  <Card theme={theme} className="p-5">
                    <h2 className="text-xs font-medium mb-3 font-nunito uppercase tracking-wide" style={{ color: theme.textMuted }}>Your circle</h2>
                    <div className="space-y-3">
                      {withScores.sort((a, b) => b.score - a.score).map(({ friend, score }) => {
                        const trend = getTrend(friend);
                        return (
                          <div key={friend.id}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium font-nunito truncate" style={{ color: theme.text }}>{friend.name}</span>
                                {trend === 'up' && <TrendingUp className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.fresh }} />}
                                {trend === 'down' && <TrendingDown className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.attention }} />}
                              </div>
                              <span className="font-semibold tabular-nums font-nunito flex-shrink-0 ml-2" style={{ color: theme.text }}>{score}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                              <div className="h-full rounded-full transition-all duration-700" style={{
                                width: `${score}%`,
                                backgroundColor: score >= 70 ? COLORS.fresh : score >= 40 ? COLORS.approaching : COLORS.attention,
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* SETTINGS SCREEN */}
      {currentScreen === 'settings' && (
        <div className="flex-1 overflow-auto pb-20 animate-screen-enter">
          <ScreenHeader isDark={isDark} title="Settings" />

          <div className={`${TOKENS.spacing.screenPadding}`}>
            <Card theme={theme} className={`overflow-hidden ${TOKENS.spacing.cardGap}`}>
              <div className="px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide font-nunito mb-3" style={{ color: theme.textMuted }}>Appearance</div>
                <div className="flex gap-1.5 p-1 rounded-xl" style={{ backgroundColor: theme.inputBg }}>
                  {(['auto', 'light', 'dark'] as const).map((opt) => (
                    <button key={opt} onClick={() => setAppState(prev => ({ ...prev, settings: { ...prev.settings, theme: opt } }))}
                      className="flex-1 py-2 rounded-lg font-semibold font-nunito capitalize text-sm transition-all"
                      style={{
                        backgroundColor: appState.settings.theme === opt ? COLORS.primary : 'transparent',
                        color: appState.settings.theme === opt ? 'white' : theme.textSecondary,
                      }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card theme={theme} className={`overflow-hidden ${TOKENS.spacing.cardGap}`}>
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <h3 className="text-xs font-medium uppercase tracking-wide font-nunito" style={{ color: theme.textMuted }}>Data</h3>
              </div>
              <button onClick={handleExport} className="w-full px-4 py-3 flex items-center gap-3 transition-colors text-left" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <Download className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.primary }} />
                <div>
                  <div className="text-sm font-nunito" style={{ color: theme.text }}>Export</div>
                  <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>Save a backup to your device</div>
                </div>
              </button>
              <label className="w-full px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer text-left">
                <Upload className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.primary }} />
                <div>
                  <div className="text-sm font-nunito" style={{ color: theme.text }}>Import</div>
                  <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>Restore from a previous backup</div>
                </div>
                <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
              </label>
            </Card>

            <Card theme={theme} className={`overflow-hidden ${TOKENS.spacing.cardGap}`} style={{ borderColor: `${COLORS.attention}30` }}>
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <h3 className="text-xs font-medium uppercase tracking-wide font-nunito" style={{ color: COLORS.attention }}>Danger zone</h3>
              </div>
              <button onClick={() => setCurrentModal('reset-confirm')} className="w-full px-4 py-3 flex items-center gap-3 transition-colors text-left">
                <Trash2 className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.attention }} />
                <div>
                  <div className="text-sm font-nunito" style={{ color: COLORS.attention }}>Reset all data</div>
                  <div className="text-xs font-nunito" style={{ color: theme.textMuted }}>Remove all friends, meetings, and settings</div>
                </div>
              </button>
            </Card>

            <Card theme={theme} className="overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AppIcon size={28} withBackground={true} isDark={isDark} />
                  <span className="text-sm font-semibold font-nunito" style={{ color: theme.text }}>In Time</span>
                </div>
                <span className="text-xs font-mono" style={{ color: theme.textMuted }}>v{APP_VERSION}</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 safe-area-bottom" style={{ backgroundColor: theme.card, borderTop: `1px solid ${theme.border}` }}>
        <div className="flex justify-around py-1.5">
          {[{ screen: 'home' as const, icon: Home, label: 'Home' }, { screen: 'insights' as const, icon: BarChart3, label: 'Insights' }, { screen: 'settings' as const, icon: Settings, label: 'Settings' }].map(({ screen, icon: Icon, label }) => (
            <button key={screen} onClick={() => setCurrentScreen(screen)} className="flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-lg transition-all relative">
              <Icon className="w-5 h-5" style={{ color: currentScreen === screen ? COLORS.primary : theme.textMuted }} />
              <span className="text-xs font-medium font-nunito" style={{ color: currentScreen === screen ? COLORS.primary : theme.textMuted }}>{label}</span>
              {currentScreen === screen && (
                <div className="absolute -bottom-0.5 w-5 h-0.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
              )}
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
      {currentModal === 'reset-confirm' && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setCurrentModal(null)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 max-w-sm mx-auto animate-scale-in" style={{ backgroundColor: theme.card }}>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${COLORS.attention}15` }}>
                <AlertTriangle className="w-6 h-6" style={{ color: COLORS.attention }} />
              </div>
              <h2 className="text-lg font-bold font-nunito mb-1" style={{ color: theme.text }}>Reset everything?</h2>
              <p className="text-sm font-nunito" style={{ color: theme.textSecondary }}>This will permanently delete all friends, meetings, and settings. This cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCurrentModal(null)} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm" style={{ backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={handleResetData} className="flex-1 py-3 rounded-xl font-semibold font-nunito text-sm text-white" style={{ backgroundColor: COLORS.attention }}>Reset</button>
            </div>
          </div>
        </>
      )}

      {/* GLOBAL STYLES */}
      <style>{`
        .font-nunito { font-family: 'Nunito', -apple-system, sans-serif; }
        .pt-safe-top { padding-top: max(env(safe-area-inset-top), 16px); }
        .safe-area-top { padding-top: env(safe-area-inset-top); }
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
        @keyframes slide-down { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes screen-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes screen-slide-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-down { animation: slide-down 0.25s ease-out; }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .animate-screen-enter { animation: screen-enter 0.25s ease-out; }
        .animate-screen-slide { animation: screen-slide-in 0.25s ease-out; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>
    </GradientBackground>
  );
}