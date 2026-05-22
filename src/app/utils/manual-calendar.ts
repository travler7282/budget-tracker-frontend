export interface ManualCalendarTransaction {
  id: string;
  date: string;
  name: string;
  description: string;
  category: string;
  amount: number;
  order: number;
}

export interface ManualCalendarDaySummary {
  date: string;
  openingBalance: number;
  income: number;
  expenses: number;
  closingBalance: number;
  transactions: ManualCalendarTransaction[];
}

export interface ManualCalendarDayCell extends ManualCalendarDaySummary {
  key: string;
  inMonth: boolean;
}

export function buildDaySummaries(
  startingDate: string,
  startingBalance: number,
  transactions: ManualCalendarTransaction[],
): ManualCalendarDaySummary[] {
  if (!startingDate) {
    return [];
  }

  const sortedTransactions = transactions
    .filter((transaction) => transaction.date >= startingDate)
    .slice()
    .sort(sortTransactions);

  const endDate = sortedTransactions.at(-1)?.date ?? startingDate;
  const transactionsByDate = new Map<string, ManualCalendarTransaction[]>();

  for (const transaction of sortedTransactions) {
    const existing = transactionsByDate.get(transaction.date) ?? [];
    existing.push(transaction);
    transactionsByDate.set(transaction.date, existing);
  }

  const summaries: ManualCalendarDaySummary[] = [];
  let date = startingDate;
  let balance = roundMoney(startingBalance);

  while (date <= endDate) {
    const dayTransactions = (transactionsByDate.get(date) ?? []).slice().sort(sortTransactions);
    const income = roundMoney(
      dayTransactions
        .filter((transaction) => transaction.amount > 0)
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    );
    const expenses = roundMoney(
      dayTransactions
        .filter((transaction) => transaction.amount < 0)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
    );
    const openingBalance = balance;
    const closingBalance = roundMoney(openingBalance + income - expenses);

    summaries.push({
      date,
      openingBalance,
      income,
      expenses,
      closingBalance,
      transactions: dayTransactions,
    });

    balance = closingBalance;
    date = addDays(date, 1);
  }

  return summaries;
}

export function buildMonthGrid(
  summaries: ManualCalendarDaySummary[],
  monthKey: string,
): ManualCalendarDayCell[] {
  const firstOfMonth = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(firstOfMonth.getTime())) {
    return [];
  }

  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(1);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));

  const lastOfMonth = new Date(firstOfMonth);
  lastOfMonth.setMonth(lastOfMonth.getMonth() + 1, 0);
  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(gridEnd.getDate() + (6 - ((gridEnd.getDay() + 6) % 7)));

  const summaryMap = new Map(summaries.map((summary) => [summary.date, summary]));
  const firstSummaryDate = summaries[0]?.date ?? null;
  const cells: ManualCalendarDayCell[] = [];
  let date = toIsoDate(gridStart);
  const finalDate = toIsoDate(gridEnd);
  let lastKnownClosingBalance: number | null = null;

  while (date <= finalDate) {
    const summary = summaryMap.get(date);
    const hasCarryForward =
      !summary &&
      firstSummaryDate !== null &&
      date >= firstSummaryDate &&
      lastKnownClosingBalance !== null;

    const openingBalance = summary
      ? summary.openingBalance
      : hasCarryForward
        ? (lastKnownClosingBalance ?? 0)
        : 0;
    const closingBalance = summary
      ? summary.closingBalance
      : hasCarryForward
        ? (lastKnownClosingBalance ?? 0)
        : 0;

    if (summary) {
      lastKnownClosingBalance = summary.closingBalance;
    }

    cells.push({
      key: date,
      date,
      inMonth: date.startsWith(monthKey),
      openingBalance,
      income: summary?.income ?? 0,
      expenses: summary?.expenses ?? 0,
      closingBalance,
      transactions: summary?.transactions ?? [],
    });
    date = addDays(date, 1);
  }

  return cells;
}

export function summarizeByCategory(transactions: ManualCalendarTransaction[]): Array<{
  category: string;
  income: number;
  expenses: number;
  net: number;
  count: number;
}> {
  const grouped = new Map<string, { category: string; income: number; expenses: number; net: number; count: number }>();

  for (const transaction of transactions) {
    const category = transaction.category.trim() || 'Uncategorized';
    const entry = grouped.get(category) ?? {
      category,
      income: 0,
      expenses: 0,
      net: 0,
      count: 0,
    };

    entry.count += 1;
    if (transaction.amount >= 0) {
      entry.income = roundMoney(entry.income + transaction.amount);
    } else {
      entry.expenses = roundMoney(entry.expenses + Math.abs(transaction.amount));
    }
    entry.net = roundMoney(entry.income - entry.expenses);
    grouped.set(category, entry);
  }

  return Array.from(grouped.values()).sort((left, right) => Math.abs(right.net) - Math.abs(left.net));
}

export function listMonthsBetween(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) {
    return [];
  }

  const months: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  cursor.setDate(1);
  const end = new Date(`${endDate}T00:00:00`);
  end.setDate(1);

  while (cursor <= end) {
    months.push(toIsoDate(cursor).slice(0, 7));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

export function summarizeRange(summaries: ManualCalendarDaySummary[]): {
  openingBalance: number;
  income: number;
  expenses: number;
  closingBalance: number;
} {
  if (summaries.length === 0) {
    return {
      openingBalance: 0,
      income: 0,
      expenses: 0,
      closingBalance: 0,
    };
  }

  return {
    openingBalance: summaries[0].openingBalance,
    income: roundMoney(summaries.reduce((sum, summary) => sum + summary.income, 0)),
    expenses: roundMoney(summaries.reduce((sum, summary) => sum + summary.expenses, 0)),
    closingBalance: summaries[summaries.length - 1].closingBalance,
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return toIsoDate(value);
}

function sortTransactions(
  left: ManualCalendarTransaction,
  right: ManualCalendarTransaction,
): number {
  const byDate = left.date.localeCompare(right.date);
  if (byDate !== 0) {
    return byDate;
  }

  const byAmount = left.amount - right.amount;
  if (byAmount !== 0) {
    return byAmount;
  }

  return left.name.localeCompare(right.name);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}