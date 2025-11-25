import type { Meta, StoryObj } from '@storybook/react';
import { SearchRow } from './search-row';

const meta = {
  title: 'Components/SearchRow',
  component: SearchRow,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-4">
        <div className="flex flex-col gap-4">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof SearchRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: '',
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <SearchRow
        id="1"
        title="The Doctrines of Grace: TULIP Explained"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        duration="45:23"
        timestamp="2 days ago"
      />
      <SearchRow
        id="2"
        title="Covenant Theology and the Promise of God"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        duration="1:23:45"
        timestamp="1 week ago"
      />
      <SearchRow
        id="3"
        title="Union with Christ: Our Foundation"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
        channelImageUrl="https://picsum.photos/seed/6/100/100"
        duration="32:15"
        timestamp="3 days ago"
      />
    </>
  ),
};

export const WithoutThumbnail: Story = {
  args: {
    id: '',
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <SearchRow
        id="4"
        title="The Doctrines of Grace: TULIP Explained"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        duration="45:23"
        timestamp="2 days ago"
      />
      <SearchRow
        id="5"
        title="Covenant Theology and the Promise of God"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        duration="1:23:45"
        timestamp="1 week ago"
      />
      <SearchRow
        id="6"
        title="Union with Christ: Our Foundation"
        channelName="Grace Chapel"
        channelImageUrl="https://picsum.photos/seed/6/100/100"
        duration="32:15"
        timestamp="3 days ago"
      />
    </>
  ),
};

export const WithTranscriptSegment: Story = {
  args: {
    id: '',
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <SearchRow
        id="7"
        title="The Doctrines of Grace: TULIP Explained"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        duration="45:23"
        timestamp="2 days ago"
        transcriptSegment={{
          start: 125,
          text: 'And so we see that <mark>total depravity</mark> is not about being as bad as we can be, but rather that sin has affected every part of our being.',
        }}
      />
      <SearchRow
        id="8"
        title="Covenant Theology and the Promise of God"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        duration="1:23:45"
        timestamp="1 week ago"
        transcriptSegment={{
          start: 542,
          text: "The <mark>covenant of grace</mark> shows us God's incredible love and faithfulness to His people throughout all of history.",
        }}
      />
      <SearchRow
        id="9"
        title="Union with Christ: Our Foundation"
        thumbnailUrl="https://picsum.photos/seed/5/640/360"
        channelName="Grace Chapel"
        channelImageUrl="https://picsum.photos/seed/6/100/100"
        duration="32:15"
        timestamp="3 days ago"
        transcriptSegment={{
          start: 890,
          text: 'Our <mark>union with Christ</mark> is the foundation for all the blessings we receive in salvation. Everything we have comes from being in Him.',
        }}
      />
    </>
  ),
};

export const WithoutThumbnailAndTranscript: Story = {
  args: {
    id: '',
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <SearchRow
        id="10"
        title="Sunday Morning Sermon on Grace"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        duration="45:23"
        timestamp="2 days ago"
        transcriptSegment={{
          start: 125,
          text: "Today we're going to talk about <mark>the grace of God</mark> and how it transforms our lives completely.",
        }}
      />
      <SearchRow
        id="11"
        title="Wednesday Night Bible Study"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        duration="1:23:45"
        timestamp="1 week ago"
        transcriptSegment={{
          start: 542,
          text: "As we study <mark>the book of Romans</mark>, we see Paul's masterful explanation of justification by faith.",
        }}
      />
    </>
  ),
};

export const LongTitle: Story = {
  args: {
    id: '',
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <SearchRow
        id="12"
        title="The Doctrines of Grace: A Comprehensive Study of Reformed Soteriology and the Five Points of Calvinism Explained in Detail"
        thumbnailUrl="https://picsum.photos/seed/1/640/360"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        duration="45:23"
        timestamp="2 days ago"
      />
      <SearchRow
        id="13"
        title="Covenant Theology Through the Ages: From Abraham to the New Covenant in Christ and the Fulfillment of All God's Promises"
        thumbnailUrl="https://picsum.photos/seed/3/640/360"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        duration="1:23:45"
        timestamp="1 week ago"
      />
    </>
  ),
};

export const Minimal: Story = {
  args: {
    id: '',
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <SearchRow
        id="14"
        title="Total Depravity"
        channelName="Reformed Church"
      />
      <SearchRow
        id="15"
        title="Unconditional Election"
        channelName="Grace Chapel"
      />
      <SearchRow
        id="16"
        title="Limited Atonement"
        channelName="Covenant Church"
      />
    </>
  ),
};

export const EmptyState: Story = {
  args: {
    id: '',
    title: '',
    channelName: '',
  },
  render: () => (
    <>
      <SearchRow
        id="17"
        title="Sunday Morning Sermon"
        channelName="First Baptist Church"
        channelImageUrl="https://picsum.photos/seed/2/100/100"
        duration="45:23"
        timestamp="2 days ago"
      />
      <SearchRow
        id="18"
        title="Wednesday Night Bible Study"
        channelName="Community Church"
        channelImageUrl="https://picsum.photos/seed/4/100/100"
        duration="1:23:45"
        timestamp="1 week ago"
      />
      <SearchRow
        id="19"
        title="Audio Devotional: Morning Prayer"
        channelName="Grace Chapel"
        channelImageUrl="https://picsum.photos/seed/6/100/100"
        duration="15:30"
        timestamp="Today"
      />
    </>
  ),
};
