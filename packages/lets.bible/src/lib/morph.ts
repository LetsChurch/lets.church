// Decode STEPBible morphology codes into a short, human-readable parsing label
// for the interlinear's "Parsing" line. Greek (TAGNT, e.g. "V-AAI-3S", "N-NSF",
// "PREP") and Hebrew (TAHOT/ETCBC, e.g. "Vqw3ms", "Ncmsa", "Td") use different
// schemes, so the decoder branches on language. Unknown or partial codes degrade
// gracefully — we render whatever we recognize and fall back to the raw code.

const PART_OF_SPEECH: Record<string, string> = {
  N: 'Noun',
  A: 'Adjective',
  T: 'Article',
  V: 'Verb',
  P: 'Personal pronoun',
  R: 'Relative pronoun',
  C: 'Reciprocal pronoun',
  D: 'Demonstrative pronoun',
  F: 'Reflexive pronoun',
  S: 'Possessive pronoun',
  K: 'Correlative pronoun',
  I: 'Interrogative pronoun',
  X: 'Indefinite pronoun',
  Q: 'Correlative/interrogative pronoun',
  PREP: 'Preposition',
  CONJ: 'Conjunction',
  ADV: 'Adverb',
  PRT: 'Particle',
  'PRT-N': 'Negative particle',
  INJ: 'Interjection',
  COND: 'Conditional',
  'PRT-I': 'Interrogative particle',
  HEB: 'Hebrew word',
  ARAM: 'Aramaic word',
};

const TENSE: Record<string, string> = {
  P: 'Present',
  I: 'Imperfect',
  F: 'Future',
  A: 'Aorist',
  R: 'Perfect',
  L: 'Pluperfect',
};
const VOICE: Record<string, string> = {
  A: 'Active',
  M: 'Middle',
  P: 'Passive',
  E: 'Middle/Passive',
  D: 'Deponent',
  O: 'Middle Deponent',
  N: 'Passive Deponent',
};
const MOOD: Record<string, string> = {
  I: 'Indicative',
  S: 'Subjunctive',
  O: 'Optative',
  M: 'Imperative',
  N: 'Infinitive',
  P: 'Participle',
};
const CASE: Record<string, string> = {
  N: 'Nominative',
  G: 'Genitive',
  D: 'Dative',
  A: 'Accusative',
  V: 'Vocative',
};
const NUMBER: Record<string, string> = { S: 'Singular', P: 'Plural' };
const GENDER: Record<string, string> = {
  M: 'Masculine',
  F: 'Feminine',
  N: 'Neuter',
};
const PERSON: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd' };

// A parsed, structured view of a morphology code. `label` is the joined,
// human-readable string; the parts are exposed for callers that want to render
// them differently (chips, abbreviations, etc.).
export type Morphology = {
  partOfSpeech: string;
  details: string[];
  label: string;
  raw: string;
};

// Decode the Case-Number-Gender tail shared by nominals and participles, e.g.
// "NSF" → ["Nominative", "Singular", "Feminine"]. Tolerates extra trailing
// letters (TAGNT appends e.g. "-T"/"-P" markers) and two-gender forms ("MN").
function decodeCNG(seg: string): string[] {
  const out: string[] = [];
  const c = CASE[seg[0]];
  if (c) {
    out.push(c);
  }
  const n = NUMBER[seg[1]];
  if (n) {
    out.push(n);
  }
  // Gender may be one or two letters (e.g. "MN" = masc/neut); collect what we know.
  const genders = seg
    .slice(2)
    .split('')
    .map((g) => GENDER[g])
    .filter(Boolean);
  if (genders.length) {
    out.push(genders.join('/'));
  }
  return out;
}

