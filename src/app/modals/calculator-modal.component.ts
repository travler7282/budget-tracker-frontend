import { CommonModule, NgComponentOutlet } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BasicCalculatorComponent,
  CompoundInterestCalculatorComponent,
} from '../calculators';

@Component({
  selector: 'app-calculator-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NgComponentOutlet],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (isOpen) {
      <div class="modal-backdrop" (click)="onBackdropClick()"></div>
        <div class="modal-container" role="dialog" aria-modal="true" aria-label="Calculator">
          <div class="modal-content">
            <div class="modal-header">
              <h2>Calculator</h2>
              <button type="button" class="close-btn" (click)="onClose()" aria-label="Close">
                ×
              </button>
            </div>

            <div class="modal-body">
              <div class="calculator-select">
                <label for="calc-type">Select Calculator:</label>
                <select
                  id="calc-type"
                  [(ngModel)]="selectedCalculatorType"
                >
                  <option value="basic">Basic Calculator</option>
                  <option value="compound">Compound Interest</option>
                </select>
              </div>

              <div class="calculator-container">
                <ng-container
                  *ngComponentOutlet="getCalculatorComponent()"
                ></ng-container>
              </div>
            </div>
          </div>
        </div>
    }
  `,
  styleUrl: './calculator-modal.component.scss',
})
export class CalculatorModalComponent {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  selectedCalculatorType = 'basic';

  onClose(): void {
    this.close.emit();
  }

  onBackdropClick(): void {
    this.close.emit();
  }

  onEscape(): void {
    if (this.isOpen) {
      this.close.emit();
    }
  }

  getCalculatorComponent(): any {
    const components: Record<string, any> = {
      'basic': BasicCalculatorComponent,
      'compound': CompoundInterestCalculatorComponent,
    };
    return components[this.selectedCalculatorType] || BasicCalculatorComponent;
  }
}