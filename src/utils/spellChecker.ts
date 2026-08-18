/**
 * Spell Checker & Vocabulary Quality Validator
 * Provides real-time heuristic validation and AI-powered bilingual spellchecking.
 */

export interface SpellCheckResult {
  id: string | number;
  hasIssue: boolean;
  issueType: 'spelling' | 'pos' | 'definition' | 'duplicate' | 'empty' | 'none';
  suggestedTerm?: string;
  suggestedDefinition?: string;
  explanation?: string;
  severity?: 'error' | 'warning' | 'info';
}

// Common ESL English typos dictionary for instant offline checking
const COMMON_TYPOS: Record<string, string> = {
  'eleganse': 'elegance',
  'elegent': 'elegant',
  'preffer': 'prefer',
  'preffered': 'preferred',
  'definately': 'definitely',
  'definate': 'definite',
  'recieve': 'receive',
  'recieved': 'received',
  'beleive': 'believe',
  'occured': 'occurred',
  'occurrance': 'occurrence',
  'accomodate': 'accommodate',
  'seperate': 'separate',
  'untill': 'until',
  'truely': 'truly',
  'goverment': 'government',
  'enviroment': 'environment',
  'sucessful': 'successful',
  'sucess': 'success',
  'neccessary': 'necessary',
  'necesary': 'necessary',
  'embarass': 'embarrass',
  'pronounciation': 'pronunciation',
  'calender': 'calendar',
  'accross': 'across',
  'adress': 'address',
  'adviseable': 'advisable',
  'agressive': 'aggressive',
  'alot': 'a lot',
  'alright': 'all right',
  'apparant': 'apparent',
  'appearence': 'appearance',
  'arguement': 'argument',
  'assasination': 'assassination',
  'basicly': 'basically',
  'begining': 'beginning',
  'bussiness': 'business',
  'collegue': 'colleague',
  'concious': 'conscious',
  'curiousity': 'curiosity',
  'decission': 'decision',
  'disapear': 'disappear',
  'dissappoint': 'disappoint',
  'embarassed': 'embarrassed',
  'existance': 'existence',
  'familar': 'familiar',
  'finaly': 'finally',
  'foriegn': 'foreign',
  'fourty': 'forty',
  'freind': 'friend',
  'garantee': 'guarantee',
  'gaurantee': 'guarantee',
  'grammer': 'grammar',
  'greatful': 'grateful',
  'happend': 'happened',
  'harrasment': 'harassment',
  'heigth': 'height',
  'independant': 'independent',
  'interupt': 'interrupt',
  'knowlege': 'knowledge',
  'liason': 'liaison',
  'libary': 'library',
  'maintenence': 'maintenance',
  'millenium': 'millennium',
  'mispell': 'misspell',
  'noticable': 'noticeable',
  'occassion': 'occasion',
  'paralell': 'parallel',
  'persistant': 'persistent',
  'posession': 'possession',
  'prefered': 'preferred',
  'priviledge': 'privilege',
  'publically': 'publicly',
  'realy': 'really',
  'reccomend': 'recommend',
  'religous': 'religious',
  'rember': 'remember',
  'resistence': 'resistance',
  'rhytm': 'rhythm',
  'rythm': 'rhythm',
  'sieze': 'seize',
  'supercede': 'supersede',
  'suprize': 'surprise',
  'tendancy': 'tendency',
  'tommorrow': 'tomorrow',
  'tomorow': 'tomorrow',
  'tounge': 'tongue',
  'unforseen': 'unforeseen',
  'unfortunatly': 'unfortunately',
  'usefull': 'useful',
  'vaccum': 'vacuum',
  'vehical': 'vehicle',
  'writting': 'writing',
  'yeild': 'yield'
};

