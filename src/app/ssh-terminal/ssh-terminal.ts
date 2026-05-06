import {
  Component, Input, Output, EventEmitter,
  OnDestroy, AfterViewInit, ViewChild, ElementRef,
  signal, OnChanges, SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { io, Socket } from 'socket.io-client';
import { environment } from '../environment/environment';

export interface SshTarget {
  id:       number;
  name:     string;
  type:     'firewall' | 'router' | 'switch';
  ip_nms:   string;
  username: string;
  password: string;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

@Component({
  selector: 'app-ssh-terminal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ssh-modal-overlay" (click)="onOverlayClick($event)">
      <div class="ssh-modal">

        <!-- ── Header ── -->
        <div class="ssh-header">
          <div class="ssh-header-left">
            <div class="ssh-device-icon" [attr.data-type]="target.type">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
            </div>
            <div class="ssh-device-info">
              <span class="ssh-device-name">{{ target.name }}</span>
              <span class="ssh-device-meta">
                {{ target.ip_nms }} · {{ target.username }}
                <span class="ssh-type-badge" [attr.data-type]="target.type">
                  {{ target.type.toUpperCase() }}
                </span>
              </span>
            </div>
          </div>

          <div class="ssh-header-right">
            <div class="ssh-status-dot" [attr.data-state]="connState()"></div>
            <span class="ssh-status-label">{{ statusLabel() }}</span>

            @if (connState() === 'connected') {
              <button class="ssh-btn ssh-btn-danger" (click)="disconnect()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Déconnecter
              </button>
            }

            <button class="ssh-btn ssh-btn-ghost" (click)="close.emit()" title="Fermer">
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none"
                   stroke="currentColor" stroke-width="2.5">
                <path d="M1 1l12 12M13 1L1 13"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- ── Terminal ── -->
        <div class="ssh-terminal-wrap">
          <!-- État vide / connexion -->
          @if (connState() !== 'connected') {
            <div class="ssh-overlay-state">
              @if (connState() === 'idle') {
                <div class="ssh-idle-screen">
                  <div class="ssh-idle-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="1.5">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <path d="M8 21h8M12 17v4"/>
                      <polyline points="7 8 12 12 17 8"/>
                    </svg>
                  </div>
                  <p class="ssh-idle-title">Terminal SSH</p>
                  <p class="ssh-idle-sub">
                    Connexion vers <strong>{{ target.ip_nms }}</strong>
                    via <strong>{{ target.username }}</strong>
                  </p>
                  <button class="ssh-connect-btn" (click)="connect()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                    Établir la connexion SSH
                  </button>
                </div>
              }

              @if (connState() === 'connecting') {
                <div class="ssh-connecting">
                  <div class="ssh-spinner"></div>
                  <p>Connexion SSH en cours…</p>
                  <small>{{ target.username }}&#64;{{ target.ip_nms }}</small>
                </div>
              }

              @if (connState() === 'error') {
                <div class="ssh-error-screen">
                  <div class="ssh-error-icon">✕</div>
                  <p class="ssh-error-title">Connexion échouée</p>
                  <p class="ssh-error-msg">{{ errorMsg() }}</p>
                  <button class="ssh-connect-btn" (click)="connect()">
                    Réessayer
                  </button>
                </div>
              }

              @if (connState() === 'closed') {
                <div class="ssh-closed-screen">
                  <div class="ssh-closed-icon">⏏</div>
                  <p>Session fermée</p>
                  <button class="ssh-connect-btn" (click)="connect()">
                    Nouvelle session
                  </button>
                </div>
              }
            </div>
          }

          <!-- xterm.js container -->
          <div #termContainer class="ssh-xterm-container"
               [class.hidden]="connState() !== 'connected'"></div>
        </div>

        <!-- ── Footer ── -->
        <div class="ssh-footer">
          <span class="ssh-footer-info">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Chiffrement SSH · Port 22
          </span>
          <span class="ssh-footer-dims">{{ cols() }}×{{ rows() }}</span>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .ssh-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 8, 20, 0.75);
      backdrop-filter: blur(4px);
      z-index: 2000;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: ssh-fadein 0.2s ease;
    }
    @keyframes ssh-fadein {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .ssh-modal {
      width: 100%; max-width: 1100px;
      height: 90vh; max-height: 780px;
      background: #0d1117;
      border-radius: 14px;
      border: 1px solid #30363d;
      display: flex; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
      animation: ssh-slidein 0.25s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes ssh-slidein {
      from { transform: translateY(24px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }

    /* Header */
    .ssh-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      flex-shrink: 0;
    }
    .ssh-header-left { display: flex; align-items: center; gap: 12px; }
    .ssh-header-right { display: flex; align-items: center; gap: 10px; }

    .ssh-device-icon {
      width: 36px; height: 36px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: #58a6ff;
      background: rgba(88,166,255,0.1);
      border: 1px solid rgba(88,166,255,0.2);
    }
    .ssh-device-icon[data-type="firewall"] { color: #f85149; background: rgba(248,81,73,0.1); border-color: rgba(248,81,73,0.2); }
    .ssh-device-icon[data-type="router"]   { color: #3fb950; background: rgba(63,185,80,0.1);  border-color: rgba(63,185,80,0.2); }
    .ssh-device-icon[data-type="switch"]   { color: #58a6ff; background: rgba(88,166,255,0.1); border-color: rgba(88,166,255,0.2); }

    .ssh-device-name {
      display: block; font-weight: 600; font-size: 0.92rem;
      color: #e6edf3; font-family: 'Courier New', monospace;
    }
    .ssh-device-meta {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.75rem; color: #8b949e; font-family: monospace;
    }
    .ssh-type-badge {
      padding: 1px 6px; border-radius: 4px; font-size: 0.65rem;
      font-weight: 700; letter-spacing: 0.05em;
    }
    .ssh-type-badge[data-type="firewall"] { background: rgba(248,81,73,0.15); color: #f85149; }
    .ssh-type-badge[data-type="router"]   { background: rgba(63,185,80,0.15);  color: #3fb950; }
    .ssh-type-badge[data-type="switch"]   { background: rgba(88,166,255,0.15); color: #58a6ff; }

    .ssh-status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      transition: background 0.3s;
    }
    .ssh-status-dot[data-state="idle"]       { background: #484f58; }
    .ssh-status-dot[data-state="connecting"] { background: #e3b341; animation: pulse 1s infinite; }
    .ssh-status-dot[data-state="connected"]  { background: #3fb950; animation: pulse 2s infinite; }
    .ssh-status-dot[data-state="error"]      { background: #f85149; }
    .ssh-status-dot[data-state="closed"]     { background: #484f58; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }

    .ssh-status-label { font-size: 0.78rem; color: #8b949e; }

    .ssh-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 6px; border: none;
      font-size: 0.8rem; font-weight: 600; cursor: pointer;
      transition: all 0.15s;
    }
    .ssh-btn-danger {
      background: rgba(248,81,73,0.15); color: #f85149;
      border: 1px solid rgba(248,81,73,0.3);
    }
    .ssh-btn-danger:hover { background: rgba(248,81,73,0.25); }
    .ssh-btn-ghost {
      background: transparent; color: #8b949e;
      border: 1px solid #30363d; padding: 6px 8px;
    }
    .ssh-btn-ghost:hover { background: #21262d; color: #e6edf3; }

    /* Terminal wrapper */
    .ssh-terminal-wrap {
      flex: 1; position: relative; overflow: hidden;
      background: #0d1117;
    }
    .ssh-xterm-container {
      width: 100%; height: 100%;
      padding: 8px;
    }
    .ssh-xterm-container.hidden { display: none; }

    /* Overlay states */
    .ssh-overlay-state {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: #0d1117;
      z-index: 10;
    }

    .ssh-idle-screen, .ssh-error-screen, .ssh-closed-screen, .ssh-connecting {
      text-align: center; color: #8b949e;
      display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .ssh-idle-icon { color: #30363d; margin-bottom: 8px; }
    .ssh-idle-title { font-size: 1.1rem; font-weight: 600; color: #e6edf3; margin: 0; }
    .ssh-idle-sub   { font-size: 0.85rem; color: #8b949e; margin: 0; font-family: monospace; }

    .ssh-connect-btn {
      display: flex; align-items: center; gap: 8px;
      margin-top: 8px; padding: 10px 24px;
      background: linear-gradient(135deg, #238636, #2ea043);
      color: #fff; border: none; border-radius: 8px;
      font-size: 0.9rem; font-weight: 600; cursor: pointer;
      transition: all 0.2s;
    }
    .ssh-connect-btn:hover {
      background: linear-gradient(135deg, #2ea043, #3fb950);
      transform: translateY(-1px);
    }

    .ssh-spinner {
      width: 36px; height: 36px; border-radius: 50%;
      border: 3px solid #30363d; border-top-color: #58a6ff;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .ssh-error-icon  { font-size: 2.5rem; color: #f85149; }
    .ssh-error-title { font-size: 1rem; font-weight: 600; color: #f85149; margin: 0; }
    .ssh-error-msg   { font-size: 0.8rem; font-family: monospace; color: #8b949e; margin: 0; max-width: 400px; }

    .ssh-closed-icon { font-size: 2.5rem; color: #484f58; }

    /* Footer */
    .ssh-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 20px;
      background: #161b22;
      border-top: 1px solid #30363d;
      flex-shrink: 0;
    }
    .ssh-footer-info {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.72rem; color: #484f58; font-family: monospace;
    }
    .ssh-footer-dims { font-size: 0.72rem; color: #484f58; font-family: monospace; }
  `],
})
export class SshTerminalComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() target!: SshTarget;
  @Output() close = new EventEmitter<void>();

  @ViewChild('termContainer') termContainer!: ElementRef<HTMLDivElement>;

  connState = signal<ConnState>('idle');
  errorMsg  = signal('');
  cols      = signal(220);
  rows      = signal(50);

  private term!: Terminal;
  private fitAddon!: FitAddon;
  private socket!: Socket;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit() {
    this.initTerminal();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['target'] && !changes['target'].firstChange) {
      this.disconnect();
      this.connState.set('idle');
    }
  }

  ngOnDestroy() {
    this.disconnect();
    this.resizeObserver?.disconnect();
    this.term?.dispose();
  }

  // ── Terminal xterm.js ─────────────────────────────────────
  private initTerminal() {
    this.term = new Terminal({
      theme: {
        background:  '#0d1117',
        foreground:  '#e6edf3',
        cursor:      '#58a6ff',
        black:       '#0d1117',
        red:         '#f85149',
        green:       '#3fb950',
        yellow:      '#e3b341',
        blue:        '#58a6ff',
        magenta:     '#bc8cff',
        cyan:        '#39c5cf',
        white:       '#e6edf3',
        brightBlack: '#6e7681',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
      fontSize:   14,
      lineHeight: 1.4,
      cursorBlink:  true,
      cursorStyle:  'block',
      scrollback:   5000,
      allowTransparency: true,
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new WebLinksAddon());
    this.term.open(this.termContainer.nativeElement);

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.termContainer.nativeElement);

    // Input → WebSocket
    this.term.onData((data) => {
      if (this.socket?.connected) {
        this.socket.emit('ssh:input', data);
      }
    });
  }

  private onResize() {
    if (this.connState() !== 'connected') return;
    this.fitAddon.fit();
    const { cols, rows } = this.term;
    this.cols.set(cols);
    this.rows.set(rows);
    this.socket?.emit('ssh:resize', { cols, rows });
  }

  // ── Connexion WebSocket + SSH ─────────────────────────────
  connect() {
    this.connState.set('connecting');
    this.errorMsg.set('');
    this.term.clear();

    // URL de ton backend NestJS
    const wsUrl = environment.apiUrl.replace('/api', '');

    this.socket = io(`${wsUrl}/ssh`, {
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this.fitAddon.fit();
      const { cols, rows } = this.term;
      this.cols.set(cols);
      this.rows.set(rows);

      this.socket.emit('ssh:connect', {
        host:     this.target.ip_nms,
        port:     22,
        username: this.target.username,
        password: this.target.password,
        cols,
        rows,
      });
    });

    this.socket.on('ssh:connected', () => {
      this.connState.set('connected');
      setTimeout(() => { this.fitAddon.fit(); this.term.focus(); }, 100);
    });

    this.socket.on('ssh:data', (data: string) => {
      this.term.write(data);
    });

    this.socket.on('ssh:error', ({ message }: { message: string }) => {
      this.connState.set('error');
      this.errorMsg.set(message);
      this.socket.disconnect();
    });

    this.socket.on('ssh:closed', () => {
      this.connState.set('closed');
      this.term.writeln('\r\n\x1b[33m--- Session fermée ---\x1b[0m');
    });

    this.socket.on('disconnect', () => {
      if (this.connState() === 'connected') {
        this.connState.set('closed');
      }
    });
  }

  disconnect() {
    this.socket?.emit('ssh:input', 'exit\n');
    setTimeout(() => {
      this.socket?.disconnect();
      this.connState.set('idle');
    }, 300);
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('ssh-modal-overlay')) {
      this.close.emit();
    }
  }

  statusLabel(): string {
    return {
      idle:       'Non connecté',
      connecting: 'Connexion…',
      connected:  'Connecté',
      error:      'Erreur',
      closed:     'Session fermée',
    }[this.connState()];
  }
}