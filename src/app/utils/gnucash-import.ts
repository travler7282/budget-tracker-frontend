import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';

type GnucashSourceFormat = 'xml' | 'gzip-xml' | 'sqlite' | 'gzip-sqlite';
type SqlValue = string | number | bigint | Uint8Array | null;

interface AccountRow {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

interface TransactionSplit {
  transactionId: string;
  postedAt: SqlValue;
  description: string;
  accountId: string;
  memo: string | null;
  amount: number;
}

interface GroupedTransactionSummary {
  label: string;
  count: number;
  income: number;
  expenses: number;
  net: number;
}

let sqlModulePromise: Promise<SqlJsModule> | null = null;

export interface GnucashAccount {
  id: string;
  name: string;
  fullName: string;
  type: string;
  parentId: string | null;
}

export interface GnucashTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  memo: string | null;
  counterparty: string | null;
  amount: number;
}

export interface GnucashImportData {
  accounts: GnucashAccount[];
  transactions: GnucashTransaction[];
  sourceFormat: GnucashSourceFormat;
}

export interface GnucashDaySummary {
  date: string;
  openingBalance: number;
  income: number;
  expenses: number;
  closingBalance: number;
  transactions: GnucashTransaction[];
}

export interface GnucashMonthDayCell extends GnucashDaySummary {
  key: string;
  inMonth: boolean;
  inRange: boolean;
}

export async function parseGnucashFile(file: File): Promise<GnucashImportData> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const compressed = isGzipBytes(bytes);
  const rawBytes = compressed ? await gunzipBytes(bytes) : bytes;

  if (isSqliteBytes(rawBytes)) {
    return parseGnucashSqlite(rawBytes, compressed ? 'gzip-sqlite' : 'sqlite');
  }

  return parseGnucashXml(new TextDecoder().decode(rawBytes), compressed ? 'gzip-xml' : 'xml');
}

export function parseGnucashXml(
  xmlText: string,
  sourceFormat: GnucashSourceFormat = 'xml',
): GnucashImportData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('The selected file is not valid GnuCash XML.');
  }

  const rawAccounts = findElements(doc.documentElement, 'account')
    .map((accountNode) => {
      const id = readPathText(accountNode, ['id']);
      const name = readPathText(accountNode, ['name']);
      const type = readPathText(accountNode, ['type']);

      if (!id || !name || !type) {
        return null;
      }

      return {
        id,
        name,
        type,
        parentId: readPathText(accountNode, ['parent']),
      };
    })
    .filter((account): account is AccountRow => account !== null);

  const accounts = finalizeAccounts(rawAccounts);
  const transactions = finalizeTransactions(
    findElements(doc.documentElement, 'transaction').flatMap((transactionNode) => {
      const transactionId = readPathText(transactionNode, ['id']) ?? createFallbackId();
      const description = readPathText(transactionNode, ['description']) ?? 'Transaction';
      const postedAt = readPathText(transactionNode, ['date-posted', 'date']);
      const date = normalizeGnucashDate(postedAt);

      if (!date) {
        return [];
      }

      const splits: TransactionSplit[] = [];
      for (const splitNode of findElements(transactionNode, 'split')) {
        const accountId = readPathText(splitNode, ['account']);
        const value = parseGnucashFraction(readPathText(splitNode, ['value']));
        if (!accountId || value === null) {
          continue;
        }

        splits.push({
          transactionId,
          postedAt: postedAt ?? date,
          description,
          accountId,
          memo: readPathText(splitNode, ['memo']),
          amount: value,
        });
      }

      return splits;
    }),
    accounts,
  );

  return { accounts, transactions, sourceFormat };
}

