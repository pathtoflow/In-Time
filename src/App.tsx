import React, { useState, useEffect, useCallback } from 'react';
import { Check, Plus, ChevronLeft, Flame, BarChart3, Settings, Home, Download, Upload, X } from 'lucide-react';

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
type Modal = 'add-friend' | 'edit-friend' | 'log-meeting' | 'import-confirm' | null;

// ==================== CONSTANTS ====================

const APP_VERSION = '1.1.0';

// Soft, calm color palette
const COLORS = {
  fresh: '#10B981',      // Emerald - recently connected
  good: '#34D399',       // Light emerald - on track
  approaching: '#FBBF24', // Amber - getting close to cadence
  overdue: '#F97316',    // Soft orange - past cadence (not red!)
  text: {
    primary: '#1F2937',
    secondary: '#6B7280',
    muted: '#9CA3AF',
  }
};

// ==================== UTILITY FUNCTIONS ====================

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const calculateElapsed = (lastMeeting: number | null): { days: number; hours: number; minutes: number; total: number } => {
  if (!lastMeeting) return { days: 0, hours: 0, minutes: 0, total: 0 };
  
  const elapsed = Date.now() - lastMeeting;
  const totalMinutes = Math.floor(elapsed / 60000);
  const totalHours = Math.floor(elapsed / 3600000);
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
  if (percentage < 80) return COLORS.good;
  if (percentage < 100) return COLORS.approaching;
  return COLORS.overdue;
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

// ==================== CUSTOM HOOKS ====================

// Live timer hook - updates every minute
const useLiveTimer = () => {
  const [tick, setTick] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);
  
  return tick;
};

// Dark mode hook
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

// Toast notification component
const ToastContainer = ({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) => {
  useEffect(() => {
    toasts.forEach(toast => {
      const timer = setTimeout(() => onDismiss(toast.id), 3000);
      return () => clearTimeout(timer);
    });
  }, [toasts, onDismiss]);

  const getToastStyles = (type: Toast['type']) => {
    switch (type) {
      case 'success': return 'bg-emerald-600';
      case 'warning': return 'bg-amber-500';
      case 'error': return 'bg-red-500';
      case 'info': return 'bg-blue-500';
    }
  };

  return (
    <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`${getToastStyles(toast.type)} text-white px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 pointer-events-auto transform transition-all duration-300 ease-out animate-slide-down`}
          onClick={() => onDismiss(toast.id)}
        >
          <Check className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

// Timer display component - the hero element
const TimerDisplay = ({ lastMeeting, cadence }: { lastMeeting: number | null; cadence: number }) => {
  useLiveTimer(); // Subscribe to timer updates
  
  const elapsed = calculateElapsed(lastMeeting);
  const color = getTimerColor(lastMeeting, cadence);
  
  if (!lastMeeting) {
    return (
      <div className="text-center py-2">
        <div className="text-3xl font-light tracking-tight text-gray-400 dark:text-gray-500 transition-colors duration-500">
          No meetings yet
        </div>
        <div className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          ready when you are
        </div>
      </div>
    );
  }
  
  return (
    <div className="text-center py-2">
      <div 
        className="font-light tracking-tight transition-colors duration-700 ease-in-out"
        style={{ color }}
      >
        <span className="text-4xl tabular-nums">{elapsed.days}</span>
        <span className="text-lg text-gray-400 dark:text-gray-500 mx-1">d</span>
        <span className="text-4xl tabular-nums">{elapsed.hours}</span>
        <span className="text-lg text-gray-400 dark:text-gray-500 mx-1">h</span>
        <span className="text-4xl tabular-nums">{elapsed.minutes}</span>
        <span className="text-lg text-gray-400 dark:text-gray-500 ml-1">m</span>
      </div>
      <div className="text-sm text-gray-400 dark:text-gray-500 mt-1 transition-opacity duration-300">
        since you connected
      </div>
    </div>
  );
};

// Progress bar component
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
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: color
          }}
        />
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
        <span className="tabular-nums">{Math.round(percentage)}% of cycle</span>
        <span className="tabular-nums">
          {daysUntil > 0 ? `${daysUntil}d left` : 'due for a catch-up'}
        </span>
      </div>
    </div>
  );
};

