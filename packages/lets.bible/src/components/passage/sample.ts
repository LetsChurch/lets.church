import type { Block } from './types';

// Philippians 4 — the reading-view sample (BSB).
export const philippians4: Block[] = [
  { kind: 'heading', text: 'Rejoice in the Lord' },
  {
    kind: 'prose',
    verses: [
      {
        num: 4,
        runs: [
          { text: 'Rejoice in the Lord always. I will say it again: Rejoice!' },
        ],
      },
      {
        num: 5,
        runs: [
          {
            text: 'Let your gentleness be apparent to all. The Lord is near.',
          },
        ],
      },
    ],
  },
  {
    kind: 'prose',
    verses: [
      {
        num: 6,
        runs: [
          {
            text: 'Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God.',
          },
        ],
      },
      {
        num: 7,
        runs: [
          {
            text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.',
          },
        ],
      },
    ],
  },
  {
    kind: 'prose',
    verses: [
      {
        num: 8,
        runs: [
          {
            text: 'Finally, brothers, whatever is true, whatever is honorable, whatever is right, whatever is pure, whatever is lovely, whatever is admirable — if anything is excellent or praiseworthy — think on these things.',
          },
        ],
      },
      {
        num: 9,
        runs: [
          {
            text: 'Whatever you have learned or received or heard from me, or seen in me, put it into practice. And the God of peace will be with you.',
          },
        ],
      },
    ],
  },
];

export type ModeSample = {
  id: string;
  label: string;
  ref: string;
  note: string;
  blocks: Block[];
};

