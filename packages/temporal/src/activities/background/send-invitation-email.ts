import {
  AppUser,
  AppUserEmail,
  Channel,
  ChannelInvitation,
  db,
  Organization,
  OrganizationInvitation,
} from '@letschurch/db';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';
import { client } from '../../client';
import { BACKGROUND_QUEUE } from '../../queues';
import { emailHtml, sanitizeForHtml } from '../../util/email';
import logger from '../../util/logger';
import { uuidTranslator } from '../../util/uuid';
import { sendEmailWorkflow } from '../../workflows/background/send-email';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/send-invitation-email',
  temporalActivity: 'sendInvitationEmail',
});

export function validateSendInvitationEmailConfig() {
  z.object({ WEB_URL: z.string() }).parse(process.env);
}

function getWebUrl(): string {
  const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);
  return WEB_URL;
}

export type InvitationEmailArgs = {
  invitationId: string;
  type: 'organization' | 'channel';
};

export default async function sendInvitationEmailActivity(
  args: InvitationEmailArgs,
) {
  const { invitationId, type } = args;

  moduleLogger.info(
    `Sending invitation email for ${type} invitation ${invitationId}`,
  );

  if (type === 'organization') {
    const invitation = await db
      .select()
      .from(OrganizationInvitation)
      .where(eq(OrganizationInvitation.id, invitationId))
      .then((r) => r[0]);

    invariant(invitation, `Organization invitation ${invitationId} not found`);

    const organization = await db
      .select({ name: Organization.name, type: Organization.type })
      .from(Organization)
      .where(eq(Organization.id, invitation.organizationId))
      .then((r) => r[0]);

    invariant(
      organization,
      `Organization not found for invitation ${invitationId}`,
    );

    const invitedBy = invitation.invitedById
      ? await db
          .select({ username: AppUser.username, fullName: AppUser.fullName })
          .from(AppUser)
          .where(eq(AppUser.id, invitation.invitedById))
          .then((r) => r[0] ?? null)
      : null;

    const inviterName =
      invitedBy?.fullName || invitedBy?.username || 'An administrator';
    const orgTypeName =
      organization.type === 'CHURCH' ? 'church' : 'organization';
    const roleName = invitation.isAdmin
      ? 'Admin'
      : invitation.canEdit
        ? 'Editor'
        : 'Member';

    // Check if user exists with this email
    const existingUserEmail = await db
      .select({ id: AppUserEmail.appUserId })
      .from(AppUserEmail)
      .where(eq(AppUserEmail.email, invitation.email))
      .then((r) => r[0] ?? null);

    const existingUser = existingUserEmail
      ? await db
          .select({ id: AppUser.id, username: AppUser.username })
          .from(AppUser)
          .where(eq(AppUser.id, existingUserEmail.id))
          .then((r) => r[0] ?? null)
      : null;

    const acceptUrl = `${getWebUrl()}/dashboard/invitations/accept?token=${uuidTranslator.fromUUID(invitation.token)}`;
    const declineUrl = `${getWebUrl()}/dashboard/invitations/accept?token=${uuidTranslator.fromUUID(invitation.token)}`;

    const subject = `You've been invited to ${organization.name} on Let's Church`;

    let text: string;
    let htmlBody: string;

    if (existingUser) {
      // Email for existing user
      text = stripIndent`
        ${inviterName} has invited you to join ${organization.name} as a ${roleName}.

        To accept this invitation, visit: ${acceptUrl}

        To decline, visit: ${declineUrl}

        This invitation expires in 7 days.
      `;

      htmlBody = stripIndent`
        <p><b>${sanitizeForHtml(inviterName)}</b> has invited you to join <b>${sanitizeForHtml(organization.name)}</b> as a <b>${sanitizeForHtml(roleName)}</b>.</p>

        <p>
          <a href="${acceptUrl}" style="display: inline-block; padding: 10px 20px; background-color: #228be6; color: white; text-decoration: none; border-radius: 4px; margin-right: 10px;">Accept Invitation</a>
          <a href="${declineUrl}" style="display: inline-block; padding: 10px 20px; background-color: #868e96; color: white; text-decoration: none; border-radius: 4px;">Decline</a>
        </p>

        <p style="color: #868e96; font-size: 14px;">This invitation expires in 7 days.</p>
      `;
    } else {
      // Email for new user
      const registerUrl = `${getWebUrl()}/auth/register?email=${encodeURIComponent(invitation.email)}`;

      text = stripIndent`
        ${inviterName} has invited you to join ${organization.name} as a ${roleName} on Let's Church.

        You'll need to create a Let's Church account with this email address first.

        Create an account: ${registerUrl}

        After registering and verifying your email, you can accept the invitation at: ${acceptUrl}

        This invitation expires in 7 days.
      `;

      htmlBody = stripIndent`
        <p><b>${sanitizeForHtml(inviterName)}</b> has invited you to join <b>${sanitizeForHtml(organization.name)}</b> as a <b>${sanitizeForHtml(roleName)}</b> on Let's Church.</p>

        <p>You'll need to create a Let's Church account with this email address first.</p>

        <p>
          <a href="${registerUrl}" style="display: inline-block; padding: 10px 20px; background-color: #228be6; color: white; text-decoration: none; border-radius: 4px;">Create Account</a>
        </p>

        <p>After registering and verifying your email, you can <a href="${acceptUrl}">accept the invitation</a>.</p>

        <p style="color: #868e96; font-size: 14px;">This invitation expires in 7 days.</p>
      `;
    }

    const html = emailHtml(`Invitation to ${organization.name}`, htmlBody).html;

    await (await client).workflow.start(sendEmailWorkflow, {
      args: [
        {
          from: 'hello@lets.church',
          to: invitation.email,
          subject,
          text,
          html,
        },
      ],
      workflowId: `${orgTypeName}-invitation:${invitation.id}:${Date.now()}`,
      taskQueue: BACKGROUND_QUEUE,
      retry: { maximumAttempts: 5 },
    });

    moduleLogger.info(
      `Started invitation email workflow for ${invitation.email} to ${orgTypeName} ${organization.name}`,
    );
  } else if (type === 'channel') {
    const invitation = await db
      .select()
      .from(ChannelInvitation)
      .where(eq(ChannelInvitation.id, invitationId))
      .then((r) => r[0]);

    invariant(invitation, `Channel invitation ${invitationId} not found`);

    const channel = await db
      .select({ name: Channel.name, slug: Channel.slug })
      .from(Channel)
      .where(eq(Channel.id, invitation.channelId))
      .then((r) => r[0]);

    invariant(channel, `Channel not found for invitation ${invitationId}`);

    const invitedBy = invitation.invitedById
      ? await db
          .select({ username: AppUser.username, fullName: AppUser.fullName })
          .from(AppUser)
          .where(eq(AppUser.id, invitation.invitedById))
          .then((r) => r[0] ?? null)
      : null;

    const inviterName =
      invitedBy?.fullName || invitedBy?.username || 'An administrator';
    const roleName = invitation.isAdmin
      ? 'Admin'
      : invitation.canEdit
        ? 'Editor'
        : invitation.canUpload
          ? 'Uploader'
          : 'Member';

    // Check if user exists with this email
    const existingUserEmail = await db
      .select({ appUserId: AppUserEmail.appUserId })
      .from(AppUserEmail)
      .where(eq(AppUserEmail.email, invitation.email))
      .then((r) => r[0] ?? null);

    const existingUser = existingUserEmail
      ? await db
          .select({ id: AppUser.id, username: AppUser.username })
          .from(AppUser)
          .where(eq(AppUser.id, existingUserEmail.appUserId))
          .then((r) => r[0] ?? null)
      : null;

    const acceptUrl = `${getWebUrl()}/dashboard/invitations/accept?token=${uuidTranslator.fromUUID(invitation.token)}`;
    const declineUrl = `${getWebUrl()}/dashboard/invitations/accept?token=${uuidTranslator.fromUUID(invitation.token)}`;

    const subject = `You've been invited to ${channel.name} on Let's Church`;

    let text: string;
    let htmlBody: string;

    if (existingUser) {
      // Email for existing user
      text = stripIndent`
        ${inviterName} has invited you to join the channel "${channel.name}" as a ${roleName}.

        To accept this invitation, visit: ${acceptUrl}

        To decline, visit: ${declineUrl}

        This invitation expires in 7 days.
      `;

      htmlBody = stripIndent`
        <p><b>${sanitizeForHtml(inviterName)}</b> has invited you to join the channel <b>${sanitizeForHtml(channel.name)}</b> as a <b>${sanitizeForHtml(roleName)}</b>.</p>

        <p>
          <a href="${acceptUrl}" style="display: inline-block; padding: 10px 20px; background-color: #228be6; color: white; text-decoration: none; border-radius: 4px; margin-right: 10px;">Accept Invitation</a>
          <a href="${declineUrl}" style="display: inline-block; padding: 10px 20px; background-color: #868e96; color: white; text-decoration: none; border-radius: 4px;">Decline</a>
        </p>

        <p style="color: #868e96; font-size: 14px;">This invitation expires in 7 days.</p>
      `;
    } else {
      // Email for new user
      const registerUrl = `${getWebUrl()}/auth/register?email=${encodeURIComponent(invitation.email)}`;

      text = stripIndent`
        ${inviterName} has invited you to join the channel "${channel.name}" as a ${roleName} on Let's Church.

        You'll need to create a Let's Church account with this email address first.

        Create an account: ${registerUrl}

        After registering and verifying your email, you can accept the invitation at: ${acceptUrl}

        This invitation expires in 7 days.
      `;

      htmlBody = stripIndent`
        <p><b>${sanitizeForHtml(inviterName)}</b> has invited you to join the channel <b>${sanitizeForHtml(channel.name)}</b> as a <b>${sanitizeForHtml(roleName)}</b> on Let's Church.</p>

        <p>You'll need to create a Let's Church account with this email address first.</p>

        <p>
          <a href="${registerUrl}" style="display: inline-block; padding: 10px 20px; background-color: #228be6; color: white; text-decoration: none; border-radius: 4px;">Create Account</a>
        </p>

        <p>After registering and verifying your email, you can <a href="${acceptUrl}">accept the invitation</a>.</p>

        <p style="color: #868e96; font-size: 14px;">This invitation expires in 7 days.</p>
      `;
    }

    const html = emailHtml(`Invitation to ${channel.name}`, htmlBody).html;

    await (await client).workflow.start(sendEmailWorkflow, {
      args: [
        {
          from: 'hello@lets.church',
          to: invitation.email,
          subject,
          text,
          html,
        },
      ],
      workflowId: `channel-invitation:${invitation.id}:${Date.now()}`,
      taskQueue: BACKGROUND_QUEUE,
      retry: { maximumAttempts: 5 },
    });

    moduleLogger.info(
      `Started invitation email workflow for ${invitation.email} to channel ${channel.name}`,
    );
  }
}