// Map full POS names to standardized abbreviations
const POS_NORMALIZER: Record<string, string> = {
  'noun': 'n',
  'n.': 'n',
  'danh từ': 'n',
  'verb': 'v',
  'v.': 'v',
  'động từ': 'v',
  'adjective': 'adj',
  'adj.': 'adj',
  'tính từ': 'adj',
  'adverb': 'adv',
  'adv.': 'adv',
  'phó từ': 'adv',
  'trạng từ': 'adv',
  'preposition': 'prep',
  'prep.': 'prep',
  'giới từ': 'prep',
  'conjunction': 'conj',
  'conj.': 'conj',
  'liên từ': 'conj',
  'pronoun': 'pron',
  'pron.': 'pron',
  'đại từ': 'pron',
  'phrase': 'phrase',
  'cụm từ': 'phrase',
  'idiom': 'idiom',
  'phrasal verb': 'phr v',
  'phr. v.': 'phr v',
  'phrv': 'phr v'
};

/**
 * Standardize and sanitize a term string
 */
export function sanitizeTermString(input: string): { word: string; pos: string } {
  let text = input.trim();
  let pos = '';

  // Check pattern: "word (pos)" or "word [pos]" or "word"
  const parenMatch = text.match(/^(.*?)\s*[\(\[](.*?)[\)\]]$/);
  if (parenMatch) {
    text = parenMatch[1].trim();
    pos = parenMatch[2].trim().toLowerCase();
    if (POS_NORMALIZER[pos]) {
      pos = POS_NORMALIZER[pos];
    }
  }

  return { word: text, pos };
}

/**
 * Fast client-side check for a single vocabulary card
 */
export function checkSingleTermLocal(
  id: string | number,
  termStr: string,
  definitionStr: string,
  allTerms?: Array<{ id: string | number; term: string; definition: string }>
): SpellCheckResult {
  const trimmedTerm = termStr.trim();
  const trimmedDef = definitionStr.trim();

  // 1. Empty check
  if (!trimmedTerm && !trimmedDef) {
    return {
      id,
      hasIssue: true,
      issueType: 'empty',
      severity: 'warning',
      explanation: 'Thẻ còn trống từ vựng và định nghĩa'
    };
  }

  if (!trimmedTerm) {
    return {
      id,
      hasIssue: true,
      issueType: 'empty',
      severity: 'warning',
      explanation: 'Chưa nhập thuật ngữ tiếng Anh'
    };
  }

  if (!trimmedDef) {
    return {
      id,
      hasIssue: true,
      issueType: 'empty',
      severity: 'warning',
      explanation: 'Chưa nhập định nghĩa tiếng Việt'
    };
  }

  // 2. Duplicate Check
  if (allTerms && allTerms.length > 1) {
    const { word: currentWord } = sanitizeTermString(trimmedTerm);
    const normalizedCurrent = currentWord.toLowerCase();
    
    if (normalizedCurrent) {
      const duplicates = allTerms.filter(t => {
        if (t.id === id) return false;
        const { word: otherWord } = sanitizeTermString(t.term.trim());
        return otherWord.toLowerCase() === normalizedCurrent;
      });

      if (duplicates.length > 0) {
        return {
          id,
          hasIssue: true,
          issueType: 'duplicate',
          severity: 'warning',
          explanation: `Từ "${currentWord}" bị trùng lặp với thẻ khác trong học phần!`
        };
      }
    }
  }

  // 3. Bracket / POS formatting check
  const hasUnclosedParen = (trimmedTerm.includes('(') && !trimmedTerm.includes(')')) ||
                           (!trimmedTerm.includes('(') && trimmedTerm.includes(')')) ||
                           (trimmedTerm.includes('[') && !trimmedTerm.includes(']')) ||
                           (!trimmedTerm.includes('[') && trimmedTerm.includes(']'));

  if (hasUnclosedParen) {
    const cleaned = trimmedTerm.replace(/[\(\)\[\]]/g, '').trim();
    return {
      id,
      hasIssue: true,
      issueType: 'pos',
      severity: 'warning',
      suggestedTerm: `${cleaned} (v)`,
      explanation: 'Dấu ngoặc từ loại chưa đóng mở đúng định dạng.'
    };
  }

  // 4. Extract word & pos
  const { word, pos } = sanitizeTermString(trimmedTerm);
  const lowerWord = word.toLowerCase();

  // 5. Offline typo lookup
  if (COMMON_TYPOS[lowerWord]) {
    const correctWord = COMMON_TYPOS[lowerWord];
    // Keep casing if uppercase first letter
    const capitalizedCorrection = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()
      ? correctWord.charAt(0).toUpperCase() + correctWord.slice(1)
      : correctWord;
    
    const suggestedTerm = pos ? `${capitalizedCorrection} (${pos})` : capitalizedCorrection;
    return {
      id,
      hasIssue: true,
      issueType: 'spelling',
      severity: 'error',
      suggestedTerm,
      suggestedDefinition: trimmedDef,
      explanation: `Lỗi chính tả: "${word}" ➔ nên là "${capitalizedCorrection}".`
    };
  }

  // 6. POS full word normalization (e.g., "noun" -> "n")
  const rawParenMatch = trimmedTerm.match(/^(.*?)\s*[\(\[](.*?)[\)\]]$/);
  if (rawParenMatch) {
    const rawPos = rawParenMatch[2].trim().toLowerCase();
    if (POS_NORMALIZER[rawPos] && POS_NORMALIZER[rawPos] !== rawPos) {
      const normalizedPos = POS_NORMALIZER[rawPos];
      return {
        id,
        hasIssue: true,
        issueType: 'pos',
        severity: 'info',
        suggestedTerm: `${word} (${normalizedPos})`,
        suggestedDefinition: trimmedDef,
        explanation: `Chuẩn hóa từ loại: "(${rawPos})" ➔ "(${normalizedPos})".`
      };
    }
  }

  return {
    id,
    hasIssue: false,
    issueType: 'none',
    severity: 'info'
  };
}

