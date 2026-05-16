import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { BudgetItem, BudgetItemType, BudgetSummary, CashFlowDay } from '../models/budget.models';
import { BudgetService } from '../services/budget.service';

type CalendarView = 'day' | 'week' | 'month' | 'year' | 'custom';

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
    const value = this.form.getRawValue();
    const payload = {
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

    const selectedItemId = this.selectedItemId();
    const request = selectedItemId
      ? this.budget.updateBudgetItem(selectedItemId, payload)
      : this.budget.createBudgetItem(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.clearForm();
        this.refreshAll();
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Unable to save budget item. Please review your values.');
      },
    });
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
