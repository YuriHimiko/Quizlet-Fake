/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ChevronDown, 
  Settings, 
  X, 
  Check,
  Volume2, 
  CircleDot,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  Save,
  Shuffle,
  Trash2,
  Cloud,
  CloudUpload,
  CloudDownload,
  Download,
  LogOut,
  RefreshCw,
  User,
  Loader2,
  ArrowLeftRight,
  Mail,
  Lock,
  Sparkles,
  Key,
  AlertCircle,
  SpellCheck,
  Wand2,
  AlertTriangle,
  Lightbulb,
  CheckCheck,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as xlsx from 'xlsx';
import { playStandardAudio, stopAllAudio, getVoiceGender, setVoiceGender } from './utils/audioService';
import { SpellCheckResult, checkSingleTermLocal, checkTermsWithAI } from './utils/spellChecker';
import { 
  googleSignIn, 
  logout, 
  findBackupFile, 
  downloadBackupFile, 
  createBackupFile, 
  updateBackupFile 
} from './driveService';
import {
  db,
  auth as firebaseAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInAnonymously,
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot
} from './firebase';

// @ts-ignore
import MASCOT_URL from './assets/images/anime_mascot_1781746439261.jpg';
import AIGeneratorView from './components/AIGeneratorView';

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
  needsReview?: number[];
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
    definition: "To stop something from happening or to impede progress",
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
    definition: "The quality of being graceful and stylish in appearance or manner",
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
    definition: "To like one thing or person better than another",
    options: [
      { id: 1, text: "Elegance", partOfSpeech: "n" },
      { id: 2, text: "Hinder", partOfSpeech: "v" },
      { id: 3, text: "Prefer", partOfSpeech: "v" },
      { id: 4, text: "Prevent", partOfSpeech: "v" },
    ],
    correctId: 3,
  }
];

const LIVE2D_MODELS = [
  {
    id: 'shizuku',
    name: 'Shizuku-chan',
    emoji: '👩‍🏫',
    url: 'https://unpkg.com/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json',
    desc: 'Playful class monitor with a mischievous wink, studying hard alongside you! 🌸',
    canvasWidth: 150,
    canvasHeight: 300,
    canvasStyle: { transform: 'scale(1.15) translateY(14%)' }
  },
  {
    id: 'koharu',
    name: 'Cute Koharu',
    emoji: '🎒',
    url: 'https://unpkg.com/live2d-widget-model-koharu@1.0.5/assets/koharu.model.json',
    desc: 'Adorable primary school student with a red rucksack, listening attentively! 🥰',
    canvasWidth: 150,
    canvasHeight: 300,
    canvasStyle: { transform: 'scale(1.15) translateY(14%)' }
  },
  {
    id: 'miku',
    name: 'Hatsune Miku',
    emoji: '🎤',
    url: 'https://unpkg.com/live2d-widget-model-miku@1.0.5/assets/miku.model.json',
    desc: 'Famous virtual singer with vibrant turquoise twintails full of energy! 🌟',
    canvasWidth: 150,
    canvasHeight: 350,
    canvasStyle: { transform: 'scale(1.2) translateY(16%)' }
  },
  {
    id: 'tororo',
    name: 'Tororo White Cat',
    emoji: '🐱',
    url: 'https://unpkg.com/live2d-widget-model-tororo@1.0.5/assets/tororo.model.json',
    desc: 'Fluffy white cat who loves sleeping, always ready to accompany your study! 💤',
    canvasWidth: 200,
    canvasHeight: 200,
    canvasStyle: { transform: 'scale(0.9) translateY(0%)' }
  },
  {
    id: 'hijiki',
    name: 'Hijiki Black Cat',
    emoji: '🐈‍⬛',
    url: 'https://unpkg.com/live2d-widget-model-hijiki@1.0.5/assets/hijiki.model.json',
    desc: 'Mysterious black cat that winks and plays around cleverly! ✨',
    canvasWidth: 200,
    canvasHeight: 200,
    canvasStyle: { transform: 'scale(0.9) translateY(0%)' }
  },
  {
    id: 'unitychan',
    name: 'Unity-chan',
    emoji: '⚔️',
    url: 'https://unpkg.com/live2d-widget-model-unitychan@1.0.5/assets/unitychan.model.json',
    desc: 'Energetic blonde game developer girl full of enthusiasm! 🎮',
    canvasWidth: 150,
    canvasHeight: 300,
    canvasStyle: { transform: 'scale(1.15) translateY(12%)' }
  },
  {
    id: 'wanko',
    name: 'Wanko Puppy',
    emoji: '🐶',
    url: 'https://unpkg.com/live2d-widget-model-wanko@1.0.5/assets/wanko.model.json',
    desc: 'Super sweet shiba puppy wagging its ears every time you make progress! 🦴',
    canvasWidth: 200,
    canvasHeight: 200,
    canvasStyle: { transform: 'scale(0.9) translateY(0%)' }
  },
  {
    id: 'chitose',
    name: 'Chitose-chan',
    emoji: '🎴',
    url: 'https://unpkg.com/live2d-widget-model-chitose@1.0.5/assets/chitose.model.json',
    desc: 'Elegant maiden in kimono gently guiding you through tricky challenges!',
    canvasWidth: 150,
    canvasHeight: 300,
    canvasStyle: { transform: 'scale(1.15) translateY(12%)' }
  }
];

const mascotListeners = new Set<() => void>();
let globalMascotType: 'static' | 'live2d' = 'static';
let globalLive2dModelId: string = 'shizuku';
let globalShowMascotConfig = false;
let globalVtuberEnabled = false;
let globalVtuberWsUrl = 'ws://localhost:8000/api/v1/client-interface';
let globalVtuberVoiceInput = false;

try {
  globalMascotType = (localStorage.getItem('mascot_type') as any) || 'static';
  globalLive2dModelId = localStorage.getItem('mascot_live2d_id') || 'shizuku';
  globalVtuberEnabled = localStorage.getItem('mascot_vtuber_enabled') === 'true';
  globalVtuberWsUrl = localStorage.getItem('mascot_vtuber_ws_url') || 'ws://localhost:8000/api/v1/client-interface';
  globalVtuberVoiceInput = localStorage.getItem('mascot_vtuber_voice_input') === 'true';
} catch (e) {
  console.warn('Failed to read initial mascot configuration from localStorage:', e);
}

const MascotState = {
  get type() { return globalMascotType; },
  set type(val) {
    globalMascotType = val;
    try {
      localStorage.setItem('mascot_type', val);
    } catch (e) {
      console.warn('Failed to save mascot_type to localStorage:', e);
    }
    mascotListeners.forEach(l => l());
  },
  get modelId() { return globalLive2dModelId; },
  set modelId(val) {
    globalLive2dModelId = val;
    try {
      localStorage.setItem('mascot_live2d_id', val);
    } catch (e) {
      console.warn('Failed to save mascot_live2d_id to localStorage:', e);
    }
    mascotListeners.forEach(l => l());
  },
  get showConfig() { return globalShowMascotConfig; },
  set showConfig(val) {
    globalShowMascotConfig = val;
    mascotListeners.forEach(l => l());
  },
  get vtuberEnabled() { return globalVtuberEnabled; },
  set vtuberEnabled(val) {
    globalVtuberEnabled = val;
    try {
      localStorage.setItem('mascot_vtuber_enabled', String(val));
    } catch (e) {
      console.warn('Failed to save mascot_vtuber_enabled to localStorage:', e);
    }
    mascotListeners.forEach(l => l());
  },
  get vtuberWsUrl() { return globalVtuberWsUrl; },
  set vtuberWsUrl(val) {
    globalVtuberWsUrl = val;
    try {
      localStorage.setItem('mascot_vtuber_ws_url', val);
    } catch (e) {
      console.warn('Failed to save mascot_vtuber_ws_url to localStorage:', e);
    }
    mascotListeners.forEach(l => l());
  },
  get vtuberVoiceInput() { return globalVtuberVoiceInput; },
  set vtuberVoiceInput(val) {
    globalVtuberVoiceInput = val;
    try {
      localStorage.setItem('mascot_vtuber_voice_input', String(val));
    } catch (e) {
      console.warn('Failed to save mascot_vtuber_voice_input to localStorage:', e);
    }
    mascotListeners.forEach(l => l());
  },
  subscribe(listener: () => void) {
    mascotListeners.add(listener);
    return () => mascotListeners.delete(listener);
  }
};

const vtuberListeners = new Set<() => void>();
let globalVtuberSpeechText = 'Hello! I am ready in Open-LLM-VTuber mode. Connect and chat with me! ✨🌸';
let globalVtuberWsStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
let globalVtuberHistory: { role: 'user' | 'assistant'; text: string; time: string }[] = [];

try {
  const storedHistory = localStorage.getItem('vtuber_chat_history');
  if (storedHistory) {
    globalVtuberHistory = JSON.parse(storedHistory);
  }
} catch (e) {
  console.warn('Failed to parse stored chat history:', e);
}

const VtuberState = {
  get speechText() { return globalVtuberSpeechText; },
  set speechText(val) {
    globalVtuberSpeechText = val;
    vtuberListeners.forEach(l => l());
  },
  get status() { return globalVtuberWsStatus; },
  set status(val) {
    globalVtuberWsStatus = val;
    vtuberListeners.forEach(l => l());
  },
  get history() { return globalVtuberHistory; },
  set history(val) {
    globalVtuberHistory = val;
    try {
      localStorage.setItem('vtuber_chat_history', JSON.stringify(val));
    } catch (e) {
      console.warn('Failed to save chat history to localStorage:', e);
    }
    vtuberListeners.forEach(l => l());
  },
  addMessage(role: 'user' | 'assistant', text: string) {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const updated = [...globalVtuberHistory, { role, text, time }].slice(-50); // Keep last 50 messages
    this.history = updated;
    if (role === 'assistant') {
      this.speechText = text;
    }
  },
  clearHistory() {
    this.history = [];
    vtuberListeners.forEach(l => l());
  },
  subscribe(listener: () => void) {
    vtuberListeners.add(listener);
    return () => vtuberListeners.delete(listener);
  }
};

declare global {
  interface Window {
    loadlive2d?: (id: string, url: string, offset?: number) => void;
  }
}

let vtuberAudioCtx: AudioContext | null = null;
let vtuberActiveSource: AudioBufferSourceNode | null = null;

function stopVtuberAudio() {
  if (vtuberActiveSource) {
    try {
      vtuberActiveSource.stop();
    } catch (e) {}
    vtuberActiveSource = null;
  }
}

