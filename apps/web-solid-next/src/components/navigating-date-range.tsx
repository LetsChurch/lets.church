import { type JSX, splitProps } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';
import { Button, Input } from './form';
import { setQueryParams } from '~/util/url';

export type Props = JSX.IntrinsicElements['div'] & {
  min?: Date | null;
  max?: Date | null;
  queryKey: string;
};

function dateToIso(date?: Date | null) {
  if (!date) {
    return null;
  }

  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(
    2,
    '0',
  )}-${date.getDate()}`;
}

export default function NavigatingDateRange(props: Props) {
  const [local, others] = splitProps(props, [
    'min',
    'max',
    'queryKey',
    'class',
  ]);
  const navigate = useNavigate();
  const loc = useLocation();

  const currentValues = () => {
    const [min = dateToIso(local.min), max = dateToIso(local.max)] =
      loc.query[local.queryKey]?.split('/').filter(Boolean) ?? [];
    return { min, max };
  };

  function doNav(min: string, max: string) {
    navigate(
      `?${setQueryParams(loc.search, {
        [props.queryKey ?? '']: `${min}/${max}`,
      })}`,
    );
  }

  function onChange(e: Event) {
    const { name, value } = e.target as HTMLInputElement;
    const { min, max } = currentValues();
    if (name === 'min') {
      doNav(value, max ?? '');
    } else {
      doNav(min ?? '', value);
    }
  }

  function clear() {
    navigate(
      `?${setQueryParams(loc.search, {
        [props.queryKey ?? '']: null,
      })}`,
    );
  }

  return (
    <div {...others} class={`space-y-2 ${local.class ?? ''}`}>
      <Input
        type="date"
        name="min"
        value={currentValues().min ?? ''}
        onChange={onChange}
      />
      <Input
        type="date"
        name="max"
        value={currentValues().max ?? ''}
        onChange={onChange}
      />
      <Button class="w-full" onClick={clear}>
        Reset
      </Button>
    </div>
  );
}
