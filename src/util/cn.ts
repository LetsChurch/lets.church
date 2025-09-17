import clsx from 'clsx';
import { type ClassNameValue, twMerge } from 'tailwind-merge';

export function cn(...classLists: ClassNameValue[]) {
  return twMerge(clsx(classLists));
}
