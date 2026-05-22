import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  ManualCalendarDaySummary,
  ManualCalendarTransaction,
  buildDaySummaries,
  buildMonthGrid,
  listMonthsBetween,
  summarizeByCategory,
  summarizeRange,
} from '../utils/manual-calendar';

interface ManualCalendarState {
  startingDate: string;
  startingBalance: number;
  transactions: ManualCalendarTransaction[];
}

type TransactionKind = 'deposit' | 'withdrawal';

interface ChartInputPoint {
  key: string;
  label: string;
  value: number;
  amountLabel: string;
  tooltip: string;
  tone: 'neutral' | 'positive' | 'negative' | 'opening';
}

interface ChartPoint extends ChartInputPoint {
  x: number;
  y: number;
  showLabel: boolean;
}

interface ChartTick {
  value: number;
  label: string;
  y: number;
}

interface ChartConfig {
  width: number;
  height: number;
  points: ChartPoint[];
  yTicks: ChartTick[];
  linePoints: string;
}

@Component({
  selector: 'app-manual-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe],
  templateUrl: './gnucash-calendar.component.html',
  styleUrl: './gnucash-calendar.component.scss',
})
export class ManualCalendarComponent {
  private readonly fb = inject(FormBuilder);
  private readonly storageKey = 'budget_tracker_manual_calendar_v1';
  readonly minChartZoom = 0.05;
  readonly maxChartZoom = 2.5;
  private readonly currencyFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  });
  private readonly compactCurrencyFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  readonly weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly selectedDate = signal<string | null>(null);
  readonly visibleMonthIndex = signal(0);
  readonly editingTransactionId = signal<string | null>(null);
  readonly importing = signal(false);
  readonly chartZoom = signal(1);
  readonly state = signal<ManualCalendarState>(this.loadState());

  readonly settingsForm = this.fb.nonNullable.group({
    startingDate: [this.state().startingDate, Validators.required],
    startingBalance: [this.state().startingBalance, Validators.required],
  });

  readonly transactionForm = this.fb.nonNullable.group({
    date: [this.state().startingDate, Validators.required],
    name: ['', Validators.required],
    description: [''],
    category: [''],
    kind: ['withdrawal' as TransactionKind, Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
  });

  readonly transactions = computed(() =>
    this.state()
      .transactions
      .slice()
      .sort((left, right) => right.date.localeCompare(left.date) || right.amount - left.amount),
  );

  readonly summaries = computed(() =>
    buildDaySummaries(
      this.state().startingDate,
      this.state().startingBalance,
      this.state().transactions,
    ),
  );

  readonly monthKeys = computed(() => {
    const summaries = this.summaries();
    const startDate = this.state().startingDate;
    const endDate = summaries.at(-1)?.date ?? startDate;
    return listMonthsBetween(startDate, endDate);
  });

  readonly visibleMonthKey = computed(() => {
    const months = this.monthKeys();
    if (months.length === 0) {
      return '';
    }

    const index = Math.min(Math.max(this.visibleMonthIndex(), 0), months.length - 1);
    return months[index] ?? '';
  });

  readonly visibleMonthLabel = computed(() => {
    const monthKey = this.visibleMonthKey();
    if (!monthKey) {
      return '';
    }

    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${monthKey}-01T00:00:00`));
  });

  readonly visibleMonthCells = computed(() => {
    const monthKey = this.visibleMonthKey();
    if (!monthKey) {
      return [];
    }

    return buildMonthGrid(this.summaries(), monthKey);
  });

  readonly rangeTotals = computed(() => summarizeRange(this.summaries()));
  readonly transactionCount = computed(() => this.transactions().length);
  readonly monthTransactions = computed(() => {
    const monthKey = this.visibleMonthKey();
    if (!monthKey) {
      return [];
    }

    return this.transactions().filter((transaction) => transaction.date.startsWith(monthKey));
  });
  readonly categorySummary = computed(() => summarizeByCategory(this.monthTransactions()));
  readonly selectedDaySummary = computed(() => {
    const selectedDate = this.selectedDate();
    if (!selectedDate) {
      return this.summaries()[0] ?? null;
    }

    return this.summaries().find((summary) => summary.date === selectedDate) ?? null;
  });

  readonly canGoToPreviousMonth = computed(() => this.visibleMonthIndex() > 0);
  readonly canGoToNextMonth = computed(
    () => this.visibleMonthIndex() < this.monthKeys().length - 1,
  );
  readonly balanceTrendChart = computed(() =>
    this.buildChartSeries(
      this.buildDailyBalancePoints(this.summaries()),
      this.chartZoom(),
    ),
  );
  readonly cashFlowChart = computed(() =>
    this.buildChartSeries(
      this.buildTransactionCashFlowPoints(this.state().startingDate, this.state().startingBalance, this.transactions()),
      this.chartZoom(),
    ),
  );
  readonly chartPointCount = computed(() =>
    Math.max(this.balanceTrendChart().points.length, this.cashFlowChart().points.length),
  );

  readonly isEditing = computed(() => this.editingTransactionId() !== null);

  constructor() {
    this.selectedDate.set(this.state().startingDate);
  }

  applyStartingBalance(): void {
    if (this.settingsForm.invalid) {
      return;
    }

    const { startingDate, startingBalance } = this.settingsForm.getRawValue();
    const existingTransactions = this.state().transactions;
    const earliestTransaction = existingTransactions
      .map((transaction) => transaction.date)
      .sort()[0];

    if (earliestTransaction && earliestTransaction < startingDate) {
      this.error.set('Starting date cannot be later than the earliest saved transaction.');
      return;
    }

    this.error.set(null);
    this.state.set({
      startingDate,
      startingBalance: Number(startingBalance) || 0,
      transactions: existingTransactions,
    });
    this.transactionForm.patchValue({ date: startingDate });
    this.selectedDate.set(startingDate);
    this.visibleMonthIndex.set(0);
    this.persistState();
  }

  addTransaction(): void {
    if (this.transactionForm.invalid) {
      return;
    }

    const { date, name, description, category, kind, amount } = this.transactionForm.getRawValue();
    if (date < this.state().startingDate) {
      this.error.set('Transaction date must be on or after the starting balance date.');
      return;
    }

    const signedAmount = kind === 'deposit' ? Number(amount) : -Number(amount);
    const editingTransactionId = this.editingTransactionId();
    const existingTransaction = editingTransactionId
      ? this.state().transactions.find((entry) => entry.id === editingTransactionId) ?? null
      : null;
    const transaction: ManualCalendarTransaction = {
      id: editingTransactionId ?? this.createId(),
      date,
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      amount: signedAmount,
      order: existingTransaction?.order ?? this.nextOrderForDate(date),
    };

    this.error.set(null);
    this.state.update((current) => {
      const transactions = current.transactions.filter((entry) => entry.id !== transaction.id);
      transactions.push(transaction);
      return { ...current, transactions };
    });
    this.selectedDate.set(date);
    this.persistState();
    this.transactionForm.reset({
      date,
      name: '',
      description: '',
      category: '',
      kind: 'withdrawal',
      amount: 0,
    });
    this.editingTransactionId.set(null);
  }

  removeTransaction(transactionId: string): void {
    this.state.update((current) => ({
      ...current,
      transactions: current.transactions.filter((transaction) => transaction.id !== transactionId),
    }));
    if (this.editingTransactionId() === transactionId) {
      this.cancelEdit();
    }
    this.persistState();
  }

  editTransaction(transactionId: string): void {
    const transaction = this.transactions().find((entry) => entry.id === transactionId);
    if (!transaction) {
      return;
    }

    this.editingTransactionId.set(transaction.id);
    this.transactionForm.patchValue({
      date: transaction.date,
      name: transaction.name,
      description: transaction.description,
      category: transaction.category,
      kind: transaction.amount >= 0 ? 'deposit' : 'withdrawal',
      amount: Math.abs(transaction.amount),
    });
    this.selectedDate.set(transaction.date);
  }

  cancelEdit(): void {
    this.editingTransactionId.set(null);
    this.transactionForm.patchValue({
      date: this.state().startingDate,
      name: '',
      description: '',
      category: '',
      kind: 'withdrawal',
      amount: 0,
    });
  }

  moveTransaction(transactionId: string, direction: -1 | 1): void {
    this.state.update((current) => {
      const transaction = current.transactions.find((entry) => entry.id === transactionId);
      if (!transaction) {
        return current;
      }

      const dayTransactions = current.transactions
        .filter((entry) => entry.date === transaction.date)
        .slice()
        .sort((left, right) => left.order - right.order);
      const index = dayTransactions.findIndex((entry) => entry.id === transactionId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= dayTransactions.length) {
        return current;
      }

      const currentTransaction = dayTransactions[index];
      const targetTransaction = dayTransactions[targetIndex];
      const currentOrder = currentTransaction.order;
      currentTransaction.order = targetTransaction.order;
      targetTransaction.order = currentOrder;

      return {
        ...current,
        transactions: current.transactions.map((entry) => {
          const replacement = dayTransactions.find((candidate) => candidate.id === entry.id);
          return replacement ?? entry;
        }),
      };
    });
    this.persistState();
  }

  exportJson(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      startingDate: this.state().startingDate,
      startingBalance: this.state().startingBalance,
      transactionCount: this.transactions().length,
      categorySummary: this.categorySummary(),
      transactions: this.transactions(),
    };
    this.downloadFile(
      `manual-calendar-${this.state().startingDate}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
  }

  exportCsv(): void {
    const headers = ['date', 'name', 'description', 'category', 'kind', 'amount', 'order'];
    const rows = this.transactions().map((transaction) => {
      const kind = transaction.amount >= 0 ? 'deposit' : 'withdrawal';
      const amount = Math.abs(transaction.amount).toFixed(2);
      return [
        transaction.date,
        transaction.name,
        transaction.description,
        transaction.category,
        kind,
        amount,
        String(transaction.order),
      ]
        .map((value) => this.escapeCsv(value))
        .join(',');
    });

    this.downloadFile(
      `manual-calendar-${this.state().startingDate}.csv`,
      [
        '# manual-calendar export',
        `# startingDate: ${this.state().startingDate}`,
        `# startingBalance: ${this.state().startingBalance}`,
        `# exportedAt: ${new Date().toISOString()}`,
        headers.join(','),
        ...rows,
      ].join('\n'),
      'text/csv;charset=utf-8',
    );
  }

  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.importing.set(true);
    this.error.set(null);
    this.info.set(null);

    try {
      const text = await file.text();
      const importedState = this.parseImportedCalendar(file.name, text);

      if (!importedState) {
        this.error.set('That file does not look like a manual calendar export.');
        return;
      }

      this.state.set(importedState);
      this.settingsForm.reset({
        startingDate: importedState.startingDate,
        startingBalance: importedState.startingBalance,
      });
      this.transactionForm.reset({
        date: importedState.startingDate,
        name: '',
        description: '',
        category: '',
        kind: 'withdrawal',
        amount: 0,
      });
      this.selectedDate.set(importedState.startingDate);
      this.visibleMonthIndex.set(0);
      this.editingTransactionId.set(null);
      this.persistState();
      this.info.set(`Imported ${importedState.transactions.length} transaction(s) from ${file.name}.`);
    } catch (importError) {
      this.error.set(importError instanceof Error ? importError.message : 'Failed to import the selected file.');
    } finally {
      this.importing.set(false);
      input.value = '';
    }
  }

  resetCalendar(): void {
    const startingDate = this.todayString();
    const nextState: ManualCalendarState = {
      startingDate,
      startingBalance: 0,
      transactions: [],
    };

    this.state.set(nextState);
    this.settingsForm.reset(nextState);
    this.transactionForm.reset({
      date: startingDate,
      name: '',
      description: '',
      category: '',
      kind: 'withdrawal',
      amount: 0,
    });
    this.selectedDate.set(startingDate);
    this.visibleMonthIndex.set(0);
    this.error.set(null);
    this.editingTransactionId.set(null);
    this.persistState();
  }

  goToPreviousMonth(): void {
    if (!this.canGoToPreviousMonth()) {
      return;
    }

    this.visibleMonthIndex.update((index) => Math.max(index - 1, 0));
  }

  goToNextMonth(): void {
    if (!this.canGoToNextMonth()) {
      return;
    }

    this.visibleMonthIndex.update((index) => index + 1);
  }

  selectDate(date: string): void {
    this.selectedDate.set(date);
  }

  isSelectedDate(date: string): boolean {
    return this.selectedDate() === date;
  }

  isDeposit(value: number): boolean {
    return value >= 0;
  }

  absoluteValue(value: number): number {
    return Math.abs(value);
  }

  formatCellAmount(value: number): string {
    return this.compactCurrencyFormatter.format(value);
  }

  formatFullAmount(value: number): string {
    return this.formatMoney(value);
  }

  setChartZoom(level: number): void {
    const normalized = Number.isFinite(level) ? level : 1;
    this.chartZoom.set(Math.min(this.maxChartZoom, Math.max(this.minChartZoom, normalized)));
  }

  zoomInCharts(): void {
    this.setChartZoom(this.chartZoom() + 0.2);
  }

  zoomOutCharts(): void {
    this.setChartZoom(this.chartZoom() - 0.2);
  }

  resetChartZoom(): void {
    this.chartZoom.set(1);
  }

  fitChartsToDates(): void {
    const pointCount = this.chartPointCount();
    if (pointCount <= 1) {
      this.chartZoom.set(1);
      return;
    }

    const baseWidth = Math.max(320, 160 + (pointCount - 1) * 96);
    const chartScrollWidths =
      typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll<HTMLElement>('.chart-scroll')).map((el) => el.clientWidth)
        : [];
    const narrowestViewport = chartScrollWidths.length > 0 ? Math.min(...chartScrollWidths) : 640;
    const targetWidth = Math.max(320, narrowestViewport);
    this.setChartZoom(targetWidth / baseWidth);
  }

  private buildChartSeries(points: ChartInputPoint[], zoomLevel: number): ChartConfig {
    if (points.length === 0) {
      return {
        width: 720,
        height: 260,
        points: [],
        yTicks: [],
        linePoints: '',
      };
    }

    const width = Math.max(320, (160 + (points.length - 1) * 96) * zoomLevel);
    const height = 260;
    const paddingLeft = 78;
    const paddingRight = 28;
    const paddingTop = 28;
    const paddingBottom = 64;
    const innerWidth = Math.max(1, width - paddingLeft - paddingRight);
    const innerHeight = Math.max(1, height - paddingTop - paddingBottom);

    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const targetLabels = Math.max(5, Math.round(10 * zoomLevel));
    const labelEvery = points.length <= targetLabels ? 1 : Math.ceil(points.length / targetLabels);

    const chartPoints = points.map((point, index) => {
      const x = points.length > 1 ? paddingLeft + (index * innerWidth) / (points.length - 1) : paddingLeft + innerWidth / 2;
      const normalized = (point.value - min) / range;
      const y = paddingTop + innerHeight - normalized * innerHeight;

      return {
        ...point,
        x,
        y,
        showLabel: index % labelEvery === 0 || index === points.length - 1,
      };
    });

    const linePoints = chartPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, index) => {
      const tickValue = min + (range * index) / tickCount;
      const y = paddingTop + innerHeight - ((tickValue - min) / range) * innerHeight;

      return {
        value: tickValue,
        label: this.formatMoney(tickValue),
        y,
      };
    });

    return {
      width,
      height,
      points: chartPoints,
      yTicks,
      linePoints,
    };
  }

  private buildDailyBalancePoints(summaries: ManualCalendarDaySummary[]): ChartInputPoint[] {
    if (summaries.length === 0) {
      return [];
    }

    const startingDate = summaries[0].date;
    const points: ChartInputPoint[] = [
      {
        key: `opening-${startingDate}`,
        label: this.formatChartDate(startingDate),
        value: summaries[0].openingBalance,
        amountLabel: 'Opening',
        tooltip: `${this.formatFullDate(startingDate)} · opening balance ${this.formatMoney(summaries[0].openingBalance)}`,
        tone: 'opening',
      },
    ];

    for (const summary of summaries) {
      points.push({
        key: summary.date,
        label: this.formatChartDate(summary.date),
        value: summary.closingBalance,
        amountLabel: summary.transactions.length > 0
          ? `${summary.transactions.length} txn`
          : 'No txns',
        tooltip: `${this.formatFullDate(summary.date)} · closing balance ${this.formatMoney(summary.closingBalance)}`,
        tone: 'neutral',
      });
    }

    return points;
  }

  private buildTransactionCashFlowPoints(
    startingDate: string,
    startingBalance: number,
    transactions: ManualCalendarTransaction[],
  ): ChartInputPoint[] {
    const orderedTransactions = transactions
      .slice()
      .sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order || left.name.localeCompare(right.name));

    const points: ChartInputPoint[] = [
      {
        key: `opening-${startingDate}`,
        label: this.formatChartDate(startingDate),
        value: startingBalance,
        amountLabel: 'Opening',
        tooltip: `${this.formatFullDate(startingDate)} · opening balance ${this.formatMoney(startingBalance)}`,
        tone: 'opening',
      },
    ];

    let runningBalance = startingBalance;
    for (const transaction of orderedTransactions) {
      runningBalance = this.roundMoney(runningBalance + transaction.amount);
      points.push({
        key: transaction.id,
        label: this.formatChartDate(transaction.date),
        value: runningBalance,
        amountLabel: `${transaction.amount >= 0 ? '+' : '-'}${this.formatMoney(Math.abs(transaction.amount))}`,
        tooltip: `${this.formatFullDate(transaction.date)} · ${transaction.name} · ${transaction.amount >= 0 ? 'deposit' : 'withdrawal'} ${this.formatMoney(Math.abs(transaction.amount))} · running balance ${this.formatMoney(runningBalance)}`,
        tone: transaction.amount >= 0 ? 'positive' : 'negative',
      });
    }

    return points;
  }

  private loadState(): ManualCalendarState {
    const fallback: ManualCalendarState = {
      startingDate: this.todayString(),
      startingBalance: 0,
      transactions: [],
    };

    if (typeof localStorage === 'undefined') {
      return fallback;
    }

    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ManualCalendarState>;
      const startingDate = typeof parsed.startingDate === 'string' ? parsed.startingDate : fallback.startingDate;
      const startingBalance = Number(parsed.startingBalance ?? fallback.startingBalance) || 0;
      const transactions = Array.isArray(parsed.transactions)
        ? parsed.transactions
            .map((entry) => this.normalizeTransaction(entry))
            .filter((entry): entry is ManualCalendarTransaction => entry !== null)
        : [];

      return {
        startingDate,
        startingBalance,
        transactions,
      };
    } catch {
      return fallback;
    }
  }

  private persistState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.storageKey, JSON.stringify(this.state()));
  }

  private normalizeTransaction(entry: unknown): ManualCalendarTransaction | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const candidate = entry as Partial<ManualCalendarTransaction>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.date !== 'string' ||
      !this.isIsoDate(candidate.date) ||
      typeof candidate.name !== 'string' ||
      candidate.name.trim().length === 0 ||
      typeof candidate.description !== 'string'
    ) {
      return null;
    }

    const amount = Number(candidate.amount);
    const order = Number(candidate.order ?? 0);
    if (!Number.isFinite(amount)) {
      return null;
    }

    return {
      id: candidate.id,
      date: candidate.date,
      name: candidate.name,
      description: candidate.description,
      category: typeof candidate.category === 'string' ? candidate.category : '',
      amount,
      order: Number.isFinite(order) ? order : 0,
    };
  }

  private parseImportedCalendar(fileName: string, text: string): ManualCalendarState | null {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
      return this.parseImportedJson(text);
    }

    return this.parseImportedCsv(text);
  }

  private parseImportedJson(text: string): ManualCalendarState | null {
    try {
      const parsed = JSON.parse(text) as Partial<ManualCalendarState>;
      const startingDate = typeof parsed.startingDate === 'string' && this.isIsoDate(parsed.startingDate)
        ? parsed.startingDate
        : '';
      const startingBalance = Number(parsed.startingBalance ?? 0) || 0;
      const transactions = Array.isArray(parsed.transactions)
        ? parsed.transactions
            .map((entry) => this.normalizeTransaction(entry))
            .filter((entry): entry is ManualCalendarTransaction => entry !== null)
        : [];

      if (transactions.length === 0 && !startingDate) {
        return null;
      }

      const fallbackDate = transactions[0]?.date ?? this.todayString();
      const importDate = startingDate || fallbackDate;

      return {
        startingDate: importDate,
        startingBalance,
        transactions: transactions.filter((transaction) => transaction.date >= importDate),
      };
    } catch {
      return null;
    }
  }

  private parseImportedCsv(text: string): ManualCalendarState | null {
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n');
    const metadata = new Map<string, string>();
    const csvLines: string[] = [];
    let headerSeen = false;

    for (const line of lines) {
      if (!headerSeen && line.trim().startsWith('#')) {
        const match = line.match(/^#\s*([^:]+):\s*(.*)$/);
        if (match) {
          metadata.set(match[1].trim().toLowerCase(), match[2].trim());
        }
        continue;
      }

      if (!headerSeen && line.trim().length === 0) {
        continue;
      }

      headerSeen = true;
      csvLines.push(line);
    }

    const records = this.parseCsvRecords(csvLines.join('\n'));
    if (records.length < 2) {
      return null;
    }

    const headers = records[0].map((value) => value.trim().toLowerCase());
    const dateIndex = headers.indexOf('date');
    const nameIndex = headers.indexOf('name');
    const descriptionIndex = headers.indexOf('description');
    const categoryIndex = headers.indexOf('category');
    const kindIndex = headers.indexOf('kind');
    const amountIndex = headers.indexOf('amount');
    const orderIndex = headers.indexOf('order');

    if (dateIndex < 0 || nameIndex < 0 || amountIndex < 0) {
      return null;
    }

    const transactions = records.slice(1).flatMap((row, rowIndex) => {
      const date = row[dateIndex]?.trim() ?? '';
      const name = row[nameIndex]?.trim() ?? '';
      const description = descriptionIndex >= 0 ? (row[descriptionIndex] ?? '') : '';
      const category = categoryIndex >= 0 ? (row[categoryIndex] ?? '') : '';
      const kind = kindIndex >= 0 ? (row[kindIndex] ?? '').trim().toLowerCase() : '';
      const amountValue = Number(row[amountIndex]);
      const orderValue = orderIndex >= 0 ? Number(row[orderIndex]) : rowIndex;

      if (!this.isIsoDate(date) || name.length === 0 || !Number.isFinite(amountValue)) {
        return [];
      }

      const signedAmount = kind === 'deposit'
        ? Math.abs(amountValue)
        : kind === 'withdrawal'
          ? -Math.abs(amountValue)
          : amountValue;

      const transaction = this.normalizeTransaction({
        id: this.createId(),
        date,
        name,
        description,
        category,
        amount: signedAmount,
        order: Number.isFinite(orderValue) ? orderValue : rowIndex,
      });

      return transaction ? [transaction] : [];
    });

    if (transactions.length === 0) {
      return null;
    }

    const metadataStartingDate = metadata.get('startingdate');
    const startingDate = metadataStartingDate && this.isIsoDate(metadataStartingDate)
      ? metadataStartingDate
      : transactions[0]?.date ?? this.todayString();
    const startingBalance = Number(metadata.get('startingbalance') ?? 0) || 0;

    return {
      startingDate,
      startingBalance,
      transactions: transactions.filter((transaction) => transaction.date >= startingDate),
    };
  }

  private parseCsvRecords(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (inQuotes) {
        if (char === '"') {
          if (text[index + 1] === '"') {
            currentCell += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          currentCell += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell);
        if (currentRow.some((value) => value.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    currentRow.push(currentCell);
    if (currentRow.some((value) => value.trim().length > 0)) {
      rows.push(currentRow);
    }

    return rows;
  }

  private isIsoDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private nextOrderForDate(date: string): number {
    return (
      Math.max(
        0,
        ...this.state()
          .transactions.filter((entry) => entry.date === date)
          .map((entry) => entry.order),
      ) + 1
    );
  }

  private downloadFile(fileName: string, content: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private escapeCsv(value: string): string {
    return value.includes(',') || value.includes('"') || value.includes('\n')
      ? `"${value.replaceAll('"', '""')}"`
      : value;
  }

  private createId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `txn-${Math.random().toString(36).slice(2, 10)}`;
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private formatMoney(value: number): string {
    return this.currencyFormatter.format(value);
  }

  private formatChartDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
  }

  private formatFullDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}