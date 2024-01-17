import { component$, Slot } from "@builder.io/qwik";
import {
  TbMenu,
  TbX,
  TbBrandFacebook,
  TbBrandX,
  TbBrandLinkedin,
  TbBrandGithub,
  TbBrandGitlab,
} from "@qwikest/icons/tablericons";
import type { RequestHandler } from "@builder.io/qwik-city";

import { NavLink } from "~/components/nav-link";
import HeaderDonate from "~/components/header-donate";
import Lc from "~/components/lc";
import Logo from "~/components/logo";
import Profile from "~/components/profile";

export const onGet: RequestHandler = async ({ cacheControl }) => {
  // Control caching for this request for best performance:
  // https://qwik.builder.io/docs/caching/
  cacheControl({
    // Always serve a cached response by default, up to a week stale
    staleWhileRevalidate: 60 * 60 * 24 * 7,
    // Max once every 5 seconds, revalidate on the server to get a fresh version of this page
    maxAge: 5,
  });
};

const navLinks = [
  {
    href: "/",
    title: "Media",
  },
  {
    href: "/churches",
    title: "Find a Church",
  },
  {
    href: "/about",
    title: "About",
  },
];

export default component$(() => {
  return (
    <div id="letschurch">
      <header class="bg-white shadow">
        <nav>
          <div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-8">
            <div class="flex h-16 justify-between">
              <div class="flex px-2 lg:px-0">
                <div class="flex flex-shrink-0 items-center text-indigo-500">
                  <a href="/" title="Let's Church Home">
                    <Logo class="h-14" />
                  </a>
                </div>
                <div class="hidden lg:ml-6 lg:flex lg:space-x-8">
                  {navLinks.map((link) => (
                    <NavLink
                      key={link.href}
                      href={link.href}
                      class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium"
                      activeClass="border-indigo-500 text-gray-900"
                      inactiveClass="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    >
                      {link.title}
                    </NavLink>
                  ))}
                </div>
              </div>
              <div class="flex items-center lg:hidden">
                <HeaderDonate />
                <button
                  type="button"
                  class="relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                  aria-controls="mobile-menu"
                  aria-expanded="false"
                  id="mobile-menu-button"
                >
                  <span class="absolute -inset-0.5"></span>
                  <span class="sr-only">Open main menu</span>
                  <div class="icon-menu block">
                    <TbMenu />
                  </div>
                  <div class="icon-close hidden">
                    <TbX />
                  </div>
                </button>
              </div>
              <div class="hidden gap-4 lg:ml-4 lg:flex lg:items-center">
                <HeaderDonate />
                <Profile />
              </div>
            </div>
          </div>
          <div class="hidden lg:hidden" id="mobile-menu">
            <div class="space-y-1 pb-3 pt-2">
              {navLinks.map((link) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  class="block border-l-4 py-2 pl-3 pr-4 text-base font-medium"
                  activeClass="border-indigo-500 bg-indigo-50 text-indigo-700"
                  inactiveClass="border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
                >
                  {link.title}
                </NavLink>
              ))}
            </div>
            <div class="border-t border-gray-200 pb-3 pt-4">
              <div>me or login</div>
            </div>
          </div>
        </nav>
      </header>
      <main class="px-2 sm:px-4 lg:px-8">
        <Slot />
      </main>
      <footer class="bg-white" aria-labelledby="footer-heading">
        <h2 id="footer-heading" class="sr-only">
          Footer
        </h2>
        <div class="mx-auto max-w-7xl px-6 pb-8 pt-16 sm:pt-24 lg:px-8 lg:pt-32">
          <div class="xl:grid xl:grid-cols-3 xl:gap-8">
            <Lc class="h-8 w-auto" />
            <div class="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
              <div class="md:grid md:grid-cols-2 md:gap-8">
                <div>
                  <h3 class="text-sm font-semibold leading-6 text-gray-900">
                    Media
                  </h3>
                  <ul role="list" class="mt-6 space-y-4">
                    <li>
                      <a
                        href="/"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Explore
                      </a>
                    </li>
                    <li>
                      <a
                        href="/channels"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Channels
                      </a>
                    </li>
                    <li>
                      <a
                        href="/"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Sermons
                      </a>
                    </li>
                    <li>
                      <a
                        href="/"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Podcasts
                      </a>
                    </li>
                  </ul>
                </div>
                <div class="mt-10 md:mt-0">
                  <h3 class="text-sm font-semibold leading-6 text-gray-900">
                    Find a Church
                  </h3>
                  <ul role="list" class="mt-6 space-y-4">
                    <li>
                      <a
                        href="/churches"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Search
                      </a>
                    </li>
                    <li>
                      <a
                        href="/churches"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Reformed Churches
                      </a>
                    </li>
                    <li>
                      <a
                        href="/churches"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Family Integrated Churches
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="md:grid md:grid-cols-2 md:gap-8">
                <div>
                  <h3 class="text-sm font-semibold leading-6 text-gray-900">
                    Company
                  </h3>
                  <ul role="list" class="mt-6 space-y-4">
                    <li>
                      <a
                        href="/about"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        About
                      </a>
                    </li>
                    <li>
                      <a
                        href="/about/theology"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Theology
                      </a>
                    </li>
                    <li>
                      <a
                        href="/about/dorean"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        The Dorean Principle
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.zeffy.com/en-US/donation-form/5da9e1c3-a8e2-4bb4-817a-5dbbb968ec6b"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                        target="_blank"
                      >
                        Donate
                      </a>
                    </li>
                  </ul>
                </div>
                <div class="mt-10 md:mt-0">
                  <h3 class="text-sm font-semibold leading-6 text-gray-900">
                    Legal
                  </h3>
                  <ul role="list" class="mt-6 space-y-4">
                    <li>
                      <a
                        href="/about/terms"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Terms
                      </a>
                    </li>
                    <li>
                      <a
                        href="/about/privacy"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        Privacy
                      </a>
                    </li>
                    <li>
                      <a
                        href="/about/dmca"
                        class="text-sm leading-6 text-gray-600 hover:text-gray-900"
                      >
                        DMCA
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div class="mt-16 border-t border-gray-900/10 pt-8 sm:mt-20 lg:mt-24 lg:flex lg:items-center lg:justify-between">
            <div>
              <h3 class="text-sm font-semibold leading-6 text-gray-900">
                Subscribe to our newsletter
              </h3>
              <p class="mt-2 text-sm leading-6 text-gray-600">
                No spam. Read our{" "}
                <a
                  href="/about/privacy"
                  class="inactive font-semibold text-indigo-600 hover:text-indigo-500"
                >
                  privacy policy
                </a>
                .
              </p>
            </div>
            <form class="mt-6 sm:flex sm:max-w-md lg:mt-0">
              <label for="email-address" class="sr-only">
                Email address
              </label>
              <input
                type="email"
                name="email-address"
                id="email-address"
                autocomplete="email"
                required
                class="w-full min-w-0 appearance-none rounded-md border-0 bg-white px-3 py-1.5 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:w-56 sm:text-sm sm:leading-6"
                placeholder="Enter your email"
              />
              <div class="mt-4 sm:ml-4 sm:mt-0 sm:flex-shrink-0">
                <button
                  type="submit"
                  class="flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Subscribe
                </button>
              </div>
            </form>
          </div>
          <div class="mt-8 border-t border-gray-900/10 pt-8 md:flex md:items-center md:justify-between">
            <div class="flex space-x-6 md:order-2 [&_svg]:h-6 [&_svg]:w-auto">
              <a
                href="https://www.facebook.com/profile.php?id=100092315746719"
                class="text-gray-400 hover:text-gray-500"
              >
                <span class="sr-only">Facebook</span>
                <TbBrandFacebook />
              </a>
              <a
                href="https://twitter.com/lets_church"
                class="text-gray-400 hover:text-gray-500"
              >
                <span class="sr-only">X</span>
                <TbBrandX />
              </a>
              <a
                href="https://www.linkedin.com/company/96956517"
                class="text-gray-400 hover:text-gray-500"
              >
                <span class="sr-only">Linkedin</span>
                <TbBrandLinkedin />
              </a>
              <a
                href="https://github.com/LetsChurch"
                class="text-gray-400 hover:text-gray-500"
              >
                <span class="sr-only">Github</span>
                <TbBrandGithub />
              </a>
              <a
                href="https://gitlab.com/LetsChurch"
                class="text-gray-400 hover:text-gray-500"
              >
                <span class="sr-only">GitLab</span>
                <TbBrandGitlab />
              </a>
            </div>
            <p class="mt-8 text-xs leading-5 text-gray-500 md:order-1 md:mt-0">
              Let's Church is in the public domain and is a 501(c)(3)
              non-profit.{" "}
              <a href="/about" class="underline decoration-indigo-100">
                Learn more.
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
});
