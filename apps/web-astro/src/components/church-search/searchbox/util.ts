import type { OrgTagQueryNode } from '../../../queries/churches';

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
  category: OrgTagQueryNode['category'],
): string {
  switch (category) {
    case 'CONFESSION':
      return 'Confession';
    case 'DENOMINATION':
      return 'Denomination';
    case 'DOCTRINE':
      return 'Doctrine';
    case 'ESCHATOLOGY':
      return 'Eschatology';
    case 'GOVERNMENT':
      return 'Government';
    case 'OTHER':
      return 'Other';
    case 'WORSHIP':
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
