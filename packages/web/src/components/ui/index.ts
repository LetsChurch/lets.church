// Dashboard UI primitives — the main app's design language, rendered without
// Mantine. Layout/spacing is done with plain elements + inline Tailwind at the
// call sites; these are the behavioral/token components that remain.

export { Avatar } from '@/components/avatar';
export type { LcColor } from './_colors';
export { ActionIcon, Button } from './button';
export { Alert, Badge, Loader, LoadingOverlay } from './feedback';
export type { SelectData, SelectGroup, SelectOption } from './input';
export {
  Checkbox,
  InputWrapper,
  MultiSelect,
  PasswordInput,
  Radio,
  RadioGroup,
  Select,
  Textarea,
  TextInput,
} from './input';
export { Pagination } from './pagination';
export { Progress } from './progress';
export { Slider } from './slider';
export { Table } from './table';
export { Tabs } from './tabs';
export { Tooltip } from './tooltip';
export { Anchor, List, Text, Title } from './typography';
