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
  ArrowRight,
  ClipboardList
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

  // --- カレンダー描画用状態 ---
  const [dates, setDates] = useState<Date[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string>("");

  // --- 記録入力用状態 (選択した日のワークアウト実績) ---
  const [currentWorkoutName, setCurrentWorkoutName] = useState<string>("");
  const [exerciseRecords, setExerciseRecords] = useState<ExerciseRecord[]>([]);

  // --- AIレスポンス・ポップアップ状態 ---
  const [aiFeedback, setAiFeedback] = useState<string>("");
  const [updatedExercisesProposal, setUpdatedExercisesProposal] = useState<any[]>([]);
  const [showProgressionModal, setShowProgressionModal] = useState(false);
  const [alternativeRequest, setAlternativeRequest] = useState<{ exerciseName: string; index: number } | null>(null);
  const [alternativesList, setAlternativesList] = useState<any[]>([]);
  
  // --- Tab 2: AIメニュー構築用の状態 ---
  const [aiRequestText, setAiRequestText] = useState("");
  const [builderAction, setBuilderAction] = useState<"create" | "improve" | "import" | "alternative">("improve");
  const [aiBuilderResponse, setAiBuilderResponse] = useState<string>("");
  const [frequency, setFrequency] = useState(3);
  const [goals, setGoals] = useState("胸と背中を大きくしたい");
  const [equipment, setEquipment] = useState("ジムのフル器具");

  // 手動編集用のテンポラリメニュー状態
  const [editableMenus, setEditableMenus] = useState<Menus>({});
  const [isEditingManual, setIsEditingManual] = useState(false);

  // 1. 初期ロード
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedKey = localStorage.getItem("aurafit_api_key");
      const savedMenus = localStorage.getItem("aurafit_menus");
      const savedSchedule = localStorage.getItem("aurafit_schedule");
      const savedDateStates = localStorage.getItem("aurafit_date_states");
      const savedStreak = localStorage.getItem("aurafit_streak");

      let loadedMenus = INITIAL_MENUS;
      if (savedKey) {
        setApiKey(savedKey);
        setInputApiKey(savedKey);
        setShowKeyWarning(false);
      }
      if (savedMenus) {
        loadedMenus = JSON.parse(savedMenus);
        setMenus(loadedMenus);
      }
      setEditableMenus(JSON.parse(JSON.stringify(loadedMenus))); // 深いコピー

      if (savedSchedule) setSchedule(JSON.parse(savedSchedule));
      if (savedDateStates) setDateStates(JSON.parse(savedDateStates));
      if (savedStreak) setStreak(parseInt(savedStreak, 10));

      const tempDates = [];
      const today = new Date();
      setSelectedDateStr(formatDate(today));

      for (let i = 0; i < 30; i++) {
        const nextDate = new Date();
        nextDate.setDate(today.getDate() + i);
        tempDates.push(nextDate);
      }
      setDates(tempDates);
    }
  }, []);

  // APIキーの保存
  const handleSaveApiKey = () => {
    if (!inputApiKey.trim()) {
      alert("有効なAPIキーを入力してください。");
      return;
    }
    setApiKey(inputApiKey.trim());
    localStorage.setItem("aurafit_api_key", inputApiKey.trim());
    setShowKeyWarning(false);
    alert("Gemini APIキーをLocalStorageに保存しました！");
  };

  // 状態の変更をLocalStorageに反映するヘルパー
  const saveToLocalStorage = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // 日付フォーマットヘルパー
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 日付状態トグル
  const toggleDateState = (dateStr: string) => {
    const current = dateStates[dateStr] || "DEFAULT";
    let next: DateState = "DEFAULT";
    if (current === "DEFAULT") next = "CONFIRMED_GO";
    else if (current === "CONFIRMED_GO") next = "CONFIRMED_NO";
    else if (current === "CONFIRMED_NO") next = "MAYBE";
    else if (current === "MAYBE") next = "DEFAULT";

    const newStates = { ...dateStates, [dateStr]: next };
    setDateStates(newStates);
    saveToLocalStorage("aurafit_date_states", newStates);
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
  const buildScheduleWithAI = async () => {
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

      const confirmedDays = Object.keys(dateStates).filter(k => dateStates[k] === "CONFIRMED_GO");
      const maybeDays = Object.keys(dateStates).filter(k => dateStates[k] === "MAYBE");
      const noDays = Object.keys(dateStates).filter(k => dateStates[k] === "CONFIRMED_NO");

      const prompt = `
ユーザーのスケジュールに合わせて最適な1ヶ月分の計画（部位・メニューの割り振り）を作成してください。

【ユーザーデータ】
- 確定している行ける日 (confirmedDays): [${confirmedDays.join(", ")}]
- 行けるかもしれない微妙な日 (maybeDays): [${maybeDays.join(", ")}]
- 絶対に行けないオフ日 (noDays): [${noDays.join(", ")}]
- 目標頻度: 週に約 ${frequency} 回
- 現在設定されている基本メニュー (menus): ${JSON.stringify(menus, null, 2)}

【指示】
1. 開始日から終了日までの約30日間のカレンダーを設計します。
2. 絶対に行けないオフ日 (noDays) にはメニューを配置しないでください。
3. ユーザーが指定した行ける日 (confirmedDays) と微妙な日 (maybeDays) を優先的にトレーニング日として使用します。
4. 不足している場合は、その他の「未指定の日」から仮の日程をAIが選定（仮予定）してください。
5. 定義されている基本メニュー（A, B, Cなど）を順番にローテーションで割り振ります。もし基本メニューがAのみであれば、毎日Aを割り振ります。

以下のJSONフォーマットで回答してください。

【出力フォーマット】
{
  "schedule": [
    {
      "date": "YYYY-MM-DD",
      "workoutName": "A", // ルーティン名
      "isTemp": true      // 仮配置はtrue、確定・微妙はfalse
    }
  ]
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "あなたはJSONフォーマットでスケジュールデータのみを返却する筋トレ支援APIです。",
        },
      });

      const data = JSON.parse(response.text || "{}");

      if (data.schedule) {
        setSchedule(data.schedule);
        saveToLocalStorage("aurafit_schedule", data.schedule);
      }
    } catch (err) {
      console.error(err);
      alert("AIスケジュールの構築に失敗しました。キーまたは接続を確認してください。");
    } finally {
      setLoading(false);
    }
  };

  // 4. 今日のワークアウト記録の初期化
  useEffect(() => {
    if (!selectedDateStr) return;

    const scheduled = schedule.find(item => item.date === selectedDateStr);
    if (scheduled && !scheduled.completed) {
      setCurrentWorkoutName(scheduled.workoutName);
      const exerciseList = menus[scheduled.workoutName] || [];

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
      setExerciseRecords([]);
    } else {
      setCurrentWorkoutName("");
      setExerciseRecords([]);
    }
  }, [selectedDateStr, schedule, menus]);

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

  // 5. トレーニング完了とワンストップ重量更新
  const completeWorkout = async () => {
    const hasAnyCompleted = exerciseRecords.some(ex => ex.sets.some(s => s.completed));
    if (!hasAnyCompleted) {
      alert("少なくとも1セット以上完了のチェックを入れてください。");
      return;
    }

    setLoading(true);
    try {
      const ai = getAiInstance();

      const prompt = `
ユーザーの今日の実績を分析し、次回の目標重量・回数・セット数を決定し、励ます褒め言葉を生成してください。

【結果】
メニュー名: ${currentWorkoutName}
実績:
${JSON.stringify(exerciseRecords, null, 2)}

【重量設定ルール】
- 目標セット数すべてにおいて目標回数をクリアし、かつ目標重量で行えた場合 ➔ 次回増量（上半身+2.5kg/下半身+5kgなど）。
- 届かなかったセットがある場合 ➔ 重量維持。

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
  "feedback": "Geminiからの褒めメッセージ(150文字程度)"
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "実績データから次回目標と褒め言葉のJSONを作成するトレーナーAPIです。",
        },
      });

      const data = JSON.parse(response.text || "{}");
      setAiFeedback(data.feedback);
      setUpdatedExercisesProposal(data.updatedExercises || []);
      setShowProgressionModal(true);
    } catch (err) {
      console.error(err);
      alert("AIフィードバックの取得に失敗しました。キーまたは接続を確認してください。");
    } finally {
      setLoading(false);
    }
  };

  // AIによる重量更新と完了の確定適用
  const applyProgressionAndSave = () => {
    const updatedSchedule = schedule.map(item => {
      if (item.date === selectedDateStr) {
        return { ...item, completed: true };
      }
      return item;
    });
    setSchedule(updatedSchedule);
    saveToLocalStorage("aurafit_schedule", updatedSchedule);

    if (updatedExercisesProposal.length > 0 && currentWorkoutName) {
      const pureWorkoutName = currentWorkoutName.replace(" (実施済み)", "");
      const updatedMenus = { ...menus };

      updatedMenus[pureWorkoutName] = updatedMenus[pureWorkoutName].map(ex => {
        const proposal = updatedExercisesProposal.find(p => p.name === ex.name);
        if (proposal) {
          return {
            ...ex,
            weight: proposal.targetWeight,
            reps: proposal.targetReps,
            sets: proposal.targetSets
          };
        }
        return ex;
      });

      setMenus(updatedMenus);
      setEditableMenus(JSON.parse(JSON.stringify(updatedMenus)));
      saveToLocalStorage("aurafit_menus", updatedMenus);
    }

    const newStreak = streak + 1;
    setStreak(newStreak);
    saveToLocalStorage("aurafit_streak", newStreak);
    setShowProgressionModal(false);
  };

  // 6. 玉突きスライド
  const slideWorkoutToNextAvailable = () => {
    const todayIndex = schedule.findIndex(item => item.date === selectedDateStr);
    if (todayIndex === -1) {
      alert("今日の予定がありません。スライドできません。");
      return;
    }

    const currentItem = schedule[todayIndex];
    if (currentItem.completed) {
      alert("このワークアウトはすでに実施済みです。");
      return;
    }

    const futureScheduledDays = schedule
      .map((item, index) => ({ ...item, index }))
      .filter(item => item.index >= todayIndex && !item.completed);

    if (futureScheduledDays.length < 2) {
      alert("スライド先となる未来のトレーニング日程がありません。カレンダーで日付を増やすか、AIスケジュール構築を行ってください。");
      return;
    }

    const newSchedule = [...schedule];
    for (let i = futureScheduledDays.length - 1; i > 0; i--) {
      const current = futureScheduledDays[i];
      const prev = futureScheduledDays[i - 1];
      newSchedule[current.index].workoutName = prev.workoutName;
      newSchedule[current.index].isTemp = prev.isTemp;
    }

    newSchedule[todayIndex] = {
      date: selectedDateStr,
      workoutName: "",
      isTemp: false,
      completed: false
    };

    setSchedule(newSchedule);
    saveToLocalStorage("aurafit_schedule", newSchedule);
  };

  // 7. Tab 2: AIメニュー構築・改善・インポート
  const handleAIBuilderSubmit = async () => {
    if ((builderAction === "improve" || builderAction === "import") && !aiRequestText.trim()) {
      alert("要望またはメニューテキストを入力してください。");
      return;
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
- 目標: "${goals}"
- 週の頻度: ${frequency} 日
- 利用可能な器具: "${equipment}"

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
ユーザーがこれまで行っていた過去の筋トレ内容（メモ、日記、雑多なテキスト）を解析し、アプリ用の筋トレメニューとしてインポート可能なJSON構造にパースしてください。

【ユーザーの入力テキスト】
"${aiRequestText}"

【指示】
- テキスト内に曜日、分割（例: 胸の日、背中の日など）、または複数のワークアウトセットがある場合は、A, B, Cなどのルーティン名に分類してパースしてください。
- 1つの大きなメニューであれば "A" の中にすべての種目を配置してください。
- 重量や回数の記述がない場合は、妥当な初期値（例: 重量0〜20kg程度、10回、3セット）を適当に補填してください。

以下のJSONフォーマットで回答してください。

【出力フォーマット】
{
  "menus": {
    "A": [
      { "name": "種目名", "weight": 60, "reps": 10, "sets": 3 }
    ]
  }
}
`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "JSONフォーマットでメニューデータのみを出力してください。",
        },
      });

      const data = JSON.parse(response.text || "{}");

      if ((builderAction === "create" || builderAction === "import") && data.menus) {
        setMenus(data.menus);
        setEditableMenus(JSON.parse(JSON.stringify(data.menus)));
        saveToLocalStorage("aurafit_menus", data.menus);
        setAiBuilderResponse(
          builderAction === "import" 
            ? "過去のメニューの解析とインポートが成功しました！現在の基本メニューに反映されました。"
            : "新しいメニューを作成し、適用しました！カレンダーに戻り、「AIスケジュール構築」を実行してください。"
        );
      } else if (builderAction === "improve" && data.updatedMenus) {
        setMenus(data.updatedMenus);
        setEditableMenus(JSON.parse(JSON.stringify(data.updatedMenus)));
        saveToLocalStorage("aurafit_menus", data.updatedMenus);
        setAiBuilderResponse(`【改善内容】\n${data.explanation || "メニューを最適化しました。"}`);
      }
    } catch (err) {
      console.error(err);
      alert("AIへのリクエストに失敗しました。キーまたは入力内容を確認してください。");
    } finally {
      setLoading(false);
    }
  };

  // 代替種目の提案をリクエスト
  const requestAlternative = async (exerciseName: string, index: number) => {
    setLoading(true);
    try {
      const ai = getAiInstance();
      const prompt = `
ユーザーは現在「${exerciseName}」を行う予定ですが、以下の理由により代替種目を求めてしています。
代わりとなる筋トレ種目を3つ提案してください。

【状況】
- 代替したい種目: "${exerciseName}"
- 代替を希望する理由: "混雑、または痛みのため"
- 使用可能な器具: "${equipment}"

以下のJSONフォーマットで回答してください。

【出力フォーマット】
{
  "alternatives": [
    {
      "name": "代替種目名",
      "weight": 20,
      "reps": 12,
      "sets": 3,
      "reason": "この種目を推薦する理由"
    }
  ]
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "代替種目リストのJSONを返却してください。",
        },
      });

      const data = JSON.parse(response.text || "{}");
      setAlternativesList(data.alternatives || []);
      setAlternativeRequest({ exerciseName, index });
    } catch (err) {
      console.error(err);
      alert("代替種目の提案取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // 代替種目の適用
  const selectAlternative = (altName: string, altWeight: number, altReps: number, altSets: number) => {
    if (!alternativeRequest || !currentWorkoutName) return;
    
    const pureWorkoutName = currentWorkoutName.replace(" (実施済み)", "");

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

    const updatedMenus = { ...menus };
    updatedMenus[pureWorkoutName] = updatedMenus[pureWorkoutName].map((ex) => {
      if (ex.name === alternativeRequest.exerciseName) {
        return {
          name: altName,
          weight: altWeight,
          reps: altReps,
          sets: altSets
        };
      }
      return ex;
    });

    setMenus(updatedMenus);
    setEditableMenus(JSON.parse(JSON.stringify(updatedMenus)));
    saveToLocalStorage("aurafit_menus", updatedMenus);

    setAlternativeRequest(null);
    setAlternativesList([]);
  };

  // -------------------------------------------------------------
  // 手動メニュー編集用メソッド
  // -------------------------------------------------------------
  
  // 種目の変更ハンドラー
  const handleManualExerciseChange = (groupKey: string, exIndex: number, field: keyof Exercise, value: any) => {
    const updated = { ...editableMenus };
    if (field === "name") {
      updated[groupKey][exIndex].name = value;
    } else {
      updated[groupKey][exIndex][field] = Math.max(0, parseFloat(value) || 0);
    }
    setEditableMenus(updated);
  };

  // 種目の削除
  const handleManualDeleteExercise = (groupKey: string, exIndex: number) => {
    const updated = { ...editableMenus };
    updated[groupKey].splice(exIndex, 1);
    setEditableMenus(updated);
  };

  // 新規種目の追加
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

  // ルーティン（グループ）の追加
  const handleManualAddGroup = () => {
    const nextChar = String.fromCharCode(65 + Object.keys(editableMenus).length); // A, B, C...
    const updated = { ...editableMenus };
    updated[nextChar] = [
      { name: "ベンチプレス", weight: 40, reps: 10, sets: 3 }
    ];
    setEditableMenus(updated);
  };

  // ルーティン（グループ）の削除
  const handleManualDeleteGroup = (groupKey: string) => {
    if (confirm(`ルーティン ${groupKey} を完全に削除しますか？`)) {
      const updated = { ...editableMenus };
      delete updated[groupKey];
      setEditableMenus(updated);
    }
  };

  // 手動編集の保存
  const handleSaveManualChanges = () => {
    // バリデーション：空のルーティンは削除するか警告
    const cleaned = { ...editableMenus };
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key].length === 0) {
        delete cleaned[key];
      }
    });

    setMenus(cleaned);
    setEditableMenus(JSON.parse(JSON.stringify(cleaned)));
    saveToLocalStorage("aurafit_menus", cleaned);
    setIsEditingManual(false);
    alert("手動の変更を保存しました！");
  };

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <h1 className={styles.title}>AuraFit</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
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
          {/* 今日のやること */}
          <div className={styles.workoutSection} style={{ marginBottom: "20px", flex: "none" }}>
            <div className={styles.workoutHeader}>
              <div className={styles.workoutTitle}>
                {selectedDateStr === formatDate(new Date()) ? "🎯 今日のトレーニング" : `📅 ${selectedDateStr} の予定`}
                {currentWorkoutName && <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginLeft: "8px" }}>- {currentWorkoutName}</span>}
              </div>
              {currentWorkoutName && !currentWorkoutName.includes("(実施済み)") && (
                <button className={styles.btnSecondary} style={{ padding: "6px 10px", fontSize: "0.75rem" }} onClick={slideWorkoutToNextAvailable}>
                  明日にスライド
                </button>
              )}
            </div>

            {exerciseRecords.length > 0 ? (
              <div className={styles.exerciseList}>
                {exerciseRecords.map((ex, exIdx) => (
                  <div key={exIdx} className={styles.exerciseCard}>
                    <div className={styles.exerciseHeader}>
                      <span className={styles.exerciseName}>{ex.name}</span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span className={styles.targetInfo}>{ex.targetWeight}kg × {ex.targetReps}回</span>
                        <button 
                          className={styles.btnSecondary} 
                          style={{ padding: "4px 8px", fontSize: "0.7rem", height: "24px" }}
                          onClick={() => requestAlternative(ex.name, exIdx)}
                        >
                          代わり
                        </button>
                      </div>
                    </div>

                    <div className={styles.setList}>
                      {ex.sets.map((set, setIdx) => (
                        <div key={setIdx} className={styles.setRow}>
                          <span className={styles.setNumber}>Set {setIdx + 1}</span>
                          <div className={styles.setInputGroup}>
                            {/* 重量 */}
                            <div className={styles.inputWrapper}>
                              <button className={styles.adjustBtn} onClick={() => handleSetChange(exIdx, setIdx, "weight", set.weight - 2.5)}>
                                <Minus size={12} />
                              </button>
                              <input 
                                type="number" 
                                className={styles.numInput} 
                                value={set.weight} 
                                onChange={(e) => handleSetChange(exIdx, setIdx, "weight", parseFloat(e.target.value) || 0)} 
                              />
                              <span className={styles.inputLabel}>kg</span>
                              <button className={styles.adjustBtn} onClick={() => handleSetChange(exIdx, setIdx, "weight", set.weight + 2.5)}>
                                <Plus size={12} />
                              </button>
                            </div>

                            {/* 回数 */}
                            <div className={styles.inputWrapper}>
                              <button className={styles.adjustBtn} onClick={() => handleSetChange(exIdx, setIdx, "reps", set.reps - 1)}>
                                <Minus size={12} />
                              </button>
                              <input 
                                type="number" 
                                className={styles.numInput} 
                                value={set.reps} 
                                onChange={(e) => handleSetChange(exIdx, setIdx, "reps", parseInt(e.target.value, 10) || 0)} 
                              />
                              <span className={styles.inputLabel}>回</span>
                              <button className={styles.adjustBtn} onClick={() => handleSetChange(exIdx, setIdx, "reps", set.reps + 1)}>
                                <Plus size={12} />
                              </button>
                            </div>

                            {/* チェック */}
                            <button 
                              className={`${styles.checkBtn} ${set.completed ? styles.checkBtnActive : ""}`}
                              onClick={() => toggleSetComplete(exIdx, setIdx)}
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                
                <button className={`${styles.btnPrimary} ${styles.submitBtn}`} onClick={completeWorkout}>
                  <Zap size={16} /> 本日のトレーニングを完了
                </button>
              </div>
            ) : (
              <div className={styles.noWorkoutText}>
                {currentWorkoutName.includes("(実施済み)") ? (
                  <p style={{ color: "var(--status-go)" }}>✨ この日のトレーニングは完了しています！</p>
                ) : (
                  <p>本日はトレーニング予定はありません。<br/>休養を取るか、カレンダーから日付を選択してください。</p>
                )}
              </div>
            )}
          </div>

          {/* カレンダー */}
          <div className={styles.calendarSection}>
            <div className={styles.sectionTitle}>
              <span>📅 カレンダー（最大1ヶ月）</span>
              <span className={styles.helperText}>ダブルタップ：予定切替 | タップ：選択</span>
            </div>
            
            <div className={styles.calendarGrid}>
              {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                <div key={i} className={styles.weekdayHeader}>{d}</div>
              ))}
              
              {dates.map((d, idx) => {
                const dateStr = formatDate(d);
                const isSelected = dateStr === selectedDateStr;
                const state = dateStates[dateStr] || "DEFAULT";
                const isScheduled = schedule.some(item => item.date === dateStr && item.workoutName);
                const isCompleted = schedule.some(item => item.date === dateStr && item.completed);

                let stateClass = styles.dayDefault;
                if (state === "CONFIRMED_GO") stateClass = styles.dayGo;
                else if (state === "CONFIRMED_NO") stateClass = styles.dayNo;
                else if (state === "MAYBE") stateClass = styles.dayMaybe;

                return (
                  <button 
                    key={idx} 
                    className={`${styles.calendarDay} ${stateClass} ${isSelected ? styles.selectedDay : ""}`}
                    onClick={() => setSelectedDateStr(dateStr)}
                    onDoubleClick={() => toggleDateState(dateStr)}
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
              <div style={{ display: "flex", gap: "10px", justifyContent: "center", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--status-default)" }}></span> 未定</span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--status-go)" }}></span> 行ける(確)</span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--status-no)" }}></span> オフ</span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--status-maybe)" }}></span> 微妙</span>
              </div>

              <div className={styles.calendarActions}>
                <button className={styles.btnSecondary} onClick={() => toggleDateState(selectedDateStr)}>
                  選択日の予定を変更
                </button>
                <button className={styles.btnPrimary} onClick={buildScheduleWithAI}>
                  <Sparkles size={14} /> AIスケジュール構築
                </button>
              </div>
            </div>
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

          {/* クイックアクション */}
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

          {/* AIフォーム & 各種フォーム */}
          <div className={styles.aiChatBox}>
            {builderAction === "create" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>目標 (部位や強度)</label>
                  <input type="text" className={styles.textInput} style={{ width: "100%" }} value={goals} onChange={(e) => setGoals(e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>週の頻度</label>
                    <input type="number" className={styles.textInput} style={{ width: "100%" }} value={frequency} onChange={(e) => setFrequency(parseInt(e.target.value, 10) || 3)} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>使える器具</label>
                    <input type="text" className={styles.textInput} style={{ width: "100%" }} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
                  </div>
                </div>
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
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  以前行っていたメニューのテキストを貼り付け（AIが自動パースします）
                </label>
                <textarea 
                  className={styles.textInput} 
                  rows={4} 
                  style={{ resize: "none", width: "100%" }}
                  placeholder="例: 月曜：ベンチプレス60kg 10回3セット、サイドレイズ10kg 12回3セット。木曜：スクワット80kg 8回3セット..."
                  value={aiRequestText}
                  onChange={(e) => setAiRequestText(e.target.value)}
                />
                <button className={styles.btnPrimary} onClick={handleAIBuilderSubmit}>
                  テキストからメニューを取り込む
                </button>
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

          {/* 現在の基本メニュー設定 (手動カスタマイズモード搭載) */}
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

            {/* 手動編集時のUI */}
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
              /* 通常表示時のUI */
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
                  const currentEx = menus[currentWorkoutName.replace(" (実施済み)", "")]?.find(ex => ex.name === prop.name);
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
    </div>
  );
}
