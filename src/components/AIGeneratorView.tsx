import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, 
  Sparkles, 
  BookOpen, 
  Headphones, 
  MessageSquare, 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  Check, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  HelpCircle, 
  Lightbulb 
} from "lucide-react";

// Types matching App.tsx
export interface Option {
  id: number;
  text: string;
  partOfSpeech: string;
}

export interface Question {
  id: number;
  definition: string;
  options: Option[];
  correctId: number;
}

export interface StudySet {
  id: string;
  title: string;
  questions: Question[];
  createdAt: number;
  lastScore?: { correct: number; total: number };
  needsReview?: number[];
}

interface AIQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface AIExerciseResponse {
  reading: string;
  listening: string;
  questions: AIQuestion[];
}

interface AIGeneratorViewProps {
  studySet: StudySet;
  onBack: () => void;
  speakText: (text: string) => void;
}

// Custom Markdown Bold parser & highlighters to avoid react-markdown dependencies
const parseBoldText = (text: string) => {
  if (!text) return "";
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const cleanWord = part.slice(2, -2);
      return (
        <span 
          key={index} 
          className="text-pink-400 bg-pink-500/10 border border-pink-400/20 px-2 py-0.5 rounded-lg font-extrabold font-bubble inline-block animate-pulse duration-1000"
        >
          {cleanWord}
        </span>
      );
    }
    return part;
  });
};

interface DialogueLine {
  speaker: string;
  text: string;
}

const parseListeningScript = (listeningText: string): DialogueLine[] => {
  if (!listeningText) return [];
  const lines: DialogueLine[] = [];

  // Match JSON-like blocks: e.g. {"Speaker": "Teacher", "text": "..."}
  const matches = listeningText.match(/\{[^{}]*\}/g);
  if (matches && matches.length > 0) {
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        const speaker = parsed.Speaker || parsed.speaker || parsed.name || parsed.Name || "Speaker";
        const text = parsed.text || parsed.Text || parsed.dialogue || parsed.content || "";
        if (text) {
          lines.push({ speaker, text });
        }
      } catch (e) {
        // Fallback manual regex in case JSON keys are unquoted or malformed
        const speakerMatch = match.match(/"(?:Speaker|speaker|name)":\s*"([^"]+)"/i);
        const textMatch = match.match(/"(?:text|content|dialogue)":\s*"([^"]+)"/i);
        if (textMatch) {
          lines.push({
            speaker: speakerMatch ? speakerMatch[1] : "Speaker",
            text: textMatch[1].replace(/\\"/g, '"')
          });
        }
      }
    }
  }

  // If no lines were parsed, fallback to plain-text parsing (line-by-line format e.g. "Speaker: Dialogue")
  if (lines.length === 0) {
    const rawLines = listeningText.split(/\r?\n/);
    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      
      const colonMatch = trimmed.match(/^(?:\*\*|\[)?([A-Za-z0-9\s._-]+)(?:\*\*|\])?\s*:\s*(.*)$/);
      if (colonMatch) {
        lines.push({
          speaker: colonMatch[1].trim(),
          text: colonMatch[2].trim()
        });
      } else {
        lines.push({
          speaker: "",
          text: trimmed
        });
      }
    }
  }

  return lines;
};

const SUGGESTED_TOPICS = [
  { text: "Thám hiểm vũ trụ", english: "Space exploration & astronaut life", icon: "🌌" },
  { text: "Cuộc thi nấu ăn", english: "A stressful masterchef cooking competition", icon: "🍳" },
  { text: "Vương quốc rồng cổ tích", english: "An ancient fairy kingdom protected by friendly dragons", icon: "🏰" },
  { text: "Cuộc sống học đường Anime", english: "A beautiful slice-of-life anime high school day", icon: "🏫" },
  { text: "Hòn đảo hoang bí ẩn", english: "Survival and exploration on a mysterious tropical island", icon: "🏝️" }
];

