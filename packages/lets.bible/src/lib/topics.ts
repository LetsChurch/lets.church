// A small curated topic taxonomy for the search autocomplete's "Topics" group.
// Each topic maps a set of synonyms (what the user might type) to a canonical
// `label` and a `query` to run when chosen (a phrase/term that surfaces good
// verses via the normal full-text search). This is intentionally hand-curated
// and finite — not an ML classifier — so suggestions stay predictable.
//
// `matchTopics` does prefix/substring matching against the label + synonyms so a
// partial query like "anx" surfaces "Anxiety & worry".

export type Topic = {
  id: string;
  label: string;
  synonyms: string[];
  // What to search when the topic is chosen (run through the normal verse search).
  query: string;
};

export const TOPICS: Topic[] = [
  {
    id: 'anxiety',
    label: 'Anxiety & worry',
    synonyms: [
      'anxiety',
      'anxious',
      'worry',
      'worried',
      'stress',
      'overwhelmed',
    ],
    query: 'do not be anxious',
  },
  {
    id: 'fear',
    label: 'Fear & courage',
    synonyms: ['fear', 'afraid', 'fearful', 'courage', 'brave', 'scared'],
    query: 'do not fear',
  },
  {
    id: 'love',
    label: 'Love',
    synonyms: ['love', 'beloved', 'charity', 'loving'],
    query: 'love one another',
  },
  {
    id: 'faith',
    label: 'Faith & trust',
    synonyms: ['faith', 'faithful', 'trust', 'believe', 'belief'],
    query: 'faith',
  },
  {
    id: 'hope',
    label: 'Hope',
    synonyms: ['hope', 'hopeful', 'hoping'],
    query: 'hope',
  },
  {
    id: 'peace',
    label: 'Peace',
    synonyms: ['peace', 'peaceful', 'rest', 'calm'],
    query: 'peace',
  },
  {
    id: 'forgiveness',
    label: 'Forgiveness',
    synonyms: ['forgive', 'forgiveness', 'forgiven', 'mercy', 'merciful'],
    query: 'forgive',
  },
  {
    id: 'prayer',
    label: 'Prayer',
    synonyms: ['prayer', 'pray', 'praying', 'intercession'],
    query: 'pray',
  },
  {
    id: 'grace',
    label: 'Grace',
    synonyms: ['grace', 'gracious', 'unmerited', 'favor'],
    query: 'grace',
  },
  {
    id: 'salvation',
    label: 'Salvation',
    synonyms: ['salvation', 'saved', 'save', 'redemption', 'redeemed'],
    query: 'salvation',
  },
  {
    id: 'wisdom',
    label: 'Wisdom',
    synonyms: ['wisdom', 'wise', 'understanding', 'discernment'],
    query: 'wisdom',
  },
  {
    id: 'strength',
    label: 'Strength',
    synonyms: ['strength', 'strong', 'strengthen', 'weary', 'weak'],
    query: 'strength',
  },
  {
    id: 'joy',
    label: 'Joy',
    synonyms: ['joy', 'joyful', 'rejoice', 'glad', 'gladness'],
    query: 'rejoice',
  },
  {
    id: 'patience',
    label: 'Patience',
    synonyms: ['patience', 'patient', 'endurance', 'perseverance', 'wait'],
    query: 'patience',
  },
  {
    id: 'thankfulness',
    label: 'Thankfulness',
    synonyms: ['thankful', 'thanks', 'thanksgiving', 'gratitude', 'grateful'],
    query: 'give thanks',
  },
  {
    id: 'comfort',
    label: 'Comfort & grief',
    synonyms: ['comfort', 'grief', 'grieving', 'mourning', 'mourn', 'sorrow'],
    query: 'comfort',
  },
  {
    id: 'humility',
    label: 'Humility',
    synonyms: ['humility', 'humble', 'meek', 'meekness', 'pride'],
    query: 'humble',
  },
  {
    id: 'money',
    label: 'Money & generosity',
    synonyms: ['money', 'wealth', 'riches', 'generosity', 'giving', 'greed'],
    query: 'treasure in heaven',
  },
  {
    id: 'marriage',
    label: 'Marriage',
    synonyms: ['marriage', 'marry', 'husband', 'wife', 'spouse'],
    query: 'husband wife',
  },
  {
    id: 'creation',
    label: 'Creation',
    synonyms: ['creation', 'created', 'creator', 'beginning', 'heavens earth'],
    query: 'in the beginning God created',
  },
  {
    id: 'repentance',
    label: 'Repentance & sin',
    synonyms: [
      'repent',
      'repentance',
      'sin',
      'sins',
      'confess',
      'confession',
      'transgression',
      'iniquity',
    ],
    query: 'repent',
  },
  {
    id: 'eternal-life',
    label: 'Heaven & eternal life',
    synonyms: [
      'heaven',
      'heavenly',
      'eternal',
      'eternal life',
      'everlasting life',
      'eternity',
      'paradise',
    ],
    query: 'eternal life',
  },
  {
    id: 'holy-spirit',
    label: 'The Holy Spirit',
    synonyms: [
      'holy spirit',
      'spirit',
      'comforter',
      'helper',
      'counselor',
      'advocate',
    ],
    query: 'Holy Spirit',
  },
  {
    id: 'temptation',
    label: 'Temptation',
    synonyms: ['temptation', 'tempt', 'tempted', 'testing', 'tested'],
    query: 'temptation',
  },
  {
    id: 'suffering',
    label: 'Suffering & trials',
    synonyms: [
      'suffering',
      'suffer',
      'affliction',
      'trials',
      'tribulation',
      'persecution',
      'hardship',
    ],
    query: 'suffering',
  },
  {
    id: 'healing',
    label: 'Healing',
    synonyms: ['healing', 'heal', 'healed', 'sick', 'sickness', 'disease'],
    query: 'healing',
  },
  {
    id: 'obedience',
    label: 'Obedience',
    synonyms: [
      'obedience',
      'obey',
      'obeyed',
      'obedient',
      'commandments',
      'commands',
    ],
    query: 'obey',
  },
  {
    id: 'worship',
    label: 'Worship & praise',
    synonyms: ['worship', 'praise', 'exalt', 'glorify', 'adoration', 'magnify'],
    query: 'praise the Lord',
  },
  {
    id: 'holiness',
    label: 'Holiness',
    synonyms: ['holiness', 'holy', 'sanctify', 'sanctification', 'consecrate'],
    query: 'be holy',
  },
  {
    id: 'righteousness',
    label: 'Righteousness',
    synonyms: [
      'righteousness',
      'righteous',
      'justified',
      'justification',
      'upright',
    ],
    query: 'righteousness',
  },
  {
    id: 'justice',
    label: 'Justice & the oppressed',
    synonyms: [
      'justice',
      'injustice',
      'oppressed',
      'oppression',
      'poor',
      'widow',
      'orphan',
      'needy',
    ],
    query: 'justice for the oppressed',
  },
  {
    id: 'truth',
    label: 'Truth & honesty',
    synonyms: [
      'truth',
      'true',
      'honesty',
      'honest',
      'integrity',
      'lies',
      'lying',
      'deceit',
    ],
    query: 'truth',
  },
  {
    id: 'light',
    label: 'Light & darkness',
    synonyms: ['light', 'darkness', 'dark', 'shine', 'lamp'],
    query: 'light of the world',
  },
  {
    id: 'cross',
    label: 'The cross & sacrifice',
    synonyms: [
      'cross',
      'crucified',
      'crucifixion',
      'sacrifice',
      'atonement',
      'blood of Christ',
    ],
    query: 'the cross',
  },
  {
    id: 'resurrection',
    label: 'Resurrection',
    synonyms: ['resurrection', 'risen', 'raised', 'rose again', 'empty tomb'],
    query: 'resurrection',
  },
  {
    id: 'gospel',
    label: 'The gospel',
    synonyms: ['gospel', 'good news', 'glad tidings', 'proclaim'],
    query: 'the gospel',
  },
  {
    id: 'kingdom',
    label: 'The kingdom of God',
    synonyms: ['kingdom of god', 'kingdom of heaven', 'kingdom', 'reign'],
    query: 'kingdom of God',
  },
  {
    id: 'spiritual-warfare',
    label: 'Spiritual warfare',
    synonyms: [
      'spiritual warfare',
      'devil',
      'satan',
      'enemy',
      'armor of god',
      'demons',
      'evil one',
    ],
    query: 'armor of God',
  },
  {
    id: 'end-times',
    label: "Christ's return & end times",
    synonyms: [
      'second coming',
      'return of christ',
      'last days',
      'end times',
      'day of the lord',
      'judgment day',
    ],
    query: 'the day of the Lord',
  },
  {
    id: 'work',
    label: 'Work & diligence',
    synonyms: [
      'work',
      'labor',
      'diligence',
      'diligent',
      'lazy',
      'laziness',
      'sluggard',
    ],
    query: 'work',
  },
  {
    id: 'anger',
    label: 'Anger',
    synonyms: ['anger', 'angry', 'wrath', 'rage', 'temper'],
    query: 'slow to anger',
  },
  {
    id: 'speech',
    label: 'Words & the tongue',
    synonyms: ['tongue', 'words', 'speech', 'speaking', 'gossip', 'slander'],
    query: 'the tongue',
  },
  {
    id: 'contentment',
    label: 'Contentment',
    synonyms: [
      'contentment',
      'content',
      'satisfied',
      'covet',
      'coveting',
      'envy',
    ],
    query: 'contentment',
  },
  {
    id: 'rest',
    label: 'Rest & Sabbath',
    synonyms: [
      'rest',
      'sabbath',
      'weary',
      'burdened',
      'refresh',
      'heavy laden',
    ],
    query: 'rest for your souls',
  },
  {
    id: 'guidance',
    label: "Guidance & God's will",
    synonyms: ['guidance', 'guide', 'will of god', 'direction', 'path', 'lead'],
    query: 'guide me',
  },
  {
    id: 'family',
    label: 'Family & children',
    synonyms: [
      'family',
      'children',
      'child',
      'parents',
      'father',
      'mother',
      'household',
    ],
    query: 'children',
  },
  {
    id: 'friendship',
    label: 'Friendship',
    synonyms: ['friend', 'friends', 'friendship', 'companion'],
    query: 'a friend loves at all times',
  },
  {
    id: 'service',
    label: 'Serving others',
    synonyms: ['servant', 'serve', 'service', 'serving', 'minister'],
    query: 'serve one another',
  },
];

// Match the query against topic labels + synonyms, both as a whole (prefix typing
// like "anx" → Anxiety) and token-by-token (a topic word inside a phrase, e.g.
// "anxious" within "do not be anxious"). Lower score = better; ranks prefix hits
// above looser token hits.
export function matchTopics(query: string, limit = 2): Topic[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return [];
  }
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
  const scored: { topic: Topic; score: number }[] = [];
  for (const topic of TOPICS) {
    const terms = [topic.label.toLowerCase(), ...topic.synonyms];
    let best = Number.POSITIVE_INFINITY;
    for (const term of terms) {
      // Whole-query match (prefix typing).
      if (term === q) {
        best = Math.min(best, 0);
      } else if (term.startsWith(q)) {
        best = Math.min(best, 1);
      } else if (q.startsWith(term) && term.length >= 3) {
        best = Math.min(best, 2);
      }
      // Token match (a content word within a multi-word query).
      for (const tok of tokens) {
        if (term === tok) {
          best = Math.min(best, 1);
        } else if (term.startsWith(tok) || tok.startsWith(term)) {
          best = Math.min(best, 2);
        }
      }
    }
    if (best < Number.POSITIVE_INFINITY) {
      scored.push({ topic, score: best });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.topic);
}
