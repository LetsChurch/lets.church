import { expect, test, describe } from 'vitest';
import {
  stitchTranscript,
  readWhisperJsonFile,
  whisperJsonToVtt,
  stitchToHtml,
} from './whisper';

describe('stitchTranscript', () => {
  test('empty transcript', () => {
    expect(stitchTranscript({ text: '', segments: [], language: 'English' }))
      .toMatchInlineSnapshot(`
        {
          "segments": [],
          "text": "",
        }
      `);
  });

  test('single-segment transcript', async () => {
    const data = await readWhisperJsonFile(
      decodeURIComponent(
        new URL('./__fixtures__/thankyou.json', import.meta.url).pathname,
      ),
    );

    expect(stitchTranscript(data)).toMatchSnapshot();
  });

  test('02 - Introduction.json', async () => {
    const data = await readWhisperJsonFile(
      decodeURIComponent(
        new URL('./__fixtures__/02 - Introduction.json', import.meta.url)
          .pathname,
      ),
    );

    expect(stitchTranscript(data)).toMatchSnapshot();
  });
});

describe('whisperJsonToVtt', () => {
  test('empty transcript', () => {
    expect(whisperJsonToVtt({ text: '', segments: [] })).toMatchInlineSnapshot(
      '"WEBVTT"',
    );
  });

  test('segments', () => {
    expect(
      whisperJsonToVtt({
        segments: [
          {
            end: 5,
            start: 0,
            text: 'Segment 1',
            words: [],
          },
          {
            end: 10,
            start: 5,
            text: 'Segment 2',
            words: [],
          },
          {
            end: 16,
            start: 10,
            text: 'Segment 3',
            words: [],
          },
          {
            end: 21,
            start: 16,
            text: 'Segment 4',
            words: [],
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
});

describe('stitchToHtml', () => {
  test('empty transcript', () => {
    expect(
      stitchToHtml({ text: '', segments: [], language: 'English' }),
    ).toMatchInlineSnapshot('""');
  });

  test('single-segment transcript', async () => {
    const data = await readWhisperJsonFile(
      decodeURIComponent(
        new URL('./__fixtures__/thankyou.json', import.meta.url).pathname,
      ),
    );

    expect(stitchToHtml(data)).toMatchSnapshot();
  });

  test('02 - Introduction.json', async () => {
    const data = await readWhisperJsonFile(
      decodeURIComponent(
        new URL('./__fixtures__/02 - Introduction.json', import.meta.url)
          .pathname,
      ),
    );

    expect(stitchToHtml(data)).toMatchSnapshot();
  });
});
