import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export type Optional<T> = T | null | undefined;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