// Decode a verb's tense/voice/mood triple (with an optional leading "2" for
// second forms, e.g. "2AMS"), returning the readable tense/voice/mood words.
function decodeTVM(seg: string): { parts: string[]; mood: string | null } {
  let s = seg;
  let second = '';
  if (s.startsWith('2')) {
    second = '2nd ';
    s = s.slice(1);
  }
  const parts: string[] = [];
  const tense = TENSE[s[0]];
  if (tense) {
    parts.push(`${second}${tense}`);
  }
  const voice = VOICE[s[1]];
  if (voice) {
    parts.push(voice);
  }
  const moodCode = s[2];
  const mood = MOOD[moodCode] ?? null;
  if (mood) {
    parts.push(mood);
  }
  return { parts, mood: moodCode ?? null };
}

// ── Hebrew (TAHOT / ETCBC compact codes) ──────────────────────────────────────
const HEB_POS: Record<string, string> = {
  N: 'Noun',
  V: 'Verb',
  A: 'Adjective',
  P: 'Pronoun',
  R: 'Preposition',
  S: 'Suffix',
  T: 'Particle',
  D: 'Adverb',
  C: 'Conjunction',
};
const HEB_GENDER: Record<string, string> = {
  m: 'Masculine',
  f: 'Feminine',
  b: 'Common',
  c: 'Common',
};
const HEB_NUMBER: Record<string, string> = {
  s: 'Singular',
  p: 'Plural',
  d: 'Dual',
};
const HEB_STATE: Record<string, string> = {
  a: 'Absolute',
  c: 'Construct',
  d: 'Determined',
};
const HEB_BINYAN: Record<string, string> = {
  q: 'Qal',
  N: 'Niphal',
  p: 'Piel',
  P: 'Pual',
  h: 'Hiphil',
  H: 'Hophal',
  t: 'Hithpael',
  o: 'Polel',
  O: 'Polal',
  r: 'Poel',
  D: 'Hishtaphel',
};
const HEB_VERB_CONJ: Record<string, string> = {
  p: 'Perfect',
  q: 'Sequential perfect',
  i: 'Imperfect',
  w: 'Consecutive imperfect',
  j: 'Jussive',
  v: 'Imperative',
  a: 'Infinitive absolute',
  c: 'Infinitive construct',
  r: 'Participle',
  s: 'Passive participle',
};
// Particle subtypes — the second letter of a "T…" code.
const HEB_PARTICLE: Record<string, string> = {
  d: 'Definite article',
  o: 'Object marker',
  c: 'Conjunction',
  n: 'Negative',
  r: 'Relative',
  i: 'Interrogative',
  m: 'Demonstrative',
  e: 'Exhortation',
  j: 'Interjection',
  a: 'Affirmation',
};

function hebPGN(seg: string): string[] {
  // person?-gender-number tail, e.g. "3ms" → ["3rd", "Masculine", "Singular"].
  const out: string[] = [];
  let i = 0;
  if (/[123]/.test(seg[i] ?? '')) {
    out.push(`${PERSON[seg[i]]} person`);
    i += 1;
  }
  const g = HEB_GENDER[seg[i] ?? ''];
  if (g) {
    out.push(g);
    i += 1;
  }
  const n = HEB_NUMBER[seg[i] ?? ''];
  if (n) {
    out.push(n);
  }
  return out;
}

