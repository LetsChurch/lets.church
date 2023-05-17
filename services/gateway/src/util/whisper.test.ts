import { expect, test, describe } from 'vitest';
import { joinerizeTranscript, whisperJsonToVtt } from './whisper';

describe('joineriizeTranscript', () => {
  test('empty transcript', () => {
    expect(joinerizeTranscript({ text: '', segments: [] }))
      .toMatchInlineSnapshot(`
      {
        "segments": [],
        "text": "",
      }
    `);
  });

  test('basic test', () => {
    expect(
      joinerizeTranscript({
        text: 'Hello, world! How are you?',
        segments: [
          { start: 0, end: 2, text: 'Hello, ' },
          { start: 2, end: 4, text: 'world! ' },
          { start: 4, end: 6, text: 'How ' },
          { start: 6, end: 8, text: 'are ' },
          { start: 8, end: 10, text: 'you?' },
        ],
      }),
    ).toMatchInlineSnapshot(`
      {
        "segments": [
          {
            "end": 6,
            "start": 0,
            "text": "Hello, world! How",
          },
          {
            "end": 10,
            "start": 6,
            "text": "are you?",
          },
        ],
        "text": "Hello, world! How are you?",
      }
    `);
  });

  test('mixed', () => {
    expect(
      joinerizeTranscript({
        text: 'Segment 1 Segment 2 Segment 3 Segment 4',
        segments: [
          { start: 0, end: 4, text: 'Segment' },
          { start: 4, end: 5, text: '1' },
          { start: 5, end: 9, text: 'Segment' },
          { start: 9, end: 10, text: '2' },
          { start: 10, end: 16, text: 'Segment 3' },
          { start: 16, end: 20, text: 'Segment' },
          { start: 20, end: 21, text: '4' },
        ],
      }),
    ).toMatchInlineSnapshot(`
      {
        "segments": [
          {
            "end": 5,
            "start": 0,
            "text": "Segment 1",
          },
          {
            "end": 10,
            "start": 5,
            "text": "Segment 2",
          },
          {
            "end": 16,
            "start": 10,
            "text": "Segment 3",
          },
          {
            "end": 21,
            "start": 16,
            "text": "Segment 4",
          },
        ],
        "text": "Segment 1 Segment 2 Segment 3 Segment 4",
      }
    `);
  });
});

test('whisperJsonToVtt', () => {
  expect(
    whisperJsonToVtt({
      segments: [
        {
          end: 5,
          start: 0,
          text: 'Segment 1',
        },
        {
          end: 10,
          start: 5,
          text: 'Segment 2',
        },
        {
          end: 16,
          start: 10,
          text: 'Segment 3',
        },
        {
          end: 21,
          start: 16,
          text: 'Segment 4',
        },
      ],
      text: 'Segment 1 Segment 2 Segment 3 Segment 4',
    }),
  ).toMatchInlineSnapshot(`
    "WEBVTT

    1
    00:00:00.000 --> 00:00:05.000
    Segment 1

    2
    00:00:05.000 --> 00:00:10.000
    Segment 2

    3
    00:00:10.000 --> 00:00:16.000
    Segment 3

    4
    00:00:16.000 --> 00:00:21.000
    Segment 4
    "
  `);
});
