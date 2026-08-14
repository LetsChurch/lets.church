import type { Meta, StoryObj } from '@storybook/react';
import { expect } from 'storybook/test';

import { StoryTRPCProvider } from '../../.storybook/trpc-fixture';
import { Player } from './player';

// A one-frame MPEG-TS segment in a blob-backed HLS playlist keeps media
// deterministic without contacting external streaming endpoints.
const mediaSegmentBase64 =
  'R0AREABC8CUAAcEAAP8B/wAB/IAUSBIBBkZGbXBlZwlTZXJ2aWNlMDF3fEPK//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9HQAAQAACwDQABwQAAAAHwACqxBLL//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////0dQABAAArASAAHBAADhAPAAG+EA8AAVvU1W////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////R0EAMGxQAAB7DH4A//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AAAHgAACAgAUhAAfYYQAAAAEJ8AAAAAFnZAAKrNlewEQAAAMABAAAAwDIPEiWWAAAAAFo6+PLIsAAAAFliIQAK//+9nN8CmttsYE=';
const mediaSegment = Uint8Array.from(atob(mediaSegmentBase64), (character) =>
  character.charCodeAt(0),
);
const mediaSegmentUrl = URL.createObjectURL(
  new Blob([mediaSegment], { type: 'video/mp2t' }),
);
const silentMediaSource = URL.createObjectURL(
  new Blob(
    [
      `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:1
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:0.04,
${mediaSegmentUrl}
#EXT-X-ENDLIST
`,
    ],
    { type: 'application/vnd.apple.mpegurl' },
  ),
);
const posterThumbnailUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="9" viewBox="0 0 16 9"%3E%3Crect width="16" height="9" fill="%2309090b"/%3E%3C/svg%3E';
const peaksJsonUrl = `data:application/json,${encodeURIComponent(
  JSON.stringify({
    data: Array.from({ length: 200 }, (_, index) =>
      Math.round(-64 + Math.sin(index / 8) * 48),
    ),
  }),
)}`;

const meta = {
  title: 'Components/Player',
  component: Player,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <StoryTRPCProvider responses={{ 'media.recordViewSeconds': undefined }}>
        <div className="bg-zinc-950 p-4">
          <Story />
        </div>
      </StoryTRPCProvider>
    ),
  ],
} satisfies Meta<typeof Player>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VideoPlayer: Story = {
  args: {
    uploadRecordId: 'test-upload-1',
    viewHash: 'test-hash-1',
    mediaSource: silentMediaSource,
    posterThumbnailUrl,
    videoWidth: 1920,
    videoHeight: 1080,
  },
  play: ({ canvasElement }) => {
    expect(canvasElement.querySelector('hls-video')).toBeInTheDocument();
    expect(canvasElement.querySelector('media-controller')).toBeInTheDocument();
  },
};

export const AudioPlayer: Story = {
  args: {
    uploadRecordId: 'test-upload-2',
    viewHash: 'test-hash-2',
    audioSource: silentMediaSource,
    videoWidth: 1920,
    videoHeight: 1080,
    lengthSeconds: 3600,
  },
};

export const AudioPlayerWithWaveform: Story = {
  args: {
    uploadRecordId: 'test-upload-3',
    viewHash: 'test-hash-3',
    audioSource: silentMediaSource,
    peaksJsonUrl,
    videoWidth: 1920,
    videoHeight: 1080,
    lengthSeconds: 3600,
  },
};

export const VideoAndAudioSources: Story = {
  args: {
    uploadRecordId: 'test-upload-4',
    viewHash: 'test-hash-4',
    mediaSource: silentMediaSource,
    audioSource: silentMediaSource,
    posterThumbnailUrl,
    videoWidth: 1920,
    videoHeight: 1080,
    lengthSeconds: 3600,
    peaksJsonUrl,
  },
};

export const NoMediaAvailable: Story = {
  args: {
    uploadRecordId: 'test-upload-5',
    viewHash: 'test-hash-5',
    mediaSource: null,
    audioSource: null,
    videoWidth: 1920,
    videoHeight: 1080,
  },
};

export const PortraitVideo: Story = {
  args: {
    uploadRecordId: 'test-upload-6',
    viewHash: 'test-hash-6',
    mediaSource: silentMediaSource,
    posterThumbnailUrl,
    videoWidth: 1080,
    videoHeight: 1920,
  },
};

export const SquareVideo: Story = {
  args: {
    uploadRecordId: 'test-upload-7',
    viewHash: 'test-hash-7',
    mediaSource: silentMediaSource,
    posterThumbnailUrl,
    videoWidth: 1080,
    videoHeight: 1080,
  },
};
