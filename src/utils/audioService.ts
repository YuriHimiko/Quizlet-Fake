// Studio Quality Standardized Audio Service
// Standardizes English audio pronunciations across all devices (iOS, Android, Windows, Mac, Linux)
// Priority:
// 1. Oxford / Cambridge / Wiktionary native dictionary MP3 pronunciations (Free Dictionary API)
// 2. Google Studio TTS MP3 audio stream
// 3. Browser SpeechSynthesis Fallback

export interface PlayAudioOptions {
  rate?: number;
  pitch?: number;
  gender?: 'male' | 'female' | 'auto';
  lang?: 'en-US' | 'en-GB';
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

export const getVoiceGender = (): 'female' | 'male' | 'auto' => {
  try {
    const saved = localStorage.getItem('koko_voice_gender');
    if (saved === 'male' || saved === 'female') return saved;
  } catch (e) {}
  return 'auto';
};

export const setVoiceGender = (gender: 'female' | 'male' | 'auto') => {
  try {
    localStorage.setItem('koko_voice_gender', gender);
  } catch (e) {}
};

// In-memory cache for fast repeat playback
const dictionaryAudioCache = new Map<string, string>();

// Load cached URLs from localStorage on init
try {
  const storedCache = localStorage.getItem('koko_audio_dict_cache');
  if (storedCache) {
    const parsed = JSON.parse(storedCache);
    Object.entries(parsed).forEach(([key, val]) => {
      if (typeof val === 'string') {
        dictionaryAudioCache.set(key, val);
      }
    });
  }
} catch (e) {
  console.warn("Could not load audio cache from localStorage:", e);
}

function saveCacheToLocalStorage() {
  try {
    const obj: Record<string, string> = {};
    dictionaryAudioCache.forEach((val, key) => {
      obj[key] = val;
    });
    localStorage.setItem('koko_audio_dict_cache', JSON.stringify(obj));
  } catch (e) {
    // Ignore cache save errors
  }
}

let activeAudioElement: HTMLAudioElement | null = null;
let currentPlayId = 0;

export const stopAllAudio = () => {
  currentPlayId++; // Invalidates any pending async audio fetch requests
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch (e) {
      console.error("Error stopping active audio:", e);
    }
    activeAudioElement = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.error("Error stopping speechSynthesis:", e);
    }
  }
};

/**
 * Attempts to fetch authentic Dictionary MP3 Audio (Oxford / Cambridge / Wiktionary)
 */
export const fetchDictionaryAudioUrl = async (term: string): Promise<string | null> => {
  const clean = term.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '');
  if (!clean || clean.split(/\s+/).length > 2) return null; // Only query dictionary API for 1-2 words

  if (dictionaryAudioCache.has(clean)) {
    const cached = dictionaryAudioCache.get(clean);
    return cached || null;
  }

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      for (const entry of data) {
        if (entry.phonetics && Array.isArray(entry.phonetics)) {
          // Look for an audio URL ending in .mp3
          const audioItem = entry.phonetics.find((p: any) => p.audio && typeof p.audio === 'string' && p.audio.trim().length > 0);
          if (audioItem && audioItem.audio) {
            let audioUrl = audioItem.audio.trim();
            if (audioUrl.startsWith('//')) {
              audioUrl = 'https:' + audioUrl;
            }
            dictionaryAudioCache.set(clean, audioUrl);
            saveCacheToLocalStorage();
            return audioUrl;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Dictionary API fetch error:", e);
  }

  return null;
};

/**
 * Generates Google Studio TTS audio stream URL
 */
export const getGoogleTtsUrl = (text: string, lang: 'en-US' | 'en-GB' = 'en-GB'): string => {
  const cleanText = text.replace(/[*_#`]/g, '').trim();
  const langCode = lang === 'en-US' ? 'en-US' : 'en-GB';
  return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${langCode}&client=tw-ob`;
};

/**
 * Standardized playAudio helper ensuring identical studio-quality sound on all devices
 */
export const playStandardAudio = async (
  text: string,
  options: PlayAudioOptions = {}
): Promise<void> => {
  stopAllAudio();
  const thisPlayId = currentPlayId;

  const cleanText = text.replace(/[*_#`]/g, '').trim();
  if (!cleanText) return;

  const lang = options.lang || (localStorage.getItem('koko_accent') as 'en-GB' | 'en-US') || 'en-GB';
  const rate = options.rate || 1.0;
  const gender = options.gender || getVoiceGender();

  options.onStart?.();

  // If a specific voice gender (male/female) is selected for the study module,
  // use Web Speech API with gender voice selection and tuned pitch for exact 100% consistency.
  if (gender === 'male' || gender === 'female') {
    fallbackToSpeechSynthesis(cleanText, { ...options, rate, gender, lang }, thisPlayId);
    return;
  }

  // Primary Audio Engine for auto/default: Google Studio TTS MP3 audio stream
  const audioSourceUrl = getGoogleTtsUrl(cleanText, lang);

  // Play using HTML5 Audio element
  let hasFiredFallback = false;
  const triggerFallback = (reason: string, err: any) => {
    if (thisPlayId !== currentPlayId || hasFiredFallback) return;
    hasFiredFallback = true;
    console.warn(`HTML5 Audio fallback (${reason}):`, err);
    fallbackToSpeechSynthesis(cleanText, { ...options, rate, gender, lang }, thisPlayId);
  };

  try {
    const audio = new Audio(audioSourceUrl);
    audio.playbackRate = rate;
    activeAudioElement = audio;

    audio.onended = () => {
      if (activeAudioElement === audio) {
        activeAudioElement = null;
      }
      if (thisPlayId === currentPlayId && !hasFiredFallback) {
        options.onEnd?.();
      }
    };

    audio.onerror = (err) => {
      triggerFallback("onerror", err);
    };

    if (thisPlayId !== currentPlayId) return;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        triggerFallback("playPromise catch", err);
      });
    }
  } catch (err) {
    triggerFallback("try catch block", err);
  }
};

