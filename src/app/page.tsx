"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import { GoogleGenAI } from "@google/genai";
import { 
  Dumbbell, 
  Sparkles, 
  Check, 
  Plus, 
  Minus, 
  Zap, 
  RefreshCw, 
  HelpCircle,
  Key,
  AlertTriangle,
  Trash2,
  Save,
  ClipboardList,
  Activity,
  RotateCcw,
  Clock,
  Info
} from "lucide-react";

// -------------------------------------------------------------
// 型定義
// -------------------------------------------------------------
type Exercise = {
  name: string;
  weight: number;
  reps: number;
  sets: number;
};

type Menus = Record<string, Exercise[]>;

type ScheduleItem = {
  date: string;
  workoutName: string;
  isTemp: boolean;
  completed?: boolean;
  customExercises?: Exercise[];
  adjustmentReason?: string;
  completedExercises?: ExerciseRecord[];
};

type DateState = "DEFAULT" | "CONFIRMED_GO" | "CONFIRMED_NO" | "MAYBE";
type DateStates = Record<string, DateState>;

type SetRecord = {
  weight: number;
  reps: number;
  completed: boolean;
};

type ExerciseRecord = {
  name: string;
  targetWeight: number;
  targetReps: number;
  targetSets: number;
  sets: SetRecord[];
};

type UserProfile = {
  goals: string;
  experience: string;
  limitations: string;
  preferences: string;
  equipment: string;
  barbellStep: number;
  dumbbellStep: number;
  machineStep: number;
};

type MenuHistoryItem = {
  id: string;
  timestamp: string;
  description: string;
  menus: Menus;
};

const INITIAL_PROFILE: UserProfile = {
  goals: "健康維持と筋肥大",
  experience: "初心者〜中級者",
  limitations: "なし（痛みやケガなし）",
  preferences: "特になし",
  equipment: "ジムのフル器具",
  barbellStep: 2.5,
  dumbbellStep: 2,
  machineStep: 5
};

// -------------------------------------------------------------
// 初期モックデータ
// -------------------------------------------------------------
const INITIAL_MENUS: Menus = {
  "A": [
    { name: "ベンチプレス", weight: 40, reps: 10, sets: 3 },
    { name: "ショルダープレス", weight: 10, reps: 10, sets: 3 },
    { name: "サイドレイズ", weight: 5, reps: 12, sets: 3 }
  ],
  "B": [
    { name: "デッドリフト", weight: 50, reps: 8, sets: 3 },
    { name: "ラットプルダウン", weight: 30, reps: 10, sets: 3 },
    { name: "アームカール", weight: 8, reps: 12, sets: 3 }
  ],
  "C": [
    { name: "バーベルスクワット", weight: 50, reps: 10, sets: 3 },
    { name: "レッグプレス", weight: 80, reps: 12, sets: 3 },
    { name: "クランチ", weight: 0, reps: 15, sets: 3 }
  ]
};

