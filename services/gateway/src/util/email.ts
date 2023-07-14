import envariant from '@knpwrs/envariant';
import mjml2html from 'mjml';
import { stripIndent } from 'proper-tags';
import { sendEmail } from '../temporal';
import prisma from './prisma';
import { uuidTranslator } from './uuid';

const fontFamily = 'Inter, sans-serif';
const color = '#111111';

const WEB_URL = envariant('WEB_URL');

export function emailHtml(title: string, body: string, minify = true) {
  return mjml2html(
    {
      tagName: 'mjml',
      attributes: {},
      children: [
        {
          tagName: 'mj-head',
          attributes: {},
          children: [
            {
              tagName: 'mj-title',
              attributes: {},
              content: title,
            },
            {
              tagName: 'mj-font',
              attributes: {
                name: 'Inter',
                href: 'https://unpkg.com/@fontsource/inter@5.0.3/index.css',
              },
            },
            {
              tagName: 'mj-preview',
              attributes: {},
              content: body.split('\n\n').at(0) ?? '',
            },
            {
              tagName: 'mj-style',
              attributes: {},
              content: stripIndent`
                a {
                  color: inherit;
                  text-decoration: underline;
                  text-decoration-style: dotted;
                }
                a.plain {
                  text-decoration: none;
                  color: inherit;
                }
                a:hover {
                  text-decoration: underline;
                }
              `,
            },
          ],
        },
        {
          tagName: 'mj-body',
          attributes: {},
          children: [
            {
              tagName: 'mj-section',
              attributes: {},
              children: [
                {
                  tagName: 'mj-column',
                  attributes: {},
                  children: [
                    {
                      tagName: 'mj-image',
                      attributes: {
                        width: '250px',
                        src: 'https://mail.letschurch.cloud/logo.png',
                        href: 'https://lets.church',
                        target: '_blank',
                      },
                    },
                    {
                      tagName: 'mj-text',
                      attributes: {
                        'font-family': fontFamily,
                        'font-size': '16px',
                        color,
                        'line-height': '165%',
                      },
                      content: stripIndent`
                        <h1>${title}</h1>
                        ${body
                          .trim()
                          .split('\n\n')
                          .map((content) => `<p>${content}</p>`)
                          .join('\n')}
                      `,
                      /* children: [ */
                      /*   { */
                      /*     tagName: 'h1', */
                      /*     attributes: {}, */
                      /*     content: title, */
                      /*   }, */
                      /*   ...body.split('\n\n').map((content) => ({ */
                      /*     tagName: 'p', */
                      /*     attributes: {}, */
                      /*     content, */
                      /*   })), */
                      /* ], */
                    },
                  ],
                },
              ],
            },
            {
              tagName: 'mj-section',
              attributes: {},
              children: [
                {
                  tagName: 'mj-column',
                  attributes: {},
                  children: [
                    {
                      tagName: 'mj-social',
                      attributes: {
                        'font-size': '12px',
                        'icon-size': '20px',
                        mode: 'horizontal',
                      },
                      children: [
                        {
                          tagName: 'mj-social-element',
                          attributes: {
                            src: 'https://mail.letschurch.cloud/brand-facebook.png',
                            href: 'https://www.facebook.com/profile.php?id=100092315746719',
                          },
                        },
                        {
                          tagName: 'mj-social-element',
                          attributes: {
                            src: 'https://mail.letschurch.cloud/brand-twitter.png',
                            href: 'https://twitter.com/lets_church',
                          },
                        },
                        {
                          tagName: 'mj-social-element',
                          attributes: {
                            src: 'https://mail.letschurch.cloud/brand-github.png',
                            href: 'https://github.com/LetsChurch',
                          },
                        },
                        {
                          tagName: 'mj-social-element',
                          attributes: {
                            src: 'https://mail.letschurch.cloud/brand-gitlab.png',
                            href: 'https://gitlab.com/LetsChurch',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              tagName: 'mj-section',
              attributes: {},
              children: [
                {
                  tagName: 'mj-column',
                  attributes: {},
                  children: [
                    {
                      tagName: 'mj-text',
                      attributes: {
                        'font-family': fontFamily,
                        'font-size': '16px',
                        'font-weight': 'bold',
                        color,
                        align: 'center',
                      },
                      content:
                        '<a href="https://lets.church" class="plain" target="_blank"></a>',
                    },
                    /* { */
                    /*   tagName: 'mj-text', */
                    /*   attributes: { */
                    /*     'font-family', */
                    /*     'font-size': '16px', */
                    /*     'font-weight': 'bold', */
                    /*     color, */
                    /*     align: 'center', */
                    /*   }, */
                    /*   content: 'You received this email because...', */
                    /* }, */
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    { minify, validationLevel: 'soft' },
  );
}

export async function subscribeToNewsletter(email: string) {
  const sub = await prisma.newsletterSubscription.upsert({
    where: {
      email,
    },
    create: {
      email,
    },
    update: {},
  });

  if (sub.verifiedAt) {
    return;
  }

  const verifyUrl = `${WEB_URL}/newsletter/verify?${new URLSearchParams({
    subscriptionId: uuidTranslator.fromUUID(sub.id),
    emailKey: uuidTranslator.fromUUID(sub.key),
  })}`;

  await sendEmail(`subscription:${email}`, {
    from: 'hello@lets.church',
    to: email,
    subject: "Please Verify Your Email for the Let's Church Newsletter",
    text: `You have subscribed to the Let's Church Newsletter. Please visit the following link to confirm your subscription: ${verifyUrl}`,
    html: emailHtml(
      "Let's Church Newsletter",
      stripIndent`
          You have been subscribed to the Let's Church Newsletter. Please click <a href="${verifyUrl}">here</a> to confirm your subscription.

          Alternatively, visit the following link to confirm your subscription: ${verifyUrl}
        `,
    ).html,
  });
}