function playVtuberAudio(base64Data: string) {
  try {
    if (!base64Data || typeof base64Data !== 'string') return;

    if (!vtuberAudioCtx) {
      vtuberAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (vtuberAudioCtx.state === 'suspended') {
      vtuberAudioCtx.resume();
    }

    // Strip out data URI header if present (e.g. data:audio/wav;base64,)
    let cleanBase64 = base64Data;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    // Remove whitespace characters & any non-base64 padding characters
    cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');

    const binaryString = window.atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    vtuberAudioCtx.decodeAudioData(bytes.buffer, (buffer) => {
      stopVtuberAudio();
      if (!vtuberAudioCtx) return;
      const source = vtuberAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(vtuberAudioCtx.destination);
      source.start(0);
      vtuberActiveSource = source;
    }, (err) => {
      console.error('Decoded audio failure:', err);
    });
  } catch (error) {
    console.error('Error starting audio playback:', error);
  }
}

function Live2DCompanion({ live2dModelId, getMascotName, getAvatarEmoji, onOpenConfig }: { 
  live2dModelId: string; 
  getMascotName: () => string; 
  getAvatarEmoji: () => string;
  onOpenConfig: () => void;
}) {
  const [loadingModel, setLoadingModel] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [uniqueCanvasId] = useState(() => 'live2d-canvas-' + Math.random().toString(16).slice(2));
  
  // VTuber States
  const [vtuberEnabled, setVtuberEnabled] = useState(MascotState.vtuberEnabled);
  const [vtuberWsUrl, setVtuberWsUrl] = useState(MascotState.vtuberWsUrl);
  const [wsStatus, setWsStatus] = useState(VtuberState.status);
  const [chatHistory, setChatHistory] = useState(VtuberState.history);
  const [chatText, setChatText] = useState('');
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to external states
  useEffect(() => {
    const unsubMascot = MascotState.subscribe(() => {
      setVtuberEnabled(MascotState.vtuberEnabled);
      setVtuberWsUrl(MascotState.vtuberWsUrl);
    });
    const unsubVtuber = VtuberState.subscribe(() => {
      setWsStatus(VtuberState.status);
      setChatHistory(VtuberState.history);
    });
    return () => {
      unsubMascot();
      unsubVtuber();
    };
  }, []);

  // Live2D canvas loader
  useEffect(() => {
    let active = true;
    setLoadingModel(true);

    const loadModel = () => {
      if (!active) return;

      const canvas = document.getElementById(uniqueCanvasId);
      if (!canvas) {
        setTimeout(loadModel, 100);
        return;
      }

      if (window.loadlive2d) {
        try {
          const model = LIVE2D_MODELS.find(m => m.id === live2dModelId) || LIVE2D_MODELS[0];
          window.loadlive2d(uniqueCanvasId, model.url, 0.5);
          setTimeout(() => {
            if (active) setLoadingModel(false);
          }, 800);
        } catch (err) {
          console.error('Error rendering Live2D model inside global canvas:', err);
          if (active) setLoadingModel(false);
        }
      }
    };

    const delayTimer = setTimeout(loadModel, 150);
    return () => {
      active = false;
      clearTimeout(delayTimer);
    };
  }, [live2dModelId, uniqueCanvasId]);

  // WebSocket Connection Handlers for Open-LLM-VTuber
  useEffect(() => {
    if (!vtuberEnabled) {
      VtuberState.status = 'disconnected';
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const isValidWsUrl = (url: string): boolean => {
      if (!url) return false;
      const t = url.trim();
      if (!t.startsWith('ws://') && !t.startsWith('wss://')) return false;
      if (
        t === 'ws://' ||
        t === 'wss://' ||
        t === 'ws:/' ||
        t === 'ws:' ||
        t === 'wss:/' ||
        t === 'wss:'
      ) {
        return false;
      }
      try {
        const parsed = new URL(t);
        return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
      } catch (e) {
        return false;
      }
    };

    const establishConnection = () => {
      if (!active) return;

      const trimmedUrl = vtuberWsUrl ? vtuberWsUrl.trim() : '';

      if (!isValidWsUrl(trimmedUrl)) {
        VtuberState.status = 'disconnected';
        // Do not schedule reconnect timer if the URL is invalid or being typed
        return;
      }

      // Proactively handle HTTPS security restrictions for ws://
      if (window.location.protocol === 'https:' && trimmedUrl.startsWith('ws://')) {
        try {
          const parsed = new URL(trimmedUrl);
          const hostname = parsed.hostname;
          if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '0.0.0.0' && hostname !== '::1') {
            console.warn(
              'Insecure WebSocket connection (ws://) to a remote host was suppressed because this page runs over HTTPS. Please configure a wss:// endpoint or use local loopback.'
            );
            VtuberState.status = 'error';
            reconnectTimer = setTimeout(establishConnection, 10000);
            return;
          }
        } catch (e) {
          VtuberState.status = 'disconnected';
          return;
        }
      }

      VtuberState.status = 'connecting';

      try {
        ws = new WebSocket(trimmedUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!active) return;
          VtuberState.status = 'connected';
          console.log('Open-LLM-VTuber connected!');
        };

        ws.onmessage = async (event) => {
          if (!active) return;
          try {
            if (typeof event.data !== 'string') return;
            const data = JSON.parse(event.data);

            // 1. Text payload handler
            if (data.type === 'text' || data.type === 'text-input' || data.text) {
              const textStr = data.payload || data.text || data.text_data;
              if (textStr) {
                // If it's a stream, we only append it on completion, or if it's full text
                VtuberState.addMessage('assistant', textStr);
              }
            }

            // 2. Audio payload handler (base64 wav/mp3 chunks)
            if (data.type === 'audio' || data.audio || data.audio_data) {
              const b64 = data.payload || data.audio || data.audio_data;
              if (b64 && typeof b64 === 'string') {
                playVtuberAudio(b64);
              }
            }

            // 3. Expression/emotion mapping handler
            if (data.type === 'expression' || data.type === 'emotion' || data.expression) {
              const expr = data.payload || data.id || data.expression;
              console.log('Mapped Vtuber expression:', expr);
            }

            // 4. Client instruction commands
            if (data.type === 'control' || data.command) {
              const cmd = data.payload || data.command;
              if (cmd === 'interrupt' || cmd === 'stop') {
                stopVtuberAudio();
              }
            }
          } catch (e) {
            console.warn('Wss payload skip:', e);
          }
        };

        ws.onerror = () => {
          if (!active) return;
          VtuberState.status = 'error';
        };

        ws.onclose = () => {
          if (!active) return;
          VtuberState.status = 'disconnected';
          // auto-reconnect logic
          reconnectTimer = setTimeout(establishConnection, 4000);
        };
      } catch (err) {
        console.warn('WS Connection initiation mistake suppressed gently:', err);
        VtuberState.status = 'error';
        reconnectTimer = setTimeout(establishConnection, 5000);
      }
    };

    establishConnection();

    return () => {
      active = false;
      if (ws) {
        ws.close();
      }
      clearTimeout(reconnectTimer);
    };
  }, [vtuberEnabled, vtuberWsUrl]);

  // Autoscroll conversation history
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, showChatPanel]);

  // Send message
  const handleSendChat = () => {
    if (!chatText.trim()) return;

    const message = chatText.trim();
    VtuberState.addMessage('user', message);
    setChatText('');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Send standard payload format of open-llm-vtuber
      const payload = {
        type: 'text-input',
        text: message,
        payload: message
      };
      wsRef.current.send(JSON.stringify(payload));
    } else {
      setTimeout(() => {
        VtuberState.addMessage('assistant', `⚠️ Không thể gửi tin nhắn! Server Open-LLM-VTuber tại địa chỉ "${vtuberWsUrl}" hiện không liên lạc được. Nhấp vào vòng xoay cài đặt để kiểm tra lại cấu hình.`);
      }, 400);
    }
  };

  // Browser Speech-to-Text Support (Vietnamese + English)
  const handleMicrophoneToggle = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Nhận diện giọng nói không được hỗ trợ trên trình duyệt này! Hãy sử dụng Google Chrome / Microsoft Edge.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'vi-VN'; // Defaults to Vietnamese
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      if (resultText) {
        setChatText(resultText);
      }
    };

    rec.onerror = (e: any) => {
      console.warn('Speechrecognition failure:', e);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    rec.start();
  };

  const modelObj = LIVE2D_MODELS.find(m => m.id === live2dModelId) || LIVE2D_MODELS[0];

  return createPortal(
    <div className="fixed bottom-6 right-6 z-50 flex items-end justify-center select-none pointer-events-auto filter drop-shadow-[0_10px_35px_rgba(236,72,153,0.35)]">
      
      {/* 1. COLLAPSIBLE AI CHAT PANEL (Slides left from Mascot) */}
      <AnimatePresence>
        {showChatPanel && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.92 }}
            className="w-72 sm:w-85 h-112 rounded-3xl bg-[#0e0729]/95 border-2 border-pink-500/40 mr-4 shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl animate-fade-in"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-pink-600/30 via-[#180e3c] to-purple-600/30 border-b border-pink-500/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping"></span>
                <span className="text-[11px] font-black tracking-wider text-pink-300 uppercase font-sans">
                  AI VTuber Chat Panel
                </span>
              </div>
              <button
                onClick={() => VtuberState.clearHistory()}
                className="text-pink-300/60 hover:text-pink-100 text-[9px] font-extrabold uppercase bg-white/5 px-2 py-0.5 rounded-md hover:bg-white/10"
                title="Xóa nhật ký trò chuyện"
              >
                Xóa Chat 🧹
              </button>
            </div>

            {/* Connection Status Sub-bar */}
            <div className="px-4 py-1.5 bg-[#140b33] border-b border-pink-500/5 flex items-center justify-between text-[10px] shrink-0">
              <span className="text-white/40">Server: <code className="text-pink-400 font-mono text-[9px]">{vtuberWsUrl}</code></span>
              {wsStatus === 'connected' ? (
                <span className="text-emerald-400 font-black flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ĐÃ KẾT NỐI
                </span>
              ) : wsStatus === 'connecting' ? (
                <span className="text-amber-400 font-black flex items-center gap-1 shrink-0 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> ĐANG KẾT NỐI...
                </span>
              ) : (
                <span className="text-rose-500 font-black flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> MẤT LIÊN LẠC
                </span>
              )}
            </div>

            {/* Chat Box Container */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-white/30 text-xs">
                  <span className="text-3xl mb-2">💬</span>
                  <p className="font-bubble text-pink-200/40">Chưa có hội thoại nào!</p>
                  <p className="text-[10px] scale-95 leading-relaxed mt-1">
                    Hãy bật ứng dụng <strong className="text-pink-400/60">Open-LLM-VTuber</strong> cục bộ của bạn, hoặc gõ lời nhắn bên dưới để kiểm tra phản hồi học thuật!
                  </p>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs font-bold leading-relaxed shadow ${
                        msg.role === 'user'
                          ? 'bg-pink-600 text-white rounded-br-none'
                          : 'bg-[#1b1240] text-pink-100 border border-pink-400/10 rounded-bl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[8px] text-white/30 font-mono mt-1 px-1">
                      {msg.time}
                    </span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Toolbar */}
            <div className="p-3 bg-[#130932]/95 border-t border-pink-500/10 flex items-center gap-2 shrink-0">
              {/* Mic Icon */}
              <button
                onClick={handleMicrophoneToggle}
                className={`p-2 rounded-xl transition-all border shrink-0 cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 border-rose-400 text-white animate-pulse'
                    : 'bg-white/5 hover:bg-white/10 text-pink-300 border-pink-500/20'
                }`}
                title={isListening ? 'Đang lắng nghe giọng nói... 🎤' : 'Nhấp để nói bằng tiếng Việt 🎤'}
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                </svg>
              </button>

              {/* Input Box */}
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder={isListening ? 'Đang lắng nghe senpai...' : 'Gửi lời nhắn cho bạn học thôi...'}
                className="flex-1 bg-white/5 border border-pink-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-pink-300/30 focus:-pink-500 outline-none"
              />

              {/* Send Icon */}
              <button
                onClick={handleSendChat}
                className="p-2.5 bg-pink-500 hover:bg-pink-600 rounded-xl text-white transition-all transform hover:scale-105 active:scale-95 shrink-0 cursor-pointer shadow-md"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. CHÍNH: LIVE2D FLOATING MASCOT BUBBLE CANVAS */}
      <div className="flex flex-col items-center">
        <div 
          onClick={() => {
            if (isMinimized) setIsMinimized(false);
          }}
          className={`${
            isMinimized 
              ? 'w-16 h-16 rounded-full cursor-pointer hover:scale-110 active:scale-95 animate-pulse border-2 border-pink-500 bg-[#0d0727]' 
              : 'w-28 h-28 sm:w-36 sm:h-36 rounded-2xl hover:scale-102 border-4 border-pink-500 bg-[#100b2b]/95'
          } overflow-hidden relative flex items-center justify-center p-0.5 transition-all duration-300`}
        >
          {/* Live2D Canvas, kept in DOM when active to keep script happy */}
          <div className={`w-full h-full absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${!isMinimized ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <canvas 
              id={uniqueCanvasId} 
              className="w-full h-full object-contain cursor-pointer transition-transform duration-300"
              style={(modelObj as any).canvasStyle || undefined}
              width={(modelObj as any).canvasWidth || 200}
              height={(modelObj as any).canvasHeight || 200}
            />
            {loadingModel && (
              <div className="absolute inset-0 bg-[#100b2b]/95 flex flex-col items-center justify-center text-center p-2 z-10">
                <RefreshCw className="w-5 h-5 text-pink-400 animate-spin mb-1.5" />
                <span className="text-[8px] text-pink-300 font-bold font-mono tracking-wider animate-pulse">TRIỆU HỒI...</span>
              </div>
            )}
          </div>

          {/* Minimized Bubble Status */}
          {isMinimized && (
            <div className="absolute inset-0 bg-gradient-to-tr from-pink-600 via-[#1e1445] to-violet-600 flex flex-col items-center justify-center rounded-full">
              <span className="text-xl" role="img" aria-label="emoji">{modelObj.emoji}</span>
              <span className="text-[8px] font-black text-pink-200/90 tracking-wide font-sans animate-pulse uppercase mt-0.5">Mở ✨</span>
            </div>
          )}

          {/* Quick Settings Gear inside companion */}
          {!isMinimized && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onOpenConfig();
              }}
              className="absolute top-1.5 right-1.5 bg-pink-600/90 hover:bg-pink-500 hover:scale-115 text-white p-1 rounded-lg transition-all cursor-pointer shadow-md border border-pink-400/45 z-20 group"
              title="Đổi bạn học Live2D ✨"
            >
              <Settings className="w-3 h-3 group-hover:rotate-45 transition-transform" />
            </button>
          )}

          {/* Collapsible Chat Box Toggle Button */}
          {!isMinimized && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowChatPanel(!showChatPanel);
              }}
              className={`absolute bottom-1.5 left-1.5 p-1 rounded-lg transition-all cursor-pointer shadow-md border z-20 ${
                showChatPanel 
                  ? 'bg-pink-600 hover:bg-pink-500 border-pink-400' 
                  : 'bg-[#180e3c]/90 hover:bg-pink-600 border-pink-400/30 text-pink-300'
              }`}
              title="Trò chuyện AI (Open-LLM-VTuber) 💬"
            >
              <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <path d="M21 15c0 1.1-.9 2-2 2H7l-4 4V5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v10z" />
              </svg>
            </button>
          )}

          {/* Minimize Button */}
          {!isMinimized && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(true);
              }}
              className="absolute bottom-1.5 right-1.5 bg-pink-600/90 hover:bg-pink-500 hover:scale-115 text-white p-1.5 rounded-lg transition-all cursor-pointer shadow-md border border-pink-400/45 z-20"
              title="Thu nhỏ ✕"
            >
              <Minus className="w-3 h-3" />
            </button>
          )}

          {/* Live glow dot indicator for VTuber connections */}
          {vtuberEnabled && !isMinimized && (
            <div 
              className={`absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full border border-black/40 z-20 shadow-sm ${
                wsStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
                wsStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
              }`}
              title={`Trạng thái Open-LLM-VTuber Connection: ${wsStatus}`}
            />
          )}
        </div>

        {/* Companion Nameplate */}
        {!isMinimized && (
          <div className="mt-2.5 bg-gradient-to-r from-pink-500 to-pink-600 text-white text-[9px] px-3 py-1 rounded-full font-black shadow-md border border-pink-400 tracking-wide uppercase select-none transition-all duration-300 animate-fade-in flex items-center gap-1">
            {getMascotName()} {getAvatarEmoji()}
            {vtuberEnabled && (
              <span className="bg-white/25 text-[7px] font-bold px-1 rounded uppercase tracking-tighter">AI</span>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function MascotConfigPortal() {
  const [show, setShow] = useState(MascotState.showConfig);
  const [mascotType, setMascotType] = useState(MascotState.type);
  const [live2dModelId, setLive2dModelId] = useState(MascotState.modelId);
  const [vtuberEnabled, setVtuberEnabled] = useState(MascotState.vtuberEnabled);
  const [vtuberWsUrl, setVtuberWsUrl] = useState(MascotState.vtuberWsUrl);
  const [wsStatus, setWsStatus] = useState(VtuberState.status);
  const [activeTab, setActiveTab] = useState<'classic' | 'live2d' | 'vtuber'>('live2d');

  useEffect(() => {
    const unsubMascot = MascotState.subscribe(() => {
      setShow(MascotState.showConfig);
      setMascotType(MascotState.type);
      setLive2dModelId(MascotState.modelId);
      setVtuberEnabled(MascotState.vtuberEnabled);
      setVtuberWsUrl(MascotState.vtuberWsUrl);
    });
    const unsubVtuber = VtuberState.subscribe(() => {
      setWsStatus(VtuberState.status);
    });
    return () => {
      unsubMascot();
      unsubVtuber();
    };
  }, []);

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070416]/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-xl bg-[#0f0a28]/95 border-2 border-pink-500/40 rounded-3xl shadow-2xl overflow-hidden text-left flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-pink-500/10 flex items-center justify-between bg-gradient-to-r from-pink-600/20 to-purple-600/20">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h3 className="text-pink-300 font-black text-sm uppercase tracking-widest font-sans">
              Cài Đặt Bạn Đồng Hành Koko
            </h3>
          </div>
          <button 
            onClick={() => { MascotState.showConfig = false; }}
            className="text-white/60 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Nav Tabs */}
        <div className="px-5 py-2.5 bg-[#140c33] border-b border-pink-500/5 flex items-center gap-1 text-xs font-black shrink-0 font-sans">
          <button
            onClick={() => setActiveTab('classic')}
            className={`px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider cursor-pointer ${
              activeTab === 'classic' ? 'bg-pink-600 text-white shadow' : 'text-pink-300/65 hover:text-pink-200'
            }`}
          >
            Koko Core 🌸
          </button>
          <button
            onClick={() => setActiveTab('live2d')}
            className={`px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider cursor-pointer ${
              activeTab === 'live2d' ? 'bg-pink-600 text-white shadow' : 'text-pink-300/65 hover:text-pink-200'
            }`}
          >
            Live2D Widget ✨
          </button>
          <button
            onClick={() => setActiveTab('vtuber')}
            className={`px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider cursor-pointer ${
              activeTab === 'vtuber' ? 'bg-pink-600 text-white shadow animate-pulse' : 'text-pink-300/65 hover:text-pink-200'
            }`}
          >
            Open-LLM-VTuber AI 🤖
          </button>
        </div>

        {/* Modal Content Arena */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5">
          {activeTab === 'classic' && (
            <div className="space-y-4 text-center py-6 text-white/80">
              <span className="text-5xl block animate-pulse">🌸</span>
              <h4 className="text-pink-300 font-extrabold text-base">Bản Sắc Koko-chan Cổ Điển</h4>
              <p className="text-xs leading-relaxed text-pink-200/70 max-w-sm mx-auto font-sans font-bold">
                Sử dụng hình ảnh vẽ tay Koko-chan nhẹ nhàng, thân thiện và tiết kiệm tài nguyên trình duyệt tối đa.
              </p>
              <button
                onClick={() => {
                  MascotState.type = 'static';
                  MascotState.showConfig = false;
                }}
                className={`px-6 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider cursor-pointer transition-all border ${
                  mascotType === 'static' 
                    ? 'bg-pink-600 border-pink-400 text-white shadow-lg shadow-pink-600/30' 
                    : 'bg-white/5 border-white/10 text-pink-300 hover:bg-white/10'
                }`}
              >
                {mascotType === 'static' ? 'ĐANG KÍCH HOẠT ✓' : 'Sử Dụng Bản Cổ Điển'}
              </button>
            </div>
          )}

          {activeTab === 'live2d' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-pink-500/5 pb-3">
                <span className="text-xs font-bold text-pink-200 font-sans">Kích hoạt Bạn Học Live2D</span>
                <button
                  onClick={() => {
                    MascotState.type = mascotType === 'live2d' ? 'static' : 'live2d';
                  }}
                  className={`px-3.5 py-1.5 rounded-xl font-black text-[10px] uppercase cursor-pointer border tracking-wider transition-all ${
                    mascotType === 'live2d'
                      ? 'bg-emerald-600 border-emerald-400 text-white'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {mascotType === 'live2d' ? 'Bật Hoạt Họa' : 'Tắt Hoạt Họa'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1.5 font-sans">
                {LIVE2D_MODELS.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => {
                      MascotState.modelId = model.id;
                      MascotState.type = 'live2d'; // Auto enable live2d
                    }}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 bg-[#130b2c] ${
                      live2dModelId === model.id && mascotType === 'live2d'
                        ? 'border-pink-500 bg-pink-950/20'
                        : 'border-white/5 hover:border-pink-500/30'
                    }`}
                  >
                    <span className="text-2xl mt-0.5 shrink-0" role="img">{model.emoji}</span>
                    <div className="space-y-0.5">
                      <h5 className="text-white text-xs font-black tracking-wide">{model.name}</h5>
                      <p className="text-[10px] text-pink-200/50 leading-relaxed font-bold">{model.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'vtuber' && (
            <div className="space-y-5">
              <div className="bg-pink-950/10 border border-pink-500/10 p-4 rounded-2xl space-y-2 font-sans">
                <h4 className="text-pink-300 font-extrabold text-xs tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse"></span>
                  Open-LLM-VTuber Integration (Tích Hợp AI)
                </h4>
                <p className="text-[11px] text-pink-200/60 leading-relaxed font-bold">
                  Dự án mã nguồn mở <code className="text-pink-400 font-mono">open-llm-vtuber</code> cho phép bạn điều khiển các mô hình nhân vật hoạt họa (Live2D) bằng giọng nói và trí tuệ nhân tạo (LLM). Khi bật tính năng này, Koko sẽ kết nối với máy chủ nội bộ của bạn để tự động nói và hiển thị câu trả lời thông qua trí tuệ nhân tạo!
                </p>
              </div>

              <div className="flex items-center justify-between border-b border-pink-500/5 pb-3 pt-1 font-sans">
                <div className="space-y-0.5">
                  <span className="text-xs font-black text-pink-200 block">Kích Hoạt Liên Kết Trò Chuyện VTuber</span>
                  <span className="text-[10px] text-white/30 block">Mở bảng chat nổi ở góc phải khi kết nối thành công</span>
                </div>
                <button
                  onClick={() => {
                    MascotState.vtuberEnabled = !vtuberEnabled;
                  }}
                  className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase cursor-pointer border tracking-wider transition-all shrink-0 ${
                    vtuberEnabled
                      ? 'bg-pink-500 border-pink-400 text-white'
                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                  }`}
                >
                  {vtuberEnabled ? 'ĐANG BẬT LIÊN KẾT ✓' : 'CHƯA LIÊN KẾT'}
                </button>
              </div>

              <div className="space-y-2 font-sans">
                <label className="text-[11px] font-black text-pink-300/80 uppercase tracking-widest block">
                  Địa Chỉ WebSocket API:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={vtuberWsUrl}
                    onChange={(e) => {
                      MascotState.vtuberWsUrl = e.target.value;
                    }}
                    placeholder="ws://localhost:8000/api/v1/client-interface"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-pink-100 outline-none focus:-pink-500 focus:border-pink-500/50 font-mono font-bold"
                  />
                  <div className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase flex items-center justify-center shrink-0 border border-white/10 bg-[#160d3c] ${
                    wsStatus === 'connected' ? 'text-emerald-400' :
                    wsStatus === 'connecting' ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {wsStatus === 'connected' ? 'Connected' :
                     wsStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
                  </div>
                </div>
                <span className="text-[9px] text-white/20 block font-bold leading-normal">
                  * Mặc định là <code className="text-pink-400/80 font-mono">ws://localhost:8000/api/v1/client-interface</code>. Để thay đổi, hãy nhập API WebSocket URL của cấu hình VTuber của bạn.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-pink-500/10 bg-[#120a2e] text-center flex items-center justify-center shrink-0">
          <button
            onClick={() => { MascotState.showConfig = false; }}
            className="px-8 py-2.5 bg-pink-500 hover:bg-pink-600 rounded-2xl text-white text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-md"
          >
            Hoàn tất thiết lập
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function KokoMascot({ expression, text }: { expression: 'happy' | 'smile' | 'cheer' | 'sad' | 'surprised'; text: string }) {
  const [mascotType, setMascotType] = useState(MascotState.type);
  const [live2dModelId, setLive2dModelId] = useState(MascotState.modelId);
  const [vtuberEnabled, setVtuberEnabled] = useState(MascotState.vtuberEnabled);
  const [vtuberSpeech, setVtuberSpeech] = useState(VtuberState.speechText);

  useEffect(() => {
    const unsubMascot = MascotState.subscribe(() => {
      setMascotType(MascotState.type);
      setLive2dModelId(MascotState.modelId);
      setVtuberEnabled(MascotState.vtuberEnabled);
    });
    const unsubVtuber = VtuberState.subscribe(() => {
      setVtuberSpeech(VtuberState.speechText);
    });
    return () => {
      unsubMascot();
      unsubVtuber();
    };
  }, []);

  const getMascotName = () => {
    if (mascotType === 'live2d') {
      const model = LIVE2D_MODELS.find(m => m.id === live2dModelId);
      return model ? model.name : 'Bạn Học Ảo';
    }
    return 'Koko-chan';
  };

  const getAvatarEmoji = () => {
    switch (expression) {
      case 'happy': return '🌸';
      case 'cheer': return '✨';
      case 'sad': return '💔';
      case 'surprised': return '☄️';
      default: return '💕';
    }
  };

  return (
    <>
      <div className="relative flex flex-col md:flex-row items-center gap-4 bg-[#1e1445]/90 border-2 border-pink-400/40 p-5 rounded-3xl shadow-lg anime-shadow-pink mb-8 text-left w-full max-w-5xl mx-auto backdrop-blur-md">
        <span className="absolute -top-3 -right-3 text-2xl animate-spin" style={{ animationDuration: '8s' }}>⭐</span>
        <span className="absolute -bottom-3 -left-3 text-2xl animate-bounce" style={{ animationDuration: '5s' }}>🌸</span>

        <div className="relative shrink-0 flex flex-col items-center">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-pink-400 shadow-md bg-[#100b2b] relative flex items-center justify-center">
            {/* Static mascot image */}
            <img 
              src={MASCOT_URL} 
              alt="Koko-chan" 
              className="w-full h-full object-cover absolute inset-0"
              referrerPolicy="no-referrer"
            />

            {/* Quick Config Settings Button right inside the card */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                MascotState.showConfig = true;
              }}
              className="absolute top-1.5 right-1.5 bg-pink-600/90 hover:bg-pink-500 hover:scale-115 text-white p-1 rounded-lg transition-all cursor-pointer shadow-md border border-pink-300/30 group z-10"
              title="Đổi bạn học Live2D ✨"
            >
              <Settings className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform" />
            </button>
          </div>

          <div className="absolute -bottom-2.5 bg-pink-500 text-white text-[10px] px-2.5 py-0.5 rounded-full font-black shadow-md border border-pink-300 shrink-0 z-10 tracking-wide">
            {getMascotName()} {getAvatarEmoji()}
          </div>
        </div>

        <div className="flex-1 text-center md:text-left mt-3 md:mt-0">
          <h4 className="text-pink-300 font-black text-xs tracking-widest uppercase mb-1.5 flex items-center justify-center md:justify-start gap-1.5">
            <span>{getMascotName()} • Bạn Đồng Hành</span>
            {mascotType === 'live2d' ? (
              <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 text-[9px] font-black px-1.5 py-0.5 rounded-md border border-emerald-500/20 uppercase tracking-widest font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Live2D Hoạt Họa
              </span>
            ) : (
              <span className="flex items-center gap-1 bg-pink-500/10 text-pink-400 text-[9px] font-black px-1.5 py-0.5 rounded-md border border-pink-500/20 uppercase tracking-widest font-mono">
                Classic Ảnh Tĩnh
              </span>
            )}
          </h4>
          <p className="text-pink-100 font-bold text-sm md:text-base leading-relaxed tracking-wide font-bubble">
            "{vtuberEnabled ? vtuberSpeech : text}"
          </p>
        </div>
      </div>

      {/* Portal items */}
      <MascotConfigPortal />
      {mascotType === 'live2d' && (
        <Live2DCompanion
          live2dModelId={live2dModelId}
          getMascotName={getMascotName}
          getAvatarEmoji={getAvatarEmoji}
          onOpenConfig={() => { MascotState.showConfig = true; }}
        />
      )}
    </>
  );
}

function DomainCopyBox() {
  const [copied, setCopied] = useState(false);
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy host:', err);
    }
  };

  return (
    <div className="bg-[#100c2a] border border-white/10 p-2.5 rounded-xl flex items-center justify-between gap-2 mt-2">
      <code className="text-pink-300 font-mono text-[10px] break-all select-all font-bold">
        {currentHost || 'đang tải...'}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className={`px-2.5 py-1 text-[9px] font-black rounded-lg transition-all shrink-0 cursor-pointer ${
          copied 
            ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/30' 
            : 'bg-pink-600/20 hover:bg-pink-600/35 text-pink-300 border border-pink-500/30 font-bold'
        }`}
      >
        {copied ? 'ĐÃ SAO CHÉP! ✅' : 'SAO CHÉP 📋'}
      </button>
    </div>
  );
}

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
  const [view, setView] = useState<'dashboard' | 'quiz' | 'flashcard' | 'written' | 'listening' | 'editor' | 'summary' | 'ai_generator'>('dashboard');
  const [writtenAnswer, setWrittenAnswer] = useState('');
  const [showWrittenFeedback, setShowWrittenFeedback] = useState(false);
  const [isWrittenCorrect, setIsWrittenCorrect] = useState<boolean | null>(null);
  const [listeningAnswer, setListeningAnswer] = useState('');
  const [showListeningFeedback, setShowListeningFeedback] = useState(false);
  const [isListeningCorrect, setIsListeningCorrect] = useState<boolean | null>(null);
  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([]);
  const [questionStatus, setQuestionStatus] = useState<('unanswered' | 'correct' | 'incorrect')[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  const [previousView, setPreviousView] = useState<'quiz' | 'flashcard' | 'written' | 'listening'>('quiz');

  // Input refs for automatic focus when switching words
  const listeningInputRef = useRef<HTMLInputElement>(null);
  const writtenInputRef = useRef<HTMLInputElement>(null);
  const autoNextTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearAutoNextTimer = () => {
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
  };

  // Google Cloud integration state
  const [user, setUser] = useState<any>(null); // Firebase User
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Auth Modal States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMsg, setAuthMsg] = useState<{ type: 'success' | 'error'; text: React.ReactNode } | null>(null);

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      const storedToken = localStorage.getItem('google_drive_token');
      if (storedToken) {
        setAccessToken(storedToken);
      }
    });
    return () => unsubscribe();
  }, []);

  // Synchronize with Firestore in real-time when user logs in
  useEffect(() => {
    if (!user) return;

    setIsCloudSyncing(true);
    let isInitialLoad = true;

    // Listen to studySets subcollection in Firestore
    const qSnapshot = query(collection(db, 'users', user.uid, 'studySets'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(qSnapshot, async (snapshot) => {
      const cloudSets: StudySet[] = [];
      snapshot.forEach((doc) => {
        cloudSets.push(doc.data() as StudySet);
      });

      // On initial load, merge local and cloud sets
      if (isInitialLoad) {
        isInitialLoad = false;
        const localSaved = localStorage.getItem('english_quiz_sets');
        const localSets: StudySet[] = localSaved ? JSON.parse(localSaved) : [];

        if (cloudSets.length === 0 && localSets.length > 0) {
          setSyncStatus({ type: 'info', message: 'Hòa điệu học phần của Senpai lên mây ma pháp... ✨' });
          for (const localSet of localSets) {
            try {
              await setDoc(doc(db, 'users', user.uid, 'studySets', localSet.id), localSet);
            } catch (err) {
              console.error('Error seeding set:', err);
            }
          }
          setIsCloudSyncing(false);
          setSyncStatus({ type: 'success', message: 'Tất cả học phần cục bộ đã được kết nối lên Cloud! ☁️🌸' });
        } else if (localSets.length > 0) {
          let hasNewUploads = false;
          for (const localSet of localSets) {
            const existsInCloud = cloudSets.some(cs => cs.id === localSet.id);
            if (!existsInCloud) {
              try {
                await setDoc(doc(db, 'users', user.uid, 'studySets', localSet.id), localSet);
                hasNewUploads = true;
              } catch (err) {
                console.error('Error uploading missing set:', err);
              }
            }
          }
          if (hasNewUploads) {
            return;
          }
        }
      }

      setStudySets(cloudSets);
      setIsCloudSyncing(false);
    }, (error) => {
      console.error("Firestore listener error:", error);
      setIsCloudSyncing(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync status auto-dismiss
  useEffect(() => {
    if (syncStatus) {
      const timer = setTimeout(() => {
        setSyncStatus(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [syncStatus]);

  // Initialize question status is now handled manually when starting/restarting/etc is triggered to keep active progress intact.

  // Save score when finishing quiz
  useEffect(() => {
    if (view === 'summary' && currentSetId) {
      let updatedSet: StudySet | null = null;
      setStudySets(prev => {
        const nextSets = prev.map(s => {
          if (s.id === currentSetId) {
            const isReviewSession = quizQuestions.length < s.questions.length;
            const newlyCorrectCount = quizQuestions.length - wrongQuestions.length;
            const needsReviewIds = wrongQuestions.map(q => q.id);
            
            let newCorrect = newlyCorrectCount;
            let newTotal = quizQuestions.length;

            if (isReviewSession && s.lastScore) {
              newCorrect = s.lastScore.correct + newlyCorrectCount;
              newTotal = s.questions.length;
            }

            updatedSet = { 
              ...s, 
              lastScore: { correct: newCorrect, total: newTotal },
              needsReview: needsReviewIds
            };
            return updatedSet;
          }
          return s;
        });

        if (user && updatedSet) {
          setDoc(doc(db, 'users', user.uid, 'studySets', currentSetId), updatedSet);
        }
        return nextSets;
      });
    }
  }, [view, currentSetId, quizQuestions.length, wrongQuestions, user]);

  // Editor state
  const [editTerms, setEditTerms] = useState<{ id: number; term: string; definition: string }[]>([]);
  const [editTitle, setEditTitle] = useState(new Date().toLocaleDateString('vi-VN'));

  // Spell check states for Vocabulary Editor
  const [spellCheckResults, setSpellCheckResults] = useState<Map<string | number, SpellCheckResult>>(new Map<string | number, SpellCheckResult>());
  const [isSpellChecking, setIsSpellChecking] = useState(false);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);
  const [spellCheckNotice, setSpellCheckNotice] = useState<{ type: 'success' | 'warning' | 'info' | 'error'; message: string } | null>(null);
  const [showPreSaveModal, setShowPreSaveModal] = useState(false);

  // Real-time local heuristic spellcheck when editTerms change
  useEffect(() => {
    if (view !== 'editor' || !autoCheckEnabled) return;

    setSpellCheckResults(prev => {
      const updated = new Map<string | number, SpellCheckResult>(prev);
      for (const t of editTerms) {
        const currentRes: SpellCheckResult | undefined = updated.get(t.id);
        const localRes: SpellCheckResult = checkSingleTermLocal(t.id, t.term, t.definition, editTerms);
        
        // If local found an error or if there was no active AI error, update with local check
        if (localRes.hasIssue || !currentRes?.hasIssue) {
          updated.set(t.id, localRes);
        }
      }
      return updated;
    });
  }, [editTerms, view, autoCheckEnabled]);

  // Sync to localStorage and set default EN-UK accent
  useEffect(() => {
    localStorage.setItem('english_quiz_sets', JSON.stringify(studySets));
    if (!localStorage.getItem('koko_accent')) {
      localStorage.setItem('koko_accent', 'en-GB');
    }
  }, [studySets]);

  // Keyboard navigation for flashcards
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view === 'flashcard') {
        if (e.key === 'ArrowLeft') {
          handleMarkFlashcard(false);
        } else if (e.key === 'ArrowRight') {
          handleMarkFlashcard(true);
        } else if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          setIsFlipped(prev => {
            const newState = !prev;
            if (newState) {
              const currentQ = quizQuestions[currentIdx];
              if (currentQ) {
                const correctOpt = currentQ.options.find(o => o.id === currentQ.correctId);
                if (correctOpt) {
                  speak(correctOpt.text);
                }
              }
            }
            return newState;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, quizQuestions, currentIdx, wrongQuestions]);

  // Pronounce word when flashcard changes, listening changes or view changes to them
  useEffect(() => {
    if ((view === 'flashcard' || view === 'listening') && quizQuestions[currentIdx]) {
      const q = quizQuestions[currentIdx];
      const correctOption = q.options.find(o => o.id === q.correctId);
      if (correctOption && correctOption.text) {
        speak(correctOption.text);
      }
    }
    return () => {
      stopAllAudio();
    };
  }, [view, currentIdx]);

  // Automatically focus blank input space in listening mode when switching to a new word / starting next question
  useEffect(() => {
    if (view === 'listening' && !showListeningFeedback) {
      const timer = setTimeout(() => {
        listeningInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [view, currentIdx, showListeningFeedback]);

  // Automatically focus blank input space in written mode when switching to a new word
  useEffect(() => {
    if (view === 'written' && !showWrittenFeedback) {
      const timer = setTimeout(() => {
        writtenInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [view, currentIdx, showWrittenFeedback]);

  // Clear auto-next timer on view/index change
  useEffect(() => {
    return () => {
      clearAutoNextTimer();
    };
  }, [view, currentIdx]);

  const handleMarkFlashcard = (known: boolean) => {
    const currentQ = quizQuestions[currentIdx];
    if (!currentQ) return;

    if (!known) {
      if (!wrongQuestions.find(q => q.id === currentQ.id)) {
        setWrongQuestions(prev => [...prev, currentQ]);
      }
    } else {
      setWrongQuestions(prev => prev.filter(q => q.id !== currentQ.id));
    }

    const wasFlipped = isFlipped;
    setIsFlipped(false);

    const delay = wasFlipped ? 300 : 50;

    setTimeout(() => {
      if (currentIdx < quizQuestions.length - 1) {
        setCurrentIdx(prev => prev + 1);
      } else {
        setView('summary');
      }
    }, delay);
  };

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
      const correctOption = currentQuestion.options.find(o => o.id === currentQuestion.correctId);
      if (correctOption) {
        speak(correctOption.text);
      }
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

  const handleNextWritten = () => {
    clearAutoNextTimer();
    if (currentIdx < quizQuestions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setWrittenAnswer('');
      setShowWrittenFeedback(false);
      setIsWrittenCorrect(null);
    } else {
      setView('summary');
    }
  };

  const handleSubmitWritten = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (showWrittenFeedback) {
      handleNextWritten();
      return;
    }

    if (!writtenAnswer.trim()) return;

    const currentQ = quizQuestions[currentIdx];
    if (!currentQ) return;

    const correctOption = currentQ.options.find(o => o.id === currentQ.correctId);
    if (!correctOption) return;

    const typedNormalized = writtenAnswer.trim().toLowerCase().replace(/\s+/g, ' ');
    const correctNormalized = correctOption.text.trim().toLowerCase().replace(/\s+/g, ' ');

    const correct = typedNormalized === correctNormalized;

    setIsWrittenCorrect(correct);
    setShowWrittenFeedback(true);

    setQuestionStatus(prev => {
      const newStatus = [...prev];
      if (newStatus[currentIdx] === 'unanswered') {
        newStatus[currentIdx] = correct ? 'correct' : 'incorrect';
      }
      return newStatus;
    });

    if (!correct) {
      setWrongQuestions(prev => {
        if (prev.find(q => q.id === currentQ.id)) return prev;
        return [...prev, currentQ];
      });
    } else {
      speak(correctOption.text);
    }

    clearAutoNextTimer();
    autoNextTimerRef.current = setTimeout(() => {
      handleNextWritten();
    }, correct ? 1400 : 2000);
  };

  const handleNextListening = () => {
    clearAutoNextTimer();
    if (currentIdx < quizQuestions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setListeningAnswer('');
      setShowListeningFeedback(false);
      setIsListeningCorrect(null);
    } else {
      setView('summary');
    }
  };

  const handleSubmitListening = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (showListeningFeedback) {
      handleNextListening();
      return;
    }

    if (!listeningAnswer.trim()) return;

    const currentQ = quizQuestions[currentIdx];
    if (!currentQ) return;

    const correctOption = currentQ.options.find(o => o.id === currentQ.correctId);
    if (!correctOption) return;

    const typedNormalized = listeningAnswer.trim().toLowerCase().replace(/\s+/g, ' ');
    const correctFull = correctOption.text.toLowerCase().trim();
    const correctBase = correctOption.text.replace(/\s*\(.*?\)\s*/g, '').toLowerCase().trim();

    const correct = (typedNormalized === correctFull || typedNormalized === correctBase);

    setIsListeningCorrect(correct);
    setShowListeningFeedback(true);

    setQuestionStatus(prev => {
      const newStatus = [...prev];
      if (newStatus[currentIdx] === 'unanswered') {
        newStatus[currentIdx] = correct ? 'correct' : 'incorrect';
      }
      return newStatus;
    });

    if (!correct) {
      setWrongQuestions(prev => {
        if (prev.find(q => q.id === currentQ.id)) return prev;
        return [...prev, currentQ];
      });
    } else {
      speak(correctOption.text);
    }

    clearAutoNextTimer();
    autoNextTimerRef.current = setTimeout(() => {
      handleNextListening();
    }, correct ? 1400 : 2000);
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
    setSpellCheckResults(new Map());
    setSpellCheckNotice(null);
    setShowPreSaveModal(false);
    setView('editor');
  };

  const handleRunAISpellCheck = async () => {
    const activeTerms = editTerms.filter(t => t.term.trim() || t.definition.trim());
    if (activeTerms.length === 0) {
      setSpellCheckNotice({
        type: 'info',
        message: 'Chưa có từ vựng nào để kiểm tra. Hãy thêm từ vựng trước nhé! 🌸'
      });
      return;
    }

    setIsSpellChecking(true);
    setSpellCheckNotice(null);

    try {
      const results = await checkTermsWithAI(editTerms);
      setSpellCheckResults(results);

      let issueCount = 0;
      results.forEach(res => {
        if (res.hasIssue && res.issueType !== 'none') {
          issueCount++;
        }
      });

      if (issueCount === 0) {
        setSpellCheckNotice({
          type: 'success',
          message: 'Tuyệt vời! Toàn bộ từ vựng & ngữ nghĩa đã được kiểm tra chính xác 100%! 🌟✨'
        });
      } else {
        setSpellCheckNotice({
          type: 'warning',
          message: `Phát hiện ${issueCount} thẻ có gợi ý sửa lỗi chính tả hoặc chuẩn hóa từ loại. Senpai xem chi tiết bên dưới nhé! 🌸`
        });
      }
    } catch (err: any) {
      console.error('Spellcheck error:', err);
      setSpellCheckNotice({
        type: 'error',
        message: 'Đã hoàn tất kiểm tra chính tả với bộ từ điển nội bộ! 📴'
      });
    } finally {
      setIsSpellChecking(false);
    }
  };

  const handleApplyCorrection = (id: string | number, suggestedTerm?: string, suggestedDefinition?: string) => {
    setEditTerms(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          term: suggestedTerm !== undefined ? suggestedTerm : t.term,
          definition: suggestedDefinition !== undefined ? suggestedDefinition : t.definition
        };
      }
      return t;
    }));

    setSpellCheckResults(prev => {
      const nextMap = new Map(prev);
      nextMap.set(id, {
        id,
        hasIssue: false,
        issueType: 'none',
        severity: 'info'
      });
      return nextMap;
    });
  };

  const handleApplyAllCorrections = () => {
    let appliedCount = 0;
    setEditTerms(prev => prev.map(t => {
      const res = spellCheckResults.get(t.id);
      if (res && res.hasIssue && (res.suggestedTerm || res.suggestedDefinition)) {
        appliedCount++;
        return {
          ...t,
          term: res.suggestedTerm || t.term,
          definition: res.suggestedDefinition || t.definition
        };
      }
      return t;
    }));

    setSpellCheckResults(prev => {
      const nextMap = new Map<string | number, SpellCheckResult>(prev);
      nextMap.forEach((val: SpellCheckResult, key: string | number) => {
        if (val.hasIssue) {
          nextMap.set(key, { ...val, hasIssue: false, issueType: 'none' });
        }
      });
      return nextMap;
    });

    setSpellCheckNotice({
      type: 'success',
      message: `Đã tự động sửa xong toàn bộ ${appliedCount} từ vựng và định nghĩa! ✨🌸`
    });
  };

  const handleDismissCorrection = (id: string | number) => {
    setSpellCheckResults(prev => {
      const nextMap = new Map<string | number, SpellCheckResult>(prev);
      nextMap.set(id, {
        id,
        hasIssue: false,
        issueType: 'none',
        severity: 'info'
      });
      return nextMap;
    });
  };

  const handleSaveEditor = (forceSave: boolean = false) => {
    // Check if there are outstanding spelling errors before saving
    if (!forceSave) {
      let hasErrors = false;
      spellCheckResults.forEach(res => {
        if (res.hasIssue && res.issueType === 'spelling') {
          hasErrors = true;
        }
      });
      if (hasErrors) {
        setShowPreSaveModal(true);
        return;
      }
    }
    setShowPreSaveModal(false);

    // Collect all unique words available for distractors - ONLY from current study set terms!
    const allAvailableWords = editTerms.map(t => {
      const match = t.term.match(/(.*)\((.*)\)/);
      const text = (match ? match[1] : t.term).trim();
      const pos = (match ? match[2] : 'v').trim();
      return { text, pos };
    }).filter(w => w.text !== "");

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
        const studySetToUpdate = studySets.find(s => s.id === currentSetId);
        const updatedSet: StudySet = {
          ...(studySetToUpdate || {}),
          id: currentSetId,
          title: editTitle,
          questions: newQuestions,
          createdAt: studySetToUpdate?.createdAt || Date.now()
        };
        setStudySets(studySets.map(s => s.id === currentSetId ? updatedSet : s));
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'studySets', currentSetId), updatedSet);
        }
      } else {
        const newSetId = Date.now().toString();
        const newSet: StudySet = {
          id: newSetId,
          title: editTitle,
          questions: newQuestions,
          createdAt: Date.now()
        };
        setStudySets([...studySets, newSet]);
        setCurrentSetId(newSetId);
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'studySets', newSetId), newSet);
        }
      }
      setQuizQuestions(newQuestions);
      setQuestionStatus(new Array(newQuestions.length).fill('unanswered'));
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

  const handleSwapColumns = () => {
    setEditTerms(editTerms.map(t => ({
      ...t,
      term: t.definition,
      definition: t.term
    })));
  };

  const [voiceGender, setVoiceGenderState] = useState<'female' | 'male' | 'auto'>(() => getVoiceGender());

  const handleGenderChange = (gender: 'female' | 'male' | 'auto') => {
    setVoiceGenderState(gender);
    setVoiceGender(gender);
    stopAllAudio();
  };

  const speak = (text: string) => {
    playStandardAudio(text, { gender: voiceGender });
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
        
        let termColIndex = 0;
        let defColIndex = 1;
        let posColIndex = 2; // Default to index 2
        let startIndex = 0;

        if (data.length > 0) {
          const firstRow = data[0];
          if (firstRow && firstRow.length >= 2) {
            let foundTerm = -1;
            let foundDef = -1;
            let foundPos = -1;

            for (let i = 0; i < firstRow.length; i++) {
              const cellVal = String(firstRow[i] || '').toLowerCase().trim();
              if (
                cellVal === 'term' || cellVal === 'từ vựng' || cellVal === 'word' || 
                cellVal === 'english' || cellVal === 'tiếng anh' || cellVal === 'từ' || cellVal === 'vocab'
              ) {
                foundTerm = i;
              } else if (
                cellVal === 'definition' || cellVal === 'nghĩa' || cellVal === 'meaning' || 
                cellVal === 'vietnamese' || cellVal === 'tiếng việt' || cellVal === 'dịch nghĩa' || cellVal === 'giải thích'
              ) {
                foundDef = i;
              } else if (
                cellVal === 'part of speech' || cellVal === 'từ loại' || cellVal === 'pos' || 
                cellVal === 'loại từ' || cellVal === 'classification'
              ) {
                foundPos = i;
              }
            }

            if (foundTerm !== -1 && foundDef !== -1) {
              termColIndex = foundTerm;
              defColIndex = foundDef;
              if (foundPos !== -1) {
                posColIndex = foundPos;
              }
              startIndex = 1; // Mark header row to be skipped
            } else {
              // Fallback logic if there are no matching headers
              const col1 = String(firstRow[0] || '').toLowerCase().trim();
              const col2 = String(firstRow[1] || '').toLowerCase().trim();
              if (
                col1 === 'term' || col1 === 'từ vựng' || col1 === 'word' || col1 === 'english' ||
                col2 === 'definition' || col2 === 'nghĩa' || col2 === 'meaning' || col2 === 'vietnamese'
              ) {
                startIndex = 1;
              }
            }
          }
        }

        const rowsToProcess = startIndex > 0 ? data.slice(startIndex) : data;

        newTerms = rowsToProcess
          .filter(row => row && row.length >= 2) // Ensure at least 2 columns exist
          .map(row => {
            const rawTerm = String(row[termColIndex] || '').trim();
            const definition = String(row[defColIndex] || '').trim();
            let term = rawTerm;
            
            // Check if there's a column for part of speech (từ loại)
            if (posColIndex < row.length && row[posColIndex] !== undefined && row[posColIndex] !== null) {
              let pos = String(row[posColIndex]).trim();
              if (pos) {
                // Strip outer and inner duplicate parentheses (e.g. "((n))" or "(n)" or "( n )" or "(( n ))" -> "n")
                while (pos.startsWith('(') && pos.endsWith(')')) {
                  pos = pos.slice(1, -1).trim();
                }
                while (pos.startsWith('(')) pos = pos.slice(1).trim();
                while (pos.endsWith(')')) pos = pos.slice(0, -1).trim();

                if (pos) {
                  // Double check if term doesn't already contain part of speech parentheses
                  const hasParens = /\(.*\)$/.test(term);
                  if (!hasParens && !term.includes('(') && !term.includes(')')) {
                    term = `${term} (${pos})`;
                  }
                }
              }
            }

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

  const exportStudySetToExcel = (set: StudySet) => {
    try {
      const wb = xlsx.utils.book_new();
      
      const wsData = set.questions.map((q, idx) => {
        const correctOpt = q.options.find(o => o.id === q.correctId);
        return {
          "STT": idx + 1,
          "Từ vựng": correctOpt ? correctOpt.text : "",
          "Từ loại": correctOpt ? correctOpt.partOfSpeech : "",
          "Định nghĩa": q.definition,
          "Lựa chọn 1": q.options[0]?.text || "",
          "Lựa chọn 2": q.options[1]?.text || "",
          "Lựa chọn 3": q.options[2]?.text || "",
          "Lựa chọn 4": q.options[3]?.text || "",
          "Đáp án đúng": correctOpt ? correctOpt.text : ""
        };
      });
      
      const ws = xlsx.utils.json_to_sheet(wsData);
      
      // Auto-size columns for better readability
      const maxLens = [5, 20, 10, 30, 15, 15, 15, 15, 15];
      ws['!cols'] = maxLens.map(w => ({ wch: w }));
      
      xlsx.utils.book_append_sheet(wb, ws, "Học phần");
      xlsx.writeFile(wb, `${set.title.replace(/[/\\?%*:|"<>[\]\s]/g, '_')}_Hoc_Phan.xlsx`);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      alert("Đã xảy ra lỗi khi xuất học phần ra Excel!");
    }
  };

  const exportAllStudySetsToExcel = () => {
    if (studySets.length === 0) {
      alert("Không có học phần nào để xuất!");
      return;
    }
    try {
      const wb = xlsx.utils.book_new();
      
      studySets.forEach((set, setIdx) => {
        const wsData = set.questions.map((q, idx) => {
          const correctOpt = q.options.find(o => o.id === q.correctId);
          return {
            "STT": idx + 1,
            "Từ vựng": correctOpt ? correctOpt.text : "",
            "Từ loại": correctOpt ? correctOpt.partOfSpeech : "",
            "Định nghĩa": q.definition,
            "Lựa chọn 1": q.options[0]?.text || "",
            "Lựa chọn 2": q.options[1]?.text || "",
            "Lựa chọn 3": q.options[2]?.text || "",
            "Lựa chọn 4": q.options[3]?.text || "",
            "Đáp án đúng": correctOpt ? correctOpt.text : ""
          };
        });
        
        const ws = xlsx.utils.json_to_sheet(wsData);
        const maxLens = [5, 20, 10, 30, 15, 15, 15, 15, 15];
        ws['!cols'] = maxLens.map(w => ({ wch: w }));
        
        // Sheet names must be unique and <= 31 characters, and not contain / \ ? * : [ ]
        let sheetName = set.title.replace(/[/\\?%*:|"<>[\]]/g, '').trim();
        if (sheetName.length > 25) {
          sheetName = sheetName.substring(0, 25);
        }
        sheetName = sheetName || `Hoc_Phan_${setIdx + 1}`;
        
        // Ensure uniqueness
        let finalSheetName = sheetName;
        let count = 1;
        while (wb.SheetNames.includes(finalSheetName)) {
          finalSheetName = `${sheetName.substring(0, 20)}_${count++}`;
        }
        
        xlsx.utils.book_append_sheet(wb, ws, finalSheetName);
      });
      
      xlsx.writeFile(wb, `Phong_Hoc_Ma_Thuat_Tat_Ca_Hoc_Phan.xlsx`);
    } catch (error) {
      console.error("Error exporting all to Excel:", error);
      alert("Đã xảy ra lỗi khi xuất tất cả học phần ra Excel!");
    }
  };

  const handleRestart = () => {
    const currentSet = studySets.find(s => s.id === currentSetId);
    if (currentSet) {
      const shuffled = [...currentSet.questions].sort(() => Math.random() - 0.5);
      setQuizQuestions(shuffled);
      setQuestionStatus(new Array(shuffled.length).fill('unanswered'));
    }
    setCurrentIdx(0);
    setSelectedId(null);
    setIsCorrect(null);
    setShowFeedback(false);
    setWrittenAnswer('');
    setShowWrittenFeedback(false);
    setIsWrittenCorrect(null);
    setListeningAnswer('');
    setShowListeningFeedback(false);
    setIsListeningCorrect(null);
    setWrongQuestions([]);
    setIsFlipped(false);
    setView(previousView);
  };

  const handleReviewWrong = () => {
    const shuffled = [...wrongQuestions].sort(() => Math.random() - 0.5);
    setQuizQuestions(shuffled);
    setQuestionStatus(new Array(shuffled.length).fill('unanswered'));
    setCurrentIdx(0);
    setSelectedId(null);
    setIsCorrect(null);
    setShowFeedback(false);
    setWrittenAnswer('');
    setShowWrittenFeedback(false);
    setIsWrittenCorrect(null);
    setListeningAnswer('');
    setShowListeningFeedback(false);
    setIsListeningCorrect(null);
    setWrongQuestions([]);
    setIsFlipped(false);
    setView(previousView);
  };

  const handleShuffleQuiz = () => {
    if (quizQuestions.length <= 1) return;

    if (currentIdx === 0) {
      const currentQ = quizQuestions[0];
      const rest = quizQuestions.slice(1);
      const shuffledRest = [...rest].sort(() => Math.random() - 0.5);
      const shuffled = [currentQ, ...shuffledRest];
      
      setQuizQuestions(shuffled);
    } else {
      const finished = quizQuestions.slice(0, currentIdx + 1);
      const remaining = quizQuestions.slice(currentIdx + 1);
      
      const shuffledRemaining = [...remaining].sort(() => Math.random() - 0.5);
      const shuffled = [...finished, ...shuffledRemaining];
      
      setQuizQuestions(shuffled);
    }
  };

  const getFriendlyAuthError = (error: any, providerName: string): React.ReactNode => {
    if (!error) return 'Có lỗi không xác định xảy ra!';
    const code = error.code;
    
    if (code === 'auth/operation-not-allowed') {
      return (
        <div className="space-y-2">
          <p className="text-rose-400 font-extrabold text-xs flex items-center gap-1 uppercase tracking-wider font-bubble">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> Kích hoạt Firebase Auth
          </p>
          <p className="text-[11px] text-white/80 font-bold leading-normal">
            Phương thức đăng nhập <span className="text-pink-400">"{providerName}"</span> chưa được bật trên Firebase Console!
          </p>
          <div className="bg-black/45 p-3 rounded-xl text-[10px] text-pink-200/90 leading-relaxed font-semibold space-y-1.5 border border-white/5">
            <p className="font-extrabold text-white uppercase text-[9px] tracking-wider mb-1">🛠️ Kích hoạt trong 30 giây:</p>
            <p>1️⃣ Truy cập trang <strong className="text-white">Firebase Console</strong></p>
            <p>2️⃣ Chọn dự án của bạn (mã: <span className="text-cyan-300 select-all font-mono font-bold bg-white/5 px-1 py-0.5 rounded">ai-studio-9157...</span>)</p>
            <p>3️⃣ Vào mục <strong className="text-white">Build ➡️ Authentication</strong></p>
            <p>4️⃣ Vào tab <strong className="text-white">Sign-in method</strong> ➡️ Click <strong className="text-white">Add new provider</strong></p>
            <p>5️⃣ Bật phương thức <strong className="text-white">"{providerName}"</strong> lên và bấm lưu nhé! ✨🌸</p>
          </div>
        </div>
      );
    }
    
    if (code === 'auth/popup-closed-by-user') {
      return (
        <div className="space-y-1.5">
          <p className="text-rose-400 font-extrabold text-xs flex items-center gap-1 uppercase tracking-wider font-bubble">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> Popup Đăng Nhập Đã Bị Đóng
          </p>
          <p className="text-[11px] text-white/80 leading-normal font-bold">
            Cửa sổ liên kết Google Drive đã bị đóng trước khi hoàn tất xác thực. Hãy thử lại nhen!
          </p>
          <p className="text-[10px] text-pink-300/60 leading-normal font-semibold">
            💡 <strong>Mẹo hay:</strong> Senpai hãy nhấn vào nút <span className="text-pink-300 underline font-bold bg-white/5 px-1.5 py-0.5 rounded">Mở trong cửa sổ mới ↗️</span> ở góc trên bên phải thanh công cụ AI Studio rồi thử lại để tránh bị trình duyệt áp dụng chính sách chặn popup nhé!
          </p>
        </div>
      );
    }

    if (code === 'auth/popup-blocked') {
      return (
        <div className="space-y-1.5">
          <p className="text-rose-400 font-extrabold text-xs flex items-center gap-1 uppercase tracking-wider font-bubble">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> Trình Duyệt Chặn Popup
          </p>
          <p className="text-[11px] text-white/80 leading-normal font-bold">
            Do ứng dụng đang được chạy bên trong Khung iFrame, trình duyệt của bạn chặn các cửa sổ tự động.
          </p>
          <p className="text-[10px] text-pink-300/60 leading-normal font-semibold">
            💡 <strong>Mẹo hay:</strong> Khuyên dùng tính năng <strong className="text-pink-200">Đăng ký Email</strong> cực kỳ thuận tiện, không lo bị chặn popup!
          </p>
        </div>
      );
    }

    if (code === 'auth/unauthorized-domain') {
      return (
        <div className="space-y-2">
          <p className="text-rose-400 font-extrabold text-xs flex items-center gap-1 uppercase tracking-wider font-bubble">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> Tên Miền Chưa Cấp Phép
          </p>
          <p className="text-[11px] text-white/90 font-bold leading-normal">
            Tên miền preview hiện tại của Senpai chưa được ủy quyền trong Auth của Firebase project!
          </p>
          
          <DomainCopyBox />

          <div className="bg-black/45 p-3 rounded-xl text-[10px] text-pink-200/90 leading-relaxed font-semibold space-y-1.5 border border-white/5">
            <p className="font-extrabold text-white uppercase text-[9px] tracking-wider mb-1">🛠️ Cách cấp phép siêu tốc:</p>
            <p>1️⃣ Truy cập <strong className="text-white">Firebase Console</strong></p>
            <p>2️⃣ Chọn dự án của bạn (mã: <span className="text-cyan-300 select-all font-mono font-bold bg-white/5 px-1 py-0.5 rounded">9157e452-9282-4891-a427-8fd4e7fe327c</span>)</p>
            <p>3️⃣ Vào <strong className="text-white">Build ➡️ Authentication</strong> ➡️ chọn tab <strong className="text-white">Settings</strong></p>
            <p>4️⃣ Chọn mục <strong className="text-white">Authorized domains</strong> ở danh sách bên trái</p>
            <p>5️⃣ Bấm <strong className="text-white">Add domain</strong> ➡️ dán tên miền đã copy ở trên vào và bấm <strong className="text-white">Add</strong> nhen! ✨🌸</p>
          </div>
        </div>
      );
    }

    if (code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
      return 'Email hoặc mật khẩu chưa chính xác rồi Senpai ơi!';
    }

    if (code === 'auth/email-already-in-use') {
      return 'Email này đã được đăng ký trước đó rồi!';
    }

    if (code === 'auth/invalid-email') {
      return 'Định dạng Email của Senpai chưa chuẩn xác rồi!';
    }

    return error.message || 'Có lỗi xảy ra trong quá trình xác thực!';
  };

  const handleSignIn = async () => {
    setIsCloudSyncing(true);
    setSyncStatus({ type: 'info', message: 'Đang kết nối tài khoản Google...' });
    setAuthError(null);
    setAuthMsg(null);
    try {
       const authResult = await googleSignIn();
       if (authResult) {
         setUser(authResult.user);
         setAccessToken(authResult.accessToken);
         setShowAuthModal(false);
         setSyncStatus({ type: 'success', message: `Đồng bộ tài khoản thành công! Xin chào, ${authResult.user.displayName || 'Senpai'}! ✨🌸` });
       }
    } catch (error: any) {
       console.error('Sign in error details:', error);
       
       let friendlyError: React.ReactNode = getFriendlyAuthError(error, 'Google');
       setSyncStatus({ type: 'error', message: `Lỗi kết nối hoặc cấu hình Firebase Auth nhen!` });
       setAuthError('Đăng nhập bị hủy hoặc Google provider chưa được kích hoạt ở Firebase Console.');
       setAuthMsg({ type: 'error', text: friendlyError });
    } finally {
       setIsCloudSyncing(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthMsg({ type: 'error', text: 'Nhập đầy đủ email và mật khẩu nha Senpai!' });
      return;
    }
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const userCredential = await signInWithEmailAndPassword(firebaseAuth, authEmail, authPassword);
      setUser(userCredential.user);
      setShowAuthModal(false);
      setSyncStatus({ type: 'success', message: `Chào mừng Senpai quay trở lại! Ma pháp mây đã hòa nguyên vị! ✨🌸` });
    } catch (err: any) {
      console.error(err);
      const friendlyErr = getFriendlyAuthError(err, 'Email/Password');
      setAuthMsg({ type: 'error', text: friendlyErr });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword || !authDisplayName) {
      setAuthMsg({ type: 'error', text: 'Vui lòng điền đủ Tên, Email và Mật khẩu nhé!' });
      return;
    }
    if (authPassword.length < 6) {
      setAuthMsg({ type: 'error', text: 'Mật khẩu cần tối thiểu 6 ký tự bảo mật nha!' });
      return;
    }
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, authEmail, authPassword);
      await updateProfile(userCredential.user, { displayName: authDisplayName });
      setUser({ ...userCredential.user, displayName: authDisplayName });
      
      // Seed user profile doc
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        userId: userCredential.user.uid,
        displayName: authDisplayName,
        email: authEmail,
        updatedAt: Date.now()
      });

      setShowAuthModal(false);
      setSyncStatus({ type: 'success', message: 'Tạo tài khoản ma pháp thành công! ✨🏵️' });
    } catch (err: any) {
      console.error(err);
      const friendlyErr = getFriendlyAuthError(err, 'Email/Password');
      setAuthMsg({ type: 'error', text: friendlyErr });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAnonymousLogin = async () => {
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const userCredential = await signInAnonymously(firebaseAuth);
      setUser(userCredential.user);
      setShowAuthModal(false);
      setSyncStatus({ type: 'success', message: 'Hòa mây ẩn danh thành công! Dữ liệu sẽ tạm sao lưu an toàn! ☁️✨' });
    } catch (err: any) {
      console.error(err);
      const friendlyErr = getFriendlyAuthError(err, 'Anonymous');
      setAuthMsg({ type: 'error', text: friendlyErr });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setShowProfileMenu(false);
      setSyncStatus({ type: 'success', message: 'Đã tạm thời ngắt kết nối với Đám mây ma pháp.' });
    } catch (error: any) {
      console.error(error);
    }
  };

  const currentQuestion = quizQuestions[currentIdx] || INITIAL_QUESTIONS[0];

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-[#0d0727] text-white flex flex-col font-sans p-6 pb-20 relative overflow-hidden">
        {/* Soft floating sakura petals decorative ornaments */}
        <div className="absolute top-10 left-10 text-white/5 text-4xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '10s' }}>🌸</div>
        <div className="absolute bottom-20 right-10 text-white/5 text-5xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '8s' }}>🌸</div>
        <div className="absolute top-1/3 right-1/4 text-white/5 text-3xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '14s' }}>✨</div>
        <div className="absolute bottom-1/3 left-1/5 text-white/5 text-4xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '12s' }}>⭐</div>

        {syncStatus && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-2xl shadow-2xl border-2 transition-all duration-300 max-w-sm flex items-center gap-3 anime-shadow-purple ${
            syncStatus.type === 'success' ? 'bg-[#152e24] border-emerald-500 text-emerald-200' :
            syncStatus.type === 'error' ? 'bg-[#3b1c1c] border-red-500 text-red-200' :
            'bg-[#1e1346] border-purple-500 text-purple-200'
          }`}>
            {isCloudSyncing ? (
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            ) : syncStatus.type === 'success' ? (
              <Check className="w-5 h-5 shrink-0 text-emerald-400" />
            ) : syncStatus.type === 'error' ? (
              <X className="w-5 h-5 shrink-0 text-red-400" />
            ) : (
              <Cloud className="w-5 h-5 shrink-0 text-pink-400" />
            )}
            <p className="text-sm font-bold font-bubble">{syncStatus.message}</p>
          </div>
        )}

        <header className="flex flex-col sm:flex-row items-center justify-between py-6 max-w-5xl mx-auto w-full border-b border-pink-500/20 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-violet-600 border-2 border-pink-300 flex items-center justify-center shadow-lg shadow-pink-500/20 animate-spin" style={{ animationDuration: '25s' }}>
              <span className="text-xl">🌸</span>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-pink-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent font-bubble">
                PHÒNG HỌC MA THUẬT
              </h1>
              <p className="text-[10px] text-pink-300/60 font-semibold tracking-wider font-mono uppercase">ANIME KAWAI STUDY ENGINE v2.0</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
            {studySets.length > 0 && (
              <button 
                onClick={exportAllStudySetsToExcel}
                className="bg-[#1f1642] hover:bg-[#281d54] text-pink-300 hover:text-pink-100 border-2 border-pink-500/30 px-5 py-2.5 rounded-2xl font-extrabold transition-all flex items-center gap-2 shadow-lg hover:-translate-y-0.5 duration-150 text-sm cursor-pointer"
                title="Xuất tất cả học phần ra file Excel (.xlsx)"
              >
                <Download className="w-4 h-4 text-pink-400" /> Xuất tất cả 📥
              </button>
            )}

            <button 
              onClick={() => {
                setCurrentSetId(null);
                setEditTitle('Học phần mới');
                setEditTerms([{ id: Date.now(), term: '', definition: '' }]);
                setView('editor');
              }}
              className="bg-pink-600 hover:bg-pink-500 text-white px-5 py-2.5 rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg hover:-translate-y-0.5 anime-shadow-pink text-sm cursor-pointer border-2 border-pink-400/50"
            >
              <Plus className="w-4 h-4" /> Tạo học phần 🌟
            </button>

            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="bg-[#1f1642] hover:bg-[#281d54] border-2 border-pink-400/30 px-4 py-2.5 rounded-2xl flex items-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" className="w-5 h-5 rounded-full border border-pink-300" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                      {user.displayName ? user.displayName.charAt(0) : 'S'}
                    </div>
                  )}
                  <span className="text-xs font-black text-pink-200 hidden sm:inline max-w-[120px] truncate">
                    {user.displayName || user.email?.split('@')[0] || 'Senpai 🌸'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-pink-300/50 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
                </button>

                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-[#15162c] border-2 border-pink-500/20 rounded-2xl shadow-2xl py-2 z-50 overflow-hidden text-left">
                    <div className="px-4 py-3 bg-[#1e1435]">
                      <p className="text-[9px] text-pink-400 uppercase font-black tracking-wider">Pháp Tịch Ma Pháp Quyết</p>
                      <p className="text-sm font-extrabold truncate text-white mt-0.5">{user.displayName || 'Pháp sư học từ'}</p>
                      <p className="text-[10px] text-pink-300/60 truncate font-mono">{user.email || 'Hòa mây ẩn danh'}</p>
                    </div>
                    
                    <div className="px-4 py-3 border-b border-white/5 bg-[#17112d] flex items-center gap-2 text-xs text-emerald-400 font-extrabold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang Tự Động Đồng Bộ 🔄✨</span>
                    </div>

                    <div className="px-4 py-2 text-[11px] text-white/50 leading-relaxed max-h-[100px] overflow-y-auto">
                      Học phần ma pháp được đồng bộ tức thì lên tất cả thiết bị của Senpai! 💻📱
                    </div>

                    <div className="border-t border-white/5 my-1"></div>

                    <button 
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2.5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 flex items-center gap-2 text-sm font-bold transition-all cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={() => {
                  setAuthMsg(null);
                  setShowAuthModal(true);
                }}
                className="bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white px-5 py-2.5 rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg hover:-translate-y-0.5 anime-shadow-pink text-sm cursor-pointer border-2 border-pink-400/50"
              >
                <Cloud className="w-4 h-4 animate-bounce" /> Đồng bộ Ma pháp ☁️✨
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full py-12">
          {/* Cloud Synchronization Status Banner */}
          {user ? (
            <div className="mb-8 p-5 bg-[#142d22] border-2 border-emerald-500/30 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg anime-shadow-emerald relative overflow-hidden">
              <div className="absolute top-0 right-0 p-1 bg-emerald-500/10 text-emerald-400 text-[9px] font-black tracking-wider uppercase font-mono px-2 py-0.5 rounded-bl-xl border-l border-b border-emerald-500/20">
                CLOUD ACTIVE ☁️✨
              </div>
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shrink-0">
                  <Cloud className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm md:text-base font-extrabold text-emerald-400 font-bubble">Kết Nối Mây Ma Pháp Tự Động Thành Công!</p>
                  <p className="text-xs text-emerald-300/60 font-semibold mt-0.5">
                    Học phần của Senpai hiện đang được lưu trữ an toàn và đồng bộ tự động <strong>tức thì</strong> giữa Máy tính và Điện thoại di động nhen! 📱💻
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-8 p-5 bg-[#191535] border-2 border-pink-500/20 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-md relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 p-1 bg-pink-500/10 text-pink-400 text-[9px] font-black tracking-wider uppercase font-mono px-2 py-0.5 rounded-bl-xl border-l border-b border-pink-500/20 animate-pulse">
                OFFLINE MODE 📴
              </div>
              <div className="flex items-center gap-3.5 text-left">
                <div className="w-11 h-11 rounded-2xl bg-pink-500/10 flex items-center justify-center text-pink-400 border border-pink-500/20 shrink-0">
                  <Cloud className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="text-sm md:text-base font-extrabold text-pink-200 font-bubble">Đồng bộ từ vựng giữa Máy tính & Điện thoại? 💻↔️📱</p>
                  <p className="text-xs text-pink-300/60 font-medium mt-1 leading-relaxed">
                    Hãy đăng nhập tài khoản đám mây ma pháp học tập để giữ toàn bộ học phần của bạn an toàn, đồng bộ dễ dàng và học tiếp trên các thiết bị khác hoàn toàn miễn phí!
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setAuthMsg(null);
                  setShowAuthModal(true);
                }}
                className="w-full md:w-auto shrink-0 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-extrabold text-xs px-5 py-3 rounded-2xl transition-all shadow-md hover:-translate-y-0.5 anime-shadow-pink text-center cursor-pointer"
              >
                Kích hoạt đồng bộ Cloud ✨
              </button>
            </div>
          )}
          <KokoMascot 
            expression="smile" 
            text="Chào mừng Senpai quay lại phòng học ma thuật! Hôm nay chúng ta cùng nhau ôn luyện & chinh phục từ vựng tiếng Anh nhé! Ganbare! 🌸✨"
          />

          {studySets.length === 0 ? (
            <div className="text-center py-20 bg-[#1e1445]/40 border-2 border-dashed border-pink-500/25 rounded-3xl p-8 max-w-xl mx-auto">
              <span className="text-5xl block mb-4">😿</span>
              <p className="text-pink-200 font-bold text-lg font-bubble">Chưa có học phần phép thuật nào cả Senpai ơi!</p>
              <p className="text-pink-300/60 text-sm mt-2 mb-6">Hãy bấm nút "Tạo học phần" phía góc để bắt đầu chuyến phiêu lưu tri thức nhé!</p>
              <button 
                onClick={() => {
                  setCurrentSetId(null);
                  setEditTitle('Học phần mới');
                  setEditTerms([{ id: Date.now(), term: '', definition: '' }]);
                  setView('editor');
                }}
                className="bg-pink-600 hover:bg-pink-500 text-white px-6 py-2.5 rounded-2xl font-black transition-all border-2 border-pink-400/50 anime-shadow-pink"
              >
                Tạo học phần ngay 🌸
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {studySets.map(set => (
                <div key={set.id} className="bg-[#1c143d] border-2 border-pink-500/30 rounded-3xl p-6 hover:border-pink-400 transition-all group relative flex flex-col shadow-xl hover:shadow-pink-500/10 anime-shadow-pink hover:-translate-y-1 duration-300">
                  {/* Cute anime sticker tags */}
                  <div className="absolute -top-3 -right-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[9.5px] font-black uppercase px-2.5 py-1 rounded-xl shadow-md border border-pink-300 z-10 font-mono tracking-wider">
                    Study Pad 🌸
                  </div>

                  <div className="flex-1">
                    <h3 className="text-xl md:text-2xl font-extrabold mb-1.5 text-pink-100 group-hover:text-pink-300 transition-colors font-bubble">{set.title}</h3>
                    <p className="text-pink-300/50 text-xs font-bold mb-5 font-mono flex items-center gap-1">
                      <span>✨ {set.questions.length} ma thuật thuật ngữ</span>
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => {
                            setCurrentSetId(set.id);
                            const shuffled = [...set.questions].sort(() => Math.random() - 0.5);
                            setQuizQuestions(shuffled);
                            setQuestionStatus(new Array(shuffled.length).fill('unanswered'));
                            setCurrentIdx(0);
                            setSelectedId(null);
                            setIsCorrect(null);
                            setShowFeedback(false);
                            setWrongQuestions([]);
                            setPreviousView('quiz');
                            setView('quiz');
                          }}
                          className="bg-purple-600/20 hover:bg-purple-600 text-purple-200 hover:text-white text-xs font-extrabold py-3 px-1 rounded-xl transition-all border-2 border-purple-500/30 text-center hover:scale-[1.03] duration-150 cursor-pointer"
                        >
                          Trắc nghiệm ☄️
                        </button>
                        <button 
                          onClick={() => {
                            setCurrentSetId(set.id);
                            const shuffled = [...set.questions].sort(() => Math.random() - 0.5);
                            setQuizQuestions(shuffled);
                            setQuestionStatus(new Array(shuffled.length).fill('unanswered'));
                            setCurrentIdx(0);
                            setIsFlipped(false);
                            setPreviousView('flashcard');
                            setView('flashcard');
                          }}
                          className="bg-pink-600/20 hover:bg-pink-600 text-pink-200 hover:text-white text-xs font-extrabold py-3 px-1 rounded-xl transition-all border-2 border-pink-400/30 text-center hover:scale-[1.03] duration-150 cursor-pointer"
                        >
                          Thẻ ghi nhớ 🏷️
                        </button>
                        <button 
                          onClick={() => {
                            setCurrentSetId(set.id);
                            const shuffled = [...set.questions].sort(() => Math.random() - 0.5);
                            setQuizQuestions(shuffled);
                            setQuestionStatus(new Array(shuffled.length).fill('unanswered'));
                            setCurrentIdx(0);
                            setWrittenAnswer('');
                            setShowWrittenFeedback(false);
                            setIsWrittenCorrect(null);
                            setWrongQuestions([]);
                            setPreviousView('written');
                            setView('written');
                          }}
                          className="bg-cyan-600/20 hover:bg-cyan-600 text-cyan-200 hover:text-white text-xs font-extrabold py-3 px-1 rounded-xl transition-all border-2 border-cyan-500/30 text-center hover:scale-[1.03] duration-150 cursor-pointer"
                        >
                          Tự luận ✏️
                        </button>
                        <button 
                          onClick={() => {
                            setCurrentSetId(set.id);
                            const shuffled = [...set.questions].sort(() => Math.random() - 0.5);
                            setQuizQuestions(shuffled);
                            setQuestionStatus(new Array(shuffled.length).fill('unanswered'));
                            setCurrentIdx(0);
                            setListeningAnswer('');
                            setShowListeningFeedback(false);
                            setIsListeningCorrect(null);
                            setWrongQuestions([]);
                            setPreviousView('listening');
                            setView('listening');
                          }}
                          className="bg-rose-600/20 hover:bg-rose-500/30 text-rose-200 hover:text-white text-xs font-extrabold py-3 px-1 rounded-xl transition-all border-2 border-rose-500/30 text-center hover:scale-[1.03] duration-150 cursor-pointer"
                        >
                          Luyện nghe 🎧
                        </button>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setCurrentSetId(set.id);
                          setView('ai_generator');
                        }}
                        className="w-full bg-gradient-to-r from-pink-600/30 to-purple-600/30 hover:from-pink-500 hover:to-purple-500 text-pink-200 hover:text-white text-xs font-black py-3 rounded-xl transition-all border-2 border-pink-500/30 text-center hover:scale-[1.01] duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-md hover:shadow-pink-500/20"
                      >
                        Sinh Bài Đọc & Nghe AI 🔮
                      </button>

                      {set.needsReview && set.needsReview.length > 0 && (
                        <button 
                          onClick={() => {
                            setCurrentSetId(set.id);
                            const reviewQuestions = set.questions.filter(q => set.needsReview?.includes(q.id));
                            const shuffled = [...reviewQuestions].sort(() => Math.random() - 0.5);
                            setQuizQuestions(shuffled);
                            setQuestionStatus(new Array(shuffled.length).fill('unanswered'));
                            setCurrentIdx(0);
                            setSelectedId(null);
                            setIsCorrect(null);
                            setShowFeedback(false);
                            setWrongQuestions([]);
                            setPreviousView('quiz');
                            setView('quiz');
                          }}
                          className="w-full bg-amber-500/20 hover:bg-amber-600 text-amber-200 hover:text-black text-xs font-extrabold py-2 rounded-xl transition-colors border-2 border-amber-400/40 hover:-translate-y-0.5 duration-100"
                        >
                          🔥 ÔN TẬP {set.needsReview.length} TỪ SAI • GANBARE!
                        </button>
                      )}
                    </div>
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
                    {deleteConfirmId === set.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-400 font-bold mr-1">Xoá?</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setStudySets(studySets.filter(s => s.id !== set.id));
                            if (user) {
                              deleteDoc(doc(db, 'users', user.uid, 'studySets', set.id));
                            }
                            setDeleteConfirmId(null);
                            if (currentSetId === set.id) setCurrentSetId(null);
                          }}
                          className="text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-xs font-bold transition-colors"
                        >
                          Có
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="text-white/60 hover:text-white px-3 py-1 rounded text-xs transition-colors"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            exportStudySetToExcel(set);
                          }}
                          className="text-white/40 hover:text-emerald-400 p-2 rounded-lg hover:bg-emerald-500/10 transition-colors"
                          title="Xuất học phần ra Excel (.xlsx)"
                        >
                          <Download className="w-4 h-4" />
                        </button>
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
                          title="Chỉnh sửa"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(set.id);
                          }}
                          className="text-white/40 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                          title="Xoá học phần"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Authentication & Integration Modal Overlay */}
          {showAuthModal && (
            <div className="fixed inset-0 bg-[#060413]/90 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-[#151233] border-4 border-pink-500/30 rounded-3xl w-full max-w-md p-6 relative shadow-2xl overflow-hidden text-left"
              >
                {/* Decorative background stars */}
                <span className="absolute top-4 right-12 text-pink-500/20 text-xl select-none animate-ping">⭐</span>
                <span className="absolute bottom-12 left-4 text-violet-500/20 text-2xl select-none animate-bounce">🌸</span>

                <button 
                  onClick={() => setShowAuthModal(false)}
                  className="absolute top-4 right-4 text-white/40 hover:text-white bg-[#201c4c] p-2 rounded-full cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center mb-6">
                  <span className="text-4xl block mb-2">☁️✨</span>
                  <h3 className="text-2xl font-black bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent font-bubble">
                    ĐỒNG BỘ MA PHÁP
                  </h3>
                  <p className="text-xs text-pink-300/60 font-semibold mt-1">Đồng bộ từ vựng Máy tính & Điện thoại không giới hạn!</p>
                </div>

                {/* Tab selectors */}
                <div className="grid grid-cols-2 gap-2 bg-[#0e0a26] p-1.5 rounded-2xl mb-5">
                  <button 
                    onClick={() => {
                      setAuthTab('login');
                      setAuthMsg(null);
                    }}
                    className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      authTab === 'login' 
                        ? 'bg-pink-600 text-white shadow anime-shadow-pink' 
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    ĐĂNG NHẬP 🔑
                  </button>
                  <button 
                    onClick={() => {
                      setAuthTab('register');
                      setAuthMsg(null);
                    }}
                    className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      authTab === 'register' 
                        ? 'bg-pink-600 text-white shadow anime-shadow-pink' 
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    ĐĂNG KÝ 🌱
                  </button>
                </div>

                {authMsg && (
                  <div className={`p-3.5 rounded-xl border mb-4 text-xs font-bold font-bubble ${
                    authMsg.type === 'error' 
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}>
                    {authMsg.text}
                  </div>
                )}

                <form onSubmit={authTab === 'login' ? handleEmailLogin : handleEmailRegister} className="space-y-4">
                  {authTab === 'register' && (
                    <div>
                      <label className="block text-[11px] text-pink-300 font-extrabold uppercase tracking-wider mb-1.5">Tên hiển thị (Senpai Name)</label>
                      <input 
                        type="text" 
                        placeholder="Ví dụ: Koko Senpai" 
                        value={authDisplayName}
                        onChange={(e) => setAuthDisplayName(e.target.value)}
                        className="w-full bg-[#0b0821] border border-pink-500/20 focus:border-pink-500 outline-none rounded-xl px-4 py-3 text-sm text-white font-semibold transition-colors shadow-inner"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] text-pink-300 font-extrabold uppercase tracking-wider mb-1.5">Địa chỉ Email</label>
                    <input 
                      type="email" 
                      placeholder="senpai@example.com" 
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full bg-[#0b0821] border border-pink-500/20 focus:border-pink-500 outline-none rounded-xl px-4 py-3 text-sm text-white font-semibold transition-colors shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-pink-300 font-extrabold uppercase tracking-wider mb-1.5">Mật khẩu</label>
                    <input 
                      type="password" 
                      placeholder="••••••••" 
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full bg-[#0b0821] border border-pink-500/20 focus:border-pink-500 outline-none rounded-xl px-4 py-3 text-sm text-white font-semibold transition-colors shadow-inner"
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={authLoading}
                    className="w-full bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white font-black py-3 rounded-xl transition-all shadow-lg hover:-translate-y-0.5 anime-shadow-pink text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2"
                  >
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                    <span>{authTab === 'login' ? 'Xác nhận Đăng Nhập ✨' : 'Hoàn Tất Đăng Ký ✨'}</span>
                  </button>
                </form>

                <div className="relative my-6 text-center">
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-white/10" />
                  <span className="relative bg-[#151233] px-3 text-[10px] text-white/40 uppercase font-black tracking-widest font-mono">hoặc chọn mây khác</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={handleSignIn}
                    disabled={authLoading}
                    className="bg-[#2a2d52] hover:bg-[#343867] border border-white/10 text-white font-extrabold text-xs py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow"
                  >
                    <span>Google 🌐</span>
                  </button>
                  <button 
                    onClick={handleAnonymousLogin}
                    disabled={authLoading}
                    className="bg-indigo-950/40 hover:bg-indigo-950/80 border border-indigo-500/15 text-indigo-300 font-extrabold text-xs py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow"
                  >
                    <span>Ẩn danh 👤</span>
                  </button>
                </div>

                <div className="mt-5 text-center px-4 py-2 bg-[#0e0a26] rounded-xl text-[10px] text-pink-300/50 leading-relaxed font-semibold">
                  💡 <strong>Senpai lưu ý:</strong> Bạn có thể mở ứng dụng bằng nút <strong>"Mở trong cửa sổ mới" (Open in new window)</strong> trên AI Studio để dùng Google Mail mà không bị trình duyệt chặn nhen!
                </div>
              </motion.div>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (view === 'ai_generator') {
    const activeSet = studySets.find(s => s.id === currentSetId);
    if (activeSet) {
      return (
        <AIGeneratorView 
          studySet={activeSet}
          onBack={() => setView('dashboard')}
          speakText={speak}
        />
      );
    } else {
      setView('dashboard');
      return null;
    }
  }

  if (view === 'flashcard') {
    const correctOption = currentQuestion.options.find(o => o.id === currentQuestion.correctId);
    const word = correctOption ? `${correctOption.text}` : '';
    const pos = correctOption ? correctOption.partOfSpeech : '';
    const definition = currentQuestion.definition;

    return (
      <div className="min-h-screen bg-[#0d0727] text-white flex flex-col font-sans relative overflow-hidden pb-12">
        {/* Soft floating sakura petals decorative ornaments */}
        <div className="absolute top-10 left-10 text-white/5 text-4xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '12s' }}>🌸</div>
        <div className="absolute bottom-20 right-10 text-white/5 text-5xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '9s' }}>🌸</div>

        <header className="flex flex-col sm:flex-row items-center justify-between p-6 border-b border-pink-500/10 gap-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setView('dashboard')}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
            <h1 className="text-xl font-bold text-pink-300 font-bubble">Magic Flashcards</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#16103a] border border-pink-500/20 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => handleGenderChange('female')}
                className={`px-2.5 py-1 font-bold rounded-lg transition-all ${
                  voiceGender === 'female' ? 'bg-pink-500 text-white shadow-md' : 'text-pink-200/70 hover:text-white'
                }`}
                title="Use female voice"
              >
                ♀️ Female
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange('male')}
                className={`px-2.5 py-1 font-bold rounded-lg transition-all ${
                  voiceGender === 'male' ? 'bg-indigo-500 text-white shadow-md' : 'text-pink-200/70 hover:text-white'
                }`}
                title="Use male voice"
              >
                ♂️ Male
              </button>
            </div>
            <span className="text-pink-300 font-black px-3 py-1 bg-pink-500/10 rounded-full text-xs font-mono border border-pink-500/20">{currentIdx + 1} / {quizQuestions.length}</span>
            <button 
              onClick={handleShuffleQuiz}
              className="p-2.5 bg-pink-600/20 hover:bg-pink-600 text-pink-300 hover:text-white rounded-xl transition-all cursor-pointer"
              title="Shuffle questions"
            >
              <Shuffle className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full">
          
          <KokoMascot 
            expression={isFlipped ? "happy" : "smile"}
            text={
              isFlipped 
                ? "Kyaaa! This word is pronounced '" + word + "'! " + (pos ? "It is a (" + pos + "). " : "") + "Did you remember it well? 🌸💖"
                : "Hmm... Can you guess the English term for '" + definition + "'? Tap the card to flip! ⭐"
            }
          />

          {/* Progress bar */}
          <div className="w-full max-w-2xl mb-8 flex gap-1 h-3">
            {quizQuestions.map((_, idx) => (
              <div 
                key={idx} 
                className={`flex-1 rounded-full transition-colors ${
                  idx === currentIdx ? 'bg-pink-400' : 
                  idx < currentIdx ? 'bg-pink-500/30' : 'bg-white/5'
                }`}
              />
            ))}
          </div>

          <div 
            className="w-full aspect-[3/2] max-h-[350px] [perspective:1000px] cursor-pointer"
            onClick={() => {
              const newFlippedState = !isFlipped;
              setIsFlipped(newFlippedState);
              if (newFlippedState) {
                speak(word);
              }
            }}
          >
            <motion.div 
              className="w-full h-full relative [transform-style:preserve-3d]"
              animate={{ rotateX: isFlipped ? 180 : 0 }}
              transition={{ type: 'tween', duration: 0.3 }}
            >
              {/* Front (Definition) */}
              <div className="absolute inset-0 [backface-visibility:hidden] bg-[#22174c] border-4 border-dashed border-pink-400/40 rounded-3xl flex flex-col items-center justify-center p-8 shadow-2xl relative">
                <div className="absolute top-4 left-4 text-pink-300/30 text-xs font-bold font-mono tracking-widest">DEFINING MAGIC 🎴</div>
                <span className="text-pink-300 font-extrabold text-sm uppercase tracking-wider mb-4 font-mono bg-pink-500/10 px-3 py-1 rounded-full border border-pink-500/20">Definition</span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-center leading-relaxed text-pink-100 font-bubble">{definition}</h2>
                <div className="absolute bottom-6 text-pink-300/50 text-xs font-black uppercase tracking-widest animate-pulse">🌸 Click or SPACE to flip card 🌸</div>
              </div>

              {/* Back (Word) */}
              <div className="absolute inset-0 [backface-visibility:hidden] bg-[#1e1445] border-4 border-solid border-pink-500 rounded-3xl flex flex-col items-center justify-center p-8 shadow-2xl [transform:rotateX(180deg)] relative anime-shadow-pink">
                <div className="absolute top-4 left-4 text-cyan-300/30 text-xs font-bold font-mono tracking-widest font-bubble">SPELL COMPLETED 💫</div>
                <span className="text-cyan-300 font-extrabold text-sm uppercase tracking-wider mb-4 font-mono bg-cyan-500/15 px-3 py-1 rounded-full border border-cyan-500/20">English Term</span>
                <h2 className="text-3xl md:text-5.5xl font-black text-center text-white font-bubble tracking-wide">{word}</h2>
                {pos && <span className="text-pink-300 font-extrabold mt-4 text-sm bg-pink-500/20 px-3.5 py-1 rounded-full border border-pink-500/20">({pos})</span>}
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(word);
                  }}
                  className="absolute top-4 right-4 p-3 bg-pink-500/20 hover:bg-pink-500 hover:scale-110 active:scale-95 text-white rounded-full transition-all border border-pink-400"
                >
                  <Volume2 className="w-5 h-5 text-pink-100" />
                </button>
                <div className="absolute bottom-6 text-pink-300/50 text-xs font-black uppercase tracking-widest">🌸 Click to flip back 🌸</div>
              </div>
            </motion.div>
          </div>

          <div className="flex items-center gap-6 mt-12 w-full max-w-sm mx-auto justify-center">
            <button 
              onClick={() => handleMarkFlashcard(false)}
              className="flex-1 py-4 bg-rose-500 hover:bg-rose-400 text-white rounded-2xl transition-all flex justify-center items-center shadow-lg border-2 border-rose-300 font-mono font-black cursor-pointer anime-shadow-pink hover:-translate-y-0.5 text-xs uppercase"
            >
              <span className="mr-2">X</span> Review 😢
            </button>
            <button 
              onClick={() => handleMarkFlashcard(true)}
              className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl transition-all flex justify-center items-center shadow-lg border-2 border-emerald-300 font-mono font-black cursor-pointer anime-shadow-emerald hover:-translate-y-0.5 text-xs uppercase"
            >
              <span className="mr-2">✓</span> Learned 🌸
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (view === 'written') {
    const q = quizQuestions[currentIdx] || INITIAL_QUESTIONS[0];
    const correctOption = q?.options?.find(o => o.id === q.correctId);
    const word = correctOption ? correctOption.text : '';
    const pos = correctOption ? correctOption.partOfSpeech : '';
    const definition = q?.definition || '';

    return (
      <div className="min-h-screen bg-[#0d0727] text-white flex flex-col font-sans relative overflow-hidden pb-12">
        {/* Soft floating sakura petals decorative ornaments */}
        <div className="absolute top-10 left-10 text-white/5 text-4xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '10s' }}>🌸</div>
        <div className="absolute bottom-20 right-10 text-white/5 text-5xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '8s' }}>🌸</div>

        <header className="flex flex-col sm:flex-row items-center justify-between p-6 border-b border-pink-500/10 gap-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setView('dashboard')}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
            <h1 className="text-xl font-bold text-pink-300 font-bubble">Spelling & Writing Mode</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#16103a] border border-pink-500/20 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => handleGenderChange('female')}
                className={`px-2.5 py-1 font-bold rounded-lg transition-all ${
                  voiceGender === 'female' ? 'bg-pink-500 text-white shadow-md' : 'text-pink-200/70 hover:text-white'
                }`}
                title="Use female voice"
              >
                ♀️ Female
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange('male')}
                className={`px-2.5 py-1 font-bold rounded-lg transition-all ${
                  voiceGender === 'male' ? 'bg-indigo-500 text-white shadow-md' : 'text-pink-200/70 hover:text-white'
                }`}
                title="Use male voice"
              >
                ♂️ Male
              </button>
            </div>
            <span className="text-pink-300 font-black px-3 py-1 bg-pink-500/10 rounded-full text-xs font-mono border border-pink-500/20">{currentIdx + 1} / {quizQuestions.length}</span>
            <button 
              onClick={handleShuffleQuiz}
              className="p-2.5 bg-pink-600/20 hover:bg-pink-600 text-pink-300 hover:text-white rounded-xl transition-all cursor-pointer"
              title="Shuffle questions"
            >
              <Shuffle className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full">
          
          <KokoMascot 
            expression={
              !showWrittenFeedback ? 'smile' :
              isWrittenCorrect ? 'happy' : 'sad'
            }
            text={
              !showWrittenFeedback 
                ? "Enter the English term corresponding to '" + definition + "'! Koko is looking forward to your answer! ✏️✨"
                : isWrittenCorrect
                  ? "Woaaa! Brilliant work! You mastered '" + word + "' perfectly! 💕🎉"
                  : "Oh... Close attempt! The correct spelling is '" + word + "'. Try writing it down to remember! 🌸"
            }
          />

          {/* Progress bar */}
          <div className="w-full max-w-2xl mb-8 flex gap-1 h-3">
            {quizQuestions.map((_, idx) => {
              const status = questionStatus[idx];
              let colorClasses = 'bg-white/5 border border-white/5';
              if (status === 'correct') {
                colorClasses = 'bg-emerald-400';
              } else if (status === 'incorrect') {
                colorClasses = 'bg-rose-500';
              } else if (idx === currentIdx) {
                colorClasses = 'bg-pink-400';
              }
              return (
                <div 
                  key={idx} 
                  className={`flex-1 rounded-full transition-colors ${colorClasses}`}
                />
              );
            })}
          </div>

          {/* Flashcard containing prompt */}
          <div className="w-full bg-[#1c143d] border-2 border-pink-500/30 rounded-3xl flex flex-col p-6 md:p-10 shadow-2xl relative anime-shadow-pink">
            <div className="absolute top-3 right-4 text-[10px] bg-pink-500/20 text-pink-300 font-extrabold px-3 py-0.5 rounded-full border border-pink-500/25 uppercase font-mono tracking-wider font-bubble">
              Spell Book 📖
            </div>
            <span className="text-pink-300/50 text-xs font-bold uppercase tracking-widest mb-3 block">Definition</span>
            <h2 className="text-2xl md:text-3xl font-extrabold mb-8 leading-relaxed text-pink-100 font-bubble">{definition}</h2>

            <form onSubmit={handleSubmitWritten} className="space-y-4">
              <div className="relative">
                <input 
                  ref={writtenInputRef}
                  type="text" 
                  value={writtenAnswer}
                  onChange={(e) => setWrittenAnswer(e.target.value)}
                  placeholder="Type the English term..."
                  className={`w-full bg-[#0d0727] border-2 rounded-2xl px-6 py-4 text-lg font-extrabold text-center focus:outline-none focus:ring-4 focus:ring-pink-500/20 transition-all font-bubble ${
                    showWrittenFeedback 
                      ? isWrittenCorrect 
                        ? 'border-emerald-500 text-emerald-400' 
                        : 'border-rose-500 text-rose-400'
                      : 'border-pink-500/20 focus:border-pink-400 text-white'
                  }`}
                  disabled={showWrittenFeedback}
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </div>

              <div className="flex gap-3 justify-center pt-2">
                {!showWrittenFeedback ? (
                  <>
                    <button 
                      type="button"
                      onClick={() => {
                        setIsWrittenCorrect(false);
                        setShowWrittenFeedback(true);
                        setQuestionStatus(prev => {
                          const newStatus = [...prev];
                          newStatus[currentIdx] = 'incorrect';
                          return newStatus;
                        });
                        setWrongQuestions(prev => {
                          if (prev.find(item => item.id === q.id)) return prev;
                          return [...prev, q];
                        });
                        clearAutoNextTimer();
                        autoNextTimerRef.current = setTimeout(() => {
                          handleNextWritten();
                        }, 1800);
                      }}
                      className="px-6 py-3 bg-[#1e1346] hover:bg-[#281d54] rounded-2xl font-black text-xs uppercase tracking-wider text-pink-300 border border-pink-500/30 transition-all cursor-pointer"
                    >
                      Skip 🌟
                    </button>
                    <button 
                      type="submit"
                      disabled={!writtenAnswer.trim()}
                      className="px-8 py-3 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:hover:bg-pink-600 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-white shadow-lg anime-shadow-pink cursor-pointer border-2 border-pink-400/50"
                    >
                      Check ☄️
                    </button>
                  </>
                ) : (
                  <button 
                    type="button"
                    onClick={handleNextWritten}
                    className="px-10 py-3 bg-pink-600 hover:bg-pink-500 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-white shadow-lg anime-shadow-pink cursor-pointer border-2 border-pink-400/50"
                  >
                    {currentIdx < quizQuestions.length - 1 ? 'Next 🌸' : 'View Results ✨'}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Feedback area */}
          <AnimatePresence>
            {showWrittenFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className={`w-full mt-6 p-5 rounded-3xl border-2 ${
                  isWrittenCorrect 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 anime-shadow-emerald' 
                    : 'bg-red-500/10 border-rose-500/30 text-rose-300 anime-shadow-pink'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="pt-1 shrink-0">
                    {isWrittenCorrect ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-extrabold text-lg mb-1 font-bubble">
                      {isWrittenCorrect ? 'Spot on! ✨' : 'Not quite right...'}
                    </p>
                    <p className="text-pink-100/80 text-sm leading-relaxed font-bubble">
                      Correct answer:{' '}
                      <strong className="text-white text-lg font-bubble underline decoration-pink-500 decoration-2 underline-offset-2">
                        {word}
                      </strong>{' '}
                      {pos && <span className="text-pink-300/60 text-xs">({pos})</span>}
                    </p>
                  </div>
                  <button 
                    onClick={() => speak(word)}
                    type="button"
                    className="p-3 bg-[#1e1346] hover:bg-[#281d54] border border-pink-500/20 text-pink-300 hover:text-pink-200 rounded-full transition-all shrink-0 cursor-pointer"
                    title="Listen to pronunciation"
                  >
                    <Volume2 className="w-5 h-5 hidden" />
                    <span className="text-xs font-mono">🔈 REPLAY</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    );
  }

  if (view === 'listening') {
    const q = quizQuestions[currentIdx] || INITIAL_QUESTIONS[0];
    const correctOption = q?.options?.find(o => o.id === q.correctId);
    const word = correctOption ? correctOption.text : '';
    const pos = correctOption ? correctOption.partOfSpeech : '';
    const definition = q?.definition || '';

    return (
      <div className="min-h-screen bg-[#0d0727] text-white flex flex-col font-sans relative overflow-hidden pb-12">
        {/* Soft floating sakura petals decorative ornaments */}
        <div className="absolute top-10 left-10 text-white/5 text-4xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '10s' }}>🌸</div>
        <div className="absolute bottom-20 right-10 text-white/5 text-5xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '8s' }}>🌸</div>

        <header className="flex flex-col sm:flex-row items-center justify-between p-6 border-b border-pink-500/10 gap-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setView('dashboard')}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
            <h1 className="text-xl font-bold text-pink-300 font-bubble">Magic Listening Practice</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#16103a] border border-pink-500/20 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => handleGenderChange('female')}
                className={`px-2.5 py-1 font-bold rounded-lg transition-all ${
                  voiceGender === 'female' ? 'bg-pink-500 text-white shadow-md' : 'text-pink-200/70 hover:text-white'
                }`}
                title="Use female voice"
              >
                ♀️ Female
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange('male')}
                className={`px-2.5 py-1 font-bold rounded-lg transition-all ${
                  voiceGender === 'male' ? 'bg-indigo-500 text-white shadow-md' : 'text-pink-200/70 hover:text-white'
                }`}
                title="Use male voice"
              >
                ♂️ Male
              </button>
            </div>
            <span className="text-pink-300 font-black px-3 py-1 bg-pink-500/10 rounded-full text-xs font-mono border border-pink-500/20">{currentIdx + 1} / {quizQuestions.length}</span>
            <button 
              onClick={handleShuffleQuiz}
              className="p-2.5 bg-pink-600/20 hover:bg-pink-600 text-pink-300 hover:text-white rounded-xl transition-all cursor-pointer"
              title="Shuffle questions"
            >
              <Shuffle className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full">
          
          <KokoMascot 
            expression={
              !showListeningFeedback ? 'smile' :
              isListeningCorrect ? 'happy' : 'sad'
            }
            text={
              !showListeningFeedback 
                ? "Koko just spoke an English word! What term did you hear? Type it into the box below! 🎧💖"
                : isListeningCorrect
                  ? "Kyaaa! Excellent listening skills! You typed it perfectly! ✨🏵️"
                  : "Oh... Close attempt! The correct word is '" + word + "'. Koko knows you will get it right next time! 💕"
            }
          />

          {/* Progress bar */}
          <div className="w-full max-w-2xl mb-8 flex gap-1 h-3">
            {quizQuestions.map((_, idx) => {
              const status = questionStatus[idx];
              let colorClasses = 'bg-white/5 border border-white/5';
              if (status === 'correct') {
                colorClasses = 'bg-emerald-400';
              } else if (status === 'incorrect') {
                colorClasses = 'bg-rose-500';
              } else if (idx === currentIdx) {
                colorClasses = 'bg-pink-400';
              }
              return (
                <div 
                  key={idx} 
                  className={`flex-1 rounded-full transition-colors ${colorClasses}`}
                />
              );
            })}
          </div>

          {/* Audio Practice Card */}
          <div className="w-full bg-[#1c143d] border-2 border-pink-500/30 rounded-3xl flex flex-col items-center p-6 md:p-10 shadow-2xl relative anime-shadow-pink">
            <span className="text-pink-300/65 text-xs font-bold uppercase tracking-widest mb-6 block text-center font-bubble">Press the audio orb to listen</span>
            
            {/* Animated Audio Pulsing Button */}
            <button 
              onClick={() => {
                speak(word);
                setTimeout(() => listeningInputRef.current?.focus(), 100);
              }}
              type="button"
              className="w-24 h-24 bg-pink-500/15 hover:bg-pink-500/30 active:scale-95 text-pink-400 hover:text-pink-300 rounded-full flex items-center justify-center transition-all border-4 border-pink-500/50 shadow-lg shadow-pink-500/20 mb-8 relative group cursor-pointer"
            >
              <div className="absolute inset-0 rounded-full bg-pink-500/10 animate-ping" style={{ animationDuration: '2s' }} />
              <Volume2 className="w-10 h-10 text-pink-300 relative z-10 group-hover:scale-110 transition-transform" />
            </button>

            <form onSubmit={handleSubmitListening} className="space-y-4 w-full">
              <div className="relative">
                <input 
                  ref={listeningInputRef}
                  type="text" 
                  value={listeningAnswer}
                  onChange={(e) => setListeningAnswer(e.target.value)}
                  placeholder="Type the English vocabulary word you heard..."
                  className={`w-full bg-[#0d0727] border-2 rounded-2xl px-6 py-4 text-lg font-extrabold text-center focus:outline-none focus:ring-4 focus:ring-pink-500/20 transition-all font-bubble ${
                    showListeningFeedback 
                      ? isListeningCorrect 
                        ? 'border-emerald-500 text-emerald-400' 
                        : 'border-rose-500 text-rose-400'
                      : 'border-pink-500/20 focus:border-pink-400 text-white'
                  }`}
                  disabled={showListeningFeedback}
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </div>

              <div className="flex gap-3 justify-center pt-2">
                {!showListeningFeedback ? (
                  <>
                    <button 
                      type="button"
                      onClick={() => {
                        setIsListeningCorrect(false);
                        setShowListeningFeedback(true);
                        setQuestionStatus(prev => {
                          const newStatus = [...prev];
                          newStatus[currentIdx] = 'incorrect';
                          return newStatus;
                        });
                        setWrongQuestions(prev => {
                          if (prev.find(item => item.id === q.id)) return prev;
                          return [...prev, q];
                        });
                        clearAutoNextTimer();
                        autoNextTimerRef.current = setTimeout(() => {
                          handleNextListening();
                        }, 1800);
                      }}
                      className="px-6 py-3 bg-[#1e1346] hover:bg-[#281d54] rounded-2xl font-black text-xs uppercase tracking-wider text-pink-300 border border-pink-500/30 transition-all cursor-pointer"
                    >
                      Skip 🌟
                    </button>
                    <button 
                      type="submit"
                      disabled={!listeningAnswer.trim()}
                      className="px-8 py-3 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:hover:bg-pink-600 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-white shadow-lg anime-shadow-pink cursor-pointer border-2 border-pink-400/50"
                    >
                      Check ☄️
                    </button>
                  </>
                ) : (
                  <button 
                    type="button"
                    onClick={handleNextListening}
                    className="px-10 py-3 bg-pink-600 hover:bg-pink-500 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-white shadow-lg anime-shadow-pink cursor-pointer border-2 border-pink-400/50"
                  >
                    {currentIdx < quizQuestions.length - 1 ? 'Next 🌸' : 'View Results ✨'}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Feedback area with pronunciation, spelling, and translation definition (nghĩa) */}
          <AnimatePresence>
            {showListeningFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className={`w-full mt-6 p-5 rounded-3xl border-2 ${
                  isListeningCorrect 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 anime-shadow-emerald' 
                    : 'bg-red-500/10 border-rose-500/30 text-rose-300 anime-shadow-pink'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="pt-1 shrink-0">
                    {isListeningCorrect ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-extrabold text-lg mb-1 font-bubble">
                      {isListeningCorrect ? 'Spot on! ✨' : 'Not quite right...'}
                    </p>
                    <p className="text-pink-100/80 text-sm leading-relaxed mb-2 font-mono">
                      Vocabulary:{' '}
                      <strong className="text-white text-lg font-bubble underline decoration-pink-500 decoration-2 underline-offset-2">
                        {word}
                      </strong>{' '}
                      {pos && <span className="text-pink-300/60 text-xs">({pos})</span>}
                    </p>
                    <div className="text-pink-300/40 text-xs border-t border-pink-500/10 pt-2 mt-2 font-bubble">
                      <span className="font-bold text-pink-300/60 uppercase block mb-1">Definition:</span>
                      <p className="text-pink-100 text-sm leading-relaxed">{definition}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => speak(word)}
                    type="button"
                    className="p-3 bg-[#1e1346] hover:bg-[#281d54] border border-pink-500/20 text-pink-300 hover:text-pink-200 rounded-full transition-all shrink-0 cursor-pointer"
                    title="Replay audio"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    );
  }

  if (view === 'summary') {
    return (
      <div className="min-h-screen bg-[#0d0727] text-white flex flex-col font-sans relative overflow-hidden p-6 pb-20">
        {/* Soft floating sakura petals decorative ornaments */}
        <div className="absolute top-10 left-10 text-white/5 text-4xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '10s' }}>🌸</div>
        <div className="absolute bottom-20 right-10 text-white/5 text-5xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '8s' }}>🌸</div>

        <div className="max-w-2xl mx-auto w-full mt-8 space-y-8 relative">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-pink-500/20 text-pink-400 mb-2 border-2 border-pink-400/30 anime-shadow-pink animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-pink-300 font-bubble">Lesson Completed!</h1>
            <p className="text-pink-200/75 text-sm md:text-base font-bubble">You have finished practicing this vocabulary set!</p>
          </div>

          <KokoMascot 
            expression={wrongQuestions.length === 0 ? "happy" : "smile"}
            text={
              wrongQuestions.length === 0
                ? "Sugoooi! Perfect score! Koko admires your incredible memory skills! 🏆💖✨ You are the best!"
                : "Excellent effort! You scored " + (quizQuestions.length - wrongQuestions.length) + "/" + quizQuestions.length + " correct words! Let's review the remaining ones together! 💕🌻"
            }
          />

          <div className="grid grid-cols-2 gap-4 font-bubble">
            <div className="bg-[#1c143d] p-6 rounded-3xl border-2 border-pink-500/20 text-center anime-shadow-emerald">
              <div className="text-4xl font-black text-emerald-400">{quizQuestions.length - wrongQuestions.length}</div>
              <div className="text-xs font-bold text-pink-300/60 uppercase mt-1">Mastered 🌸</div>
            </div>
            <div className="bg-[#1c143d] p-6 rounded-3xl border-2 border-pink-500/20 text-center anime-shadow-pink">
              <div className="text-4xl font-black text-rose-400">{wrongQuestions.length}</div>
              <div className="text-xs font-bold text-pink-300/60 uppercase mt-1">Need Review 😢</div>
            </div>
          </div>

          <div className="flex flex-col gap-3.5 pt-2">
            {wrongQuestions.length > 0 && (
              <button 
                onClick={handleReviewWrong}
                className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg anime-shadow-pink border-2 border-pink-400/50 cursor-pointer text-xs uppercase tracking-wider font-mono"
              >
                Review Incorrect Terms ({wrongQuestions.length}) 🌟
              </button>
            )}
            <button 
              onClick={handleRestart}
              className="w-full bg-[#1c143d] hover:bg-[#281d54] text-pink-300 font-black py-4 rounded-2xl transition-all border-2 border-pink-500/30 cursor-pointer text-xs uppercase tracking-wider font-mono hover:text-white"
            >
              Restart Practice 🔄
            </button>
          </div>

          {wrongQuestions.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-pink-300 font-bubble">Error Review Notebook 📓:</h2>
              <div className="space-y-3">
                {wrongQuestions.map((q) => {
                  const correctOption = q.options.find(o => o.id === q.correctId);
                  return (
                    <div key={q.id} className="bg-[#1c143d] p-5 rounded-2xl border-2 border-pink-500/10 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="font-bold text-lg text-pink-100 font-bubble">
                          {correctOption?.text}{' '}
                          {correctOption?.partOfSpeech && (
                            <span className="text-pink-300/60 text-xs bg-pink-500/10 px-2.5 py-0.5 rounded-full border border-pink-500/20">
                              {correctOption?.partOfSpeech}
                            </span>
                          )}
                        </div>
                        <div className="text-pink-200/70 text-sm font-bubble">{q.definition}</div>
                      </div>
                      <button 
                        onClick={() => speak(correctOption?.text || '')} 
                        className="p-3 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 text-pink-300 rounded-full transition-all cursor-pointer"
                        title="Listen to pronunciation"
                      >
                        <Volume2 className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-6 border-t border-pink-500/10 font-bubble">
            <button 
              onClick={() => setView('editor')}
              className="w-full text-pink-400 font-extrabold py-2 hover:text-pink-300 transition-colors text-center text-sm cursor-pointer"
            >
              Edit Vocabulary Set ⚙️
            </button>
            <button 
              onClick={() => setView('dashboard')}
              className="w-full text-pink-300/40 font-extrabold py-2 hover:text-pink-300/70 transition-colors text-center text-sm cursor-pointer"
            >
              Back to Library 🌸
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'editor') {
    return (
      <div className="min-h-screen bg-[#0d0727] text-white flex flex-col font-sans relative overflow-hidden pb-12">
        {/* Soft floating sakura petals decorative ornaments */}
        <div className="absolute top-10 left-10 text-white/5 text-4xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '10s' }}>🌸</div>
        <div className="absolute bottom-20 right-10 text-white/5 text-5xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '8s' }}>🌸</div>

        <input 
          type="file" 
          id="file-import" 
          className="hidden" 
          accept=".txt,.csv,.xlsx,.xls" 
          onChange={handleFileUpload}
        />
        
        {/* Editor Top Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between p-6 border-b border-pink-500/10 gap-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setView('dashboard')}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
            <h1 className="text-xl font-bold text-pink-300 font-bubble">Vocabulary Editor</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button 
              onClick={handleSaveEditor}
              className="px-6 py-2.5 bg-pink-600 hover:bg-pink-500 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-white shadow-lg anime-shadow-pink cursor-pointer border-2 border-pink-400/50"
            >
              Save Set ✨
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 pb-20 pt-6">
          <div className="max-w-4xl mx-auto w-full space-y-8">
            
            {/* Mascot advice */}
            <KokoMascot 
              expression="smile"
              text="Here you can edit the set title, check spelling errors with AI, and freely customize vocabulary cards! 🌸✏️"
            />

            {/* Spell Check Notification Banner */}
            <AnimatePresence>
              {spellCheckNotice && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`p-4 rounded-3xl border-2 flex items-center justify-between gap-3 font-bubble ${
                    spellCheckNotice.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                      : spellCheckNotice.type === 'warning'
                      ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                      : spellCheckNotice.type === 'error'
                      ? 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                      : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {spellCheckNotice.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                    {spellCheckNotice.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
                    {spellCheckNotice.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
                    {spellCheckNotice.type === 'info' && <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />}
                    <span className="text-xs sm:text-sm font-bold leading-relaxed">{spellCheckNotice.message}</span>
                  </div>
                  <button 
                    onClick={() => setSpellCheckNotice(null)}
                    className="p-1 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Metadata Section */}
            <div className="bg-[#1c143d] border-2 border-pink-500/20 p-6 rounded-3xl space-y-6">
              <div className="space-y-4">
                <div className="group">
                  <label className="block text-[10px] font-black text-pink-300 uppercase tracking-widest mb-1.5 ml-1 font-bubble">Set Title 🌸</label>
                  <input 
                    type="text" 
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-[#0d0727] border-2 border-pink-500/20 p-4 text-lg font-extrabold focus:border-pink-500 focus:outline-none transition-all rounded-2xl text-pink-100 font-bubble"
                    placeholder="Set title..."
                  />
                </div>
              </div>
            </div>

            {/* Toolbar & Spellcheck Actions */}
            <div className="flex flex-col gap-4 py-5 bg-[#1c143d] p-5 rounded-3xl border-2 border-pink-500/20">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 font-bubble">
                <div className="flex flex-wrap items-center gap-3">
                  <label 
                    htmlFor="file-import"
                    className="flex items-center gap-2 bg-pink-600 hover:bg-pink-500 text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all shadow-lg anime-shadow-pink border-2 border-pink-400/50 hover:-translate-y-0.5"
                  >
                    <Plus className="w-4 h-4" /> Import Excel / CSV
                  </label>
                  
                  {/* AI Spellcheck Button */}
                  <button 
                    onClick={handleRunAISpellCheck}
                    disabled={isSpellChecking}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all shadow-lg shadow-purple-500/20 border-2 border-purple-400/50 hover:-translate-y-0.5 disabled:opacity-50"
                    title="Kiểm tra toàn diện lỗi chính tả, từ loại và ngữ nghĩa"
                  >
                    {isSpellChecking ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-pink-200" />
                        Đang quét chính tả... 🔮
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        Kiểm tra chính tả AI ✨
                      </>
                    )}
                  </button>

                  {/* Auto-fix all button if issues found */}
                  {Array.from(spellCheckResults.values()).some((r: SpellCheckResult) => r.hasIssue && (r.suggestedTerm || r.suggestedDefinition)) && (
                    <button 
                      onClick={handleApplyAllCorrections}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all shadow-lg shadow-emerald-500/20 border-2 border-emerald-400/50 hover:-translate-y-0.5"
                      title="Áp dụng tất cả các từ và định nghĩa được gợi ý sửa lỗi"
                    >
                      <Wand2 className="w-4 h-4" />
                      Tự động sửa tất cả ⚡
                    </button>
                  )}

                  <button 
                    onClick={handleSwapColumns}
                    className="flex items-center gap-2 bg-[#1e1346] hover:bg-[#281d54] text-pink-300 border border-pink-500/20 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all hover:text-white"
                    title="Swap Term and Definition columns for all cards"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-pink-400" /> Swap 🔄
                  </button>
                </div>

                <div className="flex items-center gap-3 self-end lg:self-center">
                  {/* Auto-check switch */}
                  <button
                    onClick={() => setAutoCheckEnabled(!autoCheckEnabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                      autoCheckEnabled 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                        : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                    title="Bật/Tắt tự động kiểm tra chính tả tức thì khi gõ"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Tự động kiểm tra: {autoCheckEnabled ? 'BẬT' : 'TẮT'}</span>
                  </button>

                  <div className="text-pink-300/60 text-xs font-bold font-bubble">
                    Total: <span className="text-pink-300 font-black">{editTerms.length} cards</span>
                  </div>
                </div>
              </div>

              {/* Status helper summary */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-pink-200/60 bg-[#0d0727] p-3 rounded-2xl border border-pink-500/10 font-bubble">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>
                    Chức năng kiểm tra chính tả giúp phát hiện lỗi gõ sai từ tiếng Anh (e.g. <em>eleganse</em> ➔ <em>elegance</em>), chuẩn hóa từ loại <em>(n, v, adj, adv)</em> và rà soát ngữ nghĩa.
                  </span>
                </div>
                {Array.from(spellCheckResults.values()).some((r: SpellCheckResult) => r.hasIssue) && (
                  <span className="text-amber-300 font-extrabold bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-lg shrink-0">
                    ⚠️ {Array.from(spellCheckResults.values()).filter((r: SpellCheckResult) => r.hasIssue).length} thẻ cần xem lại
                  </span>
                )}
              </div>
            </div>

            {/* Term List */}
            <div className="space-y-6">
              {editTerms.map((term, index) => {
                const checkRes = spellCheckResults.get(term.id);
                const hasCardIssue = checkRes && checkRes.hasIssue;

                return (
                  <div 
                    key={term.id} 
                    className={`bg-[#1c143d] rounded-3xl p-6 border-2 transition-all relative ${
                      hasCardIssue
                        ? checkRes.issueType === 'spelling'
                          ? 'border-rose-500/40 shadow-lg shadow-rose-950/30'
                          : checkRes.issueType === 'duplicate'
                          ? 'border-amber-500/40'
                          : 'border-purple-500/40'
                        : 'border-pink-500/10 group hover:border-pink-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-pink-400/50 font-bubble bg-[#0d0727] px-3.5 py-1 rounded-full border border-pink-500/10">Card #{index + 1}</span>
                        {hasCardIssue && (
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            checkRes.issueType === 'spelling'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              : checkRes.issueType === 'duplicate'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          }`}>
                            {checkRes.issueType === 'spelling' && '⚠️ Sai chính tả'}
                            {checkRes.issueType === 'duplicate' && '⚠️ Trùng lặp'}
                            {checkRes.issueType === 'pos' && 'ℹ️ Từ loại'}
                            {checkRes.issueType === 'empty' && '⚠️ Trống dữ liệu'}
                            {checkRes.issueType === 'definition' && '💡 Ngữ nghĩa'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => speak(term.term)}
                          className="p-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 hover:text-pink-100 rounded-full transition-colors cursor-pointer"
                          title="Listen to pronunciation"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => removeTermRow(term.id)}
                          className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-full transition-colors cursor-pointer"
                          title="Delete card"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-1.5 focus-within:z-10">
                        <label className="text-[10px] font-bold text-pink-300/50 uppercase tracking-widest font-bubble">English Term (Part of Speech)</label>
                        <input 
                          type="text" 
                          value={term.term}
                          onChange={(e) => updateTerm(term.id, 'term', e.target.value)}
                          className={`w-full bg-[#0d0727] border-2 rounded-2xl p-3 focus:outline-none transition-colors text-base font-bold text-white font-bubble ${
                            hasCardIssue && checkRes.issueType === 'spelling'
                              ? 'border-rose-500/40 focus:border-rose-500'
                              : 'border-pink-500/10 focus:border-pink-500/50'
                          }`}
                          placeholder="e.g. Elegance (n) or Prevent (v)..."
                        />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-bold text-pink-300/50 uppercase tracking-widest font-bubble">Definition / Meaning</label>
                        <input 
                          type="text" 
                          value={term.definition}
                          onChange={(e) => updateTerm(term.id, 'definition', e.target.value)}
                          className={`w-full bg-[#0d0727] border-2 rounded-2xl p-3 focus:outline-none transition-colors text-base font-bold text-white font-bubble ${
                            hasCardIssue && checkRes.issueType === 'empty' && !term.definition.trim()
                              ? 'border-amber-500/40 focus:border-amber-500'
                              : 'border-pink-500/10 focus:border-pink-500/50'
                          }`}
                          placeholder="e.g. The quality of being graceful..."
                        />
                      </div>
                    </div>

                    {/* Inline Correction / Suggestion Box */}
                    {hasCardIssue && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-4 pt-4 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0d0727]/60 p-3.5 rounded-2xl"
                      >
                        <div className="space-y-1 text-xs font-bubble">
                          <div className="flex items-center gap-1.5 text-pink-200 font-bold">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{checkRes.explanation || 'Phát hiện có thể có lỗi chính tả hoặc từ loại'}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {checkRes.suggestedTerm && (
                            <button
                              onClick={() => handleApplyCorrection(term.id, checkRes.suggestedTerm, undefined)}
                              className="flex items-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer hover:scale-[1.02]"
                              title={`Sửa thành: ${checkRes.suggestedTerm}`}
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Sửa: <strong>{checkRes.suggestedTerm}</strong></span>
                            </button>
                          )}

                          {checkRes.suggestedDefinition && checkRes.suggestedDefinition !== term.definition && (
                            <button
                              onClick={() => handleApplyCorrection(term.id, undefined, checkRes.suggestedDefinition)}
                              className="flex items-center gap-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer hover:scale-[1.02]"
                              title={`Áp dụng định nghĩa gợi ý: ${checkRes.suggestedDefinition}`}
                            >
                              <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                              <span>Sửa nghĩa: <strong>{checkRes.suggestedDefinition}</strong></span>
                            </button>
                          )}

                          <button
                            onClick={() => handleDismissCorrection(term.id)}
                            className="text-xs text-white/40 hover:text-white px-2 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Bỏ qua
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>

            <button 
              onClick={addTermRow}
              className="w-full bg-[#1c143d] border-2 border-dashed border-pink-500/30 py-6 rounded-3xl text-sm font-black text-pink-300 hover:text-pink-100 hover:bg-pink-500/5 transition-all group cursor-pointer uppercase tracking-wider font-bubble"
            >
              + ADD NEW CARD 🌸
            </button>
          </div>
        </main>

        {/* Pre-Save Spelling Warning Modal */}
        <AnimatePresence>
          {showPreSaveModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#1c143d] border-2 border-pink-500/30 p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-5 font-bubble"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-pink-100">Kiểm tra chính tả</h3>
                    <p className="text-xs text-pink-200/60">Phát hiện một số từ có thể bị gõ sai</p>
                  </div>
                </div>

                <p className="text-sm text-pink-100 leading-relaxed bg-[#0d0727] p-4 rounded-2xl border border-pink-500/10">
                  Học phần của Senpai có một số từ vựng chưa được sửa chính tả. Senpai có muốn tự động sửa các từ này theo gợi ý chuẩn của từ điển trước khi lưu không? 🌸
                </p>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => {
                      handleApplyAllCorrections();
                      handleSaveEditor(true);
                    }}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3 rounded-2xl transition-all shadow-lg text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/40"
                  >
                    <Wand2 className="w-4 h-4" />
                    Tự động sửa tất cả & Lưu ✨
                  </button>

                  <button
                    onClick={() => setShowPreSaveModal(false)}
                    className="w-full bg-[#281d54] hover:bg-[#34266c] text-pink-200 font-bold py-2.5 rounded-2xl transition-all text-xs uppercase tracking-wider cursor-pointer border border-pink-500/20"
                  >
                    Xem lại & Tự chỉnh sửa
                  </button>

                  <button
                    onClick={() => handleSaveEditor(true)}
                    className="w-full text-white/40 hover:text-white font-semibold py-2 transition-colors text-xs text-center cursor-pointer"
                  >
                    Vẫn tiếp tục lưu không sửa
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0727] text-white flex flex-col font-sans relative overflow-hidden pb-12">
      {/* Sparkles backdrop decoration */}
      <div className="absolute top-12 left-12 text-white/5 text-4xl select-none pointer-events-none animate-bounce" style={{ animationDuration: '8s' }}>🌸</div>
      <div className="absolute bottom-20 right-12 text-white/5 text-5xl select-none pointer-events-none animate-pulse" style={{ animationDuration: '10s' }}>🌸</div>

      {/* Header */}
      <header className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-b border-pink-500/10 gap-3">
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setView('dashboard')}
        >
          <div className="w-9 h-9 rounded-xl bg-pink-500/25 border border-pink-300 flex items-center justify-center">
            <span className="text-sm">🌸</span>
          </div>
          <span className="font-bold text-pink-300 tracking-wide font-bubble">Your Library</span>
          <ChevronDown className="w-4 h-4 text-pink-300/60 rotate-90" />
          <span className="text-xs bg-pink-600/30 text-pink-200 font-extrabold px-2.5 py-1 rounded-full border border-pink-500/20">Quiz Mode</span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button 
            onClick={() => {
              if (window.confirm('Are you sure you want to start over? All current progress for this set will be reset.')) {
                handleRestart();
              }
            }}
            className="p-2.5 bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white rounded-xl transition-all border border-purple-500/30"
            title="Start over"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button 
            onClick={handleShuffleQuiz}
            className="p-2.5 bg-pink-600/20 hover:bg-pink-600 text-pink-300 hover:text-white rounded-xl transition-all border border-pink-500/30"
            title="Shuffle questions"
          >
            <Shuffle className="w-5 h-5" />
          </button>
          <button 
            onClick={openEditor}
            className="flex items-center gap-1.5 bg-[#1f1642] hover:bg-[#281d54] text-pink-200 border-2 border-pink-400/25 px-4 py-2 rounded-xl text-xs font-black transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Vocabulary 🌟
          </button>
          <button 
            onClick={() => setView('dashboard')}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 opacity-70" />
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="px-6 mt-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <span className="text-pink-300 font-black bg-pink-500/20 w-8 h-8 flex items-center justify-center rounded-xl text-xs border border-pink-400/30">
            {currentIdx + 1}
          </span>
          <div className="flex-1 flex gap-1 h-3">
            {quizQuestions.map((_, i) => {
              const status = questionStatus[i];
              let innerColor = 'bg-transparent';
              
              if (status === 'correct') {
                innerColor = 'bg-emerald-400';
              } else if (status === 'incorrect') {
                innerColor = 'bg-rose-500';
              } else if (i === currentIdx) {
                innerColor = 'bg-pink-400';
              }

              return (
                <div key={i} className="flex-1 rounded-full overflow-hidden bg-white/5 border border-white/5">
                  <div 
                    className={`h-full transition-all duration-300 ${innerColor}`}
                    style={{ width: (status !== 'unanswered' || i === currentIdx) ? '100%' : '0%' }}
                  />
                </div>
              );
            })}
          </div>
          <span className="text-white/40 font-black bg-white/5 w-8 h-8 flex items-center justify-center rounded-xl text-xs border border-white/5">
            {quizQuestions.length}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-6 mt-8 max-w-2xl mx-auto w-full">
        
        {/* Interactive Anime Study Companion */}
        <KokoMascot 
          expression={
            !showFeedback ? 'smile' :
            isCorrect ? 'happy' : 'sad'
          }
          text={
            !showFeedback 
              ? "Find the matching English term for the definition below! Koko knows you can do it! ⭐🌸"
              : isCorrect
                ? "Kyaaa! Brilliant work! ✨ Correct! Koko is super proud of you! 🎉💖"
                : "Oh... Don't worry! Review the correct answer below and try again next time! 💕"
          }
        />

        <div className="space-y-2 bg-[#1e1445]/50 border-2 border-dashed border-pink-500/20 p-6 rounded-3xl mb-8 relative">
          <div className="absolute top-2.5 right-3 text-xs bg-pink-500/20 text-pink-300 font-extrabold px-2.5 py-0.5 rounded-full border border-pink-500/25 uppercase font-mono tracking-wider">
            Magic Definition 🔮
          </div>
          <span className="text-pink-300/50 text-xs font-bold uppercase tracking-wider block">Definition</span>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white font-bubble">
            {currentQuestion.definition}
          </h1>
        </div>

        <div className="space-y-4">
          <p className="text-pink-300/60 text-xs font-black uppercase tracking-widest pl-1">Select the correct answer:</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedId === option.id;
              const isCorrectOption = option.id === currentQuestion.correctId;
              
              let borderColor = "border-pink-500/20";
              let bgColor = "bg-[#1c143d]";
              let animeShadow = "anime-shadow-pink";
              
              if (showFeedback) {
                if (isCorrectOption) {
                  borderColor = "border-emerald-500";
                  bgColor = "bg-emerald-500/10";
                  animeShadow = "anime-shadow-emerald";
                } else if (isSelected && !isCorrectOption) {
                  borderColor = "border-rose-500";
                  bgColor = "bg-rose-500/10";
                  animeShadow = "anime-shadow-pink";
                }
              } else if (isSelected) {
                borderColor = "border-purple-400";
                bgColor = "bg-purple-900/10";
                animeShadow = "anime-shadow-purple";
              }

              return (
                <motion.button
                  key={option.id}
                  whileHover={!showFeedback ? { scale: 1.02 } : {}}
                  whileTap={!showFeedback ? { scale: 0.98 } : {}}
                  onClick={() => handleSelect(option.id)}
                  className={`relative flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-200 ${borderColor} ${bgColor} ${animeShadow} group cursor-pointer`}
                >
                  <span className={`flex items-center justify-center w-8 h-8 rounded-xl border-2 text-xs font-black transition-colors ${
                    isSelected 
                      ? 'bg-purple-500 border-purple-400 text-white shadow' 
                      : 'border-pink-500/20 text-pink-300/50 group-hover:border-pink-500/50'
                  }`}>
                    {option.id}
                  </span>
                  <span className="text-lg font-extrabold text-white font-bubble">
                    {option.text}
                    <span className="text-pink-300/40 text-xs ml-1.5 font-normal">({option.partOfSpeech})</span>
                  </span>

                  {showFeedback && isCorrectOption && (
                    <CheckCircle2 className="absolute right-4 w-6 h-6 text-emerald-400 shrink-0" />
                  )}
                  {showFeedback && isSelected && !isCorrectOption && (
                    <XCircle className="absolute right-4 w-6 h-6 text-rose-500 shrink-0" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Action Footer */}
        <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4">
          <button 
            onClick={() => {
              const correctOption = currentQuestion.options.find(o => o.id === currentQuestion.correctId);
              if (correctOption) speak(correctOption.text);
            }}
            type="button"
            className="p-3 bg-pink-500/10 hover:bg-pink-500/20 active:scale-90 rounded-full transition-colors group cursor-pointer border border-pink-500/25"
            title="Pronounce word"
          >
            <Volume2 className="w-5 h-5 text-pink-300 group-hover:text-pink-200 transition-colors" />
          </button>
          
          <button 
            className="text-pink-400 font-extrabold hover:text-pink-300 transition-colors text-xs uppercase tracking-wider border-b-2 border-dashed border-pink-400 hover:border-pink-300"
            onClick={() => {
              if (showFeedback && !isCorrect) {
                handleNext();
              } else if (!showFeedback) {
                // Skips to next or resolves incorrect
                handleSelect(0); // Trigger incorrect skip
              }
            }}
          >
            {showFeedback && !isCorrect ? "Continue lesson 🌸" : "Skip this word ⭐"}
          </button>
        </div>

        {/* Feedback bottom trigger */}
        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`mt-8 p-5 rounded-3xl border-2 flex items-center justify-between shadow-lg ${
                isCorrect 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 anime-shadow-emerald' 
                  : 'bg-red-500/10 border-red-500/30 text-red-300 anime-shadow-pink'
              }`}
            >
              <div className="flex items-center gap-3">
                {isCorrect ? (
                  <CheckCircle2 className="text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="text-rose-400 shrink-0" />
                )}
                <span className="font-extrabold text-xs md:text-sm font-bubble">
                  {isCorrect ? 'Awesome! Moving to the next question...' : 'Unfortunate! Check carefully and try again!'}
                </span>
              </div>
              {!isCorrect && (
                <button 
                  onClick={handleNext}
                  className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all border border-white/10 cursor-pointer"
                >
                  Next Question 🌸
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
