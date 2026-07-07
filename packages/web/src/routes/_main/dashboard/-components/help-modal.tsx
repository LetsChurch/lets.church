import { Accordion } from '@base-ui/react/accordion';
import { IconChevronDown } from '@tabler/icons-react';

import { LcModal, ModalHeader } from '@/components/lc-modal';
import { List, Text } from '@/components/ui';

type HelpModalProps = {
  opened: boolean;
  onClose: () => void;
};

export function HelpModal({ opened, onClose }: HelpModalProps) {
  return (
    <LcModal.Root
      open={opened}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <LcModal.Portal>
        <LcModal.Backdrop />
        <LcModal.Popup size="lg" className="max-h-[85vh] overflow-y-auto">
          <ModalHeader title="Dashboard Help" />
          <div className="flex flex-col gap-4">
            <Accordion.Root
              defaultValue={['channels']}
              className="flex flex-col gap-3"
            >
              <Accordion.Item
                value="channels"
                className="border-fancy-pants rounded-lg"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between px-4 py-3 text-left">
                    <Text fw={500}>What is a Channel?</Text>
                    <IconChevronDown
                      size={16}
                      className="text-secondary transition-transform group-data-[panel-open]:rotate-180"
                    />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="px-4 pb-3">
                  <div className="flex flex-col gap-3">
                    <Text size="sm">
                      A Channel is a collection of media content (videos and
                      audio) that you create and manage. Think of it like a
                      YouTube channel or podcast feed.
                    </Text>
                    <Text size="sm" fw={500}>
                      Use Channels for:
                    </Text>
                    <List size="sm" spacing="xs">
                      <List.Item>
                        Uploading and organizing your media content
                      </List.Item>
                      <List.Item>
                        Creating playlists and sermon series
                      </List.Item>
                      <List.Item>
                        Managing who can upload and edit content
                      </List.Item>
                      <List.Item>
                        Building an audience with subscribers
                      </List.Item>
                    </List>
                  </div>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item
                value="churches"
                className="border-fancy-pants rounded-lg"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between px-4 py-3 text-left">
                    <Text fw={500}>What is a Church?</Text>
                    <IconChevronDown
                      size={16}
                      className="text-secondary transition-transform group-data-[panel-open]:rotate-180"
                    />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="px-4 pb-3">
                  <div className="flex flex-col gap-3">
                    <Text size="sm">
                      A Church profile represents your local congregation on
                      Let's Church. It includes information about your church
                      and connects to your church's channels.
                    </Text>
                    <Text size="sm" fw={500}>
                      Use Church profiles for:
                    </Text>
                    <List size="sm" spacing="xs">
                      <List.Item>
                        Showcasing your church's information and leadership
                      </List.Item>
                      <List.Item>
                        Connecting multiple channels (sermons, worship, youth,
                        etc.)
                      </List.Item>
                      <List.Item>
                        Managing church staff and volunteers
                      </List.Item>
                      <List.Item>
                        Helping people find and connect with your congregation
                      </List.Item>
                    </List>
                  </div>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item
                value="organizations"
                className="border-fancy-pants rounded-lg"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between px-4 py-3 text-left">
                    <Text fw={500}>What is an Organization?</Text>
                    <IconChevronDown
                      size={16}
                      className="text-secondary transition-transform group-data-[panel-open]:rotate-180"
                    />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="px-4 pb-3">
                  <div className="flex flex-col gap-3">
                    <Text size="sm">
                      An Organization represents a ministry or parachurch
                      organization. This could be a mission agency, ministry
                      network, or other Christian organization.
                    </Text>
                    <Text size="sm" fw={500}>
                      Use Organizations for:
                    </Text>
                    <List size="sm" spacing="xs">
                      <List.Item>
                        Representing ministries that aren't local churches
                      </List.Item>
                      <List.Item>Managing organizational channels</List.Item>
                      <List.Item>Connecting with partner churches</List.Item>
                      <List.Item>
                        Sharing ministry content and resources
                      </List.Item>
                    </List>
                  </div>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item
                value="roles"
                className="border-fancy-pants rounded-lg"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between px-4 py-3 text-left">
                    <Text fw={500}>Understanding Roles and Permissions</Text>
                    <IconChevronDown
                      size={16}
                      className="text-secondary transition-transform group-data-[panel-open]:rotate-180"
                    />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="px-4 pb-3">
                  <div className="flex flex-col gap-3">
                    <Text size="sm" fw={500}>
                      Channels & Organizations:
                    </Text>
                    <List size="sm" spacing="xs">
                      <List.Item>
                        <Text span fw={500}>
                          Admin
                        </Text>{' '}
                        - Can manage settings, members, and all content
                      </List.Item>
                      <List.Item>
                        <Text span fw={500}>
                          Member
                        </Text>{' '}
                        - Can upload and edit content (permissions vary)
                      </List.Item>
                      <List.Item>
                        <Text span fw={500}>
                          Subscriber
                        </Text>{' '}
                        - Follows the channel for updates (channels only)
                      </List.Item>
                    </List>
                    <Text size="sm" fw={500} className="mt-3">
                      Churches:
                    </Text>
                    <List size="sm" spacing="xs">
                      <List.Item>
                        <Text span fw={500}>
                          Admin
                        </Text>{' '}
                        - Can edit the church profile and manage settings
                      </List.Item>
                      <List.Item>
                        <Text span fw={500}>
                          User
                        </Text>{' '}
                        - Can view the church profile
                      </List.Item>
                      <List.Item>
                        <Text span fw={500}>
                          Leaders
                        </Text>{' '}
                        - Church pastors, elders, and ministry leadership
                        (distinct from profile admins)
                      </List.Item>
                    </List>
                  </div>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item
                value="visibility"
                className="border-fancy-pants rounded-lg"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between px-4 py-3 text-left">
                    <Text fw={500}>Media Visibility Settings</Text>
                    <IconChevronDown
                      size={16}
                      className="text-secondary transition-transform group-data-[panel-open]:rotate-180"
                    />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="px-4 pb-3">
                  <div className="flex flex-col gap-3">
                    <List size="sm" spacing="xs">
                      <List.Item>
                        <Text span fw={500}>
                          Public
                        </Text>{' '}
                        - Visible to everyone and appears in search results
                      </List.Item>
                      <List.Item>
                        <Text span fw={500}>
                          Unlisted
                        </Text>{' '}
                        - Only visible to people with the link, won't appear in
                        searches
                      </List.Item>
                      <List.Item>
                        <Text span fw={500}>
                          Private
                        </Text>{' '}
                        - Only visible to you and channel members
                      </List.Item>
                    </List>
                  </div>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion.Root>
          </div>
        </LcModal.Popup>
      </LcModal.Portal>
    </LcModal.Root>
  );
}
