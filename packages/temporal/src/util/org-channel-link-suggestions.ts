// Kept free of email/worker-only imports: the web app imports this module
// directly, and anything it pulls in (e.g. nodemailer) must then ship in web's
// server bundle.
import { db } from '@letschurch/db';
import { sql } from 'drizzle-orm';

/**
 * Evidence that an organization and a channel belong together.
 *
 * - `sharedMember`: a non-site-admin user belongs to both (site admins are
 *   members of nearly every imported channel, so they are ignored).
 * - `slug`: slugs match ignoring case and punctuation.
 * - `website`: website URLs share a host (social/hosting hosts excluded).
 * - `mention`: the channel's name or description contains the org's full name.
 *
 * The first three are strong signals. `mention` alone is weak: generic church
 * names ("Grace Baptist Church") show up inside unrelated channel names.
 */
export type LinkSuggestionSignalKind =
  | 'sharedMember'
  | 'slug'
  | 'website'
  | 'mention';

export type LinkSuggestionSignal = {
  kind: LinkSuggestionSignalKind;
  detail: string | null;
};

export type OrganizationChannelLinkSuggestionRow = {
  organization: { id: string; name: string; slug: string };
  channel: { id: string; name: string; slug: string; uploadCount: number };
  signals: LinkSuggestionSignal[];
  confidence: 'strong' | 'weak';
  notifiedAt: Date | null;
};

// Hosts shared by unrelated churches, so a match on them proves nothing.
const SHARED_HOSTS = [
  'facebook.com',
  'm.facebook.com',
  'youtube.com',
  'm.youtube.com',
  'youtu.be',
  'instagram.com',
  'x.com',
  'twitter.com',
  'linktr.ee',
  'sermonaudio.com',
  'subsplash.com',
  'sites.google.com',
  'google.com',
  'wixsite.com',
  'squarespace.com',
  'tithe.ly',
  'churchcenter.com',
  'lets.church',
];

const STRONG_SIGNALS: ReadonlySet<LinkSuggestionSignalKind> = new Set([
  'sharedMember',
  'slug',
  'website',
]);

type RawRow = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  channel_id: string;
  channel_name: string;
  channel_slug: string;
  upload_count: number | string;
  signals: LinkSuggestionSignal[];
  notified_at: Date | string | null;
};

/**
 * Unlinked organization/channel pairs that look like they belong together,
 * excluding pairs an admin dismissed. Only public, approved, non-deleted
 * channels are suggested, matching what a church admin may link.
 *
 * The whole cross product is scored in one query; with a few hundred orgs and
 * channels that is cheap enough to run on every page load.
 */
export async function findOrganizationChannelLinkSuggestions(): Promise<
  OrganizationChannelLinkSuggestionRow[]
> {
  const sharedHosts = sql.join(
    SHARED_HOSTS.map((host) => sql`${host}`),
    sql`, `,
  );

  const result = await db.execute<RawRow>(sql`
    with eligible_channel as (
      select c.id, c.name, c.slug, c.description, c.website_url
      from channel c
      where c.deleted_at is null
        and c.visibility = 'PUBLIC'
        and c.approved_at is not null
    ),
    signal as (
      select om.organization_id, cm.channel_id, 'sharedMember' as kind,
        u.username as detail
      from organization_membership om
      join channel_membership cm on cm.app_user_id = om.app_user_id
      join eligible_channel c on c.id = cm.channel_id
      join app_user u on u.id = om.app_user_id
      where u.role <> 'ADMIN'

      union all

      select o.id, c.id, 'slug', null
      from organization o
      join eligible_channel c
        on lower(regexp_replace(o.slug, '[^a-zA-Z0-9]', '', 'g'))
         = lower(regexp_replace(c.slug, '[^a-zA-Z0-9]', '', 'g'))

      union all

      select o.id, c.id, 'website', oh.host
      from organization o
      cross join lateral (
        select lower(substring(o.website_url
          from '^(?:[a-zA-Z]+://)?(?:www\\.)?([^/:?#]+)')) as host
      ) oh
      join eligible_channel c
        on lower(substring(c.website_url
          from '^(?:[a-zA-Z]+://)?(?:www\\.)?([^/:?#]+)')) = oh.host
      where oh.host is not null and oh.host not in (${sharedHosts})

      union all

      select o.id, c.id, 'mention', null
      from organization o
      cross join lateral (
        select ' ' || trim(regexp_replace(lower(o.name), '[^a-z0-9]+', ' ', 'g'))
          || ' ' as needle
      ) n
      join eligible_channel c
        on position(n.needle in ' ' || regexp_replace(
          lower(c.name || ' ' || coalesce(c.description, '')),
          '[^a-z0-9]+', ' ', 'g') || ' ') > 0
      where length(n.needle) >= 8
    ),
    candidate as (
      select s.organization_id, s.channel_id,
        jsonb_agg(distinct jsonb_build_object('kind', s.kind, 'detail', s.detail))
          as signals
      from signal s
      where not exists (
        select 1 from organization_channel_association a
        where a.organization_id = s.organization_id
          and a.channel_id = s.channel_id
      )
      group by s.organization_id, s.channel_id
    )
    select
      o.id as organization_id, o.name as organization_name,
      o.slug as organization_slug,
      c.id as channel_id, c.name as channel_name, c.slug as channel_slug,
      (select count(*) from upload_record r where r.channel_id = c.id)
        as upload_count,
      cand.signals,
      ls.notified_at
    from candidate cand
    join organization o on o.id = cand.organization_id
    join channel c on c.id = cand.channel_id
    left join organization_channel_link_suggestion ls
      on ls.organization_id = cand.organization_id
     and ls.channel_id = cand.channel_id
    where ls.dismissed_at is null
  `);

  return result.rows
    .map((row): OrganizationChannelLinkSuggestionRow => ({
      organization: {
        id: row.organization_id,
        name: row.organization_name,
        slug: row.organization_slug,
      },
      channel: {
        id: row.channel_id,
        name: row.channel_name,
        slug: row.channel_slug,
        uploadCount: Number(row.upload_count),
      },
      signals: row.signals,
      confidence: row.signals.some((s) => STRONG_SIGNALS.has(s.kind))
        ? 'strong'
        : 'weak',
      notifiedAt: row.notified_at ? new Date(row.notified_at) : null,
    }))
    .sort(
      (a, b) =>
        Number(b.confidence === 'strong') - Number(a.confidence === 'strong') ||
        b.signals.length - a.signals.length ||
        b.channel.uploadCount - a.channel.uploadCount ||
        a.organization.name.localeCompare(b.organization.name),
    );
}

const SIGNAL_LABELS: Record<LinkSuggestionSignalKind, string> = {
  sharedMember: 'shared member',
  slug: 'same slug',
  website: 'same website',
  mention: 'name mentioned',
};

export function describeSignal(signal: LinkSuggestionSignal): string {
  const label = SIGNAL_LABELS[signal.kind];
  return signal.detail ? `${label} (${signal.detail})` : label;
}