function decodeHebrew(raw: string): Morphology {
  const pos = HEB_POS[raw[0]] ?? raw[0];
  const details: string[] = [];
  const body = raw.slice(1);

  if (raw[0] === 'V') {
    const binyan = HEB_BINYAN[body[0]];
    if (binyan) {
      details.push(binyan);
    }
    const conjCode = body[1];
    const conj = HEB_VERB_CONJ[conjCode];
    if (conj) {
      details.push(conj);
    }
    const tail = body.slice(2);
    if (conjCode === 'r' || conjCode === 's') {
      // participle: gender-number-state
      const g = HEB_GENDER[tail[0] ?? ''];
      const n = HEB_NUMBER[tail[1] ?? ''];
      const st = HEB_STATE[tail[2] ?? ''];
      details.push(...[g, n, st].filter(Boolean));
    } else if (conjCode !== 'a' && conjCode !== 'c') {
      details.push(...hebPGN(tail));
    }
  } else if (raw[0] === 'N') {
    const type = body[0];
    if (type === 'p') {
      details.push('Proper');
    }
    // common nouns: gender-number-state at positions 1..3
    const g = HEB_GENDER[body[1] ?? ''];
    const n = HEB_NUMBER[body[2] ?? ''];
    const st = HEB_STATE[body[3] ?? ''];
    details.push(...[g, n, st].filter(Boolean));
  } else if (raw[0] === 'A' || raw[0] === 'P') {
    const g = HEB_GENDER[body[1] ?? ''];
    const n = HEB_NUMBER[body[2] ?? ''];
    const st = HEB_STATE[body[3] ?? ''];
    details.push(...[g, n, st].filter(Boolean));
  } else if (raw[0] === 'S') {
    details.push(...hebPGN(body.slice(1)));
  } else if (raw[0] === 'T') {
    const sub = HEB_PARTICLE[body[0]];
    if (sub) {
      return { partOfSpeech: sub, details: [], label: sub, raw };
    }
  }

  const label = [pos, ...details].filter(Boolean).join(' · ');
  return { partOfSpeech: pos, details, label: label || raw, raw };
}

export function decodeMorph(
  code: string | null | undefined,
  language?: string | null,
): Morphology | null {
  if (!code) {
    return null;
  }
  const raw = code.trim();
  if (!raw) {
    return null;
  }
  // Hebrew (ETCBC) codes have no hyphen and use lowercase feature letters; the
  // Greek (Tauber) codes are hyphenated or multi-letter parts of speech.
  if (language === 'hebrew') {
    return decodeHebrew(raw);
  }
  const segs = raw.split('-');
  // Multi-letter parts of speech (PREP, CONJ, …) and the "PRT-N"/"PRT-I" forms
  // are matched whole before falling back to the single-letter first segment.
  const posKey = PART_OF_SPEECH[raw]
    ? raw
    : PART_OF_SPEECH[`${segs[0]}-${segs[1]}`]
      ? `${segs[0]}-${segs[1]}`
      : segs[0];
  const partOfSpeech = PART_OF_SPEECH[posKey] ?? posKey;
  const details: string[] = [];

  if (segs[0] === 'V') {
    // Verb: V-<TVM>-<PN | CNG>. Participles/infinitives carry case-number-gender;
    // finite verbs carry person-number.
    const { parts, mood } = decodeTVM(segs[1] ?? '');
    details.push(...parts);
    const tail = segs[2];
    if (tail) {
      if (mood === 'P') {
        details.push(...decodeCNG(tail));
      } else if (/^[123][SP]$/.test(tail)) {
        const p = PERSON[tail[0]];
        const n = NUMBER[tail[1]];
        if (p) {
          details.push(`${p} person`);
        }
        if (n) {
          details.push(n);
        }
      } else {
        details.push(...decodeCNG(tail));
      }
    }
  } else if (
    ['N', 'A', 'T', 'R', 'D', 'C', 'F', 'S', 'K', 'Q'].includes(segs[0])
  ) {
    // Nominal: X-<CNG>, e.g. N-NSF, T-ASM. (TAGNT may append a marker, e.g.
    // N-NSM-T — decodeCNG tolerates the extra segment by ignoring it.)
    if (segs[1]) {
      details.push(...decodeCNG(segs[1]));
    }
  } else if (segs[0] === 'P') {
    // Personal pronoun: either P-<CNG> (P-GSM) or P-<person><number><…> (P-1GS).
    const seg = segs[1] ?? '';
    if (/^[123]/.test(seg)) {
      const p = PERSON[seg[0]];
      if (p) {
        details.push(`${p} person`);
      }
      details.push(...decodeCNG(seg.slice(1)));
    } else {
      details.push(...decodeCNG(seg));
    }
  }

  const label = [partOfSpeech, ...details].filter(Boolean).join(' · ');
  return { partOfSpeech, details, label: label || raw, raw };
}