export function buildAccountDaySummaries(
  importData: GnucashImportData,
  accountId: string,
  startDate: string,
  endDate: string,
): GnucashDaySummary[] {
  if (!startDate || !endDate || startDate > endDate) {
    return [];
  }

  const accountTransactions = importData.transactions
    .filter((transaction) => transaction.accountId === accountId)
    .sort((left, right) => compareIsoDates(left.date, right.date));

  const openingBalance = roundMoney(
    accountTransactions
      .filter((transaction) => transaction.date < startDate)
      .reduce((total, transaction) => total + transaction.amount, 0),
  );

  const transactionsByDate = new Map<string, GnucashTransaction[]>();
  for (const transaction of accountTransactions) {
    if (transaction.date < startDate || transaction.date > endDate) {
      continue;
    }

    const existing = transactionsByDate.get(transaction.date) ?? [];
    existing.push(transaction);
    transactionsByDate.set(transaction.date, existing);
  }

  const summaries: GnucashDaySummary[] = [];
  let cursor = startDate;
  let balance = openingBalance;

  while (cursor <= endDate) {
    const transactions = (transactionsByDate.get(cursor) ?? []).slice().sort(sortTransactions);
    const income = roundMoney(
      transactions.filter((transaction) => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0),
    );
    const expenses = roundMoney(
      transactions
        .filter((transaction) => transaction.amount < 0)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
    );
    const opening = balance;
    const closing = roundMoney(opening + income - expenses);

    summaries.push({
      date: cursor,
      openingBalance: opening,
      income,
      expenses,
      closingBalance: closing,
      transactions,
    });

    balance = closing;
    cursor = addDays(cursor, 1);
  }

  return summaries;
}

export function buildMonthGrid(
  summaries: GnucashDaySummary[],
  monthKey: string,
  startDate: string,
  endDate: string,
): GnucashMonthDayCell[] {
  const firstOfMonth = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(firstOfMonth.getTime())) {
    return [];
  }

  const monthStart = isoDate(firstOfMonth);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(1);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));

  const lastOfMonth = new Date(firstOfMonth);
  lastOfMonth.setMonth(lastOfMonth.getMonth() + 1, 0);
  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(gridEnd.getDate() + (6 - ((gridEnd.getDay() + 6) % 7)));

  const summaryMap = new Map(summaries.map((summary) => [summary.date, summary]));
  const cells: GnucashMonthDayCell[] = [];
  let cursor = isoDate(gridStart);
  const finalDate = isoDate(gridEnd);

  while (cursor <= finalDate) {
    const summary = summaryMap.get(cursor);
    const inMonth = cursor.startsWith(monthStart.slice(0, 7));
    cells.push({
      key: cursor,
      date: cursor,
      inMonth,
      inRange: cursor >= startDate && cursor <= endDate,
      openingBalance: summary?.openingBalance ?? 0,
      income: summary?.income ?? 0,
      expenses: summary?.expenses ?? 0,
      closingBalance: summary?.closingBalance ?? 0,
      transactions: summary?.transactions ?? [],
    });
    cursor = addDays(cursor, 1);
  }

  return cells;
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
    months.push(isoDate(cursor).slice(0, 7));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

export function summarizeRange(summaries: GnucashDaySummary[]): {
  openingBalance: number;
  closingBalance: number;
  income: number;
  expenses: number;
} {
  if (summaries.length === 0) {
    return {
      openingBalance: 0,
      closingBalance: 0,
      income: 0,
      expenses: 0,
    };
  }

  return {
    openingBalance: summaries[0].openingBalance,
    closingBalance: summaries[summaries.length - 1].closingBalance,
    income: roundMoney(summaries.reduce((sum, summary) => sum + summary.income, 0)),
    expenses: roundMoney(summaries.reduce((sum, summary) => sum + summary.expenses, 0)),
  };
}

export function groupTransactionsByCounterparty(
  transactions: GnucashTransaction[],
): GroupedTransactionSummary[] {
  const groups = new Map<string, GroupedTransactionSummary>();

  for (const transaction of transactions) {
    const label = transaction.counterparty || transaction.description || 'Uncategorized';
    const current = groups.get(label) ?? {
      label,
      count: 0,
      income: 0,
      expenses: 0,
      net: 0,
    };

    current.count += 1;
    if (transaction.amount >= 0) {
      current.income = roundMoney(current.income + transaction.amount);
    } else {
      current.expenses = roundMoney(current.expenses + Math.abs(transaction.amount));
    }
    current.net = roundMoney(current.income - current.expenses);
    groups.set(label, current);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const activityGap = Math.abs(right.net) - Math.abs(left.net);
    if (activityGap !== 0) {
      return activityGap;
    }
    return right.count - left.count;
  });
}

