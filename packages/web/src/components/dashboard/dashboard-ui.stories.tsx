import type { Meta, StoryObj } from '@storybook/react';
import {
  IconBuildingChurch,
  IconPlus,
  IconRadio,
  IconUsers,
} from '@tabler/icons-react';

import { Badge, Button } from '@/components/ui';

import {
  DashboardLinkCard,
  DashboardPageHeader,
  DashboardPanel,
  DashboardSection,
} from './dashboard-ui';

const meta = {
  title: 'Dashboard/Design language',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="bg-dashboard-canvas min-h-screen p-5 sm:p-8">
        <div className="w-full">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PageComposition: Story = {
  render: () => (
    <>
      <DashboardPageHeader
        eyebrow="Channels"
        title="Media dashboard"
        description="Publish and maintain the church media archive."
        actions={
          <>
            <Button variant="outline">Export</Button>
            <Button leftSection={<IconPlus size={16} />}>Create channel</Button>
          </>
        }
        meta={
          <>
            <Badge color="green">All systems ready</Badge>
            <Badge color="gray">Updated 2 minutes ago</Badge>
          </>
        }
      />

      <DashboardSection
        title="Dashboard areas"
        description="Cards identify destinations. Buttons remain reserved for actions."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <DashboardLinkCard
            to="/dashboard/channels"
            title="Channels"
            description="Publish sermons, livestreams, and teaching series."
            icon={<IconRadio size={18} />}
            badge={<Badge color="blue">12</Badge>}
          />
          <DashboardLinkCard
            to="/dashboard/churches"
            title="Churches"
            description="Maintain public ministry profiles and associations."
            icon={<IconBuildingChurch size={18} />}
            badge={<Badge color="yellow">3 pending</Badge>}
          />
          <DashboardLinkCard
            to="/dashboard/admin/users"
            title="People"
            description="Review access, participation, and account status."
            icon={<IconUsers size={18} />}
          />
        </div>
      </DashboardSection>

      <DashboardSection title="Panel treatment">
        <DashboardPanel>
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              ['Archive health', '99.98%'],
              ['Media awaiting review', '14'],
              ['Active publishers', '238'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border-dashboard-rule first:border-brand border-l pl-4"
              >
                <div className="text-secondary font-mono text-[0.68rem] tracking-[0.12em] uppercase">
                  {label}
                </div>
                <div className="text-dashboard-ink mt-1 text-2xl font-semibold tracking-tight">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </DashboardPanel>
      </DashboardSection>
    </>
  ),
};

export const SurfaceStates: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <DashboardPanel>
        <div className="text-dashboard-ink font-semibold">Standard panel</div>
        <p className="text-secondary mt-1 text-sm">
          Forms and read-only details sit on the same ruled paper surface.
        </p>
      </DashboardPanel>
      <DashboardLinkCard
        to="/dashboard/admin"
        title="Interactive destination"
        description="A restrained lift and indigo rule communicate navigation."
        icon={<IconRadio size={18} />}
      />
    </div>
  ),
};
