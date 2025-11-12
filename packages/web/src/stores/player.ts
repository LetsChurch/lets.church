import { atom } from 'nanostores';

export const $currentTime = atom<number>(0);
export const $setPlayAt = atom<number | null>(null);
