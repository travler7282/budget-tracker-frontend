import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  BudgetItem,
  BudgetItemUpsert,
  BudgetSummary,
  CashFlowCalendar,
} from '../models/budget.models';

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private readonly http = inject(HttpClient);
  private readonly budgetItemsUrl = `${environment.apiBaseUrl}/budget-items`;
  private readonly calendarUrl = `${environment.apiBaseUrl}/cash-flow/calendar`;

  listBudgetItems(type?: string): Observable<BudgetItem[]> {
    let params = new HttpParams();
    if (type && type !== 'all') {
      params = params.set('item_type', type);
    }
    return this.http.get<BudgetItem[]>(this.budgetItemsUrl, { params });
  }

  getSummary(): Observable<BudgetSummary[]> {
    return this.http.get<BudgetSummary[]>(`${this.budgetItemsUrl}/summary`);
  }

  createBudgetItem(payload: BudgetItemUpsert): Observable<BudgetItem> {
    return this.http.post<BudgetItem>(this.budgetItemsUrl, payload);
  }

  updateBudgetItem(itemId: number, payload: Partial<BudgetItemUpsert>): Observable<BudgetItem> {
    return this.http.patch<BudgetItem>(`${this.budgetItemsUrl}/${itemId}`, payload);
  }

  deleteBudgetItem(itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.budgetItemsUrl}/${itemId}`);
  }

  getCalendar(
    startDate: string,
    endDate: string,
    startingBalance: number,
  ): Observable<CashFlowCalendar> {
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('startingBalance', String(startingBalance));
    return this.http.get<CashFlowCalendar>(this.calendarUrl, { params });
  }
}
