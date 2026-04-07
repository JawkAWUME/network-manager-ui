import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EquipmentModal } from './equipment-modal';

describe('EquipmentModal', () => {
  let component: EquipmentModal;
  let fixture: ComponentFixture<EquipmentModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquipmentModal],
    }).compileComponents();

    fixture = TestBed.createComponent(EquipmentModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
