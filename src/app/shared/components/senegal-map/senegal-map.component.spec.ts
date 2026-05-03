import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SenegalMapComponent } from './senegal-map.component';

describe('SenegalMapComponent', () => {
  let component: SenegalMapComponent;
  let fixture: ComponentFixture<SenegalMapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SenegalMapComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SenegalMapComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
