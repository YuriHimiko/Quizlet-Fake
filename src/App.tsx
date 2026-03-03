/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  Settings, 
  X, 
  Volume2, 
  CircleDot,
  CheckCircle2,
  XCircle,
  Plus,
  Save,
  Shuffle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as xlsx from 'xlsx';

interface Option {
  id: number;
  text: string;
  partOfSpeech: string;
}

interface Question {
  id: number;
  definition: string;
  options: Option[];
  correctId: number;
}

interface StudySet {
  id: string;
  title: string;
  questions: Question[];
  createdAt: number;
  lastScore?: { correct: number; total: number };
}

const sanitizeQuestions = (qs: Question[]): Question[] => {
  return qs.map(q => {
    const correctOption = q.options.find(o => o.id === q.correctId);
    if (!correctOption) return q;
    
    const seen = new Set<string>();
    seen.add(correctOption.text.trim().toLowerCase());
    
    const uniqueOptions: Option[] = [correctOption];
    q.options.forEach(o => {
      if (o.id === q.correctId) return;
      const norm = o.text.trim().toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        uniqueOptions.push(o);
      }
    });
    
    return {
      ...q,
      options: uniqueOptions.map((o, i) => ({ ...o, id: i + 1 })),
      correctId: 1
    };
  });
};

const INITIAL_QUESTIONS: Question[] = [
  {
    id: 1,
    definition: "Ngăn chặn, phòng ngừa",
    options: [
      { id: 1, text: "Elegance", partOfSpeech: "n" },
      { id: 2, text: "Hinder", partOfSpeech: "v" },
      { id: 3, text: "Prefer", partOfSpeech: "v" },
      { id: 4, text: "Prevent", partOfSpeech: "v" },
    ],
    correctId: 4,
  },
  {
    id: 2,
    definition: "Sự thanh lịch, tao nhã",
    options: [
      { id: 1, text: "Elegance", partOfSpeech: "n" },
      { id: 2, text: "Hinder", partOfSpeech: "v" },
      { id: 3, text: "Prefer", partOfSpeech: "v" },
      { id: 4, text: "Prevent", partOfSpeech: "v" },
    ],
    correctId: 1,
  },
  {
    id: 3,
    definition: "Thích hơn",
    options: [
      { id: 1, text: "Elegance", partOfSpeech: "n" },
      { id: 2, text: "Hinder", partOfSpeech: "v" },
      { id: 3, text: "Prefer", partOfSpeech: "v" },
      { id: 4, text: "Prevent", partOfSpeech: "v" },
    ],
    correctId: 3,
  }
];