// Friend card component - timer-first design
const FriendCard = ({ 
  friend, 
  meetings, 
  onClick 
}: { 
  friend: Friend; 
  meetings: Meeting[]; 
  onClick: () => void 
}) => {
  const healthScore = calculateHealthScore(friend, meetings);
  
  return (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 mb-3 cursor-pointer 
                 transition-all duration-300 ease-out
                 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50
                 active:scale-[0.98] active:shadow-md"
    >
      {/* Timer - The Hero */}
      <TimerDisplay lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} />
      
      {/* Subtle Divider */}
      <div className="border-t border-gray-100 dark:border-gray-700/50 my-4" />
      
      {/* Friend Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 
                          flex items-center justify-center text-white font-semibold text-sm
                          shadow-md shadow-purple-500/20">
            {friend.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">{friend.name}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {friend.relationshipTier} · every {friend.cadenceDays}d
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Health Score - Subtle */}
          <div className="text-xs text-gray-400 dark:text-gray-500">
            {healthScore}
          </div>
          
          {/* Streak Badge */}
          {friend.streakCount > 0 && (
            <div className="flex items-center gap-1 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1 rounded-full
                            transition-transform duration-300 hover:scale-105">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs font-semibold text-orange-500 dark:text-orange-400 tabular-nums">
                {friend.streakCount}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Progress Bar */}
      <ProgressBar lastMeeting={friend.lastMeetingDate} cadence={friend.cadenceDays} />
    </div>
  );
};

// ==================== MODALS ====================

