import type { Meta, StoryObj } from '@storybook/react';

import { Player } from './player';

const meta = {
  title: 'Components/Player',
  component: Player,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="bg-zinc-950 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Player>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VideoPlayer: Story = {
  args: {
    uploadRecordId: 'test-upload-1',
    viewHash: 'test-hash-1',
    mediaSource: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    posterThumbnailUrl:
      'https://image.mux.com/x36xhzz/thumbnail.jpg?width=1920&height=1080&fit_mode=smartcrop&time=1',
    videoWidth: 1920,
    videoHeight: 1080,
  },
};

export const AudioPlayer: Story = {
  args: {
    uploadRecordId: 'test-upload-2',
    viewHash: 'test-hash-2',
    audioSource: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    videoWidth: 1920,
    videoHeight: 1080,
    lengthSeconds: 3600,
  },
};

export const AudioPlayerWithWaveform: Story = {
  args: {
    uploadRecordId: 'test-upload-3',
    viewHash: 'test-hash-3',
    audioSource: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    peaksJsonUrl: 'https://example.com/peaks.json',
    videoWidth: 1920,
    videoHeight: 1080,
    lengthSeconds: 3600,
  },
};

export const VideoAndAudioSources: Story = {
  args: {
    uploadRecordId: 'test-upload-4',
    viewHash: 'test-hash-4',
    mediaSource: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    audioSource: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    posterThumbnailUrl:
      'https://image.mux.com/x36xhzz/thumbnail.jpg?width=1920&height=1080&fit_mode=smartcrop&time=1',
    videoWidth: 1920,
    videoHeight: 1080,
    lengthSeconds: 3600,
    peaksJsonUrl: 'https://example.com/peaks.json',
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
    mediaSource: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    posterThumbnailUrl:
      'https://image.mux.com/x36xhzz/thumbnail.jpg?width=1080&height=1920&fit_mode=smartcrop&time=1',
    videoWidth: 1080,
    videoHeight: 1920,
  },
};

export const SquareVideo: Story = {
  args: {
    uploadRecordId: 'test-upload-7',
    viewHash: 'test-hash-7',
    mediaSource: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    posterThumbnailUrl:
      'https://image.mux.com/x36xhzz/thumbnail.jpg?width=1080&height=1080&fit_mode=smartcrop&time=1',
    videoWidth: 1080,
    videoHeight: 1080,
  },
};
