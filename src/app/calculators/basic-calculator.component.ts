import { Component } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-basic-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
		<div class="basic-calculator">
			<h3>Basic Calculator</h3>

			<div class="calculator-input">
				<input
					type="number"
					[(ngModel)]="firstNumber"
					placeholder="First number"
					class="input-field"
				/>
			</div>

			<div class="calculator-operators">
				<button
					type="button"
					(click)="setOperation('+')"
					[class.active]="operation === '+'"
					class="op-btn"
				>+</button>
				<button
					type="button"
					(click)="setOperation('-')"
					[class.active]="operation === '-'"
					class="op-btn"
				>-</button>
				<button
					type="button"
					(click)="setOperation('*')"
					[class.active]="operation === '*'"
					class="op-btn"
				>x</button>
				<button
					type="button"
					(click)="setOperation('/')"
					[class.active]="operation === '/'"
					class="op-btn"
				>÷</button>
			</div>
			
			<div class="calculator-input">
				<input
					type="number"
					[(ngModel)]="secondNumber"
					placeholder="Second number"
					class="input-field"
				/>
			</div>

			<button
				type="button"
				(click)="calculate()"
        class="calculate-btn"
      >=</button>

			<div class="result">
				<span class="result-label">Result:</span>
				<span class="result-value">{{ result | number: '1.0-6' }}</span>
			</div>
		</div>
	`,
	styleUrl: './basic-calculator.component.scss',
})
export class BasicCalculatorComponent {
	firstNumber = 0;
	secondNumber = 0;
	operation = '+';
	result = 0;

	setOperation(op: string): void {
		this.operation = op;
	}

	calculate(): void {
		const a = this.firstNumber;
		const b = this.secondNumber;
		const op = this.operation;

		let res = 0;
		switch (op)  {
			case '+':
				res = a + b;
				break;
			case '-':
				res = a - b;
				break;
			case '*':
				res = a * b;
				break;
			case '/':
				res = b !== 0 ? a / b : 0;
				break;
			default:
				res = 0;
		}

		this.result = res;
	}
}