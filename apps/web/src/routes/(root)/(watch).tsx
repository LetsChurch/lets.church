import { For } from 'solid-js';
import VideoCard from '~/components/video-card';

export default function WatchRoute() {
  return (
    <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <For each={Array(30)}>
        {() => (
          <li>
            <VideoCard
              title="Hello, World!"
              channel="Let's Church"
              href="#"
              avatarUrl="https://images.unsplash.com/photo-1477672680933-0287a151330e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
            />
          </li>
        )}
      </For>
    </ul>
  );
}
