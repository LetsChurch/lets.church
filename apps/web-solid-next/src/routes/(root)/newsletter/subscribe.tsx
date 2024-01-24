import H1 from '~/components/content/h1';
import P from '~/components/content/p';

export default function NewsletterUnsubscribeRoute() {
  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <H1>Subscribed!</H1>
        <P>
          Check your email to verify your subscription to the Let's Church
          newsletter.
        </P>
      </div>
    </div>
  );
}