const AddEditFriendModal = ({ 
  friend, 
  onClose, 
  onSave, 
  friendCount 
}: { 
  friend?: Friend; 
  onClose: () => void; 
  onSave: (data: Partial<Friend>) => void; 
  friendCount: number;
}) => {
  const [name, setName] = useState(friend?.name || '');
  const [tier, setTier] = useState<'close' | 'casual'>(friend?.relationshipTier || 'close');
  const [cadence, setCadence] = useState(friend?.cadenceDays || 14);
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!friend && friendCount >= 10) {
      setError('Friend limit reached (10 max)');
      return;
    }
    onSave({ name: name.trim(), relationshipTier: tier, cadenceDays: cadence });
  };

  const presets = [7, 14, 21, 30, 60, 90];

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300" 
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-gray-800 rounded-t-3xl 
                      max-h-[90vh] overflow-auto animate-slide-up">
        <div className="sticky top-0 bg-white dark:bg-gray-800 pb-2">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mt-3 mb-4" />
          <div className="flex items-center justify-between px-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {friend ? 'Edit Friend' : 'Add Friend'}
            </h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="px-6 pb-8 space-y-6">
          {/* Name Input */}
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Friend's name"
              className={`w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 
                         text-gray-900 dark:text-gray-100 
                         border-2 transition-colors duration-200
                         ${error ? 'border-red-400' : 'border-transparent'} 
                         focus:outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-gray-700`}
              autoFocus
            />
            {error && (
              <div className="text-sm text-red-500 mt-2 animate-shake">{error}</div>
            )}
          </div>

          {/* Relationship Tier */}
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Relationship Type
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setTier('close')}
                className={`flex-1 py-3.5 rounded-xl font-medium transition-all duration-200 ${
                  tier === 'close' 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                    : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Close
              </button>
              <button
                onClick={() => setTier('casual')}
                className={`flex-1 py-3.5 rounded-xl font-medium transition-all duration-200 ${
                  tier === 'casual' 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                    : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Casual
              </button>
            </div>
          </div>

          {/* Cadence */}
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Ideal Cadence
            </label>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-gray-500">Every</span>
              <input
                type="number"
                value={cadence}
                onChange={(e) => setCadence(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 
                           text-gray-900 dark:text-gray-100 text-center font-medium
                           focus:outline-none focus:ring-2 focus:ring-emerald-500"
                min="1"
              />
              <span className="text-sm text-gray-500">days</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map(preset => (
                <button
                  key={preset}
                  onClick={() => setCadence(preset)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    cadence === preset
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                      : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {preset}d
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl font-semibold 
                         bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 
                         hover:bg-gray-200 dark:hover:bg-gray-600 
                         transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3.5 rounded-xl font-semibold 
                         bg-emerald-500 text-white 
                         hover:bg-emerald-600 
                         shadow-lg shadow-emerald-500/30
                         transition-all duration-200"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const LogMeetingModal = ({
  friend,
  onClose,
  onSave
}: {
  friend: Friend;
  onClose: () => void;
  onSave: (note?: string) => void;
}) => {
  const [note, setNote] = useState('');

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300" 
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-gray-800 rounded-t-3xl animate-slide-up">
        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mt-3 mb-4" />
        
        <div className="px-6 pb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Log Meeting
            </h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          
          {/* Friend Preview */}
          <div className="flex items-center gap-3 mb-6 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 
                            flex items-center justify-center text-white font-semibold">
              {friend.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">{friend.name}</div>
              <div className="text-sm text-gray-500">Logging a connection</div>
            </div>
          </div>

          {/* Note Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you talk about?"
              maxLength={200}
              rows={3}
              className="w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 
                         text-gray-900 dark:text-gray-100 resize-none
                         focus:outline-none focus:ring-2 focus:ring-emerald-500
                         transition-all duration-200"
            />
            <div className="text-xs text-gray-400 text-right mt-2 tabular-nums">
              {note.length}/200
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl font-semibold 
                         bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 
                         hover:bg-gray-200 dark:hover:bg-gray-600 
                         transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(note.trim() || undefined)}
              className="flex-1 py-3.5 rounded-xl font-semibold 
                         bg-emerald-500 text-white 
                         hover:bg-emerald-600 
                         shadow-lg shadow-emerald-500/30
                         transition-all duration-200
                         flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Log Meeting
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// Import Confirmation Modal
const ImportConfirmModal = ({
  data,
  onClose,
  onConfirm
}: {
  data: DataExport;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" 
        onClick={onClose}
      />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md mx-auto animate-scale-in">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Import Data?
        </h2>
        
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
            <p><span className="font-medium">{data.friends.length}</span> friends</p>
            <p><span className="font-medium">{data.meetings.length}</span> meetings</p>
            <p className="text-xs text-gray-400 mt-2">
              Exported: {new Date(data.exportedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-6">
          This will replace all your current data. Make sure you've exported your current data first.
        </p>
        
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-semibold 
                       bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-semibold 
                       bg-emerald-500 text-white"
          >
            Import
          </button>
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
  
  const [appState, setAppState] = useState<AppState>(() => {
    const saved = localStorage.getItem('relationship-tracker-data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          friends: [],
          meetings: [],
          settings: {
            theme: 'auto',
            notificationsEnabled: true,
            dailySummaryInterval: 30,
            thresholdAlertsEnabled: true
          }
        };
      }
    }
    return {
      friends: [],
      meetings: [],
      settings: {
        theme: 'auto',
        notificationsEnabled: true,
        dailySummaryInterval: 30,
        thresholdAlertsEnabled: true
      }
    };
  });

  useDarkMode(appState.settings.theme);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('relationship-tracker-data', JSON.stringify(appState));
  }, [appState]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ==================== DATA EXPORT/IMPORT ====================
  
  const handleExport = () => {
    const exportData: DataExport = {
      version: APP_VERSION,
      exportedAt: Date.now(),
      friends: appState.friends,
      meetings: appState.meetings,
      settings: appState.settings
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relationship-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully', 'success');
  };
  
  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as DataExport;
        
        // Basic validation
        if (!data.friends || !data.meetings || !data.settings) {
          showToast('Invalid backup file format', 'error');
          return;
        }
        
        setImportData(data);
        setCurrentModal('import-confirm');
      } catch {
        showToast('Could not read backup file', 'error');
      }
    };
    reader.readAsText(file);
    
    // Reset the input
    event.target.value = '';
  };
  
  const confirmImport = () => {
    if (!importData) return;
    
    setAppState({
      friends: importData.friends,
      meetings: importData.meetings,
      settings: importData.settings
    });
    
    setImportData(null);
    setCurrentModal(null);
    showToast('Data imported successfully', 'success');
  };

  // ==================== FRIEND HANDLERS ====================

  const handleAddFriend = (data: Partial<Friend>) => {
    const newFriend: Friend = {
      id: generateId(),
      name: data.name!,
      relationshipTier: data.relationshipTier!,
      cadenceDays: data.cadenceDays!,
      lastMeetingDate: null,
      streakCount: 0,
      multiplier: 1.0,
      totalMeetings: 0,
      isArchived: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    setAppState(prev => ({
      ...prev,
      friends: [...prev.friends, newFriend]
    }));
    
    setCurrentModal(null);
    showToast(`${newFriend.name} added`);
  };

  const handleEditFriend = (data: Partial<Friend>) => {
    if (!selectedFriendId) return;
    
    setAppState(prev => ({
      ...prev,
      friends: prev.friends.map(f => 
        f.id === selectedFriendId 
          ? { ...f, ...data, updatedAt: Date.now() }
          : f
      )
    }));
    
    setCurrentModal(null);
    showToast('Friend updated');
  };

  const handleLogMeeting = (note?: string) => {
    if (!selectedFriendId) return;
    
    const friend = appState.friends.find(f => f.id === selectedFriendId);
    if (!friend) return;

    const now = Date.now();
    const newMeeting: Meeting = {
      id: generateId(),
      friendId: selectedFriendId,
      timestamp: now,
      note,
      createdAt: now
    };

    const daysSinceLastMeeting = friend.lastMeetingDate 
      ? Math.floor((now - friend.lastMeetingDate) / 86400000)
      : 0;

    const newStreak = daysSinceLastMeeting <= friend.cadenceDays && friend.lastMeetingDate
      ? friend.streakCount + 1
      : 1;

    const newMultiplier = Math.min(3.0, 1.0 + (newStreak * 0.1));

    setAppState(prev => ({
      ...prev,
      meetings: [...prev.meetings, newMeeting],
      friends: prev.friends.map(f =>
        f.id === selectedFriendId
          ? {
              ...f,
              lastMeetingDate: now,
              streakCount: newStreak,
              multiplier: newMultiplier,
              totalMeetings: f.totalMeetings + 1,
              updatedAt: now
            }
          : f
      )
    }));

    setCurrentModal(null);
    showToast(`Meeting with ${friend.name} logged`);
  };

  const handleArchiveFriend = (friendId: string) => {
    const friend = appState.friends.find(f => f.id === friendId);
    if (!friend) return;

    setAppState(prev => ({
      ...prev,
      friends: prev.friends.map(f =>
        f.id === friendId
          ? { ...f, isArchived: true, updatedAt: Date.now() }
          : f
      )
    }));

    setCurrentScreen('home');
    setSelectedFriendId(null);
    showToast(`${friend.name} archived`);
  };

  // ==================== DERIVED STATE ====================

  const selectedFriend = selectedFriendId 
    ? appState.friends.find(f => f.id === selectedFriendId) 
    : null;

  const activeFriendCount = appState.friends.filter(f => !f.isArchived).length;
  
  const activeFriends = appState.friends
    .filter(f => !f.isArchived)
    .sort((a, b) => {
      // Sort by urgency (closest to/past cadence first)
      const aDaysUntil = getDaysUntilDue(a.lastMeetingDate, a.cadenceDays);
      const bDaysUntil = getDaysUntilDue(b.lastMeetingDate, b.cadenceDays);
      return aDaysUntil - bDaysUntil;
    });

  const overallHealth = activeFriends.length > 0
    ? Math.round(activeFriends.reduce((sum, f) => sum + calculateHealthScore(f, appState.meetings), 0) / activeFriends.length)
    : 0;

  // ==================== RENDER ====================

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* HOME SCREEN */}
      {currentScreen === 'home' && (
        <div className="flex-1 overflow-auto pb-24">
          <div className="max-w-2xl mx-auto p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 pt-2">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Connections
                </h1>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                  {activeFriendCount} friend{activeFriendCount !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setCurrentModal('add-friend')}
                disabled={activeFriendCount >= 10}
                className="w-12 h-12 rounded-full bg-emerald-500 text-white 
                           flex items-center justify-center 
                           shadow-lg shadow-emerald-500/30
                           hover:bg-emerald-600 hover:shadow-emerald-500/40
                           disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed 
                           transition-all duration-200"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
            
            {/* Empty State */}
            {activeFriendCount === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 dark:bg-gray-800 
                                flex items-center justify-center">
                  <span className="text-4xl">👋</span>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Add your first friend
                </h2>
                <p className="text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
                  Start tracking meaningful connections by adding someone you care about
                </p>
              </div>
            ) : (
              <>
                {/* Friend Limit Warning */}
                {activeFriendCount >= 10 && (
                  <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 
                                  border border-amber-200 dark:border-amber-800 
                                  rounded-2xl">
                    <div className="text-sm text-amber-700 dark:text-amber-200">
                      Friend limit reached. Archive inactive friends to add new ones.
                    </div>
                  </div>
                )}
                
                {/* Friend Cards */}
                <div className="space-y-3">
                  {activeFriends.map(friend => (
                    <FriendCard 
                      key={friend.id}
                      friend={friend}
                      meetings={appState.meetings}
                      onClick={() => {
                        setSelectedFriendId(friend.id);
                        setCurrentScreen('friend-detail');
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FRIEND DETAIL SCREEN */}
      {currentScreen === 'friend-detail' && selectedFriend && (
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-lg z-10 
                            px-4 py-3 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-800/50">
              <button 
                onClick={() => {
                  setCurrentScreen('home');
                  setSelectedFriendId(null);
                }}
                className="p-2 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 rounded-full transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedFriend.name}</span>
              <div className="w-10" />
            </div>

            <div className="p-4">
              {/* Profile Section */}
              <div className="flex flex-col items-center mb-8 pt-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 
                                flex items-center justify-center text-white font-bold text-3xl mb-4
                                shadow-xl shadow-purple-500/30">
                  {selectedFriend.name.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                  {selectedFriend.name}
                </h2>
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  {selectedFriend.relationshipTier} · every {selectedFriend.cadenceDays} days
                </span>
              </div>

              {/* Timer Card */}
              <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 mb-6 shadow-sm">
                <TimerDisplay lastMeeting={selectedFriend.lastMeetingDate} cadence={selectedFriend.cadenceDays} />
                
                {/* Stats Row */}
                <div className="flex justify-center gap-8 mt-6 pt-6 border-t border-gray-100 dark:border-gray-700/50">
                  {selectedFriend.streakCount > 0 && (
                    <div className="text-center">
                      <div className="flex items-center gap-1.5 justify-center mb-1">
                        <Flame className="w-5 h-5 text-orange-400" />
                        <span className="text-2xl font-bold text-orange-500">{selectedFriend.streakCount}</span>
                      </div>
                      <div className="text-xs text-gray-400">streak</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-500">{selectedFriend.multiplier.toFixed(1)}×</div>
                    <div className="text-xs text-gray-400">multiplier</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-500">{selectedFriend.totalMeetings}</div>
                    <div className="text-xs text-gray-400">meetings</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <ProgressBar lastMeeting={selectedFriend.lastMeetingDate} cadence={selectedFriend.cadenceDays} />
                
                {/* Health Score */}
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">Health Score</span>
                    <span className="text-lg font-bold text-emerald-500">
                      {calculateHealthScore(selectedFriend, appState.meetings)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${calculateHealthScore(selectedFriend, appState.meetings)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Meeting History */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Meeting History</h3>
                {(() => {
                  const friendMeetings = appState.meetings
                    .filter(m => m.friendId === selectedFriend.id)
                    .sort((a, b) => b.timestamp - a.timestamp);
                  
                  return friendMeetings.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-gray-800/50 rounded-2xl">
                      <div className="text-4xl mb-3">📅</div>
                      <div className="text-sm text-gray-400">No meetings yet</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {friendMeetings.map(meeting => (
                        <div 
                          key={meeting.id} 
                          className="bg-white dark:bg-gray-800/50 rounded-xl p-4 transition-all duration-200 hover:shadow-md"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                              {new Date(meeting.timestamp).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </div>
                            <div className="text-xs text-gray-400">
                              {new Date(meeting.timestamp).toLocaleTimeString('en-US', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </div>
                          </div>
                          {meeting.note && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">{meeting.note}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Archive Button */}
              <button
                onClick={() => handleArchiveFriend(selectedFriend.id)}
                className="w-full py-3 text-sm text-gray-400 hover:text-red-500 transition-colors"
              >
                Archive this friend
              </button>
            </div>

            {/* Fixed Log Meeting Button */}
            <div className="fixed bottom-24 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 dark:from-gray-900 via-gray-50/80 dark:via-gray-900/80 to-transparent pt-8">
              <div className="max-w-2xl mx-auto">
                <button
                  onClick={() => setCurrentModal('log-meeting')}
                  className="w-full h-14 bg-emerald-500 text-white rounded-2xl font-semibold 
                             shadow-lg shadow-emerald-500/30
                             hover:bg-emerald-600 hover:shadow-emerald-500/40
                             transition-all duration-200 
                             flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Log Meeting
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INSIGHTS SCREEN */}
      {currentScreen === 'insights' && (
        <div className="flex-1 overflow-auto pb-24">
          <div className="max-w-2xl mx-auto p-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8 pt-2">Insights</h1>

            {/* Overall Health Card */}
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 mb-4 shadow-sm">
              <h2 className="text-sm font-medium text-gray-500 mb-4">Overall Health</h2>
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-36 h-36">
                  <svg className="transform -rotate-90 w-36 h-36">
                    <circle 
                      cx="72" cy="72" r="60" 
                      stroke="currentColor" 
                      strokeWidth="10" 
                      fill="none" 
                      className="text-gray-100 dark:text-gray-700/50" 
                    />
                    <circle 
                      cx="72" cy="72" r="60" 
                      stroke="currentColor"
                      strokeWidth="10" 
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${overallHealth * 3.77} 377`}
                      className="text-emerald-500 transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">{overallHealth}</span>
                  </div>
                </div>
              </div>
              <p className="text-center text-sm text-gray-400">
                {overallHealth >= 80 ? 'Excellent' : overallHealth >= 60 ? 'Good' : overallHealth >= 40 ? 'Needs attention' : 'Getting started'}
              </p>
            </div>

            {/* Individual Health Scores */}
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-medium text-gray-500 mb-4">Individual Scores</h2>
              {activeFriends.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No friends yet</div>
              ) : (
                <div className="space-y-4">
                  {activeFriends
                    .sort((a, b) => calculateHealthScore(b, appState.meetings) - calculateHealthScore(a, appState.meetings))
                    .map(friend => {
                      const health = calculateHealthScore(friend, appState.meetings);
                      return (
                        <div key={friend.id}>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100">{friend.name}</span>
                            <span className="font-semibold text-emerald-500 tabular-nums">{health}</span>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                              style={{ width: `${health}%` }}
                            />
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
          <div className="max-w-2xl mx-auto p-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8 pt-2">Settings</h1>

            {/* Appearance */}
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl overflow-hidden mb-4 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Appearance</h3>
              </div>
              <div className="px-4 py-4 flex items-center justify-between">
                <span className="text-gray-900 dark:text-gray-100">Theme</span>
                <select 
                  value={appState.settings.theme}
                  onChange={(e) => setAppState(prev => ({
                    ...prev,
                    settings: { ...prev.settings, theme: e.target.value as 'auto' | 'light' | 'dark' }
                  }))}
                  className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-xl border-none 
                             text-gray-900 dark:text-gray-100 font-medium
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="auto">Auto</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl overflow-hidden mb-4 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notifications</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                <div className="px-4 py-4 flex items-center justify-between">
                  <span className="text-gray-900 dark:text-gray-100">Daily summary</span>
                  <input 
                    type="checkbox"
                    checked={appState.settings.notificationsEnabled}
                    onChange={(e) => setAppState(prev => ({
                      ...prev,
                      settings: { ...prev.settings, notificationsEnabled: e.target.checked }
                    }))}
                    className="w-5 h-5 rounded accent-emerald-500"
                  />
                </div>
                <div className="px-4 py-4 flex items-center justify-between">
                  <span className="text-gray-900 dark:text-gray-100">Threshold alerts</span>
                  <input 
                    type="checkbox"
                    checked={appState.settings.thresholdAlertsEnabled}
                    onChange={(e) => setAppState(prev => ({
                      ...prev,
                      settings: { ...prev.settings, thresholdAlertsEnabled: e.target.checked }
                    }))}
                    className="w-5 h-5 rounded accent-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Data Management - NEW SECTION */}
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl overflow-hidden mb-4 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Data</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                <button 
                  onClick={handleExport}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-emerald-500" />
                    <span className="text-gray-900 dark:text-gray-100">Export Data</span>
                  </div>
                  <span className="text-sm text-gray-400">Download backup</span>
                </button>
                <label className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-blue-500" />
                    <span className="text-gray-900 dark:text-gray-100">Import Data</span>
                  </div>
                  <span className="text-sm text-gray-400">Restore backup</span>
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={handleImportFile}
                    className="hidden" 
                  />
                </label>
              </div>
            </div>

            {/* About */}
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">About</h3>
              </div>
              <div className="px-4 py-4 flex items-center justify-between">
                <span className="text-gray-900 dark:text-gray-100">Version</span>
                <span className="text-gray-400 font-mono text-sm">{APP_VERSION}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg 
                      border-t border-gray-200/50 dark:border-gray-700/50 safe-area-pb">
        <div className="max-w-2xl mx-auto flex justify-around py-2">
          {[
            { screen: 'home' as const, icon: Home, label: 'Home' },
            { screen: 'insights' as const, icon: BarChart3, label: 'Insights' },
            { screen: 'settings' as const, icon: Settings, label: 'Settings' },
          ].map(({ screen, icon: Icon, label }) => (
            <button 
              key={screen}
              onClick={() => setCurrentScreen(screen)}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all duration-200 ${
                currentScreen === screen 
                  ? 'text-emerald-500' 
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <Icon className={`w-6 h-6 transition-transform duration-200 ${currentScreen === screen ? 'scale-110' : ''}`} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MODALS */}
      {currentModal === 'add-friend' && (
        <AddEditFriendModal
          onClose={() => setCurrentModal(null)}
          onSave={handleAddFriend}
          friendCount={activeFriendCount}
        />
      )}

      {currentModal === 'edit-friend' && selectedFriend && (
        <AddEditFriendModal
          friend={selectedFriend}
          onClose={() => setCurrentModal(null)}
          onSave={handleEditFriend}
          friendCount={activeFriendCount}
        />
      )}

      {currentModal === 'log-meeting' && selectedFriend && (
        <LogMeetingModal
          friend={selectedFriend}
          onClose={() => setCurrentModal(null)}
          onSave={handleLogMeeting}
        />
      )}

      {currentModal === 'import-confirm' && importData && (
        <ImportConfirmModal
          data={importData}
          onClose={() => {
            setImportData(null);
            setCurrentModal(null);
          }}
          onConfirm={confirmImport}
        />
      )}

      {/* Global Styles for Animations */}
      <style>{`
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
        
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
        
        .animate-shake {
          animation: shake 0.3s ease-out;
        }
        
        .safe-area-pb {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>
    </div>
  );
}