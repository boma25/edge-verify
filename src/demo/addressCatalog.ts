import labelsJson from '../../assets/synthetic/labels.json';
import type { AddressExpected } from '../domain/types';

interface LabelItem {
  id: string;
  kind: string;
  expected: AddressExpected;
}

const DEMO_NAME = 'John Doe';

export interface AddressPerson {
  key: string;
  expected: AddressExpected;
}

/** Single demo account holder for the address flow. */
export function getDemoPerson(): AddressPerson {
  const labels = labelsJson as { items: LabelItem[] };
  const item = labels.items.find(
    (i) => i.kind === 'address' && i.expected.fullName === DEMO_NAME,
  );
  if (!item) {
    throw new Error(`Demo person "${DEMO_NAME}" not found in synthetic labels`);
  }
  return {
    key: DEMO_NAME,
    expected: item.expected,
  };
}
