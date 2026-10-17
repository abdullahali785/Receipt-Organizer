import { fireEvent, render, screen } from '@testing-library/react-native';

import { RecordsTable } from '@/components/records-table';
import { formatMoney } from '@/lib/money';

import { makeReceipt } from '../test-utils/make-receipt';

const receipts = [
  makeReceipt({ id: 'mid', vendor: 'Mid', date: '2026-10-03', totalAmount: 20 }),
  makeReceipt({ id: 'big', vendor: 'Big', date: '2026-10-01', totalAmount: 90 }),
  makeReceipt({ id: 'small', vendor: 'Small', date: '2026-10-02', totalAmount: 5 }),
];
const rowOrder = () => screen.getAllByTestId(/^row-/).map((row) => row.props.testID);

it('re-sorts rows when the Total header is pressed', async () => {
  await render(<RecordsTable receipts={receipts} />);
  expect(rowOrder()).toEqual(['row-mid', 'row-small', 'row-big']); // date, newest first

  await fireEvent.press(screen.getByRole('button', { name: 'Sort by Total' }));
  expect(rowOrder()).toEqual(['row-big', 'row-mid', 'row-small']);

  await fireEvent.press(screen.getByRole('button', { name: 'Sort by Total' }));
  expect(rowOrder()).toEqual(['row-small', 'row-mid', 'row-big']);

  expect(screen.getByText('3 receipts')).toBeTruthy();
  expect(screen.getByText(formatMoney(115, 'USD'))).toBeTruthy();
});
