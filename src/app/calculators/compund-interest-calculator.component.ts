import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-compound-interest-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="compound-calculator">
      <h3>Compound Interest Calculator</h3>
      
      <div class="input-group">
        <label>Principal Amount ($):</label>
        <input 
          type="number" 
          [(ngModel)]="principal"
          class="input-field"
        />
      </div>
      
      <div class="input-group">
        <label>Annual Interest Rate (%):</label>
        <input 
          type="number" 
          [(ngModel)]="rate"
          class="input-field"
        />
      </div>
      
      <div class="input-group">
        <label>Time (Years):</label>
        <input 
          type="number" 
          [(ngModel)]="time"
          class="input-field"
        />
      </div>
      
      <div class="input-group">
        <label>Compounding Frequency:</label>
        <select [(ngModel)]="frequency" class="input-field">
          <option [ngValue]="1">Annually</option>
          <option [ngValue]="2">Semi-annually</option>
          <option [ngValue]="4">Quarterly</option>
          <option [ngValue]="12">Monthly</option>
        </select>
      </div>
      
      <button 
        type="button" 
        (click)="calculate()"
        class="calculate-btn"
      >Calculate</button>
      
      @if (showResult) {
        <div class="results">
          <div class="result-row">
            <span>Final Amount:</span>
            <span class="value">{{ finalAmount | currency }}</span>
          </div>
          <div class="result-row">
            <span>Interest Earned:</span>
            <span class="value">{{ interestEarned | currency }}</span>
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './compund-interest-calculator.component.scss',
})
export class CompoundInterestCalculatorComponent {
  principal = 1000;
  rate = 5;
  time = 10;
  frequency = 12;
  
  showResult = false;
  finalAmount = 0;
  interestEarned = 0;

  calculate(): void {
    const p = this.principal;
    const r = this.rate / 100;
    const t = this.time;
    const n = this.frequency;
    
    // A = P(1 + r/n)^(nt)
    const amount = p * Math.pow(1 + r / n, n * t);
    const interest = amount - p;
    
    this.finalAmount = amount;
    this.interestEarned = interest;
    this.showResult = true;
  }
}