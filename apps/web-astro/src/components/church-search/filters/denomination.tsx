import AffiliateIcon from '@tabler/icons/affiliate.svg?sprite-solid';
import { For } from 'solid-js';
import Filter from './base';

const values = [
  { val: 'NON', label: 'Non-Denominational' },
  { val: 'CHRISTIAN', label: 'Christian' },
  { val: 'PROTESTANT', label: 'Protestant' },
  { val: 'BAPTIST', label: 'Baptist' },
  { val: 'REFORMED_BAPTIST', label: 'Reformed Baptist' },
  { val: 'PARTICULAR_BAPTIST', label: 'Particular Baptist' },
  { val: 'SOUTHERN_BAPTIST', label: 'Southern Baptist' },
  { val: 'INDEPENDENT_BAPTIST', label: 'Independent Baptist' },
  { val: 'REFORMED', label: 'Reformed' },
  { val: 'INDEPENDENT', label: 'Independent' },
  { val: 'PRESBYTERIAN', label: 'Presbyterian' },
  { val: 'PRESBYTERIAN_ARP', label: 'Presbyterian (ARP)' },
  { val: 'PRESBYTERIAN_PCA', label: 'Presbyterian (PCA)' },
  { val: 'PRESBYTERIAN_RPCUS', label: 'Presbyterian (RPCUS)' },
  { val: 'PRESBYTERIAN_RPCNA', label: 'Presbyterian (RPCNA)' },
  { val: 'PRESBYTERIAN_OPC', label: 'Presbyterian (OPC)' },
  { val: 'PRESBYTERIAN_CREC', label: 'Presbyterian (CREC)' },
  { val: 'LUTHERAN', label: 'Lutheran' },
  { val: 'LUTHERAN_TAALC', label: 'Lutheran (TAALC)' },
  { val: 'INTERDENOMINATIONAL', label: 'Interdenominational' },
  { val: 'EVANGELICAL_FREE', label: 'Evangelical Free' },
];

export default function DenominationFilter(props: {
  denominations: string[];
  setDenominations: (d: string[]) => void;
}) {
  return (
    <Filter label="Denomination" Icon={AffiliateIcon}>
      {() => (
        <ul class="max-h-96 max-w-64 overflow-y-auto">
          <For each={values}>
            {(value) => (
              <li>
                <label class="flex w-full items-center px-4 py-2 text-left">
                  <input
                    type="checkbox"
                    class="mr-2"
                    checked={props.denominations.includes(value.val)}
                    value={value.val}
                    onClick={(e) => {
                      if (e.currentTarget.checked) {
                        props.setDenominations(
                          props.denominations.concat(value.val),
                        );
                      } else {
                        props.setDenominations(
                          props.denominations.filter((d) => d !== value.val),
                        );
                      }
                    }}
                  />
                  {value.label}
                </label>
              </li>
            )}
          </For>
        </ul>
      )}
    </Filter>
  );
}
