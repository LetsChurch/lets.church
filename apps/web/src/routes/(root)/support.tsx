import A from '~/components/content/a';
import H1 from '~/components/content/h1';
import H2 from '~/components/content/h2';
import P from '~/components/content/p';

export default function SupportRoute() {
  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <H1>Support Let's Church</H1>
        <P>
          <A href="/about">
            Let's Church is a 501(c)(3) non-profit organization
          </A>
          . We provide our services completely free of charge and will never run
          ads. Your contribution helps pay for improvement of our platform,
          hosting fees, storage, and the hardware necessary to encode and
          transcribe audio and videos for the benefit of churches and ministries
          around the world. All donations are tax-deductible in the United
          States.
        </P>
        <P class="flex justify-center">
          <a
            href="https://www.zeffy.com/en-US/donation-form/5da9e1c3-a8e2-4bb4-817a-5dbbb968ec6b"
            class="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            target="_blank"
          >
            Donate to Let's Church
          </a>
        </P>
        <P>
          Please do not let any giving to Let's Church interfere with giving to
          your local church. It is important that you first support your local
          community of believers before prayerfully considering how much you can
          give to Let's Church.
        </P>
        <H2>Spread the Word</H2>
        <P>
          Another way you can support Let's Church is by spreading the word.
          Share our website, share our social media, share sermons, videos, and
          podcasts that have been helpful or edifying to you. If you know of any
          churches or ministires in need of free sermon or media hosting, send
          them our way!
        </P>
      </div>
    </div>
  );
}
