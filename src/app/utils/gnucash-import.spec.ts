import {
  buildAccountDaySummaries,
  buildMonthGrid,
  groupTransactionsByCounterparty,
  listMonthsBetween,
  parseGnucashXml,
  summarizeRange,
} from './gnucash-import';

const sampleGnucashXml = `<?xml version="1.0" encoding="utf-8" ?>
<gnc-v2
  xmlns:gnc="http://www.gnucash.org/XML/gnc"
  xmlns:act="http://www.gnucash.org/XML/act"
  xmlns:book="http://www.gnucash.org/XML/book"
  xmlns:split="http://www.gnucash.org/XML/split"
  xmlns:trn="http://www.gnucash.org/XML/trn"
  xmlns:ts="http://www.gnucash.org/XML/ts"
>
  <gnc:book version="2.0.0">
    <gnc:account version="2.0.0">
      <act:name>Root Account</act:name>
      <act:id type="guid">root</act:id>
      <act:type>ROOT</act:type>
    </gnc:account>
    <gnc:account version="2.0.0">
      <act:name>Assets</act:name>
      <act:id type="guid">assets</act:id>
      <act:type>ASSET</act:type>
      <act:parent type="guid">root</act:parent>
    </gnc:account>
    <gnc:account version="2.0.0">
      <act:name>Checking</act:name>
      <act:id type="guid">checking</act:id>
      <act:type>BANK</act:type>
      <act:parent type="guid">assets</act:parent>
    </gnc:account>
    <gnc:account version="2.0.0">
      <act:name>Salary</act:name>
      <act:id type="guid">salary</act:id>
      <act:type>INCOME</act:type>
      <act:parent type="guid">root</act:parent>
    </gnc:account>
    <gnc:account version="2.0.0">
      <act:name>Groceries</act:name>
      <act:id type="guid">groceries</act:id>
      <act:type>EXPENSE</act:type>
      <act:parent type="guid">root</act:parent>
    </gnc:account>

    <gnc:transaction version="2.0.0">
      <trn:id type="guid">opening</trn:id>
      <trn:date-posted><ts:date>2025-12-31 09:00:00 -0500</ts:date></trn:date-posted>
      <trn:description>Opening Balance</trn:description>
      <trn:splits>
        <trn:split>
          <split:id type="guid">opening-1</split:id>
          <split:value>200/1</split:value>
          <split:account type="guid">checking</split:account>
        </trn:split>
        <trn:split>
          <split:id type="guid">opening-2</split:id>
          <split:value>-200/1</split:value>
          <split:account type="guid">salary</split:account>
        </trn:split>
      </trn:splits>
    </gnc:transaction>

    <gnc:transaction version="2.0.0">
      <trn:id type="guid">payday</trn:id>
      <trn:date-posted><ts:date>2026-01-01 09:00:00 -0500</ts:date></trn:date-posted>
      <trn:description>Payroll</trn:description>
      <trn:splits>
        <trn:split>
          <split:id type="guid">payday-1</split:id>
          <split:value>1000/1</split:value>
          <split:account type="guid">checking</split:account>
          <split:memo>Paycheck</split:memo>
        </trn:split>
        <trn:split>
          <split:id type="guid">payday-2</split:id>
          <split:value>-1000/1</split:value>
          <split:account type="guid">salary</split:account>
        </trn:split>
      </trn:splits>
    </gnc:transaction>

    <gnc:transaction version="2.0.0">
      <trn:id type="guid">grocery-trip</trn:id>
      <trn:date-posted><ts:date>2026-01-02 18:00:00 -0500</ts:date></trn:date-posted>
      <trn:description>Groceries</trn:description>
      <trn:splits>
        <trn:split>
          <split:id type="guid">grocery-trip-1</split:id>
          <split:value>-4525/100</split:value>
          <split:account type="guid">checking</split:account>
          <split:memo>Weekly run</split:memo>
        </trn:split>
        <trn:split>
          <split:id type="guid">grocery-trip-2</split:id>
          <split:value>4525/100</split:value>
          <split:account type="guid">groceries</split:account>
        </trn:split>
      </trn:splits>
    </gnc:transaction>
  </gnc:book>
</gnc-v2>`;

