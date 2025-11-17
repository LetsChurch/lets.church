import { Accordion, List, Modal, Stack, Text, Title } from '@mantine/core';

type HelpModalProps = {
  opened: boolean;
  onClose: () => void;
};

export function HelpModal({ opened, onClose }: HelpModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Dashboard Help</Title>}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Accordion variant="separated" defaultValue="channels">
          <Accordion.Item value="channels">
            <Accordion.Control>
              <Text fw={500}>What is a Channel?</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  A Channel is a collection of media content (videos and audio)
                  that you create and manage. Think of it like a YouTube channel
                  or podcast feed.
                </Text>
                <Text size="sm" fw={500}>
                  Use Channels for:
                </Text>
                <List size="sm" spacing="xs">
                  <List.Item>
                    Uploading and organizing your media content
                  </List.Item>
                  <List.Item>Creating playlists and sermon series</List.Item>
                  <List.Item>
                    Managing who can upload and edit content
                  </List.Item>
                  <List.Item>Building an audience with subscribers</List.Item>
                </List>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="churches">
            <Accordion.Control>
              <Text fw={500}>What is a Church?</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  A Church profile represents your local congregation on Let's
                  Church. It includes information about your church and connects
                  to your church's channels.
                </Text>
                <Text size="sm" fw={500}>
                  Use Church profiles for:
                </Text>
                <List size="sm" spacing="xs">
                  <List.Item>
                    Showcasing your church's information and leadership
                  </List.Item>
                  <List.Item>
                    Connecting multiple channels (sermons, worship, youth, etc.)
                  </List.Item>
                  <List.Item>Managing church staff and volunteers</List.Item>
                  <List.Item>
                    Helping people find and connect with your congregation
                  </List.Item>
                </List>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="organizations">
            <Accordion.Control>
              <Text fw={500}>What is an Organization?</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
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
                  <List.Item>Sharing ministry content and resources</List.Item>
                </List>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="roles">
            <Accordion.Control>
              <Text fw={500}>Understanding Roles and Permissions</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
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
                <Text size="sm" fw={500} mt="sm">
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
                    - Church pastors, elders, and ministry leadership (distinct
                    from profile admins)
                  </List.Item>
                </List>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="visibility">
            <Accordion.Control>
              <Text fw={500}>Media Visibility Settings</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
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
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Modal>
  );
}
