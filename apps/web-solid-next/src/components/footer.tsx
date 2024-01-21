import { For } from 'solid-js';
import FacebookIcon from '@tabler/icons/brand-facebook.svg?component-solid';
import XIcon from '@tabler/icons/brand-x.svg?component-solid';
import GithubIcon from '@tabler/icons/brand-github.svg?component-solid';
import GitlabIcon from '@tabler/icons/brand-gitlab.svg?component-solid';
import { A } from '@solidjs/router';

export default function Footer() {
  const links = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    {
      href: 'https://www.zeffy.com/en-US/donation-form/5da9e1c3-a8e2-4bb4-817a-5dbbb968ec6b',
      label: 'Donate',
    },
    { href: '/about/terms', label: 'Terms' },
    { href: '/about/privacy', label: 'Privacy' },
    { href: '/about/dmca', label: 'DMCA' },
  ];

  return (
    <footer class="mt-5 bg-white">
      <div class="mx-auto max-w-7xl overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
        <nav
          class="-mx-5 -my-2 flex flex-wrap justify-center"
          aria-label="Footer"
        >
          <For each={links}>
            {(link) => (
              <div class="px-5 py-2">
                <A
                  href={link.href}
                  class="text-base text-gray-500 hover:text-gray-900"
                  target={link.href.startsWith('https://') ? '_blank' : ''}
                >
                  {link.label}
                </A>
              </div>
            )}
          </For>
        </nav>
        <div class="mt-8 flex justify-center space-x-6">
          <a
            href="https://www.facebook.com/profile.php?id=100092315746719"
            class="text-gray-400 hover:text-gray-500"
            target="_blank"
          >
            <span class="sr-only">Facebook</span>
            <FacebookIcon />
          </a>

          <a
            href="https://twitter.com/lets_church"
            class="text-gray-400 hover:text-gray-500"
            target="_blank"
          >
            <span class="sr-only">X</span>
            <XIcon />
          </a>

          <a
            href="https://github.com/LetsChurch/"
            class="text-gray-400 hover:text-gray-500"
            target="_blank"
          >
            <span class="sr-only">GitHub</span>
            <GithubIcon />
          </a>

          <a
            href="https://gitlab.com/LetsChurch/"
            class="text-gray-400 hover:text-gray-500"
            target="_blank"
          >
            <span class="sr-only">Gitlab</span>
            <GitlabIcon />
          </a>
        </div>
        <p class="mt-8 text-center text-base text-gray-400">
          Let's Church is in the public domain and is operated as a non-profit.{' '}
          <a href="/about" class="underline decoration-indigo-100">
            Learn more.
          </a>
        </p>
      </div>
    </footer>
  );
}