export default function AIGeneratorView({ studySet, onBack, speakText }: AIGeneratorViewProps) {
  const [topic, setTopic] = useState("");
  const [listeningFormat, setListeningFormat] = useState<'dialogue' | 'monologue'>('dialogue');
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exercise, setExercise] = useState<AIExerciseResponse | null>(null);
  
  // Tab control: 'reading' | 'listening' | 'quiz'
  const [activeTab, setActiveTab] = useState<'reading' | 'listening' | 'quiz'>('reading');

  // Quiz game state
  const [quizAnswers, setQuizAnswers] = useState<(number | null)[]>([null, null, null, null, null]);
  const [showExplanation, setShowExplanation] = useState<boolean[]>([false, false, false, false, false]);

  // Audio speech synthesis state
  const [isPlaying, setIsPlaying] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.85); // slower speech is better for English learners
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() => {
    try {
      return localStorage.getItem("koko_selected_voice_uri") || "";
    } catch {
      return "";
    }
  });
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Collect unique vocabulary words from this study set
  const vocabList = studySet.questions.map(q => {
    const correctOpt = q.options.find(o => o.id === q.correctId);
    return {
      word: correctOpt?.text || "Unknown",
      partOfSpeech: correctOpt?.partOfSpeech || "n/v/adj",
      definition: q.definition
    };
  }).filter(v => v.word !== "Unknown");

  // Load and subscribe to speech voices
  useEffect(() => {
    if (vocabList.length > 0) {
      setSelectedWords(vocabList.map(v => v.word));
    }
    synthRef.current = window.speechSynthesis || null;

    const updateVoices = () => {
      if (synthRef.current) {
        const allVoices = synthRef.current.getVoices();
        // Filter English (en) voices
        const englishVoices = allVoices.filter(v => v.lang.toLowerCase().startsWith("en"));
        setVoices(englishVoices);
        
        // Auto-select a voice if none is selected
        if (englishVoices.length > 0) {
          const stored = localStorage.getItem("koko_selected_voice_uri");
          if (stored && englishVoices.some(v => v.voiceURI === stored)) {
            setSelectedVoiceURI(stored);
          } else {
            // Find a high-quality default voice
            const preferred = englishVoices.find(v => 
              v.name.includes("Google US English") || 
              v.name.includes("Samantha") || 
              v.name.includes("Natural") ||
              v.name.includes("Microsoft Zira")
            );
            const defaultURI = preferred ? preferred.voiceURI : englishVoices[0].voiceURI;
            setSelectedVoiceURI(defaultURI);
            localStorage.setItem("koko_selected_voice_uri", defaultURI);
          }
        }
      }
    };

    updateVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      stopSpeech();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [studySet]);

  const handleVoiceChange = (uri: string) => {
    setSelectedVoiceURI(uri);
    try {
      localStorage.setItem("koko_selected_voice_uri", uri);
    } catch (e) {
      console.error(e);
    }
    stopSpeech();
  };

  const handleToggleWord = (word: string) => {
    if (selectedWords.includes(word)) {
      setSelectedWords(selectedWords.filter(w => w !== word));
    } else {
      setSelectedWords([...selectedWords, word]);
    }
  };

  const handleSelectAll = () => {
    setSelectedWords(vocabList.map(v => v.word));
  };

  const handleDeselectAll = () => {
    setSelectedWords([]);
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Vui lòng nhập hoặc chọn một chủ đề yêu thích nhé Senpai! 🌸");
      return;
    }
    if (selectedWords.length === 0) {
      setError("Senpai hãy chọn ít nhất 1 từ vựng để Koko tích hợp vào bài học nhen! ✨");
      return;
    }
    if (selectedWords.length > 8) {
      setError("Senpai ơi, chỉ nên chọn tối đa 8 từ vựng mỗi lần tạo thôi nhen! Việc này giúp Koko viết một câu chuyện thật tự nhiên, mạch lạc và tránh bị quá tải hệ thống đó ạ! 💕");
      return;
    }

    setLoading(true);
    setError(null);
    setExercise(null);
    setQuizAnswers([null, null, null, null, null]);
    setShowExplanation([false, false, false, false, false]);
    stopSpeech();

    const selectedVocabData = vocabList.filter(v => selectedWords.includes(v.word));

    try {
      const response = await fetch("/api/ai/generate-exercise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          topic: topic.trim(),
          vocab: selectedVocabData,
          listeningFormat: listeningFormat
        })
      });

      const responseText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Non-JSON response received:", responseText);
        if (response.status === 504 || response.status === 502 || response.status === 503 || response.status === 500) {
          throw new Error("Máy chủ AI đang bận hoặc bị quá tải thời gian chờ (Timeout/Overload). Senpai vui lòng thử lại sau giây lát nhen! 💕");
        }
        throw new Error("Phản hồi từ máy chủ không hợp lệ. Senpai vui lòng thử lại nhen!");
      }

      if (!response.ok) {
        throw new Error(data?.error || "Gặp sự cố khi sinh nội dung.");
      }

      setExercise(data);
      setActiveTab('reading');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Không thể kết nối tới vòm ma pháp Gemini. Senpai hãy kiểm tra lại khóa API hoặc kết nối internet nhé!");
    } finally {
      setLoading(false);
    }
  };

  // Browser Text-To-Speech implementation
  const playSpeech = () => {
    if (!synthRef.current || !exercise) return;

    stopSpeech();

    // Clean markdown bold notation and format the play list so speech sounds natural
    const parsedLines = parseListeningScript(exercise.listening);
    const cleanText = parsedLines.map(line => {
      const prefix = line.speaker ? `${line.speaker} says: ` : "";
      return prefix + line.text.replace(/\*\*/g, "");
    }).join("\n\n");

    const utterance = new SpeechSynthesisUtterance(cleanText || exercise.listening.replace(/\*\*/g, ""));
    utterance.lang = "en-US";
    utterance.rate = speechRate;
    utterance.pitch = speechPitch;

    // Apply selected voice
    if (selectedVoiceURI) {
      const allVoices = synthRef.current.getVoices();
      const activeVoice = allVoices.find(v => v.voiceURI === selectedVoiceURI);
      if (activeVoice) {
        utterance.voice = activeVoice;
        utterance.lang = activeVoice.lang;
      }
    }

    utterance.onend = () => {
      setIsPlaying(false);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
    setIsPlaying(true);
    synthRef.current.speak(utterance);
  };

  const playLineSpeech = (text: string) => {
    if (!synthRef.current) return;
    stopSpeech();

    const cleanText = text.replace(/\*\*/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";
    utterance.rate = speechRate;
    utterance.pitch = speechPitch;

    if (selectedVoiceURI) {
      const allVoices = synthRef.current.getVoices();
      const activeVoice = allVoices.find(v => v.voiceURI === selectedVoiceURI);
      if (activeVoice) {
        utterance.voice = activeVoice;
        utterance.lang = activeVoice.lang;
      }
    }

    synthRef.current.speak(utterance);
  };

  const pauseSpeech = () => {
    if (synthRef.current) {
      if (synthRef.current.speaking && !synthRef.current.paused) {
        synthRef.current.pause();
        setIsPlaying(false);
      } else if (synthRef.current.paused) {
        synthRef.current.resume();
        setIsPlaying(true);
      }
    }
  };

  const stopSpeech = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsPlaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0727] text-white flex flex-col font-sans p-6 pb-20 relative overflow-hidden">
      {/* Decorative floating shapes */}
      <div className="absolute top-10 left-10 text-white/5 text-4xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '10s' }}>🌸</div>
      <div className="absolute bottom-20 right-10 text-white/5 text-5xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '8s' }}>🌸</div>
      
      {/* Header */}
      <header className="max-w-4xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/5 pb-5 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-3 bg-white/5 hover:bg-pink-600/20 hover:text-pink-300 border border-white/10 rounded-2xl transition-all cursor-pointer group shrink-0"
            title="Quay lại bảng điều khiển"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <span className="text-pink-400 text-xs font-black tracking-widest uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} /> Lớp Học Phép Thuật AI
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight font-bubble flex items-center gap-2">
              Sinh Bài Đọc & Nghe Tự Động 🔮
            </h1>
          </div>
        </div>
        <div className="text-sm bg-pink-500/10 border border-pink-500/25 px-4 py-2 rounded-2xl text-pink-300 font-bold font-bubble text-center">
          Học phần: <span className="text-white">{studySet.title}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
        {!exercise ? (
          /* Step 1 UI: Inputs and Configuration */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Topic input */}
              <div className="bg-[#1c143d] border-2 border-pink-500/20 rounded-3xl p-6 shadow-xl relative">
                <span className="absolute top-4 right-4 text-pink-500/30 text-xl">✍️</span>
                <h3 className="text-lg font-black text-pink-200 mb-2 font-bubble flex items-center gap-2">
                  1. Chủ đề yêu thích của Senpai
                </h3>
                <p className="text-xs text-white/50 mb-4 font-semibold">
                  Nhập bất kỳ câu chuyện, hoàn cảnh hoặc chủ đề nào bạn muốn (ví dụ: thám hiểm biển sâu, tiệm trà chiều anime, cuộc đua xe gay cấn,...)
                </p>
                <input 
                  type="text"
                  placeholder="Ví dụ: Một ngày thám hiểm không gian đầy kỳ diệu..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-[#0b0821] border-2 border-pink-500/20 focus:border-pink-500 outline-none rounded-2xl px-5 py-4 text-white font-semibold transition-all shadow-inner placeholder-white/30 text-base"
                />

                {/* Templates list */}
                <div className="mt-5">
                  <span className="text-xs text-pink-300/60 font-bold uppercase tracking-wider block mb-2.5">
                    💡 Gợi ý nhanh cho Senpai:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_TOPICS.map((t, idx) => (
                      <button
                        key={idx}
                        onClick={() => setTopic(t.english)}
                        className="bg-purple-950/40 hover:bg-pink-600/30 text-pink-200 hover:text-white border border-pink-500/20 hover:border-pink-500/50 rounded-xl px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{t.icon}</span>
                        <span>{t.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Format selection */}
              <div className="bg-[#1c143d] border-2 border-pink-500/20 rounded-3xl p-6 shadow-xl relative">
                <span className="absolute top-4 right-4 text-pink-500/30 text-xl">🎙️</span>
                <h3 className="text-lg font-black text-pink-200 mb-2 font-bubble flex items-center gap-2">
                  2. Định dạng & Độ dài bài nghe 🎧
                </h3>
                <p className="text-xs text-white/50 mb-4 font-semibold">
                  Senpai muốn luyện nghe kiểu đối thoại ngắn hay bài nói/độc thoại dài hơn nè?
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setListeningFormat('dialogue')}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      listeningFormat === 'dialogue'
                        ? 'bg-pink-600/15 border-pink-500 text-white shadow-lg shadow-pink-500/10'
                        : 'bg-[#0b0821]/60 border-white/5 text-white/60 hover:border-white/15'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">💬</span>
                        <h4 className="font-extrabold text-sm text-pink-200 font-bubble">Hội thoại ngắn (Short Dialogue)</h4>
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed font-medium">
                        Cuộc thảo luận, trò chuyện sinh động giữa các nhân vật qua lại về chủ đề. Phù hợp luyện phản xạ hội thoại hằng ngày.
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-black ${
                        listeningFormat === 'dialogue' ? 'bg-pink-500 text-white' : 'bg-white/5 text-white/40'
                      }`}>
                        Mặc định
                      </span>
                    </div>
                  </div>

                  <div
                    onClick={() => setListeningFormat('monologue')}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      listeningFormat === 'monologue'
                        ? 'bg-pink-600/15 border-pink-500 text-white shadow-lg shadow-pink-500/10'
                        : 'bg-[#0b0821]/60 border-white/5 text-white/60 hover:border-white/15'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">🎙️</span>
                        <h4 className="font-extrabold text-sm text-pink-200 font-bubble">Bài giảng / Độc thoại dài (Long Monologue)</h4>
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed font-medium">
                        Bài độc thoại, thuyết trình hoặc bài giảng học thuật chi tiết và dài hơn. Phù hợp cho việc nâng cấp từ vựng học thuật.
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-black ${
                        listeningFormat === 'monologue' ? 'bg-pink-500 text-white' : 'bg-white/5 text-white/40'
                      }`}>
                        Chuyên sâu 🔥
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Loader */}
              <AnimatePresence>
                {loading && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[#1e1144] border-2 border-pink-500/30 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center space-y-4"
                  >
                    <Loader2 className="w-12 h-12 text-pink-500 animate-spin" />
                    <h3 className="text-xl font-black text-pink-200 font-bubble">Gemini đang dệt ma pháp... ✨</h3>
                    <p className="text-sm text-pink-100/75 max-w-md leading-relaxed font-semibold">
                      Koko đang cùng vòm ma pháp Gemini biên soạn một bài đọc kì thú và cuộc đối thoại sinh động tích hợp các từ vựng của Senpai. Đợi một tí nhen! 💕
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <div className="bg-rose-500/10 border-2 border-rose-500/30 text-rose-300 rounded-2xl p-4 text-sm font-bold flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Generate button */}
              {!loading && (
                <button
                  onClick={handleGenerate}
                  className="w-full bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-400 hover:via-purple-500 hover:to-indigo-500 text-white font-black py-4.5 rounded-2xl shadow-lg hover:shadow-pink-500/20 transition-all text-base tracking-wider uppercase flex items-center justify-center gap-2.5 cursor-pointer transform active:scale-98"
                >
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  Bắt đầu truyền ma thuật (Tạo bài học) ✨
                </button>
              )}
            </div>

            {/* Vocabulary selector sidebar */}
            <div className="bg-[#1c143d] border-2 border-pink-500/20 rounded-3xl p-6 shadow-xl h-fit">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-black text-pink-200 font-bubble">
                  3. Chọn từ vựng 🏷️
                </h3>
                <span className="text-xs font-bold text-pink-400">
                  Đã chọn: {selectedWords.length}
                </span>
              </div>
              <p className="text-xs text-white/50 mb-4 font-semibold leading-relaxed">
                Koko sẽ ưu tiên chèn những từ này vào nội dung câu chuyện tiếng Anh.
              </p>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleSelectAll}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black py-1.5 rounded-lg border border-white/10 transition-colors cursor-pointer"
                >
                  Chọn tất cả
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 text-[11px] font-black py-1.5 rounded-lg border border-white/10 transition-colors cursor-pointer"
                >
                  Bỏ chọn tất cả
                </button>
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {vocabList.map((v, i) => {
                  const isChecked = selectedWords.includes(v.word);
                  return (
                    <div 
                      key={i}
                      onClick={() => handleToggleWord(v.word)}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                        isChecked 
                          ? 'bg-pink-600/10 border-pink-500/40 text-white' 
                          : 'bg-[#0f0a28]/60 border-white/5 text-white/40 hover:border-white/10'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isChecked ? 'bg-pink-500 border-pink-400 text-white' : 'border-white/20'
                      }`}>
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <span className={`text-sm font-black block font-bubble transition-colors ${isChecked ? 'text-pink-200' : ''}`}>
                          {v.word} 
                          <span className="text-[10px] font-normal text-white/40 ml-1">({v.partOfSpeech})</span>
                        </span>
                        <span className="text-xs block truncate text-white/60 font-semibold">{v.definition}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Step 2 UI: Generated Lesson Content & Audio Player & Comprehension Quiz */
          <div className="space-y-6">
            {/* Topic display banner */}
            <div className="bg-gradient-to-r from-pink-900/40 to-purple-900/40 border-2 border-pink-500/30 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs font-black text-pink-300 uppercase tracking-wider block mb-1">Chủ đề của bài học:</span>
                <h2 className="text-xl md:text-2xl font-extrabold text-white font-bubble">
                  ✨ "{topic}"
                </h2>
              </div>
              <button
                onClick={() => setExercise(null)}
                className="bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs font-black px-4 py-2.5 rounded-xl transition-all cursor-pointer shrink-0"
              >
                Tạo chủ đề khác 🔮
              </button>
            </div>

            {/* Tab buttons */}
            <div className="grid grid-cols-3 gap-2 bg-[#1c143d] p-1.5 border border-white/5 rounded-2xl">
              <button
                onClick={() => {
                  setActiveTab('reading');
                  stopSpeech();
                }}
                className={`flex items-center justify-center gap-2 py-3 text-xs md:text-sm font-black rounded-xl transition-all cursor-pointer ${
                  activeTab === 'reading' 
                    ? 'bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow anime-shadow-pink font-extrabold' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Bài Đọc 📖</span>
              </button>
              <button
                onClick={() => setActiveTab('listening')}
                className={`flex items-center justify-center gap-2 py-3 text-xs md:text-sm font-black rounded-xl transition-all cursor-pointer ${
                  activeTab === 'listening' 
                    ? 'bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow anime-shadow-pink font-extrabold' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Headphones className="w-4 h-4" />
                <span>Bài Nghe 🎧</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('quiz');
                  stopSpeech();
                }}
                className={`flex items-center justify-center gap-2 py-3 text-xs md:text-sm font-black rounded-xl transition-all cursor-pointer ${
                  activeTab === 'quiz' 
                    ? 'bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow anime-shadow-pink font-extrabold' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Thử Thách ⚡</span>
              </button>
            </div>

            {/* Tab content area */}
            <div className="bg-[#1c143d] border-2 border-pink-500/10 rounded-3xl p-6 md:p-8 shadow-xl min-h-80">
              {activeTab === 'reading' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <h3 className="text-lg font-black text-pink-200 font-bubble flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-pink-400" />
                      Bài Đọc Học Tập (English Reading)
                    </h3>
                    <span className="text-[10px] uppercase font-black bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-2.5 py-1 rounded-full tracking-wider font-mono">
                      Cấp độ tự nhiên B1-B2
                    </span>
                  </div>

                  <div className="text-gray-100 leading-relaxed text-base md:text-lg space-y-4 whitespace-pre-line font-bubble">
                    {parseBoldText(exercise.reading)}
                  </div>

                  <div className="mt-8 p-4 bg-[#0e0a26]/80 border border-pink-500/20 rounded-2xl">
                    <span className="text-xs font-black text-pink-300 uppercase tracking-widest block mb-1">
                      💡 Mẹo của Koko-chan:
                    </span>
                    <p className="text-xs text-white/70 leading-relaxed font-semibold">
                      Senpai hãy đọc to phần tiếng Anh ở trên nhé! Những từ màu hồng nổi bật chính là từ vựng ma thuật có trong học phần của Senpai đấy! Di chuột hoặc nhấp vào để ghi nhớ kĩ hơn nha.
                    </p>
                  </div>
                </motion.div>
              )}

              {activeTab === 'listening' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-3">
                    <h3 className="text-lg font-black text-pink-200 font-bubble flex items-center gap-2">
                      <Headphones className="w-5 h-5 text-pink-400" />
                      Luyện Nghe Ma Pháp (Audio Script & Player)
                    </h3>
                    <span className="text-[10px] uppercase font-black bg-pink-500/15 border border-pink-500/25 text-pink-400 px-2.5 py-1 rounded-full tracking-wider font-mono self-start md:self-auto">
                      Hỗ trợ phát âm AI 🎙️
                    </span>
                  </div>

                  {/* Audio player controls card */}
                  <div className="bg-[#0b0821] border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={playSpeech}
                        className="w-12 h-12 rounded-full bg-pink-500 hover:bg-pink-400 flex items-center justify-center text-white cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-md shadow-pink-500/20"
                        title="Phát âm thanh"
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>
                      <button
                        onClick={pauseSpeech}
                        className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white cursor-pointer transition-all active:scale-95"
                        title="Tạm dừng / Tiếp tục"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                      <button
                        onClick={stopSpeech}
                        className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white cursor-pointer transition-all active:scale-95"
                        title="Dừng phát âm"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 w-full md:w-auto shrink-0">
                      {/* Bộ chọn giọng nói */}
                      <div className="flex-1 md:flex-initial flex flex-col gap-1.5 min-w-[170px]">
                        <span className="text-[11px] font-black uppercase text-pink-300 tracking-wider font-mono flex items-center gap-1">
                          <Volume2 className="w-3.5 h-3.5" /> Giọng đọc:
                        </span>
                        <select
                          value={selectedVoiceURI}
                          onChange={(e) => handleVoiceChange(e.target.value)}
                          className="bg-[#16103a] border-2 border-white/10 focus:border-pink-500 text-white rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none transition-all cursor-pointer w-full md:max-w-[180px]"
                        >
                          {voices.length === 0 ? (
                            <option value="">Mặc định hệ thống</option>
                          ) : (
                            voices.map((v) => (
                              <option key={v.voiceURI} value={v.voiceURI} className="bg-[#0b0821] text-white font-semibold">
                                {v.name.replace(/Microsoft|Google|Apple|Natural/gi, '').trim() || v.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div className="flex-1 md:flex-initial flex items-center gap-2.5 min-w-32">
                        <span className="text-[11px] font-black text-pink-300 font-mono">Tốc độ: {speechRate}x</span>
                        <input 
                          type="range"
                          min="0.5"
                          max="1.5"
                          step="0.05"
                          value={speechRate}
                          onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                          className="w-20 md:w-24 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500"
                        />
                      </div>

                      <div className="flex-1 md:flex-initial flex items-center gap-2.5 min-w-32">
                        <span className="text-[11px] font-black text-pink-300 font-mono">Cao độ: {speechPitch}</span>
                        <input 
                          type="range"
                          min="0.5"
                          max="1.5"
                          step="0.1"
                          value={speechPitch}
                          onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                          className="w-20 md:w-24 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Beautiful Chat-Style Dialogue Feed */}
                  <div className="space-y-4 max-h-[500px] overflow-y-auto p-4 bg-[#09061d]/80 rounded-2xl border border-white/5 scrollbar-thin">
                    {parseListeningScript(exercise.listening).map((line, idx) => {
                      const isTeacher = line.speaker.toLowerCase().includes('teacher') || line.speaker.toLowerCase().includes('giáo viên');
                      const isYuki = line.speaker.toLowerCase().includes('yuki');
                      const isHiro = line.speaker.toLowerCase().includes('hiro');
                      
                      // Assign color accents based on speaker name
                      let avatarBg = "bg-indigo-600";
                      let bubbleBg = "bg-[#16103a]/80 border-white/5";
                      let nameColor = "text-indigo-300";
                      
                      if (isTeacher) {
                        avatarBg = "bg-gradient-to-r from-pink-600 to-purple-600";
                        bubbleBg = "bg-pink-950/20 border-pink-500/10";
                        nameColor = "text-pink-300";
                      } else if (isYuki) {
                        avatarBg = "bg-purple-600";
                        bubbleBg = "bg-purple-950/20 border-purple-500/10";
                        nameColor = "text-purple-300";
                      } else if (isHiro) {
                        avatarBg = "bg-cyan-600";
                        bubbleBg = "bg-cyan-950/20 border-cyan-500/10";
                        nameColor = "text-cyan-300";
                      }
                      
                      const initial = line.speaker ? line.speaker.charAt(0).toUpperCase() : "💬";

                      return (
                        <div key={idx} className="flex gap-3.5 items-start group">
                          {/* Speaker Avatar */}
                          <div className={`w-9 h-9 rounded-full ${avatarBg} text-white flex items-center justify-center font-black text-sm shadow-md shrink-0`}>
                            {initial}
                          </div>
                          
                          {/* Message Content Bubble */}
                          <div className={`flex-1 rounded-2xl p-4 border ${bubbleBg} relative group-hover:border-white/10 transition-colors`}>
                            {line.speaker && (
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={`text-[11px] font-black uppercase tracking-wider ${nameColor}`}>
                                  {line.speaker}
                                </span>
                                
                                {/* Pronounce line button */}
                                <button
                                  onClick={() => playLineSpeech(line.text)}
                                  className="md:opacity-0 group-hover:opacity-100 p-1 bg-white/5 hover:bg-pink-600 text-white/70 hover:text-white rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-[10px] font-bold"
                                  title="Nghe riêng dòng này"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>Nghe dòng này 🎧</span>
                                </button>
                              </div>
                            )}
                            
                            <p className="text-sm text-white/90 leading-relaxed font-sans">
                              {parseBoldText(line.text)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {activeTab === 'quiz' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <h3 className="text-lg font-black text-pink-200 font-bubble flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-pink-400" />
                      Thử Thách Đọc Hiểu Ma Thuật (5 Questions)
                    </h3>
                    <span className="text-xs font-black bg-pink-500/20 text-pink-300 px-3 py-1 rounded-xl border border-pink-400/20">
                      Điểm: {quizAnswers.filter((a, idx) => a === exercise.questions[idx].correctIndex).length}/5 đúng
                    </span>
                  </div>

                  <div className="space-y-8">
                    {exercise.questions.map((q, qIdx) => {
                      const selectedOpt = quizAnswers[qIdx];
                      const isAnswered = selectedOpt !== null;
                      const isCorrect = isAnswered && selectedOpt === q.correctIndex;

                      return (
                        <div key={qIdx} className="bg-[#0f0a28]/60 border border-white/5 rounded-2xl p-5 relative space-y-4">
                          <span className="absolute -top-3.5 left-4 bg-pink-600 text-white text-[10px] font-mono px-3 py-1 rounded-xl shadow-md border border-pink-300">
                            CÂU HỎI {qIdx + 1}
                          </span>

                          <h4 className="text-base font-extrabold text-white pt-2 font-bubble">
                            {q.question}
                          </h4>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            {q.options.map((opt, optIdx) => {
                              const isThisSelected = selectedOpt === optIdx;
                              const isThisCorrect = optIdx === q.correctIndex;
                              
                              let buttonStyle = "bg-[#16103a] border-white/5 text-white/80 hover:border-white/20";
                              
                              if (isAnswered) {
                                if (isThisCorrect) {
                                  buttonStyle = "bg-emerald-500/10 border-emerald-500 text-emerald-300 font-bold";
                                } else if (isThisSelected) {
                                  buttonStyle = "bg-rose-500/10 border-rose-500 text-rose-300 font-bold";
                                } else {
                                  buttonStyle = "bg-[#16103a]/50 border-white/5 text-white/30 cursor-not-allowed";
                                }
                              } else if (isThisSelected) {
                                buttonStyle = "bg-pink-600/20 border-pink-500 text-pink-300 font-bold";
                              }

                              return (
                                <button
                                  key={optIdx}
                                  disabled={isAnswered}
                                  onClick={() => {
                                    const nextAnswers = [...quizAnswers];
                                    nextAnswers[qIdx] = optIdx;
                                    setQuizAnswers(nextAnswers);
                                    
                                    const nextExplanations = [...showExplanation];
                                    nextExplanations[qIdx] = true;
                                    setShowExplanation(nextExplanations);
                                  }}
                                  className={`p-3.5 rounded-xl border-2 text-left text-xs md:text-sm transition-all flex items-center justify-between cursor-pointer ${buttonStyle}`}
                                >
                                  <span>{opt}</span>
                                  {isAnswered && isThisCorrect && (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
                                  )}
                                  {isAnswered && isThisSelected && !isThisCorrect && (
                                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 ml-2" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {/* Explanation block */}
                          <AnimatePresence>
                            {showExplanation[qIdx] && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-[#120e2e] border-t border-white/5 p-4 rounded-xl mt-3 flex items-start gap-3 text-xs text-pink-200/90 leading-relaxed font-bubble"
                              >
                                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-extrabold uppercase text-amber-400 block mb-1">Giải thích phép thuật:</span>
                                  <span>{q.explanation}</span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