describe('gnucash-import', () => {
  it('parses accounts and split transactions from gnucash xml', () => {
    const parsed = parseGnucashXml(sampleGnucashXml);

    expect(parsed.accounts.map((account) => account.fullName)).toEqual([
      'Assets',
      'Assets:Checking',
      'Groceries',
      'Salary',
    ]);
    expect(parsed.transactions.filter((transaction) => transaction.accountId === 'checking')).toEqual([
      {
        id: 'opening',
        accountId: 'checking',
        date: '2025-12-31',
        description: 'Opening Balance',
        memo: null,
        counterparty: 'Salary',
        amount: 200,
      },
      {
        id: 'payday',
        accountId: 'checking',
        date: '2026-01-01',
        description: 'Payroll',
        memo: 'Paycheck',
        counterparty: 'Salary',
        amount: 1000,
      },
      {
        id: 'grocery-trip',
        accountId: 'checking',
        date: '2026-01-02',
        description: 'Groceries',
        memo: 'Weekly run',
        counterparty: 'Groceries',
        amount: -45.25,
      },
    ]);
    expect(parsed.sourceFormat).toBe('xml');
  });

  it('builds daily balances and month cells for an account range', () => {
    const parsed = parseGnucashXml(sampleGnucashXml);
    const summaries = buildAccountDaySummaries(parsed, 'checking', '2026-01-01', '2026-01-31');

    expect(summaries[0]).toEqual({
      date: '2026-01-01',
      openingBalance: 200,
      income: 1000,
      expenses: 0,
      closingBalance: 1200,
      transactions: [
        {
          id: 'payday',
          accountId: 'checking',
          date: '2026-01-01',
          description: 'Payroll',
          memo: 'Paycheck',
          counterparty: 'Salary',
          amount: 1000,
        },
      ],
    });
    expect(summaries[1]).toEqual({
      date: '2026-01-02',
      openingBalance: 1200,
      income: 0,
      expenses: 45.25,
      closingBalance: 1154.75,
      transactions: [
        {
          id: 'grocery-trip',
          accountId: 'checking',
          date: '2026-01-02',
          description: 'Groceries',
          memo: 'Weekly run',
          counterparty: 'Groceries',
          amount: -45.25,
        },
      ],
    });
    expect(summaries[2].openingBalance).toBe(1154.75);
    expect(summaries[2].closingBalance).toBe(1154.75);

    const grid = buildMonthGrid(summaries, '2026-01', '2026-01-01', '2026-01-31');
    expect(grid).toHaveLength(35);
    expect(grid[0].date).toBe('2025-12-29');
    expect(grid[3].date).toBe('2026-01-01');
    expect(grid[3].inRange).toBe(true);
    expect(grid[3].income).toBe(1000);
    expect(grid[4].expenses).toBe(45.25);
  });

  it('lists months and range totals', () => {
    const parsed = parseGnucashXml(sampleGnucashXml);
    const summaries = buildAccountDaySummaries(parsed, 'checking', '2026-01-01', '2026-02-05');

    expect(listMonthsBetween('2026-01-01', '2026-02-05')).toEqual(['2026-01', '2026-02']);
    expect(summarizeRange(summaries)).toEqual({
      openingBalance: 200,
      closingBalance: 1154.75,
      income: 1000,
      expenses: 45.25,
    });
  });

  it('groups transactions by counterparty for range insights', () => {
    const parsed = parseGnucashXml(sampleGnucashXml);
    const grouped = groupTransactionsByCounterparty(parsed.transactions);

    expect(grouped).toEqual([
      {
        label: 'Salary',
        count: 2,
        income: 1000,
        expenses: 0,
        net: 1000,
      },
      {
        label: 'Groceries',
        count: 1,
        income: 0,
        expenses: 45.25,
        net: -45.25,
      },
    ]);
  });
});