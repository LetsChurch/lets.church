import { IconBible } from '@tabler/icons-react';

export function Transcript() {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
      {/* First section heading */}
      <div />
      <h4 className="font-bold text-base text-white leading-[1.4]">
        This is the first section heading
      </h4>

      {/* First transcript item */}
      <div className="pt-1 font-mono text-[10px] text-indigo-500 leading-[1.4] tracking-[-0.2px]">
        0:05
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-white leading-[1.4]">
          Proident non aliquip incididunt incididunt. Nulla ad fugiat dolore
          deserunt aliqua cillum enim aliqua sit ad labore ex amet tempor
          consectetur.
        </p>
      </div>

      {/* Transcript Item with badge */}
      <div className="pt-1 font-mono text-[10px] text-white/50 leading-[1.4] tracking-[-0.2px]">
        0:23
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-white leading-[1.4]">
          Voluptate reprehenderit ad incididunt voluptate aliqua velit ullamco
          irure duis.
        </p>
        <div className="flex gap-2 pb-1">
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-white/15 pr-2 pl-1 font-medium text-white/80 text-xs backdrop-blur-sm">
            <IconBible size={16} />
            Rev 19:20
          </span>
        </div>
      </div>

      {/* Transcript Item */}
      <div className="pt-1 font-mono text-[10px] text-white/50 leading-[1.4] tracking-[-0.2px]">
        0:35
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-white leading-[1.4]">
          Aute dolor ipsum incididunt culpa velit in voluptate nostrud pariatur
          proident laborum non consequat ex.
        </p>
      </div>

      {/* Another section heading */}
      <div />
      <h4 className="mt-4 font-bold text-base text-white leading-[1.4]">
        This is another heading
      </h4>

      {/* Another section transcript item */}
      <div className="pt-1 font-mono text-[10px] text-white/50 leading-[1.4] tracking-[-0.2px]">
        0:57
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-white leading-[1.4]">
          Aute dolor ipsum incididunt culpa velit in voluptate nostrud pariatur
          proident laborum non consequat ex.
        </p>
        <div className="flex gap-2 pb-1">
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-white/15 pr-2 pl-1 font-medium text-white/80 text-xs backdrop-blur-sm">
            <IconBible size={16} />
            Badge
          </span>
        </div>
      </div>

      {/* Transcript Item */}
      <div className="pt-1 font-mono text-[10px] text-white/50 leading-[1.4] tracking-[-0.2px]">
        1:12
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-white leading-[1.4]">
          Culpa occaecat laborum anim eiusmod fugiat ut laborum.
        </p>
      </div>
    </div>
  );
}
