import { OrganizationTagCategory } from '~/__generated__/graphql-types';

export type Color =
  | 'gray'
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'pink';

export function getOrgTagCategoryLabel(
  category: OrganizationTagCategory,
): string {
  switch (category) {
    case OrganizationTagCategory.Confession:
      return 'Confession';
    case OrganizationTagCategory.Denomination:
      return 'Denomination';
    case OrganizationTagCategory.Doctrine:
      return 'Doctrine';
    case OrganizationTagCategory.Eschatology:
      return 'Eschatology';
    case OrganizationTagCategory.Government:
      return 'Government';
    case OrganizationTagCategory.Other:
      return 'Other';
    case OrganizationTagCategory.Worship:
      return 'Worship';
  }
}

export function getMenuColorClass(color: Color | Uppercase<Color>): string {
  switch (color.toLowerCase() as Color) {
    case 'gray':
      return 'bg-gray-300';
    case 'red':
      return 'bg-red-300';
    case 'yellow':
      return 'bg-yellow-300';
    case 'green':
      return 'bg-green-300';
    case 'blue':
      return 'bg-blue-300';
    case 'indigo':
      return 'bg-indigo-300';
    case 'purple':
      return 'bg-purple-300';
    case 'pink':
      return 'bg-pink-300';
  }
}

export function optionId(prefix: string, slug: string, i: number) {
  return `${prefix}:${slug}:${i}`;
}
