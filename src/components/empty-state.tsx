import { IconFlag } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

export function EmptyState({
  emptyTitle,
  emptyBody,
  emptyCta,
  emptyCtaHref = '/',
}: {
  emptyTitle?: string;
  emptyBody?: string;
  emptyCta?: string;
  emptyCtaHref?: string;
}) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center rounded-2xl border border-white/15 border-dashed px-4 text-center">
      <div className="mb-4">
        <svg
          width="78"
          height="78"
          viewBox="0 0 78 78"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mx-auto"
        >
          <title>Empty</title>
          <foreignObject x="3" y="5" width="72" height="72">
            <div
              style={{
                backdropFilter: 'blur(4px)',
                height: '100%',
                width: '100%',
              }}
            />
          </foreignObject>
          <g filter="url(#filter0_d_144_5508)">
            <rect
              x="16"
              y="16"
              width="46"
              height="46"
              rx="23"
              stroke="#6366F1"
              strokeWidth="2"
              shapeRendering="crispEdges"
            />
          </g>
          <rect
            opacity="0.6"
            x="10.5"
            y="10.5"
            width="57"
            height="57"
            rx="28.5"
            stroke="#6366F1"
            strokeDasharray="2 2"
          />
          <rect
            opacity="0.4"
            x="5.5"
            y="5.5"
            width="67"
            height="67"
            rx="33.5"
            stroke="#6366F1"
            strokeDasharray="2 2"
          />
          <rect
            opacity="0.2"
            x="0.5"
            y="0.5"
            width="77"
            height="77"
            rx="38.5"
            stroke="#6366F1"
            strokeDasharray="2 2"
          />
          <foreignObject x="31" y="31" width="16" height="16">
            <IconFlag size={16} color="white" />
          </foreignObject>
          <defs>
            <filter
              x="3"
              y="5"
              width="72"
              height="72"
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feColorMatrix
                in="SourceAlpha"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                result="hardAlpha"
              />
              <feOffset dy="2" />
              <feGaussianBlur stdDeviation="6" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.388235 0 0 0 0 0.4 0 0 0 0 0.945098 0 0 0 1 0"
              />
              <feBlend
                mode="normal"
                in2="BackgroundImageFix"
                result="effect1_dropShadow_144_5508"
              />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="effect1_dropShadow_144_5508"
                result="shape"
              />
            </filter>
          </defs>
        </svg>
      </div>
      {emptyTitle && emptyBody ? (
        <>
          <h2 className="mb-1 text-center font-bold text-base text-primary leading-[140%]">
            {emptyTitle}
          </h2>
          <h3 className="text-center font-normal text-primary text-xs leading-[140%]">
            {emptyBody}
          </h3>
          {emptyCta ? (
            <Link
              to={emptyCtaHref}
              className="mt-4 flex h-8 items-center rounded-full border-top-highlight bg-indigo-500 px-3 font-bold text-primary text-sm"
            >
              {emptyCta}
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
