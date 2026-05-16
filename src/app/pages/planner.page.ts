import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { BudgetItem, BudgetItemType, BudgetSummary, CashFlowDay } from '../models/budget.models';
import { BudgetService } from '../services/budget.service';

type CalendarView = 'day' | 'week' | 'month' | 'year' | 'custom';
type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
interface BudgetPayload {
  name: string;
  description: string | null;
  category: string | null;
  itemType: BudgetItemType;
  budgetedDate: string | null;
  actualDate: string | null;
  budgetedAmount: number;
  actualAmount: number | null;
  interestRate: number | null;
  isApr: boolean | null;
  isCreditCard: boolean;
  isLoan: boolean;
  isExpense: boolean;
  isIncome: boolean;
}

interface ImportPreviewRow {
  index: number;
  payload: BudgetPayload;
  valid: boolean;
  reason: string | null;
}

@Component({
  standalone: true,
  selector: 'app-planner-page',
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe],
  templateUrl: './planner.page.html',
  styleUrl: './planner.page.scss',
})
export class PlannerPageComponent {
  private readonly budget = inject(BudgetService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly calendarLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly items = signal<BudgetItem[]>([]);
  readonly summaries = signal<BudgetSummary[]>([]);
  readonly calendarDays = signal<CashFlowDay[]>([]);

  readonly selectedItemId = signal<number | null>(null);
  readonly selectedTypeFilter = signal<string>('all');

  readonly calendarView = signal<CalendarView>('month');
  readonly referenceDate = signal(this.todayString());
  readonly customStartDate = signal(this.todayString());
  readonly customEndDate = signal(this.todayPlusDaysString(30));
  readonly startingBalance = signal(0);
  readonly recurrence = signal<Recurrence>('none');
  readonly recurrenceCount = signal(1);
  readonly importing = signal(false);
  readonly importPreviewOpen = signal(false);
  readonly importPreviewRows = signal<ImportPreviewRow[]>([]);
  readonly importPreviewFileName = signal('');
  readonly validImportCount = computed(
    () => this.importPreviewRows().filter((row) => row.valid).length,
  );

  private importInputRef: HTMLInputElement | null = null;

  readonly categoryChart = computed(() => {
    const groups = new Map<string, number>();
    for (const item of this.items()) {
      const key = item.category?.trim() || 'Uncategorized';
      groups.set(key, (groups.get(key) ?? 0) + this.toMoney(item.budgetedAmount));
    }
    const rows = Array.from(groups.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    const max = Math.max(...rows.map((r) => r.total), 0);
    return rows.map((row) => ({
      ...row,
      widthPercent: max > 0 ? (row.total / max) * 100 : 0,
    }));
  });

  readonly balanceTrend = computed(() => {
    const days = this.calendarDays();
    if (days.length === 0) {
      return { planned: '', actual: '' };
    }

    const planned = days.map((d) => this.toMoney(d.plannedBalance));
    const actual = days.map((d) => this.toMoney(d.actualBalance));
    const min = Math.min(...planned, ...actual);
    const max = Math.max(...planned, ...actual);

    return {
      planned: this.makeLinePoints(planned, min, max, 520, 180),
      actual: this.makeLinePoints(actual, min, max, 520, 180),
    };
  });

  readonly budgetTypes: BudgetItemType[] = [
    'expense',
    'income',
    'loan',
    'credit_card',
    'mortgage',
    'student_loan',
    'savings',
    'investment',
    'other',
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    category: [''],
    itemType: ['expense' as BudgetItemType, Validators.required],
    budgetedDate: [''],
    actualDate: [''],
    budgetedAmount: [0, Validators.min(0)],
    actualAmount: [''],
    interestRate: [''],
    isApr: [false],
    isCreditCard: [false],
    isLoan: [false],
    isExpense: [true],
    isIncome: [false],
  });

  readonly formTitle = computed(() =>
    this.selectedItemId() ? 'Edit Budget Item' : 'Add Budget Item',
  );

  constructor() {
    this.refreshAll();
  }

  refreshAll(): void {
    this.refreshItems();
    this.refreshSummary();
    this.refreshCalendar();
  }

  refreshItems(): void {
    this.loading.set(true);
    this.error.set(null);
    this.budget.listBudgetItems(this.selectedTypeFilter()).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load budget items.');
        this.loading.set(false);
      },
    });
  }

  refreshSummary(): void {
    this.budget.getSummary().subscribe({
      next: (summary) => this.summaries.set(summary),
      error: () => this.summaries.set([]),
    });
  }

  submitItem(): void {
    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    const payload = this.buildPayload();

    const selectedItemId = this.selectedItemId();
    if (!selectedItemId && this.recurrence() !== 'none' && this.recurrenceCount() > 1) {
      this.createRecurringSeries(payload);
      return;
    }

    const request = selectedItemId
      ? this.budget.updateBudgetItem(selectedItemId, payload)
      : this.budget.createBudgetItem(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.clearForm();
        this.info.set(selectedItemId ? 'Budget item updated.' : 'Budget item created.');
        this.refreshAll();
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Unable to save budget item. Please review your values.');
      },
    });
  }

  setRecurrence(value: Recurrence): void {
    this.recurrence.set(value);
    if (value === 'none') {
      this.recurrenceCount.set(1);
    }
  }

  setRecurrenceCount(value: string): void {
    const count = Math.max(1, Math.min(120, Number(value) || 1));
    this.recurrenceCount.set(count);
  }

  editItem(item: BudgetItem): void {
    this.selectedItemId.set(item.id);
    this.form.patchValue({
      name: item.name,
      description: item.description ?? '',
      category: item.category ?? '',
      itemType: item.itemType,
      budgetedDate: item.budgetedDate ?? '',
      actualDate: item.actualDate ?? '',
      budgetedAmount: Number(item.budgetedAmount),
      actualAmount: item.actualAmount ?? '',
      interestRate: item.interestRate ?? '',
      isApr: item.isApr ?? false,
      isCreditCard: item.isCreditCard,
      isLoan: item.isLoan,
      isExpense: item.isExpense,
      isIncome: item.isIncome,
    });
  }

  removeItem(item: BudgetItem): void {
    if (!confirm(`Delete \"${item.name}\"?`)) {
      return;
    }

    this.budget.deleteBudgetItem(item.id).subscribe({
      next: () => {
        if (this.selectedItemId() === item.id) {
          this.clearForm();
        }
        this.refreshAll();
      },
      error: () => this.error.set('Unable to delete budget item.'),
    });
  }

  clearForm(): void {
    this.selectedItemId.set(null);
    this.recurrence.set('none');
    this.recurrenceCount.set(1);
    this.form.reset({
      name: '',
      description: '',
      category: '',
      itemType: 'expense',
      budgetedDate: '',
      actualDate: '',
      budgetedAmount: 0,
      actualAmount: '',
      interestRate: '',
      isApr: false,
      isCreditCard: false,
      isLoan: false,
      isExpense: true,
      isIncome: false,
    });
  }

  exportJson(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      itemCount: this.items().length,
      items: this.items(),
    };
    this.downloadFile(
      `budget-items-${this.todayString()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
    this.info.set('Exported items as JSON.');
  }

  exportCsv(): void {
    const headers = [
      'name',
      'description',
      'category',
      'itemType',
      'budgetedDate',
      'actualDate',
      'budgetedAmount',
      'actualAmount',
      'interestRate',
      'isApr',
      'isCreditCard',
      'isLoan',
      'isExpense',
      'isIncome',
    ];
    const rows = this.items().map((item) =>
      [
        item.name,
        item.description ?? '',
        item.category ?? '',
        item.itemType,
        item.budgetedDate ?? '',
        item.actualDate ?? '',
        item.budgetedAmount,
        item.actualAmount ?? '',
        item.interestRate ?? '',
        item.isApr ?? '',
        item.isCreditCard,
        item.isLoan,
        item.isExpense,
        item.isIncome,
      ]
        .map((value) => this.escapeCsv(value))
        .join(','),
    );

    const csv = `${headers.join(',')}\n${rows.join('\n')}`;
    this.downloadFile(`budget-items-${this.todayString()}.csv`, csv, 'text/csv;charset=utf-8');
    this.info.set('Exported items as CSV.');
  }

  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    this.importInputRef = input;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.importing.set(true);
    this.error.set(null);
    this.info.set(null);

    try {
      const text = await file.text();
      const payloads = file.name.toLowerCase().endsWith('.json')
        ? this.parseJsonImport(text)
        : this.parseCsvImport(text);

      if (payloads.length === 0) {
        throw new Error('No rows found to import.');
      }

      const previewRows = payloads.map((payload, index) => this.validateImportRow(payload, index));
      this.importPreviewRows.set(previewRows);
      this.importPreviewFileName.set(file.name);
      this.importPreviewOpen.set(true);
      this.importing.set(false);
      this.info.set(`Dry-run complete: ${previewRows.length} row(s) ready for review.`);
    } catch (err) {
      this.importing.set(false);
      this.error.set(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  confirmImport(): void {
    const validRows = this.importPreviewRows().filter((row) => row.valid);
    if (validRows.length === 0) {
      this.error.set('No valid rows to import.');
      return;
    }

    this.importing.set(true);
    this.error.set(null);
    this.info.set(null);

    forkJoin(validRows.map((row) => this.budget.createBudgetItem(row.payload))).subscribe({
      next: () => {
        this.importing.set(false);
        this.closeImportPreview();
        this.info.set(`Imported ${validRows.length} item(s).`);
        this.refreshAll();
      },
      error: () => {
        this.importing.set(false);
        this.error.set('Import failed while creating items in backend.');
      },
    });
  }

  closeImportPreview(): void {
    this.importPreviewOpen.set(false);
    this.importPreviewRows.set([]);
    this.importPreviewFileName.set('');
    if (this.importInputRef) {
      this.importInputRef.value = '';
    }
  }

  setTypeFilter(value: string): void {
    this.selectedTypeFilter.set(value);
    this.refreshItems();
  }

  setCalendarView(value: CalendarView): void {
    this.calendarView.set(value);
    this.refreshCalendar();
  }

  setReferenceDate(value: string): void {
    this.referenceDate.set(value);
    this.refreshCalendar();
  }

  setCustomRangeStart(value: string): void {
    this.customStartDate.set(value);
  }

  setCustomRangeEnd(value: string): void {
    this.customEndDate.set(value);
  }

  setStartingBalance(value: string): void {
    this.startingBalance.set(Number(value) || 0);
  }

  applyCustomRange(): void {
    this.calendarView.set('custom');
    this.refreshCalendar();
  }

  refreshCalendar(): void {
    const range = this.resolveCalendarRange();
    this.calendarLoading.set(true);
    this.budget.getCalendar(range.startDate, range.endDate, this.startingBalance()).subscribe({
      next: (calendar) => {
        this.calendarDays.set(calendar.days);
        this.calendarLoading.set(false);
      },
      error: () => {
        this.error.set('Could not load calendar data.');
        this.calendarLoading.set(false);
      },
    });
  }

  private createRecurringSeries(basePayload: BudgetPayload): void {
    const count = this.recurrenceCount();
    const recurrence = this.recurrence();
    const requests = Array.from({ length: count }).map((_, index) => {
      if (index === 0) {
        return this.budget.createBudgetItem(basePayload);
      }
      return this.budget.createBudgetItem({
        ...basePayload,
        budgetedDate: this.shiftDate(basePayload.budgetedDate, index, recurrence),
        actualDate: this.shiftDate(basePayload.actualDate, index, recurrence),
      });
    });

    forkJoin(requests).subscribe({
      next: () => {
        this.saving.set(false);
        this.clearForm();
        this.info.set(`Created ${count} recurring item(s).`);
        this.refreshAll();
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Unable to create recurring series.');
      },
    });
  }

  private buildPayload() {
    const value = this.form.getRawValue();
    return {
      name: value.name,
      description: value.description || null,
      category: value.category || null,
      itemType: value.itemType,
      budgetedDate: value.budgetedDate || null,
      actualDate: value.actualDate || null,
      budgetedAmount: Number(value.budgetedAmount),
      actualAmount: value.actualAmount === '' ? null : Number(value.actualAmount),
      interestRate: value.interestRate === '' ? null : Number(value.interestRate),
      isApr: value.interestRate === '' ? null : value.isApr,
      isCreditCard: value.isCreditCard,
      isLoan: value.isLoan,
      isExpense: value.isExpense,
      isIncome: value.isIncome,
    };
  }

  private shiftDate(
    dateValue: string | null,
    index: number,
    recurrence: Recurrence,
  ): string | null {
    if (!dateValue || recurrence === 'none') {
      return dateValue;
    }

    const dt = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(dt.getTime())) {
      return dateValue;
    }

    switch (recurrence) {
      case 'daily':
        dt.setDate(dt.getDate() + index);
        break;
      case 'weekly':
        dt.setDate(dt.getDate() + index * 7);
        break;
      case 'monthly':
        dt.setMonth(dt.getMonth() + index);
        break;
      case 'yearly':
        dt.setFullYear(dt.getFullYear() + index);
        break;
      default:
        break;
    }

    return this.toDateInputValue(dt);
  }

  private makeLinePoints(
    values: number[],
    min: number,
    max: number,
    width: number,
    height: number,
  ): string {
    if (values.length === 0) {
      return '';
    }

    const range = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : width;
    return values
      .map((value, idx) => {
        const x = idx * stepX;
        const normalized = (value - min) / range;
        const y = height - normalized * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  private toMoney(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    return Number(value) || 0;
  }

  private downloadFile(fileName: string, content: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private escapeCsv(value: unknown): string {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  }

  private parseJsonImport(text: string): Array<BudgetPayload> {
    const raw = JSON.parse(text) as
      | { items?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>;
    const items = Array.isArray(raw) ? raw : (raw.items ?? []);
    return items.map((item) => this.mapImportRow(item));
  }

  private parseCsvImport(text: string): Array<BudgetPayload> {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length <= 1) {
      return [];
    }
    const headers = this.parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = this.parseCsvLine(line);
      const row: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? '';
      });
      return this.mapImportRow(row);
    });
  }

  private parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (ch === ',' && !inQuotes) {
        out.push(current);
        current = '';
        continue;
      }

      current += ch;
    }

    out.push(current);
    return out;
  }

  private mapImportRow(row: Record<string, unknown>): BudgetPayload {
    const itemType = String(row['itemType'] ?? 'expense') as BudgetItemType;
    return {
      name: String(row['name'] ?? '').trim(),
      description: this.toNullableString(row['description']),
      category: this.toNullableString(row['category']),
      itemType,
      budgetedDate: this.toNullableString(row['budgetedDate']),
      actualDate: this.toNullableString(row['actualDate']),
      budgetedAmount: Number(row['budgetedAmount'] ?? 0) || 0,
      actualAmount: this.toNullableNumber(row['actualAmount']),
      interestRate: this.toNullableNumber(row['interestRate']),
      isApr: this.toNullableBoolean(row['isApr']),
      isCreditCard: this.toBoolean(row['isCreditCard']),
      isLoan: this.toBoolean(row['isLoan']),
      isExpense: this.toBoolean(row['isExpense']),
      isIncome: this.toBoolean(row['isIncome']),
    };
  }

  private validateImportRow(payload: BudgetPayload, index: number): ImportPreviewRow {
    if (!payload.name.trim()) {
      return { index, payload, valid: false, reason: 'Name is required.' };
    }
    if (!Number.isFinite(payload.budgetedAmount) || payload.budgetedAmount < 0) {
      return { index, payload, valid: false, reason: 'Budgeted amount must be 0 or greater.' };
    }
    return { index, payload, valid: true, reason: null };
  }

  private toNullableString(value: unknown): string | null {
    const str = String(value ?? '').trim();
    return str.length > 0 ? str : null;
  }

  private toNullableNumber(value: unknown): number | null {
    const str = String(value ?? '').trim();
    if (!str) {
      return null;
    }
    const num = Number(str);
    return Number.isFinite(num) ? num : null;
  }

  private toBoolean(value: unknown): boolean {
    const str = String(value ?? '')
      .toLowerCase()
      .trim();
    return str === 'true' || str === '1' || str === 'yes';
  }

  private toNullableBoolean(value: unknown): boolean | null {
    const str = String(value ?? '')
      .toLowerCase()
      .trim();
    if (!str) {
      return null;
    }
    return str === 'true' || str === '1' || str === 'yes';
  }

  private resolveCalendarRange(): { startDate: string; endDate: string } {
    if (this.calendarView() === 'custom') {
      return {
        startDate: this.customStartDate(),
        endDate: this.customEndDate(),
      };
    }

    const anchor = new Date(`${this.referenceDate()}T00:00:00`);
    const start = new Date(anchor);
    const end = new Date(anchor);

    switch (this.calendarView()) {
      case 'day': {
        break;
      }
      case 'week': {
        const day = start.getDay();
        const diffToMonday = (day + 6) % 7;
        start.setDate(start.getDate() - diffToMonday);
        end.setDate(start.getDate() + 6);
        break;
      }
      case 'month': {
        start.setDate(1);
        end.setMonth(end.getMonth() + 1, 0);
        break;
      }
      case 'year': {
        start.setMonth(0, 1);
        end.setMonth(11, 31);
        break;
      }
      default:
        break;
    }

    return {
      startDate: this.toDateInputValue(start),
      endDate: this.toDateInputValue(end),
    };
  }

  private toDateInputValue(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private todayString(): string {
    return this.toDateInputValue(new Date());
  }

  private todayPlusDaysString(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return this.toDateInputValue(date);
  }
}
