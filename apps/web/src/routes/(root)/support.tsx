import A from '~/components/content/a';
import H1 from '~/components/content/h1';
import H2 from '~/components/content/h2';
import P from '~/components/content/p';
import { Donorbox } from '~/components/donorbox';

export default function SupportRoute() {
  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto flex max-w-3xl flex-col text-base leading-7 text-gray-700 md:block">
        <Donorbox class="order-3 mb-6 mt-6 flex items-center justify-center md:float-right md:ml-6 md:mt-0" />
        <H1 class="order-0">Support Let's Church</H1>
        <P class="order-1">
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
        <P class="order-2">
          Please do not let any giving to Let's Church interfere with giving to
          your local church. It is important that you first support your local
          community of believers before prayerfully considering how much you can
          give to Let's Church.
        </P>
        <H2 class="order-4">Spread the Word</H2>
        <P class="order-5">
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