async function parseGnucashSqlite(
  bytes: Uint8Array,
  sourceFormat: GnucashSourceFormat,
): Promise<GnucashImportData> {
  const SQL = await loadSqlJsModule();
  const db = new SQL.Database(bytes);

  try {
    const rawAccounts = execRows(db, `
      select
        guid as id,
        name,
        account_type as type,
        parent_guid as parentId
      from accounts
    `)
      .map((row) => {
        const id = toStringValue(row['id']);
        const name = toStringValue(row['name']);
        const type = toStringValue(row['type']);
        if (!id || !name || !type) {
          return null;
        }

        return {
          id,
          name,
          type,
          parentId: toNullableString(row['parentId']),
        } satisfies AccountRow;
      })
      .filter((account): account is AccountRow => account !== null);

    const accounts = finalizeAccounts(rawAccounts);
    const transactionSplits = execRows(db, `
      select
        t.guid as transactionId,
        t.post_date as postedAt,
        coalesce(t.description, '') as description,
        s.account_guid as accountId,
        s.memo as memo,
        s.value_num as valueNum,
        s.value_denom as valueDenom
      from transactions t
      inner join splits s on s.tx_guid = t.guid
      order by t.post_date asc, t.guid asc
    `)
      .map((row) => {
        const transactionId = toStringValue(row['transactionId']);
        const accountId = toStringValue(row['accountId']);
        const amount = parseGnucashNumericPair(row['valueNum'], row['valueDenom']);

        if (!transactionId || !accountId || amount === null) {
          return null;
        }

        return {
          transactionId,
          postedAt: row['postedAt'] ?? null,
          description: toStringValue(row['description']) ?? 'Transaction',
          accountId,
          memo: toNullableString(row['memo']),
          amount,
        } satisfies TransactionSplit;
      })
      .filter((split): split is TransactionSplit => split !== null);

    return {
      accounts,
      transactions: finalizeTransactions(transactionSplits, accounts),
      sourceFormat,
    };
  } finally {
    db.close();
  }
}