export default function Home() {
  // --- 基本状態 ---
  const [activeTab, setActiveTab] = useState<"workouts" | "builder">("workouts");
  const [loading, setLoading] = useState(false);

  // --- APIキー管理 ---
  const [apiKey, setApiKey] = useState<string>("");
  const [inputApiKey, setInputApiKey] = useState<string>("");
  const [showKeyWarning, setShowKeyWarning] = useState(true);

  // --- ローカルストレージ連動状態 ---
  const [menus, setMenus] = useState<Menus>(INITIAL_MENUS);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [dateStates, setDateStates] = useState<DateStates>({});
  const [streak, setStreak] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile>(INITIAL_PROFILE);

  // --- Undo（元に戻す）用の状態 ---
  const [previousSchedule, setPreviousSchedule] = useState<ScheduleItem[] | null>(null);
  const [previousDateStates, setPreviousDateStates] = useState<DateStates | null>(null);
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  // --- カレンダー描画用状態 ---
  const [dates, setDates] = useState<Date[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string>("");
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [builderChatHistory, setBuilderChatHistory] = useState<{ role: string; parts: { text: string }[] }[]>([]);
  const [menuHistory, setMenuHistory] = useState<MenuHistoryItem[]>([]);
  const [lastTapInfo, setLastTapInfo] = useState<{ dateStr: string; time: number }>({ dateStr: "", time: 0 });

  // --- カレンダー月切り替えハンドラー ---
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDateStr(formatDate(today));
  };

  // --- 記録入力用状態 (選択した日のワークアウト実績) ---
  const [currentWorkoutName, setCurrentWorkoutName] = useState<string>("");
  const [exerciseRecords, setExerciseRecords] = useState<ExerciseRecord[]>([]);
  const [activeAdjustmentReason, setActiveAdjustmentReason] = useState<string>("");
  const [loadedDateStr, setLoadedDateStr] = useState<string>("");
  const [customAdjustmentNote, setCustomAdjustmentNote] = useState<string>("");

  // --- AI調整（体調・時間）のポップアップ用状態 ---
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [userCondition, setUserCondition] = useState<"normal" | "energetic" | "fatigued" | "joint_ache">("normal");
  const [userTimeLimit, setUserTimeLimit] = useState<"none" | "short">("none");

  // --- AIレスポンス・ポップアップ状態 ---
  const [aiFeedback, setAiFeedback] = useState<string>("");
  const [updatedExercisesProposal, setUpdatedExercisesProposal] = useState<any[]>([]);
  const [showProgressionModal, setShowProgressionModal] = useState(false);
  const [alternativeRequest, setAlternativeRequest] = useState<{ exerciseName: string; index: number } | null>(null);
  const [alternativesList, setAlternativesList] = useState<any[]>([]);
  
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isEditingPast, setIsEditingPast] = useState(false);
  const [scheduleInstruction, setScheduleInstruction] = useState("");
  const [progressionInstruction, setProgressionInstruction] = useState("");
  const [hasUnsavedDateChanges, setHasUnsavedDateChanges] = useState(false);
  
  // --- Tab 2: AIメニュー構築用の状態 ---
  const [aiRequestText, setAiRequestText] = useState("");
  const [builderAction, setBuilderAction] = useState<"create" | "improve" | "import" | "alternative">("improve");
  const [aiBuilderResponse, setAiBuilderResponse] = useState<string>("");

  // 手動編集用のテンポラリメニュー状態
  const [editableMenus, setEditableMenus] = useState<Menus>({});
  const [isEditingManual, setIsEditingManual] = useState(false);

  // 画面の回転やリサイズ時のレイアウト崩れ対策
  useEffect(() => {
    if (typeof window === "undefined") return;

    let resizeTimeout: NodeJS.Timeout;
    let savedScrollY = 0;
    let isLandscape = window.innerWidth > window.innerHeight;

    const handleResizeOrRotation = () => {
      const currentIsLandscape = window.innerWidth > window.innerHeight;

      // 縦画面から横画面へ切り替わる瞬間に、現在のスクロール位置を記憶する
      if (!isLandscape && currentIsLandscape) {
        savedScrollY = window.scrollY || document.documentElement.scrollTop;
      }
      isLandscape = currentIsLandscape;

      // CSS変数 --app-height の更新
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);

      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // 回転アニメーション完了後の高さを再適用
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);

        if (!currentIsLandscape) {
          // 縦画面に戻った際、保存していたスクロール位置に復元する
          window.scrollTo(0, savedScrollY);
          
          // 強制リフローによってブラウザの再レイアウトとスクロールバー表示を確定させる
          const originalOverflow = document.body.style.overflow;
          document.body.style.overflow = "hidden";
          document.body.offsetHeight; // reflowをトリガー
          document.body.style.overflow = originalOverflow;

          // リフロー後に再度スクロール位置を設定
          window.scrollTo(0, savedScrollY);
        }
      }, 150);
    };

    // 初期化時にもCSS変数をセット
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);

    window.addEventListener("resize", handleResizeOrRotation);
    window.addEventListener("orientationchange", handleResizeOrRotation);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResizeOrRotation);
      window.removeEventListener("orientationchange", handleResizeOrRotation);
    };
  }, []);

  // 1. 初期ロード
  useEffect(() => {
    if (typeof window !== "undefined") {
      // 旧 AuraFit から 新 Fitrum へのデータ移行
      const migrate = (oldKey: string, newKey: string) => {
        const val = localStorage.getItem(oldKey);
        if (val && !localStorage.getItem(newKey)) {
          localStorage.setItem(newKey, val);
        }
      };
      migrate("aurafit_api_key", "fitrum_api_key");
      migrate("aurafit_menus", "fitrum_menus");
      migrate("aurafit_schedule", "fitrum_schedule");
      migrate("aurafit_date_states", "fitrum_date_states");
      migrate("aurafit_streak", "fitrum_streak");
      migrate("aurafit_user_profile", "fitrum_user_profile");
      migrate("aurafit_menu_history", "fitrum_menu_history");

      const savedKey = localStorage.getItem("fitrum_api_key");
      const savedMenus = localStorage.getItem("fitrum_menus");
      const savedSchedule = localStorage.getItem("fitrum_schedule");
      const savedDateStates = localStorage.getItem("fitrum_date_states");
      const savedStreak = localStorage.getItem("fitrum_streak");
      const savedProfile = localStorage.getItem("fitrum_user_profile");
      const savedChatHistory = localStorage.getItem("fitrum_builder_chat_history");
      const savedMenuHistory = localStorage.getItem("fitrum_menu_history");

      let loadedMenus = INITIAL_MENUS;
      if (savedKey) {
        setApiKey(savedKey);
        setInputApiKey(savedKey);
        setShowKeyWarning(false);
      }
      
      try {
        if (savedMenus) {
          const parsed = JSON.parse(savedMenus);
          if (validateMenus(parsed)) {
            loadedMenus = parsed;
            setMenus(loadedMenus);
          } else {
            console.error("Loaded menus structure is invalid");
            alert("⚠️ 保存されている基本メニューデータが不完全です。破損防止のため、初期化を保留します。バックアップがある場合は復元してください。");
          }
        }
      } catch (e) {
        console.error("Failed to parse savedMenus, preserving corrupted data...", e);
        localStorage.setItem("fitrum_corrupted_menus", savedMenus || "");
        alert("⚠️ 基本メニューデータの読み込みに失敗しました。データを退避用キー（fitrum_corrupted_menus）にコピーしました。");
      }
      
      try {
        setEditableMenus(JSON.parse(JSON.stringify(loadedMenus)));
      } catch (e) {
        console.error("Failed to clone loadedMenus", e);
        setEditableMenus(JSON.parse(JSON.stringify(INITIAL_MENUS)));
      }

      try {
        if (savedSchedule) setSchedule(JSON.parse(savedSchedule));
      } catch (e) {
        console.error("Failed to parse savedSchedule, preserving corrupted data...", e);
        localStorage.setItem("fitrum_corrupted_schedule", savedSchedule || "");
        alert("⚠️ スケジュール（実績含む）データの読み込みに失敗しました。データを退避用キー（fitrum_corrupted_schedule）にコピーしました。");
      }

      try {
        if (savedDateStates) setDateStates(JSON.parse(savedDateStates));
      } catch (e) {
        console.error("Failed to parse savedDateStates, preserving corrupted data...", e);
        localStorage.setItem("fitrum_corrupted_date_states", savedDateStates || "");
        alert("⚠️ 日程設定データの読み込みに失敗しました。データを退避用キー（fitrum_corrupted_date_states）にコピーしました。");
      }

      if (savedStreak) {
        const val = parseInt(savedStreak, 10);
        if (!isNaN(val)) setStreak(val);
      }

      try {
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile);
          if (parsed.barbellStep === undefined) parsed.barbellStep = 2.5;
          if (parsed.dumbbellStep === undefined) parsed.dumbbellStep = 2;
          if (parsed.machineStep === undefined) parsed.machineStep = 5;
          setUserProfile(parsed);
        }
      } catch (e) {
        console.error("Failed to parse savedProfile, preserving corrupted data...", e);
        localStorage.setItem("fitrum_corrupted_user_profile", savedProfile || "");
        alert("⚠️ ユーザーカルテデータの読み込みに失敗しました。データを退避用キー（fitrum_corrupted_user_profile）にコピーしました。");
      }

      try {
        if (savedChatHistory) setBuilderChatHistory(JSON.parse(savedChatHistory));
      } catch (e) {
        console.error("Failed to parse savedChatHistory, preserving corrupted data...", e);
        localStorage.setItem("fitrum_corrupted_builder_chat_history", savedChatHistory || "");
      }

      try {
        if (savedMenuHistory) setMenuHistory(JSON.parse(savedMenuHistory));
      } catch (e) {
        console.error("Failed to parse savedMenuHistory, preserving corrupted data...", e);
        localStorage.setItem("fitrum_corrupted_menu_history", savedMenuHistory || "");
      }

      const today = new Date();
      setSelectedDateStr(formatDate(today));
    }
  }, []);

  // カレンダー描画用日付の動的更新（無制限カレンダー対応）
  useEffect(() => {
    const days = [];
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(currentYear, currentMonth, i));
    }
    setDates(days);
  }, [currentYear, currentMonth]);
  // APIキーの保存
  const handleSaveApiKey = () => {
    if (!inputApiKey.trim()) {
      alert("有効なAPIキーを入力してください。");
      return;
    }
    setApiKey(inputApiKey.trim());
    localStorage.setItem("fitrum_api_key", inputApiKey.trim());
    setShowKeyWarning(false);
    alert("Gemini APIキーをLocalStorageに保存しました！");
  };

  // 状態の変更をLocalStorageに反映するヘルパー
  const saveToLocalStorage = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // 全データのバックアップをJSONファイルとしてエクスポート
  const exportData = () => {
    try {
      const backupData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        menus: localStorage.getItem("fitrum_menus") ? JSON.parse(localStorage.getItem("fitrum_menus")!) : INITIAL_MENUS,
        schedule: localStorage.getItem("fitrum_schedule") ? JSON.parse(localStorage.getItem("fitrum_schedule")!) : [],
        dateStates: localStorage.getItem("fitrum_date_states") ? JSON.parse(localStorage.getItem("fitrum_date_states")!) : {},
        streak: localStorage.getItem("fitrum_streak") ? JSON.parse(localStorage.getItem("fitrum_streak")!) : 0,
        userProfile: localStorage.getItem("fitrum_user_profile") ? JSON.parse(localStorage.getItem("fitrum_user_profile")!) : INITIAL_PROFILE,
        menuHistory: localStorage.getItem("fitrum_menu_history") ? JSON.parse(localStorage.getItem("fitrum_menu_history")!) : []
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const yyyymmdd = formatDate(new Date()).replace(/-/g, "");
      a.href = url;
      a.download = `fitrum_backup_${yyyymmdd}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`エクスポート中にエラーが発生しました。\n詳細: ${e.message || e}`);
    }
  };

  // JSONバックアップファイルからデータを復元
  const importData = (file: File) => {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const backupData = JSON.parse(text);
        
        // 簡単なフォーマットバリデーション
        if (!backupData || typeof backupData !== "object" || !backupData.menus || !backupData.schedule) {
          alert("無効なバックアップファイルです。正しいJSONファイルを選択してください。");
          return;
        }

        if (!confirm("データを復元しますか？\n現在のデータは上書きされ、復元されたデータに置き換わります。")) {
          return;
        }

        // LocalStorageに保存
        saveToLocalStorage("fitrum_menus", backupData.menus);
        saveToLocalStorage("fitrum_schedule", backupData.schedule);
        saveToLocalStorage("fitrum_date_states", backupData.dateStates || {});
        saveToLocalStorage("fitrum_streak", backupData.streak || 0);
        saveToLocalStorage("fitrum_user_profile", backupData.userProfile || INITIAL_PROFILE);
        if (backupData.menuHistory) {
          saveToLocalStorage("fitrum_menu_history", backupData.menuHistory);
        }

        // 状態を更新
        setMenus(backupData.menus);
        setSchedule(backupData.schedule);
        setDateStates(backupData.dateStates || {});
        setStreak(backupData.streak || 0);
        setUserProfile(backupData.userProfile || INITIAL_PROFILE);
        if (backupData.menuHistory) {
          setMenuHistory(backupData.menuHistory);
        }

        alert("データの復元が完了しました！");
      } catch (err: any) {
        alert(`復元中にエラーが発生しました。\n詳細: ${err.message || err}`);
      }
    };
    reader.readAsText(file);
  };

  // 基本メニュー（Menus）の妥当性をチェックするバリデーション
  const validateMenus = (testMenus: any): boolean => {
    if (!testMenus || typeof testMenus !== "object" || Array.isArray(testMenus)) {
      return false;
    }
    const keys = Object.keys(testMenus);
    if (keys.length === 0) {
      return false;
    }
    for (const key of keys) {
      const list = testMenus[key];
      if (!Array.isArray(list)) {
        return false;
      }
      if (list.length === 0) {
        return false; // 空のルーティンは無効
      }
      for (const ex of list) {
        if (!ex || typeof ex !== "object" || !ex.name || typeof ex.name !== "string") {
          return false;
        }
      }
    }
    return true;
  };

  // メニュー変更履歴を保存するヘルパー
  const saveMenuToHistory = (description: string, targetMenus: Menus) => {
    const now = new Date();
    const timestamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newItem: MenuHistoryItem = {
      id,
      timestamp,
      description,
      menus: JSON.parse(JSON.stringify(targetMenus))
    };
    
    // 直近10件のみ保持
    setMenuHistory(prev => {
      const updated = [newItem, ...prev].slice(0, 10);
      localStorage.setItem("fitrum_menu_history", JSON.stringify(updated));
      return updated;
    });
  };

  // メニューのロールバックを実行する処理
  const rollbackMenu = (historyId: string) => {
    const targetItem = menuHistory.find(item => item.id === historyId);
    if (!targetItem) {
      alert("該当する履歴データが見つかりません。");
      return;
    }

    if (confirm(`【${targetItem.timestamp}】時点のメニューに復元しますか？\n（現在の基本メニューは履歴にバックアップ保存されたあと上書きされます）`)) {
      // 復元前に現在のメニューをバックアップ保存
      saveMenuToHistory(`復元前のバックアップ (${targetItem.timestamp})`, menus);

      const restoredMenus = JSON.parse(JSON.stringify(targetItem.menus));
      setMenus(restoredMenus);
      setEditableMenus(JSON.parse(JSON.stringify(restoredMenus)));
      saveToLocalStorage("fitrum_menus", restoredMenus);
      
      alert("基本メニューを復元しました！");
    }
  };

  // 日付フォーマットヘルパー
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ストリーク（連続記録）を今日から過去に向かって動的に再計算するヘルパー
  const recalculateStreak = (targetSchedule: ScheduleItem[], targetDateStates: DateStates = dateStates) => {
    let currentStreak = 0;
    const today = new Date();
    
    // 今日から過去365日間を走査
    for (let i = 0; i < 365; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);
      const dateStr = formatDate(targetDate);
      
      const item = targetSchedule.find(s => s.date === dateStr);
      if (item && item.completed) {
        currentStreak++;
      } else {
        const state = targetDateStates[dateStr] || "DEFAULT";
        const hasUncompletedWorkout = item && item.workoutName && !item.completed;
        const isMissedGoDay = state === "CONFIRMED_GO" && (!item || !item.completed);

        if (hasUncompletedWorkout || isMissedGoDay) {
          break;
        }
      }
    }
    return currentStreak;
  };

  // Undo用バックアップ作成
  const backupScheduleForUndo = (currentStates: DateStates) => {
    setPreviousSchedule(JSON.parse(JSON.stringify(schedule)));
    setPreviousDateStates(JSON.parse(JSON.stringify(currentStates)));
    setShowUndoBanner(true);
  };

  // Undo実行
  const undoLastSlide = () => {
    if (previousSchedule) {
      setSchedule(previousSchedule);
      saveToLocalStorage("fitrum_schedule", previousSchedule);
    }
    if (previousDateStates) {
      setDateStates(previousDateStates);
      saveToLocalStorage("fitrum_date_states", previousDateStates);
    }
    setPreviousSchedule(null);
    setPreviousDateStates(null);
    setShowUndoBanner(false);
  };

  // 今日より前の未消化予定（scheduleレコードがあり、completedがfalseで予定名がある）の数をカウント
  const getPastUncompletedCount = () => {
    if (typeof window === "undefined") return 0;
    const todayStr = formatDate(new Date());
    return schedule.filter(item => item.date < todayStr && !item.completed && item.workoutName).length;
  };

  // 過去の未完了予定をすべてオフ（❌）にしてスケジュールから消去
  const clearPastUncompletedWorkouts = () => {
    const pastUncompletedItems = schedule.filter(item => {
      const todayStr = formatDate(new Date());
      return item.date < todayStr && !item.completed && item.workoutName;
    });

    if (pastUncompletedItems.length === 0) return;

    const count = pastUncompletedItems.length;
    if (!confirm(`今日より前の未消化の予定が ${count} 件あります。\nこれらをすべて「オフ(❌)」にしてスケジュールを整理しますか？`)) {
      return;
    }

    const todayStr = formatDate(new Date());

    // 1. dateStates を更新（過去の未完了日を CONFIRMED_NO に変更）
    const updatedDateStates = { ...dateStates };
    pastUncompletedItems.forEach(item => {
      updatedDateStates[item.date] = "CONFIRMED_NO";
    });
    setDateStates(updatedDateStates);
    saveToLocalStorage("fitrum_date_states", updatedDateStates);

    // 2. schedule から未完了の過去予定を削除
    const updatedSchedule = schedule.filter(item => {
      const isPastUncompleted = item.date < todayStr && !item.completed && item.workoutName;
      return !isPastUncompleted;
    });
    setSchedule(updatedSchedule);
    saveToLocalStorage("fitrum_schedule", updatedSchedule);

    // 3. 変更ありフラグを立てて、ユーザーにAIスケジュール構築を促す
    setHasUnsavedDateChanges(true);
    alert("過去の未消化予定をすべて「オフ」にしました。\n「AIスケジュール構築」ボタンを押して未来のスケジュールを再編成してください。");
  };

  // 特定の日付の状態を直接設定する
  const setSpecificDateState = (dateStr: string, next: DateState) => {
    const newStates = { ...dateStates, [dateStr]: next };
    
    setDateStates(newStates);
    saveToLocalStorage("fitrum_date_states", newStates);

    // 自動でのAI再考は行わず、未反映フラグを立てる
    setHasUnsavedDateChanges(true);
  };

  // 日付状態トグル
  const toggleDateState = (dateStr: string) => {
    const current = dateStates[dateStr] || "DEFAULT";
    let next: DateState = "DEFAULT";
    if (current === "DEFAULT") next = "CONFIRMED_GO";
    else if (current === "CONFIRMED_GO") next = "CONFIRMED_NO";
    else if (current === "CONFIRMED_NO") next = "MAYBE";
    else if (current === "MAYBE") next = "DEFAULT";

    setSpecificDateState(dateStr, next);
  };

  // カレンダー日付クリックハンドラー（シングルタップで選択、ダブルタップで全ステータス循環トグル）
  const handleDayClick = (dateStr: string) => {
    const now = Date.now();
    const isDoubleTap = lastTapInfo.dateStr === dateStr && (now - lastTapInfo.time) < 300;

    if (isDoubleTap) {
      toggleDateState(dateStr);
      setLastTapInfo({ dateStr: "", time: 0 });
    } else {
      setSelectedDateStr(dateStr);
      setLastTapInfo({ dateStr, time: now });
    }
  };

  const getUserProfileContext = () => {
    return `
【ユーザーカルテ（過去チャット引き継ぎコンテキスト）】
- 筋トレ目標: ${userProfile.goals}
- 経験・現在の頻度: ${userProfile.experience}
- ケガ・身体の制限・注意点: ${userProfile.limitations}
- トレーニングの好み・スタイル: ${userProfile.preferences}
- 使用可能器具: ${userProfile.equipment}
`;
  };

  // -------------------------------------------------------------
  // クライアントサイドでの Gemini API 呼び出し
  // -------------------------------------------------------------
  const getAiInstance = () => {
    if (!apiKey) {
      alert("AI機能を使用するにはGemini APIキーを設定してください。");
      throw new Error("APIキーがありません");
    }
    return new GoogleGenAI({ apiKey });
  };

  // 3. AIスケジュール構築 (Tab 1)
  const buildScheduleWithAI = async (
    targetMenus: Menus = menus,
    targetSchedule: ScheduleItem[] = schedule,
    targetDateStates: DateStates = dateStates
  ) => {
    if (!apiKey) {
      alert("AIスケジュール構築にはAPIキーの設定が必要です。");
      return;
    }
    setLoading(true);
    try {
      const ai = getAiInstance();
      const today = new Date();
      const end = new Date();
      end.setDate(today.getDate() + 29);

      // 前後30日の範囲を設定してフィルタリング（文字列比較でタイムゾーン依存バグを防止）
      const todayStr = formatDate(today);
      const rangeStart = new Date(today);
      rangeStart.setDate(today.getDate() - 30);
      const rangeStartStr = formatDate(rangeStart);
      const rangeEnd = new Date(today);
      rangeEnd.setDate(today.getDate() + 30);
      const rangeEndStr = formatDate(rangeEnd);

      const filterByRange = (dateStr: string) => {
        return dateStr >= rangeStartStr && dateStr <= rangeEndStr;
      };

      const filterFutureOnly = (dateStr: string) => {
        return dateStr >= todayStr && dateStr <= rangeEndStr;
      };

      const confirmedDays = Object.keys(targetDateStates)
        .filter(k => targetDateStates[k] === "CONFIRMED_GO" && filterFutureOnly(k));
      const maybeDays = Object.keys(targetDateStates)
        .filter(k => targetDateStates[k] === "MAYBE" && filterFutureOnly(k));
      const noDays = Object.keys(targetDateStates)
        .filter(k => targetDateStates[k] === "CONFIRMED_NO" && filterFutureOnly(k));

      if (confirmedDays.length === 0 && maybeDays.length === 0) {
        alert("カレンダー上で「👌行ける」または「❓微妙」の日を1日以上設定してから実行してください。");
        setLoading(false);
        return;
      }

      const routineKeys = Object.keys(targetMenus);

      // 直近の完了メニューを特定するロジック（A, B, C...のローテーションバトン引き継ぎ用）
      let lastCompletedWorkout = "";
      const sortedCompletedItems = [...targetSchedule]
        .filter(item => item.completed && item.workoutName)
        .sort((a, b) => b.date.localeCompare(a.date)); // 直近順

      if (sortedCompletedItems.length > 0) {
        const match = sortedCompletedItems.find(item => routineKeys.includes(item.workoutName));
        if (match) {
          lastCompletedWorkout = match.workoutName;
        }
      }
      if (!lastCompletedWorkout) {
        lastCompletedWorkout = routineKeys[0] || "A";
      }

      const prompt = `
あなたの役割は、科学的なエビデンス（運動生理学・スポーツ科学）に基づく一流のパーソナルトレーナーです。
ユーザーが指定した日程に対して、登録された「基本メニュー」のルーティン（A, B, Cなど）をカレンダーへ最適に配置してください。

${getUserProfileContext()}

【ユーザーデータ】
- 確定している行ける日 (confirmedDays): ${JSON.stringify(confirmedDays)}
- 行けるかもしれない微妙な日 (maybeDays): ${JSON.stringify(maybeDays)}
- 絶対に行けないオフ日 (noDays): ${JSON.stringify(noDays)}
- 基本メニューのルーティン名: [${routineKeys.join(", ")}]
- 直近で完了した基本メニュー: "${lastCompletedWorkout}"
- 開始日: ${formatDate(today)}
- 終了日: ${formatDate(end)} (開始日から1ヶ月後)

【スケジュール配置ルール】
1. ユーザーが設定した「確定している行ける日 (confirmedDays)」および「行けるかもしれない微妙な日 (maybeDays)」にのみトレーニングを配置してください。未定の日やオフの日には一切配置しないでください。
2. 直近で完了した基本メニューの「次のメニュー（例: 直近がAならB）」から開始し、ルーティンの順序（例: A ➔ B ➔ C ➔ A...）を崩さずに日付順に割り当ててください。
3. 筋肉の回復を最優先するため、同じメニュー（同じアルファベット、例: AとA、BとB、CとC）の間は、必ず中2日以上（中48〜72時間以上）の間隔を空けて配置してください。
   - 例：月曜日に「A」を配置した場合、次の「A」は木曜日以降にしか配置できません（火曜日と水曜日の間はAを配置できません）。
   - もし、次に配置すべきメニューが間隔ルール（中2日）を満たせない場合は、その日には配置を行わず（空欄にしてスキップ）、次の👌/❓の日にスライドして配置してください。
4. 必ず今日（開始日）以降の日程のみに配置し、過去の日付には一切配置しないでください。
${scheduleInstruction.trim() ? `
【ユーザーからの追加指示（最優先指示事項）】
- "${scheduleInstruction.trim()}"
- このユーザーからの指示は、他の「スケジュール配置ルール」よりも最優先で反映させてください。
- 指示によって「ルール2（ローテーション順序）」や「ルール3（中2日の間隔）」に一部の例外（順序の前後や中1日の間隔になるなど）が発生したとしても、指定された日程のメニュー配置を最優先してください。ただし、同一メニューが連日（二日連続など）配置されることだけは、回復を考慮して避けてください。
` : ""}

以下のJSONフォーマットで回答してください。余計な説明テキストは一切含めず、純粋なJSONのみを返してください。

【出力フォーマット】
{
  "schedule": [
    {
      "date": "YYYY-MM-DD",
      "workoutName": "A",
      "isTemp": true
    }
  ]
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "あなたはJSONフォーマットでスケジュールデータのみを返却する筋トレ支援APIです。",
          temperature: 0.0,
        },
      });

      let data;
      try {
        data = JSON.parse(response.text || "{}");
        console.log("AI Response Schedule data:", data);
      } catch (parseErr: any) {
        console.error("JSON Parse Error. Raw text:", response.text, parseErr);
        alert(`AIからのデータ解析に失敗しました。\n詳細: ${parseErr.message}\n生データ: ${response.text?.substring(0, 150)}`);
        setLoading(false);
        return;
      }

      if (data.schedule) {
        // AI提案の日程と既存の日程を安全にマージする
        const aiProposal: ScheduleItem[] = data.schedule;

        // 保護対象（期間外のもの、過去のもの、完了済み、入力中、またはカスタム調整済みのもの）を抽出
        const preservedSchedule = targetSchedule.filter(item => {
          const isInRange = filterByRange(item.date);
          
          if (!isInRange) return true;
          if (item.date < todayStr) return true; // 過去日付を保護
          if (item.completed) return true;       // 完了済みを保護

          // 入力中の一時保存データ（オートセーブ）がある日を保護
          const tempKey = `fitrum_temp_exercise_records_${item.date}_${item.workoutName}`;
          const hasTempData = typeof window !== "undefined" && localStorage.getItem(tempKey) !== null;
          if (hasTempData) return true;

          // AI体調調整や手動種目追加などのカスタム種目設定がある日を保護
          if (item.customExercises && item.customExercises.length > 0) return true;

          return false;
        });

        // AI提案の中で、保護対象（完了、一時保存あり、カスタム調整あり）とバッティングしないものを抽出し、バリデーションを行う
        const filteredAiProposal = aiProposal
          .filter(aiItem => {
            if (!aiItem.date || isNaN(Date.parse(aiItem.date))) return false;
            const standardizedDate = formatDate(new Date(aiItem.date));
            
            // 保護対象（完了済み、一時保存データあり、カスタム種目あり）の日程と被っているかチェック
            const isPreserved = targetSchedule.some(item => {
              if (item.date !== standardizedDate) return false;
              if (item.completed) return true;
              
              const tempKey = `fitrum_temp_exercise_records_${item.date}_${item.workoutName}`;
              const hasTempData = typeof window !== "undefined" && localStorage.getItem(tempKey) !== null;
              if (hasTempData) return true;
              
              if (item.customExercises && item.customExercises.length > 0) return true;
              
              return false;
            });

            if (standardizedDate < todayStr) return false; // 今日以降の提案のみに限定
            return !isPreserved;
          })
          .map(aiItem => {
            const standardizedDate = formatDate(new Date(aiItem.date));
            return {
              ...aiItem,
              date: standardizedDate,
              customExercises: undefined // シンプル設計では全身法カスタム種目は不要
            };
          });

        // マージして日付順にソート
        const mergedSchedule = [...preservedSchedule, ...filteredAiProposal];
        mergedSchedule.sort((a, b) => a.date.localeCompare(b.date));

        setSchedule(mergedSchedule);
        saveToLocalStorage("fitrum_schedule", mergedSchedule);
        setHasUnsavedDateChanges(false);
      }
    } catch (err: any) {
      console.error(err);
      alert(`AIスケジュールの構築に失敗しました。\n詳細: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // 日付の変更時に過去編集モードを自動的に解除する
  useEffect(() => {
    setIsEditingPast(false);
  }, [selectedDateStr]);

  // 4. 今日のワークアウト記録の初期化
  useEffect(() => {
    if (!selectedDateStr) return;
    // 過去編集モード中は、schedule変更による再初期化をスキップする
    // （completeWorkout保存直後にuseEffectが再発火して修正データが消えるのを防止）
    if (isEditingPast) return;

    const scheduled = schedule.find(item => item.date === selectedDateStr);
    
    // 一時保存データのチェックと復元（日付＋メニュー名に依存するキーを使用）
    const tempKey = scheduled ? `fitrum_temp_exercise_records_${selectedDateStr}_${scheduled.workoutName}` : "";
    let tempRecordsStr = tempKey ? localStorage.getItem(tempKey) : null;

    // 旧キー（日付のみ）からのマイグレーション
    if (!tempRecordsStr && tempKey) {
      const oldDateKey = `fitrum_temp_exercise_records_${selectedDateStr}`;
      const oldData = localStorage.getItem(oldDateKey);
      if (oldData) {
        tempRecordsStr = oldData;
        localStorage.setItem(tempKey, oldData);
        localStorage.removeItem(oldDateKey);
      }
    }

    // さらに古いキー（日付なし）からのマイグレーション
    if (!tempRecordsStr && tempKey) {
      const oldestKey = "fitrum_temp_exercise_records";
      const oldestDateKey = "fitrum_temp_exercise_records_date";
      const oldestDate = localStorage.getItem(oldestDateKey);
      if (oldestDate === selectedDateStr) {
        const oldestData = localStorage.getItem(oldestKey);
        if (oldestData) {
          tempRecordsStr = oldestData;
          localStorage.setItem(tempKey, oldestData);
          localStorage.removeItem(oldestKey);
          localStorage.removeItem(oldestDateKey);
        }
      }
    }

    if (tempRecordsStr && (!scheduled || !scheduled.completed)) {
      try {
        const parsed = JSON.parse(tempRecordsStr);
        if (parsed && parsed.length > 0) {
          if (scheduled) {
            setCurrentWorkoutName(scheduled.workoutName);
            setActiveAdjustmentReason(scheduled.adjustmentReason || "");
          }
          setExerciseRecords(parsed);
          setLoadedDateStr(selectedDateStr); // 読み込み完了日付を記録
          return; // 一時データから復元した場合は以降の通常初期化をスキップ
        }
      } catch (e) {
        console.error("Failed to parse tempRecords", e);
      }
    }

    if (scheduled && !scheduled.completed) {
      setCurrentWorkoutName(scheduled.workoutName);
      
      const exerciseList = scheduled.customExercises || menus[scheduled.workoutName] || [];
      setActiveAdjustmentReason(scheduled.adjustmentReason || "");

      const records: ExerciseRecord[] = exerciseList.map(ex => ({
        name: ex.name,
        targetWeight: ex.weight,
        targetReps: ex.reps,
        targetSets: ex.sets,
        sets: Array.from({ length: ex.sets }).map(() => ({
          weight: ex.weight,
          reps: ex.reps,
          completed: false
        }))
      }));
      setExerciseRecords(records);
    } else if (scheduled && scheduled.completed) {
      setCurrentWorkoutName(scheduled.workoutName + " (実施済み)");
      setActiveAdjustmentReason(scheduled.adjustmentReason || "");
      
      // 過去の実績履歴があればそれを復元表示する
      if (scheduled.completedExercises && scheduled.completedExercises.length > 0) {
        setExerciseRecords(scheduled.completedExercises);
      } else {
        // バックプレフィル：詳細実績が保存されていない過去データの場合のフォールバック
        const exerciseList = scheduled.customExercises || menus[scheduled.workoutName] || [];
        const fallbackRecords: ExerciseRecord[] = exerciseList.map(ex => ({
          name: ex.name,
          targetWeight: ex.weight,
          targetReps: ex.reps,
          targetSets: ex.sets,
          sets: Array.from({ length: ex.sets }).map(() => ({
            weight: ex.weight,
            reps: ex.reps,
            completed: true
          }))
        }));
        setExerciseRecords(fallbackRecords);
      }
    } else {
      setCurrentWorkoutName("");
      setExerciseRecords([]);
      setActiveAdjustmentReason("");
    }
    setLoadedDateStr(selectedDateStr); // 初期化完了日付を記録
  }, [selectedDateStr, schedule, menus, isEditingPast]);

  // 実績入力中の一時保存（タスクキル・リロード対策）
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 日付切り替え時に古いデータが新しい日付に誤って一時保存されるのを防ぐガード
    if (!selectedDateStr || selectedDateStr !== loadedDateStr) return;
    
    const scheduled = schedule.find(item => item.date === selectedDateStr);
    if (!scheduled) return; // 予定がない日は一時保存しない
    
    const isCompleted = scheduled.completed;
    const tempKey = `fitrum_temp_exercise_records_${selectedDateStr}_${scheduled.workoutName}`;
    
    if (exerciseRecords.length > 0 && !isCompleted && !isEditingPast) {
      localStorage.setItem(tempKey, JSON.stringify(exerciseRecords));
    } else if (isCompleted || isEditingPast) {
      // 完了済みまたは過去編集モードの場合は一時保存をクリーンアップ
      localStorage.removeItem(tempKey);
    }
  }, [exerciseRecords, selectedDateStr, schedule, isEditingPast, loadedDateStr]);

  // 実績入力値の変更ハンドラー
  const handleSetChange = (exIndex: number, setIndex: number, field: "weight" | "reps", value: number) => {
    const updated = [...exerciseRecords];
    if (field === "weight") {
      updated[exIndex].sets[setIndex].weight = Math.max(0, value);
    } else {
      updated[exIndex].sets[setIndex].reps = Math.max(0, value);
    }
    setExerciseRecords(updated);
  };

  // セットのチェックトグル
  const toggleSetComplete = (exIndex: number, setIndex: number) => {
    const updated = [...exerciseRecords];
    updated[exIndex].sets[setIndex].completed = !updated[exIndex].sets[setIndex].completed;
    setExerciseRecords(updated);
  };

  // セット数の追加
  const addNewSet = (exIndex: number) => {
    const updated = [...exerciseRecords];
    const ex = updated[exIndex];
    const lastSet = ex.sets[ex.sets.length - 1];
    
    const newSet = {
      weight: lastSet ? lastSet.weight : ex.targetWeight,
      reps: lastSet ? lastSet.reps : ex.targetReps,
      completed: false
    };
    
    ex.sets = [...ex.sets, newSet];
    setExerciseRecords(updated);
  };

  // セット数の削減
  const deleteLastSet = (exIndex: number) => {
    const updated = [...exerciseRecords];
    const ex = updated[exIndex];
    if (ex.sets.length <= 1) return; // 1セット未満にはしない
    
    ex.sets = ex.sets.slice(0, -1);
    setExerciseRecords(updated);
  };

  // 5. トレーニング完了とワンストップ重量更新
  const completeWorkout = async () => {
    const isSelectedDateCompleted = schedule.some(item => item.date === selectedDateStr && item.completed);
    if (isSelectedDateCompleted && !isEditingPast) {
      alert("この日のトレーニングはすでに完了しているため、変更できません。");
      return;
    }

    const hasAnyCompleted = exerciseRecords.some(ex => ex.sets.some(s => s.completed));
    if (!hasAnyCompleted) {
      alert("少なくとも1セット以上完了のチェックを入れてください。");
      return;
    }

    const todayStr = formatDate(new Date());
    const isPastDate = selectedDateStr < todayStr;
    
    if (isPastDate) {
      // 過去日付の場合はAIプロンプトをスキップして直接完了保存
      setLoading(true);
      setTimeout(() => {
        try {
          const updatedSchedule = schedule.map(item => {
            if (item.date === selectedDateStr) {
              return { 
                ...item, 
                completed: true,
                completedExercises: JSON.parse(JSON.stringify(exerciseRecords))
              };
            }
            return item;
          });
          setSchedule(updatedSchedule);
          saveToLocalStorage("fitrum_schedule", updatedSchedule);

          // 過去実績変更による Streak の再計算と適用
          const newStreak = recalculateStreak(updatedSchedule, dateStates);
          setStreak(newStreak);
          saveToLocalStorage("fitrum_streak", newStreak);

          setIsEditingPast(false);
          setLoading(false);
          const pastScheduled = updatedSchedule.find(item => item.date === selectedDateStr);
          if (pastScheduled) {
            localStorage.removeItem(`fitrum_temp_exercise_records_${selectedDateStr}_${pastScheduled.workoutName}`);
          }
          setProgressionInstruction("");
          alert(`過去の実績として登録・保存しました！\n連続記録: 🔥 ${newStreak}日`);

          // 未来の予定の自動再構築 (バトンローテーションの更新に対応)
          buildScheduleWithAI(menus, updatedSchedule);
        } catch (e) {
          console.error(e);
          setLoading(false);
          alert("過去実績の保存中にエラーが発生しました。");
        }
      }, 300);
      return;
    }

    setLoading(true);
    try {
      const ai = getAiInstance();
      const pureWorkoutName = currentWorkoutName.replace(" (実施済み)", "").split(" ")[0];
      const baseExercises = menus[pureWorkoutName] || [];

      const prompt = `
ユーザーの今日の実績を分析し、次回の「基本メニュー」の目標重量・回数・セット数を決定し、褒め言葉を生成してください。
今回は「その日限りの調整メニュー」で実施した可能性がありますが、提案は「基本メニューの更新」に対して行ってください。

${getUserProfileContext()}

【基本メニューの設定】
${JSON.stringify(baseExercises, null, 2)}

【今日の実績（調整適用後）】
実績:
${JSON.stringify(exerciseRecords, null, 2)}

【重量設定ルール】
- 実施した各セットにおいて、基本メニューの目標重量・回数をクリアしている場合 ➔ 次回増量。
- 疲労による調整などでセット数や重量を減らしていた場合は、維持を推奨してください。
- 重量（targetWeight）を提案する際は、ユーザーが設定した以下の器具カテゴリ別の最小調整単位の倍数で設定してください。中途半端な端数（例: 5kg刻みなら50, 55など。2.5kg刻みなら52.5, 55など）は絶対に避けてください。
  - バーベル系種目: ${userProfile.barbellStep || 2.5}kg の倍数
  - ダンベル系種目: ${userProfile.dumbbellStep || 2}kg の倍数
  - マシン系種目: ${userProfile.machineStep || 5}kg の倍数

${progressionInstruction ? `【ユーザーからの次回への追加要望・指示】\n"${progressionInstruction}"\n※このユーザーからの指示を重量更新や回数・セット数の決定に最大限優先・反映させてください。` : ""}

【出力フォーマット】
{
  "updatedExercises": [
    {
      "name": "種目名",
      "targetWeight": 62.5,
      "targetReps": 10,
      "targetSets": 3
    }
  ],
  "feedback": "Geminiからの熱い褒めメッセージ(150文字程度)"
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "実績データから基本メニューの次回目標と褒め言葉のJSONを作成するトレーナーAPIです。",
        },
      });

      const data = JSON.parse(response.text || "{}");
      setAiFeedback(data.feedback);
      setUpdatedExercisesProposal(data.updatedExercises || []);
      setShowProgressionModal(true);
    } catch (err: any) {
      console.error(err);
      alert(`AIフィードバックの取得に失敗しました。\n詳細: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // AIによる重量更新と完了の確定適用
  const applyProgressionAndSave = () => {
    const updatedSchedule = schedule.map(item => {
      if (item.date === selectedDateStr) {
        return { 
          ...item, 
          completed: true,
          completedExercises: JSON.parse(JSON.stringify(exerciseRecords))
        };
      }
      return item;
    });
    setSchedule(updatedSchedule);
    saveToLocalStorage("fitrum_schedule", updatedSchedule);
    const progressionScheduled = updatedSchedule.find(item => item.date === selectedDateStr);
    if (progressionScheduled) {
      localStorage.removeItem(`fitrum_temp_exercise_records_${selectedDateStr}_${progressionScheduled.workoutName}`);
    }
    setProgressionInstruction("");

    let finalMenus = menus;
    if (updatedExercisesProposal.length > 0) {
      const updatedMenus = { ...menus };
      let anyUpdated = false;

      Object.keys(updatedMenus).forEach(groupKey => {
        updatedMenus[groupKey] = updatedMenus[groupKey].map(ex => {
          const proposal = updatedExercisesProposal.find(p => p.name === ex.name);
          if (proposal) {
            anyUpdated = true;
            return {
              ...ex,
              weight: typeof proposal.targetWeight === 'number' ? proposal.targetWeight : ex.weight,
              reps: typeof proposal.targetReps === 'number' ? proposal.targetReps : ex.reps,
              sets: typeof proposal.targetSets === 'number' ? proposal.targetSets : ex.sets
            };
          }
          return ex;
        });
      });

      if (anyUpdated) {
        finalMenus = updatedMenus;
        setMenus(updatedMenus);
        setEditableMenus(JSON.parse(JSON.stringify(updatedMenus)));
        saveToLocalStorage("fitrum_menus", updatedMenus);
        saveMenuToHistory("重量更新（全ルーティン伝播）", updatedMenus);
      }
    }

    const newStreak = streak + 1;
    setStreak(newStreak);
    saveToLocalStorage("fitrum_streak", newStreak);
    setShowProgressionModal(false);

    // 未来の予定の自動再構築
    buildScheduleWithAI(finalMenus, updatedSchedule);
  };

  // 当日限定：種目の新規追加
  const addManualExercise = () => {
    const isSelectedDateCompleted = schedule.some(item => item.date === selectedDateStr && item.completed);
    if (isSelectedDateCompleted && !isEditingPast) {
      alert("この日のトレーニングはすでに完了しているため、変更できません。");
      return;
    }

    const newEx = {
      name: "新しい種目",
      targetWeight: 10,
      targetReps: 10,
      targetSets: 3,
      sets: [
        { weight: 10, reps: 10, completed: false },
        { weight: 10, reps: 10, completed: false },
        { weight: 10, reps: 10, completed: false }
      ]
    };

    const updatedRecords = [...exerciseRecords, newEx];
    setExerciseRecords(updatedRecords);

    // schedule の customExercises も同期更新
    updateScheduleCustomExercises(updatedRecords);
  };

  // 当日限定：種目の削除
  const deleteManualExercise = (index: number) => {
    const isSelectedDateCompleted = schedule.some(item => item.date === selectedDateStr && item.completed);
    if (isSelectedDateCompleted && !isEditingPast) {
      alert("この日のトレーニングはすでに完了しているため、変更できません。");
      return;
    }

    const updatedRecords = exerciseRecords.filter((_, idx) => idx !== index);
    setExerciseRecords(updatedRecords);

    // schedule の customExercises も同期更新
    updateScheduleCustomExercises(updatedRecords);
  };

  // 当日限定：種目名の直接編集
  const handleExerciseNameChange = (index: number, newName: string) => {
    const isSelectedDateCompleted = schedule.some(item => item.date === selectedDateStr && item.completed);
    if (isSelectedDateCompleted && !isEditingPast) {
      return;
    }

    const updatedRecords = [...exerciseRecords];
    updatedRecords[index].name = newName;
    setExerciseRecords(updatedRecords);

    // schedule の customExercises も同期更新
    updateScheduleCustomExercises(updatedRecords);
  };

  // schedule 内の customExercises を同期更新しローカルストレージへ保存する共通ヘルパー
  const updateScheduleCustomExercises = (records: ExerciseRecord[]) => {
    let hasDateInSchedule = schedule.some(item => item.date === selectedDateStr);
    
    const updatedSchedule = hasDateInSchedule 
      ? schedule.map(item => {
          if (item.date === selectedDateStr) {
            return {
              ...item,
              customExercises: records.map(r => ({
                name: r.name,
                weight: r.targetWeight,
                reps: r.targetReps,
                sets: r.targetSets
              }))
            };
          }
          return item;
        })
      : [
          ...schedule,
          {
            date: selectedDateStr,
            workoutName: "Custom",
            isTemp: true,
            completed: false,
            customExercises: records.map(r => ({
              name: r.name,
              weight: r.targetWeight,
              reps: r.targetReps,
              sets: r.targetSets
            }))
          }
        ];

    setSchedule(updatedSchedule);
    saveToLocalStorage("fitrum_schedule", updatedSchedule);
  };

  // -------------------------------------------------------------
  // その日限りの AI 体調調整 (オートレギュレーション) ロジック
  // -------------------------------------------------------------
  const applyAIWorkoutAdjustment = async () => {
    const isSelectedDateCompleted = schedule.some(item => item.date === selectedDateStr && item.completed);
    if (isSelectedDateCompleted) {
      alert("この日のトレーニングはすでに完了しているため、変更できません。");
      return;
    }

    if (!apiKey) {
      alert("AI調整にはAPIキーの設定が必要です。");
      return;
    }
    setLoading(true);
    setShowAdjustModal(false);
    try {
      const ai = getAiInstance();
      const pureWorkoutName = currentWorkoutName.replace(" (実施済み)", "").split(" ")[0];
      const baseExercises = menus[pureWorkoutName] || [];

      const conditionText = {
        normal: "普通（予定通り行う）",
        energetic: "絶好調（もっと追い込みたい、元気）",
        fatigued: "寝不足・疲労あり（体が重い、回復不足）",
        joint_ache: "肩や腰など関節に軽い違和感・痛みあり"
      }[userCondition];

      const timeLimitText = {
        none: "時間制限なし",
        short: "時間がない（30分以内の時短トレーニング希望）"
      }[userTimeLimit];

      const prompt = `
ユーザーの「今日の体調」「時間制限」${customAdjustmentNote ? '「追加の状況・要望」' : ''}に基づいて、基本メニューを「今日限りの調整メニュー（今日1日だけの特別なメニュー）」に科学的に最適化（セット数の削減、重量の加減、補助種目のカットなど）してください。

⚠️ 重要（厳格ルール）: 
- あなたは基本メニューを変更することはできません。変更するのは、今日限りのトレーニング内容（今日1日だけ適用される調整メニュー）のみです。
- 明日以降の予定や基本メニュー全体には一切影響を与えないようにしてください。

${getUserProfileContext()}

【今日の基本メニュー】
${JSON.stringify(baseExercises, null, 2)}

【ユーザーの今日のステータス】
- 体調: "${conditionText}"
- 時間制限: "${timeLimitText}"
${customAdjustmentNote ? `- 追加の状況・要望（最優先）: "${customAdjustmentNote}"` : ""}

【調整ルール】
- 絶好調: 重量や回数は維持、補助種目の追加や、限界まで追い込むアドバイス。
- 寝不足・疲労: セット数を1〜2セット減らす、または重量を5%〜10%下げる。
- 関節に軽い違和感・痛みや自由記述での痛み（例: 「肩が痛い」等）: 違和感や痛みのある関節・筋肉に負担がかかる種目を、低負荷・高回数の動作に変更するか、安全な代替種目に差し替えてください。
- 時短希望: 補助種目をカットし、大きな多関節種目にのみ絞ってセット数も減らす。
- ユーザーの「追加の状況・要望」が指定されている場合は、その具体的な指示（例：「腕立て伏せに変更したい」「スクワットはやりたくない」など）を最優先で今日のメニューに反映させてください。
- 重量（weight）は必ずユーザーが設定した以下の器具別最小調整単位の倍数で設定してください。中途半端な端数は絶対に避けてください。
  - バーベル系種目: ${userProfile.barbellStep || 2.5}kg の倍数
  - ダンベル系種目: ${userProfile.dumbbellStep || 2}kg の倍数
  - マシン系種目: ${userProfile.machineStep || 5}kg の倍数

以下のJSONフォーマットで回答してください。余計なテキストは含めないでください。

【出力フォーマット】
{
  "adjustedExercises": [
    { "name": "種目名", "weight": 40, "reps": 10, "sets": 2 }
  ],
  "reason": "調整理由の説明（100文字以内でポジティブに！）"
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "体調に合わせた今日限定メニューを生成するAIトレーナーAPIです。",
        },
      });

      const data = JSON.parse(response.text || "{}");

      if (data.adjustedExercises && data.reason) {
        const updatedSchedule = schedule.map(item => {
          if (item.date === selectedDateStr) {
            return {
              ...item,
              customExercises: data.adjustedExercises,
              adjustmentReason: data.reason
            };
          }
          return item;
        });

        setSchedule(updatedSchedule);
        saveToLocalStorage("fitrum_schedule", updatedSchedule);

        setActiveAdjustmentReason(data.reason);
        const records: ExerciseRecord[] = data.adjustedExercises.map((ex: any) => ({
          name: ex.name,
          targetWeight: ex.weight,
          targetReps: ex.reps,
          targetSets: ex.sets,
          sets: Array.from({ length: ex.sets }).map(() => ({
            weight: ex.weight,
            reps: ex.reps,
            completed: false
          }))
        }));
        setExerciseRecords(records);
        setCustomAdjustmentNote(""); // 適用成功時に自由記述をリセット
      }
    } catch (err: any) {
      console.error(err);
      alert(`AIによるメニュー調整に失敗しました。\n詳細: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // AI体調調整のリセット
  const resetAIWorkoutAdjustment = () => {
    if (confirm("今日のメニューを元の基本メニュー設定に戻しますか？")) {
      const updatedSchedule = schedule.map(item => {
        if (item.date === selectedDateStr) {
          const newItem = { ...item };
          delete newItem.customExercises;
          delete newItem.adjustmentReason;
          return newItem;
        }
        return item;
      });
      setSchedule(updatedSchedule);
      saveToLocalStorage("fitrum_schedule", updatedSchedule);
      setActiveAdjustmentReason("");
    }
  };

  // 7. Tab 2: AIメニュー構築・改善・インポート
  const handleAIBuilderSubmit = async () => {
    if ((builderAction === "improve" || builderAction === "import") && !aiRequestText.trim()) {
      alert("要望またはメニューテキストを入力してください。");
      return;
    }

    // --- ハイブリッドインポートの判定 (JSONコピペの場合はAPIを通さず処理) ---
    if (builderAction === "import") {
      const trimmedText = aiRequestText.trim();
      if (trimmedText.startsWith("{") && trimmedText.endsWith("}")) {
        try {
          const parsedData = JSON.parse(trimmedText);
          if (parsedData.menus || parsedData.profile) {
            if (parsedData.menus) {
              if (!validateMenus(parsedData.menus)) {
                alert("⚠️ 貼り付けられたJSONメニューの構造が不正、または中身が空です。インポートを中止しました。");
                return;
              }
              if (Object.keys(menus).length > 0) {
                const confirmed = window.confirm(
                  "警告: 現在設定されているすべての基本メニューが、貼り付けられたJSONメニューで上書き（上書き消去）されます。\nよろしいですか？"
                );
                if (!confirmed) return;
              }
            }

            let finalMenus = menus;
            if (parsedData.menus) {
              finalMenus = parsedData.menus;
              setMenus(parsedData.menus);
              setEditableMenus(JSON.parse(JSON.stringify(parsedData.menus)));
              saveToLocalStorage("fitrum_menus", parsedData.menus);
              saveMenuToHistory("過去メニューのインポート (JSON)", parsedData.menus);
            }
            if (parsedData.profile) {
              const { frequency, ...restProfile } = parsedData.profile as any;
              setUserProfile(restProfile);
              saveToLocalStorage("fitrum_user_profile", restProfile);
            }

            setAiBuilderResponse("専用JSONからプロフィール（カルテ）とメニューのインポートが瞬時に成功しました！（API通信はスキップされました）");
            
            // 未来の予定の自動再構築
            buildScheduleWithAI(finalMenus, schedule);
            return;
          }
        } catch (e) {
          console.log("貼り付けられたテキストは有効なJSONではありませんでした。通常のAI解析にフォールバックします。");
        }
      }
    }

    setLoading(true);
    setAiBuilderResponse("");
    try {
      const ai = getAiInstance();
      let prompt = "";

      if (builderAction === "create") {
        prompt = `
ユーザーの条件に基づいて、最適な筋トレメニューを作成してください。

【ユーザー条件】
- 目標: "${userProfile.goals}"
- 利用可能な器具: "${userProfile.equipment}"

【重量設定ルール】
- 重量（weight）は必ずユーザーが設定した以下の器具別最小調整単位の倍数で設定してください。中途半端な端数は絶対に避けてください。
  - バーベル系種目: ${userProfile.barbellStep || 2.5}kg の倍数
  - ダンベル系種目: ${userProfile.dumbbellStep || 2}kg の倍数
  - マシン系種目: ${userProfile.machineStep || 5}kg の倍数

以下のJSONフォーマットで回答してください。

【出力フォーマット】
{
  "menus": {
    "A": [
      { "name": "種目名1", "weight": 40, "reps": 10, "sets": 3 }
    ]
  }
}
`;
      } else if (builderAction === "improve") {
        prompt = `
ユーザーが現在実施しているメニューを、要望に基づいて改善してください。

【現在のメニュー】
${JSON.stringify(menus, null, 2)}

【ユーザーの改善要望】
"${aiRequestText}"

【重量設定ルール】
- 重量（weight）は必ずユーザーが設定した以下の器具別最小調整単位の倍数で設定してください。中途半端な端数は絶対に避けてください。
  - バーベル系種目: ${userProfile.barbellStep || 2.5}kg の倍数
  - ダンベル系種目: ${userProfile.dumbbellStep || 2}kg の倍数
  - マシン系種目: ${userProfile.machineStep || 5}kg の倍数

以下のJSONフォーマットで回答してください。

【出力フォーマット】
{
  "updatedMenus": {
    "A": [
      { "name": "種目名", "weight": 40, "reps": 10, "sets": 3 }
    ]
  },
  "explanation": "改善内容の説明"
}
`;
      } else if (builderAction === "import") {
        prompt = `
ユーザーがこれまで行っていた過去の筋トレ内容や会話履歴（日記、雑多なテキスト）を解析し、アプリ用の筋トレメニューとユーザープロファイル（カルテ）をインポート可能なJSON構造にパースしてください。

【ユーザーの入力テキスト】
"${aiRequestText}"

【重量設定ルール】
- 重量（weight）は必ずユーザーが設定した以下の器具別最小調整単位の倍数で設定してください。中途半端な端数は絶対に避けてください。
  - バーベル系種目: ${userProfile.barbellStep || 2.5}kg の倍数
  - ダンベル系種目: ${userProfile.dumbbellStep || 2}kg の倍数
  - マシン系種目: ${userProfile.machineStep || 5}kg の倍数

以下のJSONフォーマットで回答してください。余計な説明テキストは含めないでください。

【出力フォーマット】
{
  "profile": {
    "goals": "ユーザーの目標",
    "experience": "トレーニング経験や頻度",
    "limitations": "ケガや痛み、避けるべき種目・注意点",
    "preferences": "トレーニングの好み",
    "equipment": "使用可能な器具"
  },
  "menus": {
    "A": [
      { "name": "種目名", "weight": 60, "reps": 10, "sets": 3 }
    ]
  }
}
`;
      }

      let apiContents: any[] = [];
      if (builderAction === "improve") {
        apiContents = [
          ...builderChatHistory,
          { role: "user", parts: [{ text: prompt }] }
        ];
      } else {
        apiContents = [
          { role: "user", parts: [{ text: prompt }] }
        ];
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: apiContents,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "JSONフォーマットでメニューデータおよびカルテデータのみを出力してください。",
        },
      });

      const responseText = response.text || "";
      const data = JSON.parse(responseText || "{}");

      // チャット履歴の更新と永続化
      let finalHistory = [];
      if (builderAction === "improve") {
        finalHistory = [
          ...apiContents,
          { role: "model", parts: [{ text: responseText }] }
        ];
      } else {
        finalHistory = [
          { role: "user", parts: [{ text: prompt }] },
          { role: "model", parts: [{ text: responseText }] }
        ];
      }
      setBuilderChatHistory(finalHistory);
      saveToLocalStorage("fitrum_builder_chat_history", finalHistory);

      if ((builderAction === "create" || builderAction === "import") && (data.menus || data.profile)) {
        if (data.menus) {
          if (!validateMenus(data.menus)) {
            alert("⚠️ AIが生成したメニュー構造が不正、または空でした。適用を中止しました。");
            setLoading(false);
            return;
          }
          if (Object.keys(menus).length > 0) {
            const actionName = builderAction === "create" ? "AI新規作成" : "過去メニュー取り込み";
            const confirmed = window.confirm(
              `警告: 現在設定されているすべての基本メニューが、${actionName}によって作成されたメニューで上書き（上書き消去）されます。\nよろしいですか？`
            );
            if (!confirmed) {
              setLoading(false);
              return;
            }
          }
        }
        let finalMenus = menus;
        if (data.menus) {
          finalMenus = data.menus;
          setMenus(data.menus);
          setEditableMenus(JSON.parse(JSON.stringify(data.menus)));
          saveToLocalStorage("fitrum_menus", data.menus);
          const historyDesc = builderAction === "import" ? "過去メニューのインポート (AI解析)" : "AI新規メニュー作成";
          saveMenuToHistory(historyDesc, data.menus);
        }
        if (data.profile) {
          const { frequency, ...restProfile } = data.profile as any;
          setUserProfile(restProfile);
          saveToLocalStorage("fitrum_user_profile", restProfile);
        }
        setAiBuilderResponse(
          builderAction === "import" 
            ? "過去のメニューおよびユーザーカルテの解析とインポートが成功しました！現在の基本メニューおよびAIカルテに反映されました。"
            : "新しいメニューを作成し、適用しました！カレンダーに戻り、「AIスケジュール構築」を実行してください。"
        );

        // 未来の予定の自動再構築
        buildScheduleWithAI(finalMenus, schedule);
      } else if (builderAction === "improve" && data.updatedMenus) {
        if (!validateMenus(data.updatedMenus)) {
          alert("⚠️ AIが生成した改善メニューの構造が不正、または空でした。適用を中止しました。");
          setLoading(false);
          return;
        }
        setMenus(data.updatedMenus);
        setEditableMenus(JSON.parse(JSON.stringify(data.updatedMenus)));
        saveToLocalStorage("fitrum_menus", data.updatedMenus);
        saveMenuToHistory(`AIメニュー改善: ${aiRequestText.substring(0, 30)}${aiRequestText.length > 30 ? "..." : ""}`, data.updatedMenus);
        setAiBuilderResponse(`【改善内容】\n${data.explanation || "メニューを最適化しました。"}`);

        // 未来の予定の自動再構築
        buildScheduleWithAI(data.updatedMenus, schedule);
      }
    } catch (err: any) {
      console.error(err);
      alert(`AIへのリクエストに失敗しました。\n詳細: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // 代替種目の提案をリクエスト
  const requestAlternative = async (exerciseName: string, index: number) => {
    const isSelectedDateCompleted = schedule.some(item => item.date === selectedDateStr && item.completed);
    if (isSelectedDateCompleted) {
      alert("この日のトレーニングはすでに完了しているため、変更できません。");
      return;
    }

    setLoading(true);
    try {
      const ai = getAiInstance();
      const currentEx = exerciseRecords[index];
      const originalWeight = currentEx ? currentEx.targetWeight : 0;
      const originalReps = currentEx ? currentEx.targetReps : 0;
      const originalSets = currentEx ? currentEx.targetSets : 0;

      const prompt = `
ユーザーは現在「${exerciseName}」を行う予定ですが、以下の理由により代替種目を求めています。
代わりとなる筋トレ種目を3つ提案してください。

${getUserProfileContext()}

【状況】
- 代替したい種目: "${exerciseName}"
- 元の予定負荷: 重量 ${originalWeight}kg × ${originalReps}回 × ${originalSets}セット
- 代替を希望する理由: "混雑、または痛みのため"
- 使用可能な器具: "${userProfile.equipment}"

【重量設定の指示】
- 提案する代替種目の負荷（重量・回数・セット数）は、元の予定負荷と同等の運動強度（主働筋への刺激量）になるように運動生理学的に換算して決定してください。
- 例：バーベル種目からダンベル種目へ移行する場合、片側重量はバーベル総重量の半分より少し軽め（例: ベンチプレス 60kg ➔ ダンベルプレス片側 25kg等）にするなど適切に調整してください。
- 自重種目の場合は重量を 0 としてください。

以下のJSONフォーマットで回答してください。余計な説明テキストは含めないでください。

【出力フォーマット】
{
  "alternatives": [
    {
      "name": "代替種目名",
      "weight": 20,
      "reps": 12,
      "sets": 3,
      "reason": "この種目を推薦する理由（元の種目と同じ部位を鍛えられる点や、混雑を回避できる点、関節に優しい点など）"
    }
  ]
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "代替種目リストのJSONを返却してください。",
        },
      });

      const data = JSON.parse(response.text || "{}");
      setAlternativesList(data.alternatives || []);
      setAlternativeRequest({ exerciseName, index });
    } catch (err: any) {
      console.error(err);
      alert(`代替種目の提案取得に失敗しました。\n詳細: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // 代替種目の適用
  const selectAlternative = (altName: string, altWeight: number, altReps: number, altSets: number) => {
    const isSelectedDateCompleted = schedule.some(item => item.date === selectedDateStr && item.completed);
    if (isSelectedDateCompleted) {
      alert("この日のトレーニングはすでに完了しているため、変更できません。");
      return;
    }

    if (!alternativeRequest || !currentWorkoutName) return;
    
    const pureWorkoutName = currentWorkoutName.replace(" (実施済み)", "").split(" ")[0];

    const updatedRecords = [...exerciseRecords];
    updatedRecords[alternativeRequest.index] = {
      name: altName,
      targetWeight: altWeight,
      targetReps: altReps,
      targetSets: altSets,
      sets: Array.from({ length: altSets }).map(() => ({
        weight: altWeight,
        reps: altReps,
        completed: false
      }))
    };
    setExerciseRecords(updatedRecords);

    const updatedSchedule = schedule.map(item => {
      if (item.date === selectedDateStr) {
        const originalExercises = item.customExercises || menus[item.workoutName] || [];
        const newExercises = originalExercises.map((ex, idx) => {
          if (idx === alternativeRequest.index) {
            return {
              name: altName,
              weight: altWeight,
              reps: altReps,
              sets: altSets
            };
          }
          return ex;
        });

        return {
          ...item,
          customExercises: newExercises
        };
      }
      return item;
    });

    setSchedule(updatedSchedule);
    saveToLocalStorage("fitrum_schedule", updatedSchedule);

    setAlternativeRequest(null);
    setAlternativesList([]);
  };

  // 手動メニュー編集用メソッド
  const handleManualExerciseChange = (groupKey: string, exIndex: number, field: keyof Exercise, value: any) => {
    const updated = { ...editableMenus };
    if (field === "name") {
      updated[groupKey][exIndex].name = value;
    } else {
      updated[groupKey][exIndex][field] = Math.max(0, parseFloat(value) || 0);
    }
    setEditableMenus(updated);
  };

  const handleManualDeleteExercise = (groupKey: string, exIndex: number) => {
    const updated = { ...editableMenus };
    updated[groupKey].splice(exIndex, 1);
    setEditableMenus(updated);
  };

  const handleManualAddExercise = (groupKey: string) => {
    const updated = { ...editableMenus };
    if (!updated[groupKey]) {
      updated[groupKey] = [];
    }
    updated[groupKey].push({
      name: "新しい種目",
      weight: 10,
      reps: 10,
      sets: 3
    });
    setEditableMenus(updated);
  };

  const handleManualAddGroup = () => {
    const nextChar = String.fromCharCode(65 + Object.keys(editableMenus).length);
    const updated = { ...editableMenus };
    updated[nextChar] = [
      { name: "ベンチプレス", weight: 40, reps: 10, sets: 3 }
    ];
    setEditableMenus(updated);
  };

  const handleManualDeleteGroup = (groupKey: string) => {
    if (confirm(`ルーティン ${groupKey} を完全に削除しますか？`)) {
      const updated = { ...editableMenus };
      delete updated[groupKey];
      setEditableMenus(updated);
    }
  };

  const handleSaveManualChanges = () => {
    const cleaned = { ...editableMenus };
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key].length === 0) {
        delete cleaned[key];
      }
    });

    if (!validateMenus(cleaned)) {
      alert("⚠️ 保存できません。メニューの構造が不正であるか、種目が1つも登録されていないルーティンが存在します。各ルーティンに最低1つ以上の種目を設定してください。");
      return;
    }

    setMenus(cleaned);
    setEditableMenus(JSON.parse(JSON.stringify(cleaned)));
    saveToLocalStorage("fitrum_menus", cleaned);
    saveMenuToHistory("手動編集", cleaned);
    setIsEditingManual(false);
    alert("手動の変更を保存しました！");

    // 未来の予定の自動再構築
    buildScheduleWithAI(cleaned, schedule);
  };

  const selectedScheduleItem = schedule.find(item => item.date === selectedDateStr);
  const isWorkoutCompleted = selectedScheduleItem?.completed || false;

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <h1 className={styles.title}>Fitrum</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button 
            onClick={() => setShowHelpModal(true)} 
            style={{ 
              background: "transparent", 
              border: "none", 
              color: "var(--text-muted)", 
              cursor: "pointer", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              padding: "6px",
              borderRadius: "50%",
              transition: "all 0.2s"
            }}
            title="使い方ヘルプ"
          >
            <HelpCircle size={20} />
          </button>
          <div className={styles.statCard} style={{ padding: "6px 12px" }}>
            <span className={styles.statValue}>🔥 {streak}</span>
            <span className={styles.statLabel} style={{ marginLeft: "4px" }}>連続</span>
          </div>
        </div>
      </header>

      {/* ローディング */}
      {loading && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.spinner}></div>
            <p style={{ fontSize: "0.85rem", color: "var(--color-primary)", fontWeight: "600" }}>AIが思考中...</p>
          </div>
        </div>
      )}

      {/* APIキー警告 */}
      {showKeyWarning && activeTab === "workouts" && (
        <div className={styles.workoutSection} style={{ marginBottom: "20px", borderColor: "var(--status-maybe)" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "12px" }}>
            <AlertTriangle size={24} style={{ color: "var(--status-maybe)", flexShrink: 0 }} />
            <div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: "700" }}>Gemini API キーを設定してください</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: "1.4" }}>
                スケジュール自動配置や重量自動更新など、AI機能を使用するためにGoogle AI Studioで取得したキーを設定してください（ローカルにのみ保存）。
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input 
              type="password" 
              className={styles.textInput} 
              placeholder="AIzaSy..." 
              value={inputApiKey} 
              onChange={(e) => setInputApiKey(e.target.value)} 
            />
            <button className={styles.btnPrimary} style={{ padding: "8px 16px" }} onClick={handleSaveApiKey}>
              <Key size={14} /> 設定
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          Tab 1: ワークアウト（カレンダー ＆ 記録一体型ホーム）
          ------------------------------------------------------------- */}
      {activeTab === "workouts" && (
        <>
          {/* カレンダー */}
          <div className={styles.calendarSection}>
            <div className={styles.sectionTitle}>
              <span style={{ fontSize: "1rem", fontWeight: "700" }}>📅 {currentYear}年 {currentMonth + 1}月</span>
              <div style={{ display: "flex", gap: "4px" }}>
                <button className={styles.btnSecondary} style={{ padding: "4px 8px", fontSize: "0.75rem", flex: "none" }} onClick={handlePrevMonth}>◀</button>
                <button className={styles.btnSecondary} style={{ padding: "4px 8px", fontSize: "0.75rem", flex: "none" }} onClick={handleGoToToday}>今月</button>
                <button className={styles.btnSecondary} style={{ padding: "4px 8px", fontSize: "0.75rem", flex: "none" }} onClick={handleNextMonth}>▶</button>
              </div>
            </div>
            
            <div className={styles.calendarGrid}>
              {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                <div key={i} className={styles.weekdayHeader}>{d}</div>
              ))}
              
              {/* 曜日のズレ修正：その月の1日の曜日に合わせてダミーマスを挿入 */}
              {dates.length > 0 && Array.from({ length: dates[0].getDay() }).map((_, i) => (
                <div key={`empty-${i}`} style={{ aspectRatio: "1" }} />
              ))}
              
              {dates.map((d, idx) => {
                const dateStr = formatDate(d);
                const isSelected = dateStr === selectedDateStr;
                const state = dateStates[dateStr] || "DEFAULT";
                const isScheduled = schedule.some(item => item.date === dateStr && item.workoutName);
                const isCompleted = schedule.some(item => item.date === dateStr && item.completed);

                const todayObj = new Date();
                const compareToday = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
                const compareD = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                const isPast = compareD < compareToday;
                const isToday = dateStr === formatDate(todayObj);

                let stateClass = styles.dayDefault;
                if (state === "CONFIRMED_GO") stateClass = styles.dayGo;
                else if (state === "CONFIRMED_NO") stateClass = styles.dayNo;
                else if (state === "MAYBE") stateClass = styles.dayMaybe;

                return (
                  <button 
                    key={idx} 
                    className={`${styles.calendarDay} ${stateClass} ${isSelected ? styles.selectedDay : ""} ${isToday ? styles.todayDay : ""} ${isPast ? styles.pastDay : ""}`}
                    onClick={() => handleDayClick(dateStr)}
                  >
                    <span className={styles.dayLabel}>{d.getDate()}</span>
                    {isCompleted ? (
                      <Check size={8} style={{ color: "var(--status-go)", marginTop: "2px" }} />
                    ) : isScheduled ? (
                      <div className={styles.workoutDot}></div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {selectedDateStr && (
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center", 
                  gap: "8px", 
                  background: "rgba(255,255,255,0.02)", 
                  padding: "6px 12px", 
                  borderRadius: "12px", 
                  border: "1px solid rgba(255,255,255,0.05)" 
                }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    選択日のステータス:
                  </span>
                  <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.03)", padding: "2px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <button 
                      onClick={() => setSpecificDateState(selectedDateStr, "CONFIRMED_GO")}
                      style={{
                        background: dateStates[selectedDateStr] === "CONFIRMED_GO" ? "var(--status-go)" : "transparent",
                        border: "none", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", cursor: "pointer", opacity: dateStates[selectedDateStr] === "CONFIRMED_GO" ? 1 : 0.4
                      }}
                      title="👌 行ける"
                    >👌</button>
                    <button 
                      onClick={() => setSpecificDateState(selectedDateStr, "CONFIRMED_NO")}
                      style={{
                        background: dateStates[selectedDateStr] === "CONFIRMED_NO" ? "var(--status-no)" : "transparent",
                        border: "none", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", cursor: "pointer", opacity: dateStates[selectedDateStr] === "CONFIRMED_NO" ? 1 : 0.4
                      }}
                      title="❌ オフ (スライド)"
                    >❌</button>
                    <button 
                      onClick={() => setSpecificDateState(selectedDateStr, "MAYBE")}
                      style={{
                        background: dateStates[selectedDateStr] === "MAYBE" ? "var(--status-maybe)" : "transparent",
                        border: "none", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", cursor: "pointer", opacity: dateStates[selectedDateStr] === "MAYBE" ? 1 : 0.4
                      }}
                      title="微妙"
                    >❓</button>
                    <button 
                      onClick={() => setSpecificDateState(selectedDateStr, "DEFAULT")}
                      style={{
                        background: !dateStates[selectedDateStr] || dateStates[selectedDateStr] === "DEFAULT" ? "rgba(255,255,255,0.15)" : "transparent",
                        border: "none", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: "bold", color: "#fff", cursor: "pointer", opacity: !dateStates[selectedDateStr] || dateStates[selectedDateStr] === "DEFAULT" ? 1 : 0.4
                      }}
                      title="未定"
                    >未</button>
                  </div>
                </div>
              )}

              <div className={styles.calendarActions} style={{ flexDirection: "column", gap: "8px" }}>
                {getPastUncompletedCount() > 0 && (
                  <button
                    onClick={clearPastUncompletedWorkouts}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 69, 58, 0.4)",
                      background: "linear-gradient(135deg, rgba(255, 69, 58, 0.15) 0%, rgba(255, 69, 58, 0.05) 100%)",
                      color: "#ff453a",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      transition: "all 0.2s ease",
                      boxShadow: "0 2px 8px rgba(255, 69, 58, 0.1)"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 69, 58, 0.25) 0%, rgba(255, 69, 58, 0.1) 100%)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 69, 58, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 69, 58, 0.15) 0%, rgba(255, 69, 58, 0.05) 100%)";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(255, 69, 58, 0.1)";
                    }}
                  >
                    <Trash2 size={12} /> 過去の未完了予定 ({getPastUncompletedCount()}件) を一括オフ
                  </button>
                )}
                {hasUnsavedDateChanges && (
                  <div 
                    style={{ 
                      fontSize: "0.7rem", 
                      color: "#ffd700", 
                      backgroundColor: "rgba(255, 215, 0, 0.1)", 
                      border: "1px solid rgba(255, 215, 0, 0.2)", 
                      borderRadius: "6px", 
                      padding: "6px 10px", 
                      textAlign: "center", 
                      width: "100%",
                      animation: "pulse 2s infinite" 
                    }}
                  >
                    ⚠️ 日程が変更されました。「AIスケジュール構築」を押して反映してください。
                  </div>
                )}
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder="💬 例: 今週は胸を多めに / 肩が痛いので控えめに"
                  value={scheduleInstruction}
                  onChange={(e) => setScheduleInstruction(e.target.value)}
                  style={{ fontSize: "0.75rem", padding: "8px 10px", width: "100%" }}
                />
                <button 
                  className={styles.btnPrimary} 
                  style={{ 
                    width: "100%",
                    boxShadow: hasUnsavedDateChanges ? "0 0 12px rgba(255, 215, 0, 0.4)" : "none",
                    border: hasUnsavedDateChanges ? "1px solid #ffd700" : "none"
                  }} 
                  onClick={() => buildScheduleWithAI()}
                >
                  <Sparkles size={14} /> AIスケジュール構築
                </button>
                <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0px", textAlign: "center", lineHeight: "1.3" }}>
                  ※カレンダー上で日程（👌行ける・❌オフ等）を変更した後、このボタンを押してAIにスケジュールを再構築させてください。
                </p>
              </div>
            </div>
          </div>

          {/* 今日のやること */}
          <div className={styles.workoutSection} style={{ marginBottom: "20px", flex: "none" }}>


            <div className={styles.workoutHeader} style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div className={styles.workoutTitle}>
                    {selectedDateStr === formatDate(new Date()) ? "🎯 今日のトレーニング" : `📅 ${selectedDateStr} の予定`}
                    {currentWorkoutName && (
                      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginLeft: "8px", fontWeight: "500" }}>
                        ({currentWorkoutName})
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  {currentWorkoutName && !isWorkoutCompleted && (
                    <button className={styles.btnSecondary} style={{ padding: "6px 10px", fontSize: "0.75rem" }} onClick={() => setShowAdjustModal(true)}>
                      <Activity size={12} style={{ marginRight: "2px" }} /> AI体調調整
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* AI体調調整が適用されている場合のメッセージ */}
            {activeAdjustmentReason && (
              <div style={{ 
                background: "rgba(0, 242, 254, 0.05)", 
                border: "1px solid var(--color-primary)", 
                borderRadius: "10px", 
                padding: "8px 12px", 
                marginBottom: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem" }}>
                  <Info size={14} style={{ color: "var(--color-primary)" }} />
                  <span>💡 {activeAdjustmentReason}</span>
                </div>
                {!isWorkoutCompleted && (
                  <button 
                    className={styles.adjustBtn} 
                    style={{ color: "var(--status-no)", background: "transparent", border: "none", cursor: "pointer" }}
                    onClick={resetAIWorkoutAdjustment}
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            )}

            {exerciseRecords.length > 0 ? (
              <div className={styles.exerciseList}>
                {exerciseRecords.map((ex, exIdx) => (
                  <div key={exIdx} className={styles.exerciseCard}>
                    <div className={styles.exerciseHeader}>
                      {(!isWorkoutCompleted || isEditingPast) ? (
                        <input 
                          type="text" 
                          className={styles.exerciseNameInput} 
                          value={ex.name} 
                          onChange={(e) => handleExerciseNameChange(exIdx, e.target.value)} 
                          style={{
                            background: "transparent",
                            border: "none",
                            borderBottom: "1px dashed rgba(255,255,255,0.3)",
                            color: "var(--text-main)",
                            fontSize: "1rem",
                            fontWeight: "700",
                            padding: "2px 4px",
                            width: "60%"
                          }}
                        />
                      ) : (
                        <span className={styles.exerciseName}>{ex.name}</span>
                      )}
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span className={styles.targetInfo}>{ex.targetWeight}kg × {ex.targetReps}回</span>
                        {!isWorkoutCompleted && !isEditingPast && (
                          <button 
                            className={styles.btnSecondary} 
                            style={{ padding: "4px 8px", fontSize: "0.7rem", height: "24px" }}
                            onClick={() => requestAlternative(ex.name, exIdx)}
                          >
                            代わり
                          </button>
                        )}
                        {(!isWorkoutCompleted || isEditingPast) && (
                          <button 
                            className={styles.deleteExBtn} 
                            style={{ 
                              background: "transparent", 
                              border: "none", 
                              color: "var(--status-no)", 
                              cursor: "pointer", 
                              display: "flex", 
                              alignItems: "center", 
                              padding: "4px" 
                            }}
                            onClick={() => deleteManualExercise(exIdx)}
                            title="種目を削除"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className={styles.setList}>
                      {ex.sets.map((set, setIdx) => (
                        <div key={setIdx} className={styles.setRow}>
                          <span className={styles.setNumber}>Set {setIdx + 1}</span>
                          <div className={styles.setInputGroup}>
                            {/* 重量 */}
                            <div className={styles.inputWrapper}>
                              <input 
                                type="number" 
                                className={styles.numInput} 
                                value={set.weight} 
                                disabled={isWorkoutCompleted && !isEditingPast}
                                style={{ width: "50px" }}
                                onChange={(e) => handleSetChange(exIdx, setIdx, "weight", parseFloat(e.target.value) || 0)} 
                              />
                              <span className={styles.inputLabel}>kg</span>
                            </div>

                            {/* 回数 */}
                            <div className={styles.inputWrapper}>
                              <input 
                                type="number" 
                                className={styles.numInput} 
                                value={set.reps} 
                                disabled={isWorkoutCompleted && !isEditingPast}
                                style={{ width: "40px" }}
                                onChange={(e) => handleSetChange(exIdx, setIdx, "reps", parseInt(e.target.value, 10) || 0)} 
                              />
                              <span className={styles.inputLabel}>回</span>
                            </div>

                            {/* チェック */}
                            <button 
                              className={`${styles.checkBtn} ${set.completed ? styles.checkBtnActive : ""}`}
                              disabled={isWorkoutCompleted && !isEditingPast}
                              onClick={() => toggleSetComplete(exIdx, setIdx)}
                              style={isWorkoutCompleted && !isEditingPast ? { cursor: "default" } : {}}
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(!isWorkoutCompleted || isEditingPast) && (
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                        <button 
                          className={styles.btnSecondary} 
                          style={{ padding: "2px 8px", fontSize: "0.7rem", height: "22px", display: "flex", alignItems: "center", gap: "2px" }}
                          onClick={() => deleteLastSet(exIdx)}
                          disabled={ex.sets.length <= 1}
                        >
                          <Minus size={10} /> セット削減
                        </button>
                        <button 
                          className={styles.btnSecondary} 
                          style={{ padding: "2px 8px", fontSize: "0.7rem", height: "22px", display: "flex", alignItems: "center", gap: "2px" }}
                          onClick={() => addNewSet(exIdx)}
                        >
                          <Plus size={10} /> セット追加
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {(!isWorkoutCompleted || isEditingPast) && (
                  <button 
                    className={styles.btnSecondary} 
                    style={{ width: "100%", marginTop: "8px", marginBottom: "16px" }} 
                    onClick={addManualExercise}
                  >
                    <Plus size={14} style={{ marginRight: "4px" }} /> 種目を追加
                  </button>
                )}
                
                {isWorkoutCompleted && !isEditingPast ? (
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    padding: "16px",
                    background: "rgba(0, 255, 135, 0.05)",
                    border: "1px solid var(--status-go)",
                    borderRadius: "12px",
                    marginTop: "16px",
                    width: "100%"
                  }}>
                    <span style={{ color: "var(--status-go)", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Check size={16} /> この日のトレーニング実績は保存済みです
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
                      実績データは保護されています。修正が必要な場合は下記のボタンからロックを解除してください。
                    </span>
                    <button 
                      className={styles.btnSecondary} 
                      style={{ marginTop: "4px", padding: "6px 12px", fontSize: "0.75rem" }} 
                      onClick={() => setIsEditingPast(true)}
                    >
                      実績を修正する (ロック解除)
                    </button>
                  </div>
                ) : (
                  <>
                    {(!isWorkoutCompleted || isEditingPast) && (
                      <div style={{ marginBottom: "12px", width: "100%" }}>
                        <input
                          type="text"
                          className={styles.textInput}
                          style={{ width: "100%", fontSize: "0.75rem", padding: "8px 10px" }}
                          placeholder="💬 次回メニューへの要望（例：次回は肩を増やして / 維持で）"
                          value={progressionInstruction}
                          onChange={(e) => setProgressionInstruction(e.target.value)}
                        />
                      </div>
                    )}
                    <button className={`${styles.btnPrimary} ${styles.submitBtn}`} onClick={completeWorkout}>
                      <Zap size={16} /> {selectedDateStr < formatDate(new Date()) ? "過去の記録を保存" : "本日のトレーニングを完了"}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.noWorkoutText}>
                {currentWorkoutName.includes("(実施済み)") && !isEditingPast ? (
                  <p style={{ color: "var(--status-go)" }}>✨ この日のトレーニングは完了しています！</p>
                ) : isEditingPast ? (
                  <>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>種目がすべて削除されています。種目を追加するか、日付を変更してください。</p>
                    <button 
                      className={styles.btnSecondary} 
                      style={{ marginTop: "12px" }}
                      onClick={addManualExercise}
                    >
                      <Plus size={14} style={{ marginRight: "4px" }} /> 種目を追加
                    </button>
                  </>
                ) : (
                  <>
                    <p>本日はトレーニング予定はありません。<br/>休養を取るか、カレンダーから日付を選択してください。</p>
                    {selectedDateStr < formatDate(new Date()) && (
                      <button 
                        className={styles.btnSecondary} 
                        style={{ marginTop: "12px" }}
                        onClick={addManualExercise}
                      >
                        <Plus size={14} style={{ marginRight: "4px" }} /> この日の実績を登録する
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* -------------------------------------------------------------
          Tab 2: メニュー構築 (Menu Builder) ＆ APIキー設定
          ------------------------------------------------------------- */}
      {activeTab === "builder" && (
        <div className={styles.menuBuilderSection}>
          <h2 className={styles.sectionTitle} style={{ marginBottom: "16px" }}>
            <Sparkles size={16} style={{ color: "var(--color-primary)", marginRight: "8px" }} />
            AIメニュー構築 ＆ 手動カスタマイズ
          </h2>

          <div className={styles.quickActionGrid} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <button 
              className={`${styles.actionCard} ${builderAction === "improve" ? styles.actionCardActive : ""}`}
              onClick={() => { setBuilderAction("improve"); setIsEditingManual(false); }}
            >
              <RefreshCw size={16} />
              <span style={{ fontSize: "0.6rem" }}>既存改善</span>
            </button>
            <button 
              className={`${styles.actionCard} ${builderAction === "create" ? styles.actionCardActive : ""}`}
              onClick={() => { setBuilderAction("create"); setIsEditingManual(false); }}
            >
              <Plus size={16} />
              <span style={{ fontSize: "0.6rem" }}>AI新規</span>
            </button>
            <button 
              className={`${styles.actionCard} ${builderAction === "import" ? styles.actionCardActive : ""}`}
              onClick={() => { setBuilderAction("import"); setIsEditingManual(false); }}
            >
              <ClipboardList size={16} />
              <span style={{ fontSize: "0.6rem" }}>過去取込</span>
            </button>
            <button 
              className={`${styles.actionCard} ${builderAction === "alternative" ? styles.actionCardActive : ""}`}
              onClick={() => { setBuilderAction("alternative"); setIsEditingManual(false); }}
            >
              <Key size={16} />
              <span style={{ fontSize: "0.6rem" }}>キー設定</span>
            </button>
          </div>

          <div className={styles.aiChatBox}>
            {builderAction === "create" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: "1.5" }}>
                  💡 下記の「AIカルテ」に登録されている情報（目標、週の目標頻度、使用可能器具）に基づいて、AIが新しい最適な筋トレメニューをゼロから構築します。
                </p>
                <button className={styles.btnPrimary} style={{ marginTop: "8px" }} onClick={handleAIBuilderSubmit}>
                  AI新メニューを適用
                </button>
              </div>
            ) : builderAction === "improve" ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  現在のメニューの改善要望
                </label>
                <div className={styles.inputArea}>
                  <input 
                    type="text" 
                    className={styles.textInput} 
                    placeholder="例: 胸の種目を追加、時間を40分に減らす..." 
                    value={aiRequestText} 
                    onChange={(e) => setAiRequestText(e.target.value)} 
                  />
                  <button className={styles.btnPrimary} onClick={handleAIBuilderSubmit}>
                    送信
                  </button>
                </div>
              </div>
            ) : builderAction === "import" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "4px" }}>
                    💡 過去チャットからの完璧なデータ移行方法
                  </span>
                  <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                    以前使っていたGemini等のチャットに「専用プロンプト」を送信し、出力されたJSONテキストをそのまま貼り付けることで、メニューとAIカルテが正確に移行されます。
                  </p>
                  <button 
                    className={styles.btnSecondary} 
                    style={{ padding: "6px 12px", fontSize: "0.7rem", marginTop: "8px", width: "100%" }}
                    onClick={() => {
                      const promptTemplate = `これまでの私たちの筋トレ管理のチャット履歴や私の状況（設定メニュー、目標、これまでの実績、ケガの情報、好みなど）をすべて要約し、以下のJSON形式で出力してください。余計な説明文は含めず、純粋なJSONテキストのみを出力してください。\n\n【出力JSONフォーマット】\n{\n  "profile": {\n    "goals": "あなたの筋トレ目標",\n    "experience": "これまでの経験や頻度など",\n    "limitations": "ケガや痛み、避けるべき種目・動作などの注意点",\n    "preferences": "好きな種目やトレーニングスタイルの好み",\n    "equipment": "使用可能な器具"\n  },\n  "menus": {\n    "A": [\n      { "name": "種目名", "weight": 重量kg, "reps": 回数, "sets": セット数 }\n    ],\n    "B": [ ... ]\n  }\n}`;
                      navigator.clipboard.writeText(promptTemplate);
                      alert("過去チャット用指示プロンプトをクリップボードにコピーしました！以前のチャットへ貼り付けてください。");
                    }}
                  >
                    過去チャット用の指示プロンプトをコピー
                  </button>
                </div>

                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                  以前のメニューテキスト、または出力された専用JSONを貼り付け
                </label>
                <textarea 
                  className={styles.textInput} 
                  rows={4} 
                  style={{ resize: "none", width: "100%", fontSize: "0.75rem" }}
                  placeholder='{"profile": {...}, "menus": {...}} または 雑多な履歴日記テキスト...'
                  value={aiRequestText}
                  onChange={(e) => setAiRequestText(e.target.value)}
                />
                <button className={styles.btnPrimary} onClick={handleAIBuilderSubmit}>
                  データをインポートする
                </button>

                {/* AIカルテ（引き継ぎ情報）の表示・手動修正フォーム */}
                <div style={{ marginTop: "16px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "16px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: "700", display: "block", marginBottom: "8px" }}>
                    📋 現在のAIカルテ（引き継ぎコンテキスト情報）
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>筋トレ目標</label>
                      <input 
                        type="text" 
                        className={styles.textInput} 
                        style={{ width: "100%", padding: "4px 8px", fontSize: "0.75rem" }} 
                        value={userProfile.goals} 
                        onChange={(e) => {
                          const updated = { ...userProfile, goals: e.target.value };
                          setUserProfile(updated);
                          saveToLocalStorage("fitrum_user_profile", updated);
                        }} 
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>経験・頻度</label>
                      <input 
                        type="text" 
                        className={styles.textInput} 
                        style={{ width: "100%", padding: "4px 8px", fontSize: "0.75rem" }} 
                        value={userProfile.experience} 
                        onChange={(e) => {
                          const updated = { ...userProfile, experience: e.target.value };
                          setUserProfile(updated);
                          saveToLocalStorage("fitrum_user_profile", updated);
                        }} 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.65rem", color: "var(--status-no)", fontWeight: "600" }}>ケガ・身体の制限・注意点</label>
                      <input 
                        type="text" 
                        className={styles.textInput} 
                        style={{ width: "100%", padding: "4px 8px", fontSize: "0.75rem" }} 
                        value={userProfile.limitations} 
                        onChange={(e) => {
                          const updated = { ...userProfile, limitations: e.target.value };
                          setUserProfile(updated);
                          saveToLocalStorage("fitrum_user_profile", updated);
                        }} 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>トレーニングの好み・スタイル</label>
                      <input 
                        type="text" 
                        className={styles.textInput} 
                        style={{ width: "100%", padding: "4px 8px", fontSize: "0.75rem" }} 
                        value={userProfile.preferences} 
                        onChange={(e) => {
                          const updated = { ...userProfile, preferences: e.target.value };
                          setUserProfile(updated);
                          saveToLocalStorage("fitrum_user_profile", updated);
                        }} 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>使用可能器具</label>
                      <input 
                        type="text" 
                        className={styles.textInput} 
                        style={{ width: "100%", padding: "4px 8px", fontSize: "0.75rem" }} 
                        value={userProfile.equipment} 
                        onChange={(e) => {
                          const updated = { ...userProfile, equipment: e.target.value };
                          setUserProfile(updated);
                          saveToLocalStorage("fitrum_user_profile", updated);
                        }} 
                      />
                    </div>

                    <div style={{ borderTop: "1px dashed rgba(255,255,255,0.05)", marginTop: "8px", paddingTop: "8px" }}>
                      <span style={{ fontSize: "0.65rem", color: "var(--color-primary)", fontWeight: "600", display: "block", marginBottom: "4px" }}>
                        ⚙️ 器具別・重量の調整最小単位
                      </span>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.55rem", color: "var(--text-muted)" }}>バーベル</label>
                          <select
                            className={styles.textInput}
                            style={{ width: "100%", padding: "2px 4px", fontSize: "0.7rem", background: "rgba(0,0,0,0.3)", color: "var(--text-main)" }}
                            value={userProfile.barbellStep || 2.5}
                            onChange={(e) => {
                              const updated = { ...userProfile, barbellStep: parseFloat(e.target.value) || 2.5 };
                              setUserProfile(updated);
                              saveToLocalStorage("fitrum_user_profile", updated);
                            }}
                          >
                            <option value="1">1kg</option>
                            <option value="2">2kg</option>
                            <option value="2.5">2.5kg</option>
                            <option value="5">5kg</option>
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.55rem", color: "var(--text-muted)" }}>ダンベル</label>
                          <select
                            className={styles.textInput}
                            style={{ width: "100%", padding: "2px 4px", fontSize: "0.7rem", background: "rgba(0,0,0,0.3)", color: "var(--text-main)" }}
                            value={userProfile.dumbbellStep || 2}
                            onChange={(e) => {
                              const updated = { ...userProfile, dumbbellStep: parseFloat(e.target.value) || 2 };
                              setUserProfile(updated);
                              saveToLocalStorage("fitrum_user_profile", updated);
                            }}
                          >
                            <option value="1">1kg</option>
                            <option value="2">2kg</option>
                            <option value="2.5">2.5kg</option>
                            <option value="5">5kg</option>
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.55rem", color: "var(--text-muted)" }}>マシン</label>
                          <select
                            className={styles.textInput}
                            style={{ width: "100%", padding: "2px 4px", fontSize: "0.7rem", background: "rgba(0,0,0,0.3)", color: "var(--text-main)" }}
                            value={userProfile.machineStep || 5}
                            onChange={(e) => {
                              const updated = { ...userProfile, machineStep: parseFloat(e.target.value) || 5 };
                              setUserProfile(updated);
                              saveToLocalStorage("fitrum_user_profile", updated);
                            }}
                          >
                            <option value="2">2kg</option>
                            <option value="2.5">2.5kg</option>
                            <option value="4.5">4.5kg</option>
                            <option value="5">5kg</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Gemini API キー設定
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input 
                    type="password" 
                    className={styles.textInput} 
                    placeholder="AIzaSy..." 
                    value={inputApiKey} 
                    onChange={(e) => setInputApiKey(e.target.value)} 
                  />
                  <button className={styles.btnPrimary} onClick={handleSaveApiKey}>
                    保存
                  </button>
                </div>
                {apiKey && (
                  <p style={{ fontSize: "0.7rem", color: "var(--status-go)" }}>
                    ✓ APIキー設定済み。
                  </p>
                )}
              </div>
            )}

            {aiBuilderResponse && (
              <div className={styles.aiResponseText}>
                {aiBuilderResponse}
              </div>
            )}
          </div>

          {/* 基本メニュー設定 */}
          <div className={styles.savedMenusCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.05)", paddingBottom: "8px", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: "700" }}>
                📋 基本メニューの編集 ＆ 確認
              </h3>
              {!isEditingManual ? (
                <button className={styles.btnSecondary} style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={() => setIsEditingManual(true)}>
                  手動で細かく編集
                </button>
              ) : (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button className={styles.btnSecondary} style={{ padding: "4px 8px", fontSize: "0.75rem" }} onClick={() => { setEditableMenus(JSON.parse(JSON.stringify(menus))); setIsEditingManual(false); }}>
                    キャンセル
                  </button>
                  <button className={styles.btnPrimary} style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={handleSaveManualChanges}>
                    <Save size={12} style={{ marginRight: "4px" }} /> 保存
                  </button>
                </div>
              )}
            </div>

            {isEditingManual ? (
              <div className={styles.menuListGroup}>
                {Object.keys(editableMenus).map((groupKey) => (
                  <div key={groupKey} className={styles.menuGroupCard} style={{ background: "rgba(255,255,255,0.01)", padding: "10px", borderRadius: "10px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span className={styles.menuGroupName}>ルーティン {groupKey}</span>
                      <button className={styles.adjustBtn} style={{ color: "var(--status-no)" }} onClick={() => handleManualDeleteGroup(groupKey)}>
                        ルーティン削除
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {editableMenus[groupKey].map((ex, idx) => (
                        <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "6px", background: "rgba(255,255,255,0.02)", padding: "8px", borderRadius: "8px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <input 
                              type="text" 
                              className={styles.textInput} 
                              style={{ flex: 2, padding: "4px 8px", fontSize: "0.8rem" }} 
                              value={ex.name} 
                              onChange={(e) => handleManualExerciseChange(groupKey, idx, "name", e.target.value)} 
                            />
                            <button className={styles.checkBtn} style={{ color: "var(--status-no)", border: "none" }} onClick={() => handleManualDeleteExercise(groupKey, idx)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                          
                          <div style={{ display: "flex", gap: "6px" }}>
                            <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: "6px" }}>
                              <input 
                                type="number" 
                                className={styles.numInput} 
                                style={{ width: "100%", fontSize: "0.75rem" }} 
                                value={ex.weight} 
                                onChange={(e) => handleManualExerciseChange(groupKey, idx, "weight", e.target.value)} 
                              />
                              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>kg</span>
                            </div>
                            <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: "6px" }}>
                              <input 
                                type="number" 
                                className={styles.numInput} 
                                style={{ width: "100%", fontSize: "0.75rem" }} 
                                value={ex.reps} 
                                onChange={(e) => handleManualExerciseChange(groupKey, idx, "reps", e.target.value)} 
                              />
                              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>回</span>
                            </div>
                            <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: "6px" }}>
                              <input 
                                type="number" 
                                className={styles.numInput} 
                                style={{ width: "100%", fontSize: "0.75rem" }} 
                                value={ex.sets} 
                                onChange={(e) => handleManualExerciseChange(groupKey, idx, "sets", e.target.value)} 
                              />
                              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>set</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      <button className={styles.btnSecondary} style={{ padding: "6px", fontSize: "0.75rem", width: "100%" }} onClick={() => handleManualAddExercise(groupKey)}>
                        + 種目を追加
                      </button>
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <button className={styles.btnSecondary} style={{ flex: 1, padding: "10px" }} onClick={handleManualAddGroup}>
                    + 新しいルーティンを追加
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.menuListGroup}>
                {Object.keys(menus).map((groupKey) => (
                  <div key={groupKey} className={styles.menuGroupCard}>
                    <div className={styles.menuGroupName}>ルーティン {groupKey}</div>
                    {menus[groupKey].map((ex, idx) => (
                      <div key={idx} className={styles.menuItemRow}>
                        <span>{ex.name}</span>
                        <span>{ex.weight}kg × {ex.reps}回 ({ex.sets}set)</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* メニュー変更履歴 */}
          {menuHistory.length > 0 && (
            <div className={styles.savedMenusCard} style={{ marginTop: "20px", background: "rgba(255,255,255,0.01)" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: "700", borderBottom: "1px solid rgba(255, 255, 255, 0.05)", paddingBottom: "8px", marginBottom: "12px" }}>
                ↩️ メニュー変更履歴（過去のバージョンに戻す）
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {menuHistory.map((item) => (
                  <div key={item.id} style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    background: "rgba(255, 255, 255, 0.02)", 
                    padding: "8px 12px", 
                    borderRadius: "10px", 
                    border: "1px solid rgba(255, 255, 255, 0.04)" 
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, marginRight: "8px" }}>
                      <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{item.timestamp}</span>
                      <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-main)", wordBreak: "break-all" }}>{item.description}</span>
                    </div>
                    <button 
                      className={styles.btnSecondary} 
                      style={{ padding: "4px 10px", fontSize: "0.7rem", flex: "none", height: "28px" }}
                      onClick={() => rollbackMenu(item.id)}
                    >
                      復元
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* データのバックアップと復元 */}
          <div className={styles.savedMenusCard} style={{ marginTop: "20px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: "700", borderBottom: "1px solid rgba(255, 255, 255, 0.05)", paddingBottom: "8px", marginBottom: "12px" }}>
              💾 データのバックアップ ＆ 復元
            </h3>
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "14px", lineHeight: "1.4" }}>
              データはブラウザ（LocalStorage）に保存されています。キャッシュクリア時のデータ消失を防ぐため、定期的なバックアップや、別端末への引き継ぎにご利用ください。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button 
                className={styles.btnSecondary} 
                style={{ 
                  width: "100%", 
                  padding: "10px", 
                  fontSize: "0.75rem", 
                  fontWeight: "bold",
                  background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)" 
                }}
                onClick={exportData}
              >
                📥 全データをバックアップ（JSON書き出し）
              </button>
              
              <div style={{ 
                borderTop: "1px dashed rgba(255, 255, 255, 0.05)", 
                paddingTop: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <label style={{ fontSize: "0.7rem", fontWeight: "700", color: "var(--color-primary)" }}>
                  バックアップファイルから復元
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        importData(file);
                        e.target.value = "";
                      }
                    }}
                    style={{ fontSize: "0.7rem", flex: 1, color: "var(--text-muted)" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 下部ナビゲーション */}
      <nav className={styles.navBar}>
        <div className={styles.navBarInner}>
          <button 
            className={`${styles.navTab} ${activeTab === "workouts" ? styles.navTabActive : ""}`}
            onClick={() => setActiveTab("workouts")}
          >
            <Dumbbell size={20} />
            <span>ワークアウト</span>
          </button>
          <button 
            className={`${styles.navTab} ${activeTab === "builder" ? styles.navTabActive : ""}`}
            onClick={() => setActiveTab("builder")}
          >
            <Sparkles size={20} />
            <span>メニュー構築</span>
          </button>
        </div>
      </nav>

      {/* AI重量更新 ＆ 褒めちぎりフィードバックモーダル */}
      {showProgressionModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.statValue} style={{ fontSize: "2rem" }}>🎉 GREAT JOB!</div>
            <h3 className={styles.feedbackTitle}>トレーニング完了！</h3>
            
            <div className={styles.feedbackMessage}>
              {aiFeedback}
            </div>

            {updatedExercisesProposal.length > 0 && (
              <div className={styles.progressionList}>
                <div className={styles.progressionTitle}>🚀 次回目標のアップデート提案</div>
                {updatedExercisesProposal.map((prop, idx) => {
                  const currentEx = menus[currentWorkoutName.replace(" (実施済み)", "").split(" ")[0]]?.find(ex => ex.name === prop.name);
                  const isUpgraded = currentEx ? prop.targetWeight > currentEx.weight : false;

                  return (
                    <div key={idx} className={styles.progressionItem}>
                      <span className={styles.progressionName}>{prop.name}</span>
                      <div className={styles.progressionChange}>
                        {currentEx && (
                          <span className={styles.oldVal}>{currentEx.weight}kg</span>
                        )}
                        <span className={styles.newVal} style={{ color: isUpgraded ? "var(--status-go)" : "var(--text-main)" }}>
                          {prop.targetWeight}kg ({prop.targetReps}回)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button className={`${styles.btnPrimary} ${styles.modalBtn}`} onClick={applyProgressionAndSave}>
              次回目標を適用して保存
            </button>
          </div>
        </div>
      )}

      {/* 代替種目モーダル */}
      {alternativeRequest && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "360px" }}>
            <h3 className={styles.feedbackTitle} style={{ fontSize: "1.1rem" }}>
              「{alternativeRequest.exerciseName}」の代替種目
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "16px" }}>
              ターゲット部位が同様の以下の種目と入れ替えられます。
            </p>

            <div className={styles.altList}>
              {alternativesList.map((alt, idx) => (
                <div 
                  key={idx} 
                  className={styles.altCard}
                  onClick={() => selectAlternative(alt.name, alt.weight, alt.reps, alt.sets)}
                >
                  <div className={styles.altName}>{alt.name}</div>
                  <div className={styles.altTarget}>推奨: {alt.weight}kg × {alt.reps}回 ({alt.sets}セット)</div>
                  <div className={styles.altReason}>{alt.reason}</div>
                </div>
              ))}
            </div>

            <button 
              className={styles.btnSecondary} 
              style={{ width: "100%" }}
              onClick={() => {
                setAlternativeRequest(null);
                setAlternativesList([]);
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* AI体調調整モーダル */}
      {showAdjustModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "360px" }}>
            <div className={styles.statValue} style={{ fontSize: "1.5rem", marginBottom: "8px" }}>🩺 AI体調調整</div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "20px" }}>
              今日の体調や時間に合わせて、基本メニューはそのままに、今日のトレーニングだけをAIが一時的に調整します。
            </p>

            {/* 体調選択 */}
            <div style={{ width: "100%", textAlign: "left", marginBottom: "16px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "8px" }}>
                今日の体調は？
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <button 
                  className={`${styles.btnSecondary} ${userCondition === "normal" ? styles.actionCardActive : ""}`}
                  style={{ justifyContent: "flex-start", padding: "10px" }}
                  onClick={() => setUserCondition("normal")}
                >
                  😀 普通（予定通り行う）
                </button>
                <button 
                  className={`${styles.btnSecondary} ${userCondition === "energetic" ? styles.actionCardActive : ""}`}
                  style={{ justifyContent: "flex-start", padding: "10px" }}
                  onClick={() => setUserCondition("energetic")}
                >
                  🔥 絶好調（もっと追い込みたい！）
                </button>
                <button 
                  className={`${styles.btnSecondary} ${userCondition === "fatigued" ? styles.actionCardActive : ""}`}
                  style={{ justifyContent: "flex-start", padding: "10px" }}
                  onClick={() => setUserCondition("fatigued")}
                >
                  💤 寝不足・疲労（ボリュームを減らす）
                </button>
                <button 
                  className={`${styles.btnSecondary} ${userCondition === "joint_ache" ? styles.actionCardActive : ""}`}
                  style={{ justifyContent: "flex-start", padding: "10px" }}
                  onClick={() => setUserCondition("joint_ache")}
                >
                  ⚠️ 肩や腰に軽い痛み・違和感がある
                </button>
              </div>
            </div>

            {/* 時間制限選択 */}
            <div style={{ width: "100%", textAlign: "left", marginBottom: "24px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "8px" }}>
                時間制限は？
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button 
                  className={`${styles.btnSecondary} ${userTimeLimit === "none" ? styles.actionCardActive : ""}`}
                  style={{ flex: 1, padding: "10px" }}
                  onClick={() => setUserTimeLimit("none")}
                >
                  <Clock size={14} style={{ marginRight: "4px" }} /> なし
                </button>
                <button 
                  className={`${styles.btnSecondary} ${userTimeLimit === "short" ? styles.actionCardActive : ""}`}
                  style={{ flex: 1, padding: "10px" }}
                  onClick={() => setUserTimeLimit("short")}
                >
                  ⚡️ 時短 (30分)
                </button>
              </div>
            </div>

            {/* 自由記述調整メモ */}
            <div style={{ width: "100%", textAlign: "left", marginBottom: "20px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "8px" }}>
                具体的な状況や要望（自由記述）
              </label>
              <input
                type="text"
                className={styles.textInput}
                placeholder="例: 肩が痛い、ベンチプレスを腕立て伏せに変更等"
                value={customAdjustmentNote}
                onChange={(e) => setCustomAdjustmentNote(e.target.value)}
                style={{ fontSize: "0.75rem", padding: "8px 10px", width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              <button 
                className={styles.btnSecondary} 
                style={{ flex: 1 }}
                onClick={() => setShowAdjustModal(false)}
              >
                キャンセル
              </button>
              <button 
                className={styles.btnPrimary} 
                style={{ flex: 2 }}
                onClick={applyAIWorkoutAdjustment}
              >
                AI調整メニューを適用
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ヘルプモーダル */}
      {showHelpModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "420px", textAlign: "left" }}>
            <h3 className={styles.feedbackTitle} style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "10px", marginBottom: "16px" }}>
              <HelpCircle size={18} style={{ color: "var(--color-primary)" }} /> Fitrum 使い方ガイド
            </h3>
            
            <div style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: "6px", display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.75rem", lineHeight: "1.5", color: "var(--text-main)" }}>
              
              <div>
                <span style={{ fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "4px", fontSize: "0.8rem" }}>
                  1. 【準備】メニューとAIカルテの登録
                </span>
                <p style={{ color: "var(--text-muted)" }}>
                  「メニュー構築」タブ (Tab 2) にて、AIを使って基本メニューを作成するか、お手持ちのメニューを貼り付けます。<br />
                  「過去取込」を選ぶと、目標やケガの制限を手動調整できる <strong>AIカルテ</strong> が表示されます。「週の目標頻度」設定は完全廃止され、AIがカレンダーから直接判断します。
                </p>
              </div>

              <div>
                <span style={{ fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "4px", fontSize: "0.8rem" }}>
                  2. 【計画】行ける日の設定 ＆ AI自動配置
                </span>
                <p style={{ color: "var(--text-muted)" }}>
                  カレンダーの日付をダブルタップ（またはタップして下の👌❌❓ボタンを選択）し、ジムに行く予定の日を指定します。<br />
                  カレンダー下の <strong>「AIスケジュール構築」</strong> ボタンを押すと、AIが予定を自動配置します。<br />
                  <strong>・👌が週2回以下</strong> ➔ 全身を鍛える「全身法」メニューを動的にブレンド作成。<br />
                  <strong>・👌が週3回以上</strong> ➔ 基本のローテーション順序（A➔B➔C...）を崩さずに順次配置。
                </p>
              </div>

              <div>
                <span style={{ fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "4px", fontSize: "0.8rem" }}>
                  3. 【実行】トレーニング記録 ＆ レベルアップ
                </span>
                <p style={{ color: "var(--text-muted)" }}>
                  ジムに着いたら、予定種目の各セット重量・回数を記入し、完了したセットの <strong>チェック（✔）</strong> を入れます。<br />
                  すべて終えたら <strong>「本日のトレーニングを完了」</strong> ボタンを押します。AIが今日の実績を分析し、目標クリア状況に応じて次回の目標（重量・回数）の自動更新を提案します。
                </p>
              </div>

              <div>
                <span style={{ fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "4px", fontSize: "0.8rem" }}>
                  4. 【連携】変更時の自動スケジュール再構築
                </span>
                <p style={{ color: "var(--text-muted)" }}>
                  <strong>・全ルーティン伝播:</strong> 完了した種目の重量更新は、全ルーティン（A, B, C...）の同種目へ自動で伝播します。<br />
                  <strong>・自動再構築:</strong> 基本メニューの手動変更時や、重量更新適用時、カレンダーの👌/❌を変更した際は、<strong>未来の予定（未完了）が最新の設定で自動再構築</strong>されます。
                </p>
              </div>

              <div>
                <span style={{ fontWeight: "700", color: "var(--color-primary)", display: "block", marginBottom: "4px", fontSize: "0.8rem" }}>
                  5. 【調整】その日限りのメニュー調整
                </span>
                <p style={{ color: "var(--text-muted)" }}>
                  <strong>・代替種目 (代わり):</strong> 混雑や痛みがある場合、ボタンからAIが同等強度に換算した代替種目を提案します。この差し替えは当日限り有効で、基本メニューは汚されません。<br />
                  <strong>・AI体調調整:</strong> 寝不足や疲労度、痛みに合わせて、今日だけのメニュー（セット減など）をAIが自動調整します。
                </p>
              </div>

            </div>

            <button 
              className={styles.btnPrimary} 
              style={{ width: "100%", marginTop: "16px" }} 
              onClick={() => setShowHelpModal(false)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
