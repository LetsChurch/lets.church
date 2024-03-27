import BrandFacebookIcon from '@tabler/icons/outline/brand-facebook.svg?component-solid';
import BrandXIcon from '@tabler/icons/outline/brand-x.svg?component-solid';
import BrandLinkedInIcon from '@tabler/icons/outline/brand-linkedin.svg?component-solid';
import BrandGithubIcon from '@tabler/icons/outline/brand-github.svg?component-solid';
import BrandGitlabIcon from '@tabler/icons/outline/brand-gitlab.svg?component-solid';
import { Icon as LogoIcon } from '~/components/logo';

export default function Footer() {
  return (
    <footer class="bg-white" aria-labelledby="footer-heading">
      <h2 id="footer-heading" class="sr-only">
        Footer
      </h2>
      <div class="mx-auto max-w-7xl px-6 pb-8 pt-16 sm:pt-24 lg:px-8 lg:pt-32">
        <div class="xl:grid xl:grid-cols-3 xl:gap-8 [&_svg]:h-8">
          <LogoIcon />
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
              No spam. Read our{' '}
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
          <div class="flex space-x-6 md:order-2">
            <a
              href="https://fb.me/LetsChurchOrg"
              class="text-gray-400 hover:text-gray-500"
            >
              <span class="sr-only">Facebook</span>
              <BrandFacebookIcon class="h-6" />
            </a>
            <a
              href="https://twitter.com/LetsChurchOrg"
              class="text-gray-400 hover:text-gray-500"
            >
              <span class="sr-only">X</span>
              <BrandXIcon class="h-6" />
            </a>
            <a
              href="https://www.linkedin.com/company/96956517"
              class="text-gray-400 hover:text-gray-500"
            >
              <span class="sr-only [&_svg]:h-6">Linkedin</span>
              <BrandLinkedInIcon class="h-6" />
            </a>
            <a
              href="https://github.com/LetsChurch"
              class="text-gray-400 hover:text-gray-500"
            >
              <span class="sr-only [&_svg]:h-6">Github</span>
              <BrandGithubIcon class="h-6" />
            </a>
            <a
              href="https://gitlab.com/LetsChurch"
              class="text-gray-400 hover:text-gray-500"
            >
              <span class="sr-only [&_svg]:h-6">GitLab</span>
              <BrandGitlabIcon class="h-6" />
            </a>
          </div>
          <p class="mt-8 text-xs leading-5 text-gray-500 md:order-1 md:mt-0">
            Let's Church is in the public domain and is a 501(c)(3) non-profit.{' '}
            <a href="/about" class="underline decoration-indigo-100">
              Learn more.
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