// The seven verse rendering modes from the design concept.
export const MODES: ModeSample[] = [
  {
    id: 'prose',
    label: 'Prose · narrative',
    ref: 'John 1:1–3',
    note: 'Continuous measure, justified left. The default for narrative and epistle.',
    blocks: [
      {
        kind: 'prose',
        verses: [
          {
            num: 1,
            runs: [
              {
                text: 'In the beginning was the Word, and the Word was with God, and the Word was God.',
              },
            ],
          },
          {
            num: 2,
            runs: [{ text: 'The same was in the beginning with God.' }],
          },
          { num: 3, runs: [{ text: 'All things were made through him.' }] },
        ],
      },
    ],
  },
  {
    id: 'poetry',
    label: 'Hebrew poetry · parallelism',
    ref: 'Psalm 23:1–3',
    note: 'Each line gets its own row; parallel cola are indented. The divine name is set in small caps.',
    blocks: [
      {
        kind: 'poetry',
        lines: [
          {
            num: 1,
            indent: 0,
            runs: [
              { text: 'The ' },
              { text: 'Lord', smallcaps: true },
              { text: ' is my shepherd;' },
            ],
          },
          { indent: 1, runs: [{ text: 'I shall lack nothing.' }] },
          {
            num: 2,
            indent: 0,
            runs: [{ text: 'He makes me lie down in green pastures.' }],
          },
          { indent: 1, runs: [{ text: 'He leads me beside still waters.' }] },
          { num: 3, indent: 0, runs: [{ text: 'He restores my soul.' }] },
        ],
      },
    ],
  },
  {
    id: 'selah',
    label: 'Poetry · musical notation',
    ref: 'Psalm 46:1–3',
    note: 'Liturgical markers like Selah are set right-aligned and italic, distinct from the verse text.',
    blocks: [
      {
        kind: 'poetry',
        lines: [
          {
            num: 1,
            indent: 0,
            runs: [{ text: 'God is our refuge and strength,' }],
          },
          { indent: 1, runs: [{ text: 'a very present help in trouble.' }] },
          {
            num: 2,
            indent: 0,
            runs: [
              {
                text: 'Therefore we won’t be afraid, though the earth changes,',
              },
            ],
          },
          {
            indent: 1,
            runs: [
              {
                text: 'though the mountains are shaken into the heart of the seas;',
              },
            ],
          },
        ],
      },
      { kind: 'selah' },
    ],
  },
  {
    id: 'hymn',
    label: 'Hymn embedded in prose',
    ref: 'Philippians 2:5–7',
    note: 'Prose flows normally, then shifts to indented poetry where the text turns hymnic.',
    blocks: [
      {
        kind: 'prose',
        verses: [
          {
            num: 5,
            runs: [
              {
                text: 'Have this in your mind, which was also in Christ Jesus,',
              },
            ],
          },
        ],
      },
      {
        kind: 'poetry',
        hymn: true,
        lines: [
          {
            num: 6,
            indent: 0,
            runs: [{ text: 'who, existing in the form of God,' }],
          },
          {
            indent: 1,
            runs: [
              {
                text: 'didn’t consider equality with God a thing to be grasped,',
              },
            ],
          },
          {
            num: 7,
            indent: 0,
            runs: [
              { text: 'but emptied himself, taking the form of a servant,' },
            ],
          },
          { indent: 1, runs: [{ text: 'being made in the likeness of men.' }] },
        ],
      },
    ],
  },
  {
    id: 'ot-quote',
    label: 'Old Testament quotation',
    ref: 'Romans 10:12–13',
    note: 'NASB convention: quoted Old Testament text is set in small capitals — no quotation marks — with the source noted alongside.',
    blocks: [
      {
        kind: 'prose',
        verses: [
          {
            num: 12,
            runs: [
              {
                text: 'The same Lord is Lord of all, and is rich to all who call on him.',
              },
            ],
          },
          {
            num: 13,
            runs: [
              { text: 'For, ' },
              {
                text: 'Whoever will call on the name of the Lord will be saved.',
                smallcaps: true,
              },
            ],
          },
        ],
      },
      { kind: 'chip', text: '↩ quoting Joel 2:32', variant: 'neutral' },
    ],
  },
  {
    id: 'red-letter',
    label: 'Red letter · words of Christ',
    ref: 'Matthew 11:28–29',
    note: 'Spoken words of Christ in a warm terracotta — never pure red. Toggleable, distinguished by quotation, not color alone.',
    blocks: [
      {
        kind: 'prose',
        verses: [
          {
            num: 28,
            redletter: true,
            runs: [
              {
                text: '“Come to me, all you who labor and are heavily burdened, and I will give you rest.',
              },
            ],
          },
          {
            num: 29,
            redletter: true,
            runs: [
              {
                text: 'Take my yoke upon you and learn from me, for I am gentle and humble in heart; and you will find rest for your souls.”',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'acrostic',
    label: 'Acrostic · alphabetic',
    ref: 'Psalm 119:1–2',
    note: 'Each 8-verse stanza is headed by its Hebrew letter, set in the Hebrew face with a transliteration.',
    blocks: [
      { kind: 'acrostic', letter: 'א', name: 'Aleph' },
      {
        kind: 'prose',
        verses: [
          {
            num: 1,
            runs: [
              {
                text: 'Blessed are those whose ways are blameless, who walk according to Yahweh’s law.',
              },
            ],
          },
          {
            num: 2,
            runs: [
              {
                text: 'Blessed are those who keep his statutes, who seek him with their whole heart.',
              },
            ],
          },
        ],
      },
    ],
  },
];

export type ContextSample = {
  id: string;
  ref: string;
  blocks: Block[];
};

// The faded-context treatment applied to each genre: surrounding verses recede,
// the matched line keeps full contrast with a gold edge.
export const CONTEXT: ContextSample[] = [
  {
    id: 'poetry',
    ref: 'Psalm 23:1–4',
    blocks: [
      { kind: 'chip', text: 'Poetic parallel', variant: 'neutral' },
      {
        kind: 'poetry',
        lines: [
          {
            num: 1,
            indent: 0,
            tone: 'faded',
            runs: [
              { text: 'The ' },
              { text: 'Lord', smallcaps: true },
              { text: ' is my shepherd; I shall lack nothing.' },
            ],
          },
          {
            num: 2,
            indent: 0,
            tone: 'faded',
            runs: [{ text: 'He makes me lie down in green pastures.' }],
          },
          {
            num: 4,
            tone: 'focus',
            runs: [
              {
                text: 'Even though I walk through the valley of the shadow of death, ',
              },
              { text: 'I will fear no evil, for you are with me.', mark: true },
            ],
          },
          {
            indent: 0,
            tone: 'faded',
            runs: [{ text: 'Your rod and your staff, they comfort me.' }],
          },
        ],
      },
    ],
  },
  {
    id: 'red-letter',
    ref: 'Matthew 11:27–28',
    blocks: [
      { kind: 'chip', text: 'Words of Christ', variant: 'red' },
      {
        kind: 'prose',
        verses: [
          {
            num: 27,
            tone: 'faded',
            runs: [
              { text: 'All things have been delivered to me by my Father…' },
            ],
          },
        ],
      },
      {
        kind: 'focusVerse',
        verse: {
          num: 28,
          redletter: true,
          runs: [
            {
              text: '“Come to me, all you who labor and are heavily burdened, and I will give you rest.”',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'ot-quote',
    ref: 'Romans 10:12–13',
    blocks: [
      { kind: 'chip', text: 'OT quotation', variant: 'gold', dot: true },
      {
        kind: 'prose',
        verses: [
          {
            num: 12,
            tone: 'faded',
            runs: [
              {
                text: '…the same Lord is Lord of all, and is rich to all who call on him.',
              },
            ],
          },
        ],
      },
      {
        kind: 'focusVerse',
        verse: {
          num: 13,
          runs: [
            { text: 'For, ' },
            {
              text: 'Whoever will call on the name of the Lord will be saved.',
              smallcaps: true,
              mark: true,
            },
          ],
        },
      },
    ],
  },
];