export default function App() {
  const [studySets, setStudySets] = useState<StudySet[]>(() => {
    const saved = localStorage.getItem('english_quiz_sets');
    if (saved) return JSON.parse(saved);
    
    const oldSaved = localStorage.getItem('english_quiz_questions');
    const raw = oldSaved ? JSON.parse(oldSaved) : INITIAL_QUESTIONS;
    return [{
      id: 'default',
      title: 'Học phần mặc định',
      questions: sanitizeQuestions(raw),
      createdAt: Date.now()
    }];
  });
  const [currentSetId, setCurrentSetId] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [view, setView] = useState<'dashboard' | 'quiz' | 'editor' | 'summary'>('dashboard');
  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([]);
  const [questionStatus, setQuestionStatus] = useState<('unanswered' | 'correct' | 'incorrect')[]>([]);

  // Initialize question status
  useEffect(() => {
    setQuestionStatus(new Array(quizQuestions.length).fill('unanswered'));
  }, [quizQuestions]);

  // Save score when finishing quiz
  useEffect(() => {
    if (view === 'summary' && currentSetId) {
      setStudySets(prev => prev.map(s => {
        if (s.id === currentSetId) {
          const correctCount = quizQuestions.length - wrongQuestions.length;
          return { ...s, lastScore: { correct: correctCount, total: quizQuestions.length } };
        }
        return s;
      }));
    }
  }, [view, currentSetId, quizQuestions.length, wrongQuestions.length]);

  // Editor state
  const [editTerms, setEditTerms] = useState<{ id: number; term: string; definition: string }[]>([]);
  const [editTitle, setEditTitle] = useState(new Date().toLocaleDateString('vi-VN'));

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('english_quiz_sets', JSON.stringify(studySets));
  }, [studySets]);

  const handleSelect = (id: number) => {
    if (showFeedback) return;
    
    setSelectedId(id);
    const correct = id === currentQuestion.correctId;
    setIsCorrect(correct);
    setShowFeedback(true);

    setQuestionStatus(prev => {
      const newStatus = [...prev];
      if (newStatus[currentIdx] === 'unanswered') {
        newStatus[currentIdx] = correct ? 'correct' : 'incorrect';
      }
      return newStatus;
    });

    if (!correct) {
      setWrongQuestions(prev => {
        if (prev.find(q => q.id === currentQuestion.id)) return prev;
        return [...prev, currentQuestion];
      });
    }

    if (correct) {
      setTimeout(() => {
        handleNext();
      }, 1500);
    }
  };

  const handleNext = () => {
    if (currentIdx < quizQuestions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      setSelectedId(null);
      setIsCorrect(null);
      setShowFeedback(false);
    } else {
      setView('summary');
    }
  };

  const openEditor = () => {
    const currentSet = studySets.find(s => s.id === currentSetId);
    if (currentSet) {
      setEditTitle(currentSet.title);
      const terms = currentSet.questions.map(q => {
        const correctOption = q.options.find(o => o.id === q.correctId);
        return {
          id: q.id,
          term: correctOption ? `${correctOption.text}(${correctOption.partOfSpeech})` : '',
          definition: q.definition
        };
      });
      setEditTerms(terms.length > 0 ? terms : [{ id: Date.now(), term: '', definition: '' }]);
    } else {
      setEditTitle('Học phần mới');
      setEditTerms([{ id: Date.now(), term: '', definition: '' }]);
    }
    setView('editor');
  };

  const handleSaveEditor = () => {
    // Collect all unique words available for distractors
    const allAvailableWords = [
      ...editTerms.map(t => {
        const match = t.term.match(/(.*)\((.*)\)/);
        const text = (match ? match[1] : t.term).trim();
        const pos = (match ? match[2] : 'v').trim();
        return { text, pos };
      }),
      ...INITIAL_QUESTIONS.flatMap(q => q.options.map(o => ({ text: o.text.trim(), pos: o.partOfSpeech.trim() })))
    ].filter(w => w.text !== "");

    const newQuestions: Question[] = editTerms
      .filter(t => t.term.trim() && t.definition.trim())
      .map((t) => {
        // Parse term and POS for the correct answer
        const match = t.term.match(/(.*)\((.*)\)/);
        const termText = (match ? match[1] : t.term).trim();
        const posText = (match ? match[2] : 'v').trim();
        const normalizedTerm = termText.toLowerCase();

        // Get unique distractors that are not the correct answer
        const uniqueDistractors: {text: string, pos: string}[] = [];
        const seenTexts = new Set<string>();
        seenTexts.add(normalizedTerm);

        // Shuffle the pool to get random ones
        const shuffledPool = [...allAvailableWords].sort(() => 0.5 - Math.random());

        for (const word of shuffledPool) {
          const normalizedWord = word.text.toLowerCase();
          if (!seenTexts.has(normalizedWord)) {
            seenTexts.add(normalizedWord);
            uniqueDistractors.push(word);
          }
          if (uniqueDistractors.length >= 3) break;
        }

        // If we still don't have enough distractors (very small vocabulary), 
        // the pool will just be smaller, which is fine.

        const options: Option[] = [
          { id: 1, text: termText, partOfSpeech: posText },
          ...uniqueDistractors.map((d, i) => ({ id: i + 2, text: d.text, partOfSpeech: d.pos }))
        ].sort(() => 0.5 - Math.random());

        const finalOptions = options.map((o, i) => ({ ...o, id: i + 1 }));
        const correctOption = finalOptions.find(o => o.text === termText);

        return {
          id: t.id,
          definition: t.definition,
          options: finalOptions,
          correctId: correctOption?.id || 1
        };
      });

    if (newQuestions.length > 0) {
      if (currentSetId) {
        setStudySets(studySets.map(s => s.id === currentSetId ? { ...s, title: editTitle, questions: newQuestions } : s));
      } else {
        const newSet: StudySet = {
          id: Date.now().toString(),
          title: editTitle,
          questions: newQuestions,
          createdAt: Date.now()
        };
        setStudySets([...studySets, newSet]);
        setCurrentSetId(newSet.id);
      }
      setQuizQuestions(newQuestions);
      setCurrentIdx(0);
      setView('quiz');
    } else {
      setView('dashboard');
    }
  };

  const addTermRow = () => {
    setEditTerms([...editTerms, { id: Date.now(), term: '', definition: '' }]);
  };

  const removeTermRow = (id: number) => {
    setEditTerms(editTerms.filter(t => t.id !== id));
  };

  const updateTerm = (id: number, field: 'term' | 'definition', value: string) => {
    setEditTerms(editTerms.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (!content) return;

      let newTerms: { id: number; term: string; definition: string }[] = [];

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Parse Excel file
        const workbook = xlsx.read(content, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const data = xlsx.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        newTerms = data
          .filter(row => row && row.length >= 2) // Ensure at least 2 columns exist
          .map(row => {
            const term = String(row[0] || '').trim();
            const definition = String(row[1] || '').trim();
            if (term && definition) {
              return { id: Date.now() + Math.random(), term, definition };
            }
            return null;
          })
          .filter((t): t is { id: number; term: string; definition: string } => t !== null);
      } else {
        // Parse text/csv file
        const textContent = content as string;
        const lines = textContent.split('\n');
        newTerms = lines
          .map(line => {
            const [term, ...defParts] = line.split(/[:\-,]/);
            const definition = defParts.join(':').trim();
            if (term && definition) {
              return { id: Date.now() + Math.random(), term: term.trim(), definition };
            }
            return null;
          })
          .filter((t): t is { id: number; term: string; definition: string } => t !== null);
      }

      if (newTerms.length > 0) {
        setEditTerms([...editTerms, ...newTerms]);
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
    
    // Reset input so the same file can be uploaded again if needed
    e.target.value = '';
  };

  const handleRestart = () => {
    const currentSet = studySets.find(s => s.id === currentSetId);
    if (currentSet) {
      setQuizQuestions(currentSet.questions);
    }
    setCurrentIdx(0);
    setSelectedId(null);
    setIsCorrect(null);
    setShowFeedback(false);
    setWrongQuestions([]);
    setView('quiz');
  };

  const handleReviewWrong = () => {
    setQuizQuestions(wrongQuestions);
    setCurrentIdx(0);
    setSelectedId(null);
    setIsCorrect(null);
    setShowFeedback(false);
    setWrongQuestions([]);
    setView('quiz');
  };

  const handleShuffleQuiz = () => {
    const shuffled = [...quizQuestions].sort(() => Math.random() - 0.5);
    setQuizQuestions(shuffled);
    setCurrentIdx(0);
    setSelectedId(null);
    setIsCorrect(null);
    setShowFeedback(false);
  };

  const currentQuestion = quizQuestions[currentIdx] || INITIAL_QUESTIONS[0];

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-[#0a0b1e] text-white flex flex-col font-sans p-6">
        <header className="flex items-center justify-between py-6 max-w-5xl mx-auto w-full border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-indigo-500 flex items-center justify-center">
              <CircleDot className="w-6 h-6 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold">Thư viện của bạn</h1>
          </div>
          <button 
            onClick={() => {
              setCurrentSetId(null);
              setEditTitle('Học phần mới');
              setEditTerms([{ id: Date.now(), term: '', definition: '' }]);
              setView('editor');
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-5 h-5" /> Tạo học phần
          </button>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full py-12">
          {studySets.length === 0 ? (
            <div className="text-center py-20 opacity-50">
              <p>Bạn chưa có học phần nào. Hãy tạo một học phần mới để bắt đầu!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {studySets.map(set => (
                <div key={set.id} className="bg-[#15162c] border border-white/10 rounded-2xl p-6 hover:border-indigo-500/50 transition-colors group relative flex flex-col">
                  <div className="flex-1 cursor-pointer" onClick={() => {
                    setCurrentSetId(set.id);
                    setQuizQuestions(set.questions);
                    setCurrentIdx(0);
                    setSelectedId(null);
                    setIsCorrect(null);
                    setShowFeedback(false);
                    setWrongQuestions([]);
                    setView('quiz');
                  }}>
                    <h3 className="text-xl font-bold mb-2 group-hover:text-indigo-400 transition-colors">{set.title}</h3>
                    <p className="text-white/40 text-sm">{set.questions.length} thuật ngữ</p>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-xs text-white/30">{new Date(set.createdAt).toLocaleDateString('vi-VN')}</span>
                      {set.lastScore && (
                        <span className="text-xs font-bold mt-1 text-emerald-400">
                          Tiến độ: {set.lastScore.correct}/{set.lastScore.total} đúng
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentSetId(set.id);
                        setEditTitle(set.title);
                        const terms = set.questions.map(q => {
                          const correctOption = q.options.find(o => o.id === q.correctId);
                          return {
                            id: q.id,
                            term: correctOption ? `${correctOption.text}(${correctOption.partOfSpeech})` : '',
                            definition: q.definition
                          };
                        });
                        setEditTerms(terms.length > 0 ? terms : [{ id: Date.now(), term: '', definition: '' }]);
                        setView('editor');
                      }}
                      className="text-white/40 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (view === 'summary') {
    return (
      <div className="min-h-screen bg-[#0a0b1e] text-white flex flex-col font-sans p-6">
        <div className="max-w-2xl mx-auto w-full mt-12 space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-500/20 text-indigo-400 mb-4">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h1 className="text-4xl font-bold">Hoàn thành!</h1>
            <p className="text-white/60">Bạn đã hoàn thành tất cả các câu hỏi trong bộ từ vựng này.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#15162c] p-6 rounded-2xl border border-white/10 text-center">
              <div className="text-3xl font-bold text-emerald-400">{quizQuestions.length - wrongQuestions.length}</div>
              <div className="text-xs font-bold text-white/40 uppercase mt-1">Chính xác</div>
            </div>
            <div className="bg-[#15162c] p-6 rounded-2xl border border-white/10 text-center">
              <div className="text-3xl font-bold text-red-400">{wrongQuestions.length}</div>
              <div className="text-xs font-bold text-white/40 uppercase mt-1">Cần luyện lại</div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 pb-4">
            {wrongQuestions.length > 0 && (
              <button 
                onClick={handleReviewWrong}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-500/20"
              >
                Luyện lại các từ sai ({wrongQuestions.length})
              </button>
            )}
            <button 
              onClick={handleRestart}
              className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl transition-all border border-white/10"
            >
              Học lại từ đầu
            </button>
          </div>

          {wrongQuestions.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Danh sách từ cần luyện lại:</h2>
              <div className="space-y-2">
                {wrongQuestions.map((q) => {
                  const correctOption = q.options.find(o => o.id === q.correctId);
                  return (
                    <div key={q.id} className="bg-[#1a1b3a] p-4 rounded-xl border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-lg">{correctOption?.text} <span className="text-white/40 text-sm">({correctOption?.partOfSpeech})</span></div>
                        <div className="text-white/60 text-sm">{q.definition}</div>
                      </div>
                      <button onClick={() => speak(correctOption?.text || '')} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <Volume2 className="w-5 h-5 text-white/40" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
            <button 
              onClick={() => setView('editor')}
              className="w-full text-indigo-400 font-bold py-2 hover:text-indigo-300 transition-colors"
            >
              Chỉnh sửa bộ từ vựng
            </button>
            <button 
              onClick={() => setView('dashboard')}
              className="w-full text-white/40 font-bold py-2 hover:text-white/60 transition-colors"
            >
              Về thư viện
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'editor') {
    return (
      <div className="min-h-screen bg-[#0a0b1e] text-white flex flex-col font-sans">
        <input 
          type="file" 
          id="file-import" 
          className="hidden" 
          accept=".txt,.csv,.xlsx,.xls" 
          onChange={handleFileUpload}
        />
        {/* Editor Top Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/5">
          <div className="flex items-center gap-4 flex-1">
            <div className="p-2 hover:bg-white/5 rounded-lg cursor-pointer">
              <div className="w-5 h-1 bg-white/60 mb-1 rounded-full" />
              <div className="w-5 h-1 bg-white/60 mb-1 rounded-full" />
              <div className="w-5 h-1 bg-white/60 rounded-full" />
            </div>
            <div className="relative flex-1 max-w-xl">
              <input 
                type="text" 
                placeholder="Tính năng tìm kiếm nay còn nhanh hơn"
                className="w-full bg-[#1a1b3a] border-none rounded-lg px-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">
                <Settings className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-500">
              <Plus className="w-5 h-5" />
            </button>
            <button className="bg-brand-accent text-black px-4 py-1.5 rounded-lg text-sm font-bold">
              Nâng cấp
            </button>
            <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center font-bold text-sm">
              Y
            </div>
          </div>
        </header>

        {/* Editor Sub Header */}
        <div className="px-6 py-6 flex items-center justify-between max-w-5xl mx-auto w-full">
          <button 
            onClick={() => setView(currentSetId ? 'quiz' : 'dashboard')}
            className="flex items-center gap-2 text-indigo-400 font-bold hover:text-indigo-300"
          >
            <ChevronDown className="w-5 h-5 rotate-90" />
            {currentSetId ? 'Trở về học phần' : 'Hủy'}
          </button>
          <button 
            onClick={handleSaveEditor}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2.5 rounded-lg font-bold transition-all"
          >
            Hoàn tất
          </button>
        </div>

        <main className="flex-1 overflow-y-auto px-6 pb-20">
          <div className="max-w-5xl mx-auto w-full space-y-8">
            {/* Metadata Section */}
            <div className="space-y-6">
              <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider opacity-80">
                <CircleDot className="w-3 h-3" />
                Công khai
              </button>
              
              <div className="space-y-4">
                <div className="group">
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 ml-1">Tiêu đề</label>
                  <input 
                    type="text" 
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-[#1a1b3a] border-b-2 border-white/10 p-4 text-xl font-bold focus:border-indigo-500 focus:outline-none transition-colors rounded-t-lg"
                  />
                </div>
                <input 
                  type="text" 
                  placeholder="Thêm mô tả..."
                  className="w-full bg-[#1a1b3a] border-b-2 border-white/10 p-4 text-sm focus:border-indigo-500 focus:outline-none transition-colors rounded-b-lg"
                />
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between py-4">
              <div className="flex gap-3">
                <label 
                  htmlFor="file-import"
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg text-sm font-bold border border-white/10 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Nhập
                </label>
                <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg text-sm font-bold border border-white/10">
                  <Plus className="w-4 h-4" /> Thêm sơ đồ <Settings className="w-3 h-3 text-brand-accent" />
                </button>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white/40 uppercase">Gợi ý</span>
                  <div className="w-10 h-5 bg-indigo-600 rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10"><ChevronDown className="w-4 h-4 rotate-90" /></button>
                  <button className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10"><Settings className="w-4 h-4" /></button>
                  <button className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 text-red-400"><X className="w-4 h-4" /></button>
                </div>
              </div>
            </div>

            {/* Term List */}
            <div className="space-y-6">
              {editTerms.map((term, index) => (
                <div key={term.id} className="bg-[#1a1b3a] rounded-xl p-6 border border-white/5 group">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-lg font-bold opacity-40">{index + 1}</span>
                    <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => speak(term.term)}
                        className="text-white/40 hover:text-indigo-400 transition-colors"
                      >
                        <Volume2 className="w-5 h-5" />
                      </button>
                      <div className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white">
                        <div className="w-5 h-0.5 bg-current mb-1" />
                        <div className="w-5 h-0.5 bg-current" />
                      </div>
                      <button 
                        onClick={() => removeTermRow(term.id)}
                        className="text-white/40 hover:text-red-400 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-2">
                      <input 
                        type="text" 
                        value={term.term}
                        onChange={(e) => updateTerm(term.id, 'term', e.target.value)}
                        className="w-full bg-transparent border-b-2 border-white/10 py-2 focus:border-indigo-500 focus:outline-none transition-colors text-lg"
                        placeholder="Nhập thuật ngữ..."
                      />
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Thuật ngữ</label>
                    </div>
                    <div className="flex-1 space-y-2">
                      <input 
                        type="text" 
                        value={term.definition}
                        onChange={(e) => updateTerm(term.id, 'definition', e.target.value)}
                        className="w-full bg-transparent border-b-2 border-white/10 py-2 focus:border-indigo-500 focus:outline-none transition-colors text-lg"
                        placeholder="Nhập định nghĩa..."
                      />
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Định nghĩa</label>
                    </div>
                    <div className="w-24 h-24 border-2 border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-white/5 transition-colors">
                      <Settings className="w-5 h-5 opacity-40" />
                      <span className="text-[8px] font-bold uppercase opacity-40">Hình ảnh</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={addTermRow}
              className="w-full bg-[#1a1b3a] border-2 border-dashed border-white/10 py-8 rounded-xl text-lg font-bold hover:bg-white/5 transition-all group"
            >
              <span className="border-b-4 border-indigo-500 group-hover:border-indigo-400 transition-colors">+ THÊM THẺ</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b1e] text-white flex flex-col font-sans selection:bg-brand-accent/30">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setView('dashboard')}
        >
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 flex items-center justify-center">
            <CircleDot className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="font-semibold text-lg">Thư viện</span>
          <ChevronDown className="w-4 h-4 opacity-60 rotate-90" />
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleShuffleQuiz}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Xáo trộn câu hỏi"
          >
            <Shuffle className="w-6 h-6 opacity-70" />
          </button>
          <button 
            onClick={openEditor}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-full text-sm font-bold transition-all"
          >
            <Plus className="w-4 h-4" />
            Thêm từ vựng
          </button>
          <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <Settings className="w-6 h-6 opacity-70" />
          </button>
          <button 
            onClick={openEditor}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-6 h-6 opacity-70" />
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="px-6 mt-4">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-bold bg-emerald-400/10 w-8 h-8 flex items-center justify-center rounded-full text-sm">
            {currentIdx + 1}
          </span>
          <div className="flex-1 flex gap-1 h-2.5">
            {quizQuestions.map((_, i) => {
              const status = questionStatus[i];
              let innerColor = 'bg-transparent';
              
              if (status === 'correct') {
                innerColor = 'bg-emerald-500';
              } else if (status === 'incorrect') {
                innerColor = 'bg-red-500';
              } else if (i === currentIdx) {
                innerColor = 'bg-indigo-500';
              }

              return (
                <div key={i} className="flex-1 rounded-full overflow-hidden bg-white/10">
                  <div 
                    className={`h-full transition-all duration-500 ${innerColor}`}
                    style={{ width: (status !== 'unanswered' || i === currentIdx) ? '100%' : '0%' }}
                  />
                </div>
              );
            })}
          </div>
          <span className="text-white/40 font-bold bg-white/5 w-8 h-8 flex items-center justify-center rounded-full text-sm">
            {quizQuestions.length}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-6 mt-12 max-w-2xl mx-auto w-full">
        <div className="space-y-1">
          <span className="text-white/50 text-sm font-medium uppercase tracking-wider">Định nghĩa</span>
          <h1 className="text-3xl font-bold tracking-tight">
            {currentQuestion.definition}
          </h1>
        </div>

        <div className="mt-12 space-y-4">
          <p className="text-white/60 text-sm font-medium">Chọn đáp án đúng</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedId === option.id;
              const isCorrectOption = option.id === currentQuestion.correctId;
              
              let borderColor = "border-white/10";
              let bgColor = "bg-[#15162c]";
              
              if (showFeedback) {
                if (isCorrectOption) {
                  borderColor = "border-emerald-500";
                  bgColor = "bg-emerald-500/10";
                } else if (isSelected && !isCorrectOption) {
                  borderColor = "border-red-500";
                  bgColor = "bg-red-500/10";
                }
              } else if (isSelected) {
                borderColor = "border-indigo-500";
              }

              return (
                <motion.button
                  key={option.id}
                  whileHover={!showFeedback ? { scale: 1.02 } : {}}
                  whileTap={!showFeedback ? { scale: 0.98 } : {}}
                  onClick={() => handleSelect(option.id)}
                  className={`relative flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200 ${borderColor} ${bgColor} group`}
                >
                  <span className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-bold transition-colors ${
                    isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/20 text-white/40 group-hover:border-white/40'
                  }`}>
                    {option.id}
                  </span>
                  <span className="text-lg font-medium">
                    {option.text}
                    <span className="text-white/40 ml-1">({option.partOfSpeech})</span>
                  </span>

                  {showFeedback && isCorrectOption && (
                    <CheckCircle2 className="absolute right-4 w-6 h-6 text-emerald-500" />
                  )}
                  {showFeedback && isSelected && !isCorrectOption && (
                    <XCircle className="absolute right-4 w-6 h-6 text-red-500" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Action Footer */}
        <div className="mt-8 flex items-center justify-between">
          <button 
            onClick={() => {
              const correctOption = currentQuestion.options.find(o => o.id === currentQuestion.correctId);
              if (correctOption) speak(correctOption.text);
            }}
            className="p-3 hover:bg-white/5 rounded-full transition-colors group"
          >
            <Volume2 className="w-6 h-6 text-white/40 group-hover:text-white transition-colors" />
          </button>
          
          <button 
            className="text-indigo-400 font-semibold hover:text-indigo-300 transition-colors text-sm"
            onClick={() => {
              if (showFeedback && !isCorrect) {
                handleNext();
              }
            }}
          >
            {showFeedback && !isCorrect ? "Thử lại câu khác" : "Bạn không biết?"}
          </button>
        </div>


        {/* Feedback Message */}
        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`mt-12 p-4 rounded-2xl flex items-center justify-between ${
                isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}
            >
              <div className="flex items-center gap-3">
                {isCorrect ? <CheckCircle2 /> : <XCircle />}
                <span className="font-bold">
                  {isCorrect ? 'Chính xác! Đang chuyển câu tiếp theo...' : 'Chưa đúng rồi. Hãy thử lại!'}
                </span>
              </div>
              {!isCorrect && (
                <button 
                  onClick={handleNext}
                  className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-bold transition-colors"
                >
                  Bỏ qua
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
