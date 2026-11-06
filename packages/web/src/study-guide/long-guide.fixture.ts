import type { StudyGuideContent } from '@letschurch/temporal/util/study-guide';

const verse = (verse: number, text: string) => ({ chapter: 3, verse, text });

// Modeled on a real guide whose back page ran onto a third page: a long
// memory verse, six key terms and a five-item timeline in the right column.
export const long: StudyGuideContent = {
  title: 'Sola Fide',
  seriesLabel: null,
  bigIdea:
    'God justifies guilty sinners through faith in Christ, whose righteousness and sacrifice, not their works, make them right with God.',
  opening:
    'In the Tower of London, a young woman waits to die. The deeper question behind her imprisonment is what can make a guilty sinner right before God.',
  keyPassage: {
    ref: { book: 'Rom', chapter: 3, verse: 23, endVerse: 28 },
    translation: 'BSB',
    verses: [
      verse(23, 'for all have sinned and fall short of the glory of God,'),
      verse(
        24,
        'and are justified freely by His grace through the redemption that is in Christ Jesus.',
      ),
      verse(
        25,
        'God presented Him as an atoning sacrifice in His blood through faith, in order to demonstrate His righteousness, because in His forbearance He had passed over the sins committed beforehand.',
      ),
      verse(
        26,
        'He did this to demonstrate His righteousness at the present time, so as to be just and to justify the one who has faith in Jesus.',
      ),
      verse(
        27,
        'Where, then, is boasting? It is excluded. On what principle? On that of works? No, but on that of faith.',
      ),
      verse(
        28,
        'For we maintain that a man is justified by faith apart from works of the law.',
      ),
    ],
  },
  outline: [
    {
      marker: 'Intro',
      before:
        "Lady Jane Grey's imprisonment raises the deeper question of how anyone can stand right before God.",
      answer: null,
      after: '',
      startSec: 13,
    },
    {
      marker: 'I.',
      before: 'The verdict against all people is ',
      answer: 'guilty',
      after: ' (Rom 3:19, 23).',
      startSec: 1477,
    },
    {
      marker: 'II.',
      before: 'God justifies the guilty through ',
      answer: 'Christ',
      after: ', who bears judgment and satisfies justice (Rom 3:24-26).',
      startSec: 1963,
    },
    {
      marker: 'III.',
      before: '',
      answer: 'Faith',
      after:
        " alone receives Christ's righteousness; good works follow salvation but cannot earn it (Rom 3:27-28).",
      startSec: 2878,
    },
    {
      marker: 'Apply',
      before:
        "Rest in Christ's righteousness, and build courage through ordinary faithfulness in Scripture, prayer, and worship.",
      answer: null,
      after: '',
      startSec: 3079,
    },
  ],
  questions: {
    observe: [
      'According to Romans 3:23-24, what is true of everyone, and how are sinners justified?',
      'In Romans 3:27-28, what happens to boasting, and how is a person justified?',
    ],
    interpret: [
      'How can God be both just and the justifier of those who have faith in Jesus?',
      "Why can't future obedience or repentance erase the guilt of past sin?",
      'How does this teaching distinguish good works as fruit of salvation from works as a way to earn salvation?',
    ],
    apply: [
      "Where are you tempted to rely on your own record instead of Christ's righteousness?",
      'What ordinary practices of Scripture, prayer, or worship could help you grow in faithfulness and courage?',
    ],
  },
  family: {
    intro: 'Talk together about how Jesus gives us what we could never earn.',
    prompts: [
      'Can doing good things today erase something wrong we did yesterday?',
      'What did Jesus do so that people who trust him can be right with God?',
      'What is one small way your family can read the Bible, pray, or worship together this week?',
    ],
  },
  memoryVerse: {
    ref: { book: 'Rom', chapter: 3, verse: 24, endVerse: 25 },
    translation: 'BSB',
    verses: [
      verse(
        24,
        'and are justified freely by His grace through the redemption that is in Christ Jesus.',
      ),
      verse(
        25,
        'God presented Him as an atoning sacrifice in His blood through faith, in order to demonstrate His righteousness, because in His forbearance He had passed over the sins committed beforehand.',
      ),
    ],
  },
  keyTerms: [
    {
      term: 'Sola fide',
      definition:
        'Latin for "faith alone": faith receives salvation rather than earning it.',
    },
    {
      term: 'Justification',
      definition:
        "God's judicial declaration that believers are righteous on the basis of Christ.",
    },
    {
      term: 'Propitiation',
      definition:
        "Christ's sacrifice satisfying God's righteous judgment against sin.",
    },
    {
      term: 'Redemption',
      definition:
        "Deliverance secured for sinners through Christ's costly work.",
    },
    {
      term: 'Alien righteousness',
      definition:
        "Righteousness from outside believers: Christ's righteousness credited to them.",
    },
    {
      term: 'Forbearance',
      definition:
        "God's patience in delaying judgment, not treating sin as unimportant.",
    },
  ],
  timeline: {
    heading: 'Lady Jane Grey',
    items: [
      {
        label: '1547',
        text: "Jane is transferred to Catherine Parr's household.",
      },
      {
        label: '1550',
        text: 'Roger Ascham finds Jane reading Plato in Greek.',
      },
      {
        label: '1553',
        text: 'Edward dies; Jane is proclaimed queen on July 10.',
      },
      {
        label: '1553',
        text: 'Jane is deposed nine days later, then tried in November.',
      },
      {
        label: 'February 1554',
        text: 'Jane waits in the Tower of London, facing execution.',
      },
    ],
  },
  quotes: [
    {
      text: 'God often forges extraordinary courage in acts of ordinary faithfulness.',
      startSec: 1168,
    },
    {
      text: 'Nothing you can do can make you right with God. But if you have faith in Jesus Christ, you have been made right and nothing can ever take it.',
      startSec: 3079,
    },
  ],
  prayer:
    "Ask God to help you rest in Christ's righteousness rather than your own efforts. Ask him to build steady faithfulness and courage in you through his Word, prayer, and worship.",
  passages: [
    { book: 'Eph', chapter: 2, verse: 5 },
    { book: 'Rom', chapter: 3, verse: 21, endVerse: 28 },
    { book: 'Eph', chapter: 2, verse: 1 },
    { book: 'Rom', chapter: 1 },
    { book: 'Rom', chapter: 2 },
    { book: 'Rom', chapter: 3, verse: 19 },
    { book: 'Rom', chapter: 3, verse: 10 },
    { book: 'Jas', chapter: 2, verse: 10 },
    { book: '1John', chapter: 1, verse: 8 },
    { book: 'Exod', chapter: 23, verse: 7 },
    { book: 'Rom', chapter: 4, verse: 5 },
    { book: 'Rom', chapter: 7 },
    { book: '2Cor', chapter: 5, verse: 21 },
    { book: 'Phil', chapter: 3, verse: 9 },
    { book: 'Zech', chapter: 3, verse: 1 },
    { book: 'Zech', chapter: 3, verse: 4 },
  ],
  echoes: [
    { book: 'Rom', chapter: 8, verse: 38, endVerse: 39 },
    { book: 'Eph', chapter: 2, verse: 8, endVerse: 9 },
  ],
};

export const args = {
  channelName: "The Shepherd's Church",
  publishedAt: new Date('2026-11-03T00:00:00Z'),
  lengthSeconds: 3180,
  mediaUrl: 'https://lets.church/media/ntoRUoP94P3FUpYtrpvKqj',
};
