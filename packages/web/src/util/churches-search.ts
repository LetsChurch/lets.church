import {
  DEFAULT_NEARBY_RANGE,
  DEFAULT_RANGE,
  MURICA,
} from '@/constants/churches';

type ChurchesSearch = {
  center?: string;
  range?: string;
  organization?: string;
  tag?: string;
};

export function parseChurchesLocation(search: ChurchesSearch) {
  const parsed = search.center?.split(',').map((v: string) => parseFloat(v));
  const center: [number, number] =
    parsed &&
    parsed.length >= 2 &&
    Number.isFinite(parsed[0]) &&
    Number.isFinite(parsed[1])
      ? [parsed[0], parsed[1]]
      : MURICA;

  return {
    range:
      search.range ?? (search.center ? DEFAULT_NEARBY_RANGE : DEFAULT_RANGE),
    center,
  };
}

export function parseChurchesOrganization(search: ChurchesSearch) {
  return { organizationSlug: search.organization ?? null };
}

export function parseChurchesTags(search: ChurchesSearch) {
  return { tags: search.tag?.split(',').filter(Boolean) ?? [] };
}