/**
 * Run comprehensive AI spellcheck & quality inspection for all cards
 */
export async function checkTermsWithAI(
  terms: Array<{ id: string | number; term: string; definition: string }>
): Promise<Map<string | number, SpellCheckResult>> {
  const resultMap = new Map<string | number, SpellCheckResult>();

  // First, populate with local instant heuristics
  for (const t of terms) {
    const localRes = checkSingleTermLocal(t.id, t.term, t.definition, terms);
    resultMap.set(t.id, localRes);
  }

  const validTerms = terms.filter(t => t.term.trim() || t.definition.trim());
  if (validTerms.length === 0) {
    return resultMap;
  }

  try {
    const response = await fetch('/api/ai/spellcheck-terms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ terms: validTerms })
    });

    if (!response.ok) {
      throw new Error(`AI spellcheck service responded with status ${response.status}`);
    }

    const data = await response.json();
    if (data && Array.isArray(data.results)) {
      for (const res of data.results) {
        // Find matching term
        const matchingId = res.id;
        const matched = terms.find(t => String(t.id) === String(matchingId));
        const targetId = matched ? matched.id : matchingId;

        const currentLocal = resultMap.get(targetId);

        // If local found duplicate, preserve duplicate severity
        if (currentLocal && currentLocal.issueType === 'duplicate') {
          continue;
        }

        resultMap.set(targetId, {
          id: targetId,
          hasIssue: Boolean(res.hasIssue),
          issueType: (res.issueType as any) || (res.hasIssue ? 'spelling' : 'none'),
          suggestedTerm: res.suggestedTerm || undefined,
          suggestedDefinition: res.suggestedDefinition || undefined,
          explanation: res.explanation || (res.hasIssue ? 'Phát hiện cần chỉnh sửa' : 'Từ vựng chuẩn xác'),
          severity: res.hasIssue ? (res.issueType === 'spelling' ? 'error' : 'warning') : 'info'
        });
      }
    }
  } catch (error) {
    console.warn('AI spellcheck request fallback to local heuristics:', error);
    // Keep local heuristics already populated
  }

  return resultMap;
}
