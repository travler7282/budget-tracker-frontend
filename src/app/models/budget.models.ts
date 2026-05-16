export type BudgetItemType =
  | 'expense'
  | 'income'
  | 'loan'
  | 'credit_card'
  | 'mortgage'
  | 'student_loan'
  | 'savings'
  | 'investment'
  | 'other';

export interface BudgetItem {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  itemType: BudgetItemType;
  budgetedDate: string | null;
  actualDate: string | null;
  budgetedAmount: string;
  actualAmount: string | null;
  interestRate: string | null;
  isApr: boolean | null;
  isCreditCard: boolean;
  isLoan: boolean;
  isExpense: boolean;
  isIncome: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetItemUpsert {
  name: string;
  description?: string | null;
  category?: string | null;
  itemType?: BudgetItemType | null;
  budgetedDate?: string | null;
  actualDate?: string | null;
  budgetedAmount: number;
  actualAmount?: number | null;
  interestRate?: number | null;
  isApr?: boolean | null;
  isCreditCard?: boolean | null;
  isLoan?: boolean | null;
  isExpense?: boolean | null;
  isIncome?: boolean | null;
}

export interface BudgetSummary {
  itemType: BudgetItemType;
  itemCount: number;
  plannedTotal: string;
  actualTotal: string;
}

export interface CashFlowItem {
  id: number;
  name: string;
  category: string | null;
  itemType: BudgetItemType;
  plannedDate: string | null;
  actualDate: string | null;
  plannedAmount: string;
  actualAmount: string | null;
}

export interface CashFlowDay {
  date: string;
  plannedIncome: string;
  plannedOutflow: string;
  plannedNet: string;
  actualIncome: string;
  actualOutflow: string;
  actualNet: string;
  plannedBalance: string;
  actualBalance: string;
  items: CashFlowItem[];
}

export interface CashFlowCalendar {
  startDate: string;
  endDate: string;
  startingBalance: string;
  days: CashFlowDay[];
}
