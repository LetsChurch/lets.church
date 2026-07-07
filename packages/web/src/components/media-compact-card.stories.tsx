import type { Meta, StoryObj } from '@storybook/react';

import { MediaCompactCard } from './media-compact-card';

const meta = {
  title: 'Components/MediaCompactCard',
  component: MediaCompactCard,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof MediaCompactCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <MediaCompactCard
        title="The Doctrines of Grace: TULIP Explained"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        timestamp="2 days ago"
        duration="45:23"
      />
      <MediaCompactCard
        title="Covenant Theology and the Promise of God"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        timestamp="1 week ago"
        duration="1:23:45"
      />
      <MediaCompactCard
        title="Union with Christ: Our Foundation"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
        channelImageUrl="https://picsum.photos/seed/6/100/100"
        timestamp="3 days ago"
        duration="32:15"
      />
      <MediaCompactCard
        title="The Sovereignty of God in Salvation"
        thumbnailUrl="https://picsum.photos/seed/7/640/360"
        channelName="City Church"
        channelImageUrl="https://picsum.photos/seed/8/100/100"
        timestamp="Yesterday"
        duration="28:50"
      />
      <MediaCompactCard
        title="Justification by Faith Alone"
        thumbnailUrl="https://picsum.photos/seed/9/640/360"
        channelName="Hope Church"
        channelImageUrl="https://picsum.photos/seed/lamb/100/100"
        timestamp="5 days ago"
        duration="41:20"
      />
      <MediaCompactCard
        title="The Heidelberg Catechism: Question 1"
        thumbnailUrl="https://picsum.photos/seed/11/640/360"
        channelName="Lighthouse Church"
        channelImageUrl="https://picsum.photos/seed/12/100/100"
        timestamp="1 month ago"
        duration="38:45"
      />
    </>
  ),
};

export const WithProgress: Story = {
  args: {
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <MediaCompactCard
        title="The Doctrines of Grace: TULIP Explained"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        timestamp="2 days ago"
        duration="45:23"
        progress={25}
      />
      <MediaCompactCard
        title="Covenant Theology and the Promise of God"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        timestamp="1 week ago"
        duration="1:23:45"
        progress={50}
      />
      <MediaCompactCard
        title="Union with Christ: Our Foundation"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
        channelImageUrl="https://picsum.photos/seed/6/100/100"
        timestamp="3 days ago"
        duration="32:15"
        progress={75}
      />
      <MediaCompactCard
        title="The Sovereignty of God in Salvation"
        thumbnailUrl="https://picsum.photos/seed/7/640/360"
        channelName="City Church"
        channelImageUrl="https://picsum.photos/seed/8/100/100"
        timestamp="Yesterday"
        duration="28:50"
        progress={90}
      />
    </>
  ),
};

export const WithoutThumbnail: Story = {
  args: {
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <MediaCompactCard
        title="The Doctrines of Grace: TULIP Explained"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        timestamp="2 days ago"
        duration="45:23"
      />
      <MediaCompactCard
        title="Covenant Theology and the Promise of God"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        timestamp="1 week ago"
        duration="1:23:45"
      />
      <MediaCompactCard
        title="Union with Christ: Our Foundation"
        channelName="Grace Chapel"
        channelImageUrl="https://picsum.photos/seed/6/100/100"
        timestamp="3 days ago"
        duration="32:15"
      />
    </>
  ),
};

export const LongTitles: Story = {
  args: {
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <MediaCompactCard
        title="The Doctrines of Grace: A Comprehensive Study of Reformed Soteriology and the Five Points of Calvinism"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        timestamp="2 days ago"
        duration="45:23"
      />
      <MediaCompactCard
        title="Covenant Theology Through the Ages: From Abraham to the New Covenant in Christ"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        timestamp="1 week ago"
        duration="1:23:45"
      />
      <MediaCompactCard
        title="The Westminster Confession of Faith: Chapter 3 on God's Eternal Decree"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
        channelImageUrl="https://picsum.photos/seed/6/100/100"
        timestamp="3 days ago"
        duration="32:15"
      />
    </>
  ),
};

export const Minimal: Story = {
  args: {
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <MediaCompactCard title="Total Depravity" channelName="Reformed Church" />
      <MediaCompactCard
        title="Unconditional Election"
        channelName="Grace Chapel"
      />
      <MediaCompactCard
        title="Limited Atonement"
        channelName="Covenant Church"
      />
    </>
  ),
};
