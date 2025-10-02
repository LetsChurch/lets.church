import type { Meta, StoryObj } from '@storybook/react';
import { MediaCard } from './media-card';

const meta = {
  title: 'Components/MediaCard',
  component: MediaCard,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof MediaCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <>
      <MediaCard
        title="The Doctrines of Grace: TULIP Explained"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelAvatarUrl="https://picsum.photos/seed/2/100/100"
      />
      <MediaCard
        title="Covenant Theology and the Promise of God"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelAvatarUrl="https://picsum.photos/seed/4/100/100"
      />
      <MediaCard
        title="Union with Christ: Our Foundation"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
        channelAvatarUrl="https://picsum.photos/seed/6/100/100"
      />
      <MediaCard
        title="The Sovereignty of God in Salvation"
        thumbnailUrl="https://picsum.photos/seed/7/640/360"
        channelName="City Church"
        channelAvatarUrl="https://picsum.photos/seed/8/100/100"
      />
      <MediaCard
        title="Justification by Faith Alone"
        thumbnailUrl="https://picsum.photos/seed/9/640/360"
        channelName="Hope Church"
        channelAvatarUrl="https://picsum.photos/seed/lamb/100/100"
      />
      <MediaCard
        title="The Heidelberg Catechism: Question 1"
        thumbnailUrl="https://picsum.photos/seed/11/640/360"
        channelName="Lighthouse Church"
        channelAvatarUrl="https://picsum.photos/seed/12/100/100"
      />
      <MediaCard
        title="Christ's Active and Passive Obedience"
        thumbnailUrl="https://picsum.photos/seed/13/640/360"
        channelName="New Life Church"
        channelAvatarUrl="https://picsum.photos/seed/14/100/100"
      />
      <MediaCard
        title="The Perseverance of the Saints"
        thumbnailUrl="https://picsum.photos/seed/15/640/360"
        channelName="Cornerstone Church"
        channelAvatarUrl="https://picsum.photos/seed/16/100/100"
      />
    </>
  ),
};

export const WithoutThumbnail: Story = {
  render: () => (
    <>
      <MediaCard
        title="The Doctrines of Grace: TULIP Explained"
        channelName="First Baptist Church"
        channelAvatarUrl="https://picsum.photos/seed/2/100/100"
      />
      <MediaCard
        title="Covenant Theology and the Promise of God"
        channelName="Community Church"
        channelAvatarUrl="https://picsum.photos/seed/4/100/100"
      />
      <MediaCard
        title="Union with Christ: Our Foundation"
        channelName="Grace Chapel"
        channelAvatarUrl="https://picsum.photos/seed/6/100/100"
      />
      <MediaCard
        title="The Sovereignty of God in Salvation"
        channelName="City Church"
        channelAvatarUrl="https://picsum.photos/seed/8/100/100"
      />
    </>
  ),
};

export const WithoutAvatar: Story = {
  render: () => (
    <>
      <MediaCard
        title="The Doctrines of Grace: TULIP Explained"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
      />
      <MediaCard
        title="Covenant Theology and the Promise of God"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
      />
      <MediaCard
        title="Union with Christ: Our Foundation"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
      />
      <MediaCard
        title="The Sovereignty of God in Salvation"
        thumbnailUrl="https://picsum.photos/seed/7/640/360"
        channelName="City Church"
      />
    </>
  ),
};

export const LongTitle: Story = {
  render: () => (
    <>
      <MediaCard
        title="The Doctrines of Grace: A Comprehensive Study of Reformed Soteriology and the Five Points of Calvinism"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelAvatarUrl="https://picsum.photos/seed/2/100/100"
      />
      <MediaCard
        title="Covenant Theology Through the Ages: From Abraham to the New Covenant in Christ"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelAvatarUrl="https://picsum.photos/seed/4/100/100"
      />
      <MediaCard
        title="The Westminster Confession of Faith: Chapter 3 on God's Eternal Decree"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
        channelAvatarUrl="https://picsum.photos/seed/6/100/100"
      />
      <MediaCard
        title="Particular Redemption: Christ's Definite Atonement for the Elect Explained"
        thumbnailUrl="https://picsum.photos/seed/7/640/360"
        channelName="City Church"
        channelAvatarUrl="https://picsum.photos/seed/8/100/100"
      />
    </>
  ),
};

export const WithProgress: Story = {
  render: () => (
    <>
      <MediaCard
        title="The Doctrines of Grace: TULIP Explained"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelAvatarUrl="https://picsum.photos/seed/2/100/100"
        duration="45:23"
        timestamp="2 days ago"
        progress={33}
      />
      <MediaCard
        title="Covenant Theology and the Promise of God"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelAvatarUrl="https://picsum.photos/seed/4/100/100"
        duration="1:23:45"
        timestamp="1 week ago"
        progress={50}
      />
      <MediaCard
        title="Union with Christ: Our Foundation"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
        channelAvatarUrl="https://picsum.photos/seed/6/100/100"
        duration="32:15"
        timestamp="3 days ago"
        progress={67}
      />
      <MediaCard
        title="The Sovereignty of God in Salvation"
        thumbnailUrl="https://picsum.photos/seed/7/640/360"
        channelName="City Church"
        channelAvatarUrl="https://picsum.photos/seed/8/100/100"
        duration="28:50"
        timestamp="Yesterday"
        progress={85}
      />
      <MediaCard
        title="Justification by Faith Alone"
        thumbnailUrl="https://picsum.photos/seed/9/640/360"
        channelName="Hope Church"
        channelAvatarUrl="https://picsum.photos/seed/lamb/100/100"
        duration="41:20"
        timestamp="5 days ago"
        progress={15}
      />
      <MediaCard
        title="The Heidelberg Catechism: Question 1"
        thumbnailUrl="https://picsum.photos/seed/11/640/360"
        channelName="Lighthouse Church"
        channelAvatarUrl="https://picsum.photos/seed/12/100/100"
        duration="38:45"
        timestamp="1 month ago"
        progress={95}
      />
    </>
  ),
};

export const Minimal: Story = {
  render: () => (
    <>
      <MediaCard title="Total Depravity" channelName="Reformed Church" />
      <MediaCard title="Unconditional Election" channelName="Grace Chapel" />
      <MediaCard title="Limited Atonement" channelName="Covenant Church" />
      <MediaCard title="Irresistible Grace" channelName="Trinity Church" />
    </>
  ),
};
