import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SshTerminal } from './ssh-terminal';

describe('SshTerminal', () => {
  let component: SshTerminal;
  let fixture: ComponentFixture<SshTerminal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SshTerminal],
    }).compileComponents();

    fixture = TestBed.createComponent(SshTerminal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