function finalizeAccounts(rawAccounts: AccountRow[]): GnucashAccount[] {
  const accountNameCache = new Map<string, string>();
  const accountMap = new Map(rawAccounts.map((account) => [account.id, account]));

  return rawAccounts
    .filter((account) => account.type !== 'ROOT')
    .map((account) => ({
      ...account,
      fullName: buildAccountFullName(account.id, accountMap, accountNameCache),
    }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
}

function finalizeTransactions(
  splits: TransactionSplit[],
  accounts: GnucashAccount[],
): GnucashTransaction[] {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const splitsByTransactionId = new Map<string, TransactionSplit[]>();

  for (const split of splits) {
    const existing = splitsByTransactionId.get(split.transactionId) ?? [];
    existing.push(split);
    splitsByTransactionId.set(split.transactionId, existing);
  }

  const transactions: GnucashTransaction[] = [];
  for (const transactionSplits of splitsByTransactionId.values()) {
    const date = normalizeSqliteDate(transactionSplits[0]?.postedAt);
    if (!date) {
      continue;
    }

    for (const split of transactionSplits) {
      if (!accountMap.has(split.accountId)) {
        continue;
      }

      transactions.push({
        id: split.transactionId,
        accountId: split.accountId,
        date,
        description: split.description,
        memo: split.memo,
        counterparty: describeCounterparty(transactionSplits, split.accountId, accountMap),
        amount: split.amount,
      });
    }
  }

  return transactions.sort((left, right) => {
    const byDate = compareIsoDates(left.date, right.date);
    if (byDate !== 0) {
      return byDate;
    }

    const byDescription = left.description.localeCompare(right.description);
    if (byDescription !== 0) {
      return byDescription;
    }

    return left.amount - right.amount;
  });
}

async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot open gzip-compressed GnuCash files.');
  }

  const copy = Uint8Array.from(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function loadSqlJsModule(): Promise<SqlJsModule> {
  sqlModulePromise ??= initSqlJs({
    locateFile: (file) => `/${file}`,
  });
  return sqlModulePromise;
}

function execRows(db: SqlJsDatabase, sql: string): Array<Record<string, SqlValue>> {
  const [result] = db.exec(sql);
  if (!result) {
    return [];
  }

  return result.values.map((values) => {
    const row: Record<string, SqlValue> = {};
    result.columns.forEach((column, index) => {
      row[column] = values[index] ?? null;
    });
    return row;
  });
}

function describeCounterparty(
  transactionSplits: TransactionSplit[],
  currentAccountId: string,
  accountMap: Map<string, GnucashAccount>,
): string | null {
  const labels = Array.from(
    new Set(
      transactionSplits
        .filter((split) => split.accountId !== currentAccountId)
        .map((split) => accountMap.get(split.accountId)?.fullName)
        .filter((label): label is string => Boolean(label)),
    ),
  );

  if (labels.length === 0) {
    return null;
  }

  if (labels.length <= 2) {
    return labels.join(', ');
  }

  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
}

function findElements(root: ParentNode, localName: string): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(
    (node): node is Element => node instanceof Element && node.localName === localName,
  );
}

function findChild(parent: Element, localName: string): Element | null {
  return Array.from(parent.children).find((node) => node.localName === localName) ?? null;
}

function readPathText(parent: Element, path: string[]): string | null {
  let current: Element | null = parent;
  for (const segment of path) {
    current = current ? findChild(current, segment) : null;
  }
  const value = current?.textContent?.trim() ?? '';
  return value || null;
}

function buildAccountFullName(
  accountId: string,
  accountMap: Map<string, { id: string; name: string; type: string; parentId: string | null }>,
  cache: Map<string, string>,
): string {
  const cached = cache.get(accountId);
  if (cached) {
    return cached;
  }

  const account = accountMap.get(accountId);
  if (!account) {
    return accountId;
  }

  const parent = account.parentId ? accountMap.get(account.parentId) : null;
  const fullName = parent && parent.type !== 'ROOT'
    ? `${buildAccountFullName(parent.id, accountMap, cache)}:${account.name}`
    : account.name;
  cache.set(accountId, fullName);
  return fullName;
}

function normalizeGnucashDate(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeSqliteDate(value: SqlValue): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const direct = normalizeGnucashDate(String(value));
  if (direct) {
    return direct;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const absolute = Math.abs(numeric);
    const asDate = new Date(
      absolute > 1_000_000_000_000_000
        ? numeric / 1_000
        : absolute > 1_000_000_000_000
          ? numeric
          : absolute > 1_000_000_000
            ? numeric * 1_000
            : numeric,
    );

    if (!Number.isNaN(asDate.getTime())) {
      return isoDate(asDate);
    }
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : isoDate(parsed);
}

function parseGnucashFraction(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const [numeratorText, denominatorText] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? '1');
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return roundMoney(numerator / denominator);
}

function parseGnucashNumericPair(
  numeratorValue: SqlValue,
  denominatorValue: SqlValue,
): number | null {
  const numerator = Number(numeratorValue);
  const denominator = Number(denominatorValue);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return roundMoney(numerator / denominator);
}

function sortTransactions(left: GnucashTransaction, right: GnucashTransaction): number {
  const byAmount = left.amount - right.amount;
  if (byAmount !== 0) {
    return byAmount;
  }
  return left.description.localeCompare(right.description);
}

function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return isoDate(next);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function isSqliteBytes(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, 16)) === 'SQLite format 3\0';
}

function toStringValue(value: SqlValue): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableString(value: SqlValue): string | null {
  return toStringValue(value);
}

function createFallbackId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tx-${Math.random().toString(36).slice(2, 10)}`;
}

interface SqlJsQueryResult {
  columns: string[];
  values: SqlValue[][];
}

interface SqlJsDatabase {
  exec(sql: string, params?: SqlValue[]): SqlJsQueryResult[];
  close(): void;
}

interface SqlJsModule {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
}