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
            Let's Church operates as a non-profit organization
          </A>{' '}
          (501c3 pending). We operate completely free of charge with no ads. We
          plan on accepting donations through our website soon. In the iterim,
          if you would like to support Let's Church feel free to reach out to{' '}
          <A href="&#109;&#097;&#105;&#108;&#116;&#111;&#058;&#99;&#111;n&#116;&#97;&#99;&#116;&#64;l&#101;t&#115;&#46;&#99;h&#117;&#114;c&#104;">
            cont&#97;ct&#64;&#108;&#101;t&#115;&#46;&#99;h&#117;r&#99;h
          </A>
          .
        </P>
        <P>
          Please do not let any giving to Let's Church interfere with giving to
          your local church. It is important that you first support your local
          community of believers before considering how much you can give to
          Let's Church.
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
