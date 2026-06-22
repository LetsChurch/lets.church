import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon, PageShell } from '@/components/chrome';

export const Route = createFileRoute('/listen')({
  component: Listen,
});

function Listen() {
  return (
    <PageShell>
      <ComingSoon
        eyebrow="Listen"
        title="Audio & sermons"
        blurb="Read-aloud audio for any chapter plus sermons from the lets.church catalog, connected directly to the passages they teach."
      />
    </PageShell>
  );
}