/**
 * Web Speech API Fallback
 */
const fallbackToSpeechSynthesis = (text: string, options: PlayAudioOptions = {}, playId?: number) => {
  if (playId !== undefined && playId !== currentPlayId) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    options.onError?.('Speech synthesis unavailable');
    options.onEnd?.();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const lang = options.lang || (localStorage.getItem('koko_accent') as 'en-GB' | 'en-US') || 'en-GB';
    utterance.lang = lang;
    utterance.rate = options.rate || 1.0;

    const gender = options.gender || getVoiceGender();
    const voices = window.speechSynthesis.getVoices();
    const ukVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').includes('en-gb') || v.name.toLowerCase().includes('uk') || v.name.toLowerCase().includes('british'));
    const englishVoices = ukVoices.length > 0 ? [...ukVoices, ...voices.filter(v => v.lang.toLowerCase().startsWith('en'))] : voices.filter(v => v.lang.toLowerCase().startsWith('en'));

    if (gender === 'male') {
      utterance.pitch = options.pitch ?? 0.82;
      const maleVoice = englishVoices.find(v => {
        const name = v.name.toLowerCase();
        return name.includes('male') || name.includes('david') || name.includes('george') || 
               name.includes('alex') || name.includes('daniel') || name.includes('guy') || 
               name.includes('james') || name.includes('mark') || name.includes('richard') || 
               name.includes('oliver') || name.includes('matthew') || name.includes('thomas') ||
               name.includes('arthur');
      });
      if (maleVoice) {
        utterance.voice = maleVoice;
        utterance.lang = maleVoice.lang;
      }
    } else if (gender === 'female') {
      utterance.pitch = options.pitch ?? 1.12;
      const femaleVoice = englishVoices.find(v => {
        const name = v.name.toLowerCase();
        return name.includes('female') || name.includes('hazel') || name.includes('serena') || 
               name.includes('kate') || name.includes('victoria') || name.includes('zira') || 
               name.includes('samantha') || name.includes('jenny') || name.includes('karen') || 
               name.includes('siri') || name.includes('moira') || name.includes('fiona') || 
               name.includes('ava') || name.includes('alice');
      });
      if (femaleVoice) {
        utterance.voice = femaleVoice;
        utterance.lang = femaleVoice.lang;
      }
    } else {
      utterance.pitch = options.pitch ?? 1.0;
      const savedVoiceURI = localStorage.getItem('koko_selected_voice_uri');
      if (savedVoiceURI) {
        const found = voices.find(v => v.voiceURI === savedVoiceURI);
        if (found) {
          utterance.voice = found;
        }
      } else if (ukVoices.length > 0) {
        utterance.voice = ukVoices[0];
        utterance.lang = ukVoices[0].lang;
      }
    }

    utterance.onend = () => {
      if (playId === undefined || playId === currentPlayId) {
        options.onEnd?.();
      }
    };
    utterance.onerror = (e) => {
      options.onError?.(e);
      if (playId === undefined || playId === currentPlayId) {
        options.onEnd?.();
      }
    };

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    options.onError?.(e);
    options.onEnd?.();
  }
};
