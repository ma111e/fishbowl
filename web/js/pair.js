// <fb-pair> — FishBowl backend pairing screen (live custom element)
// Manages its own digit state, countdown timer, and submission flow.
// Fires 'fb-pair-done' (bubbles) on successful pairing.
(function () {
  const W = 460;

  function code(txt) {
    return h('code', {
      style: {
        fontFamily: 'var(--font-mono)', fontSize: '0.92em',
        padding: '1.5px 6px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--accent-strong)',
        whiteSpace: 'nowrap',
      },
    }, txt);
  }

  function digitBoxes({ digits, error }) {
    const firstEmpty = digits.findIndex((d) => d === '');
    return h('div', { style: { display: 'flex', gap: '8px' } },
      digits.map((d, i) => {
        const isCaret = i === firstEmpty;
        const filled = d !== '';
        const accent = error ? 'var(--c-mal)' : 'var(--accent)';
        return h('div', {
          style: {
            width: '46px', height: '56px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-0)',
            border: '1.5px solid ' + (
              isCaret ? accent :
              error ? 'var(--c-mal-border)' :
              filled ? 'var(--border-strong)' : 'var(--border-1)'
            ),
            borderRadius: 'var(--radius-md)',
            boxShadow: isCaret ? '0 0 0 3px ' + (error ? 'var(--c-mal-soft)' : 'var(--accent-soft)') : 'none',
            fontFamily: 'var(--font-mono)', fontWeight: '600',
            fontSize: '24px',
            color: filled ? (error ? 'var(--c-mal)' : 'var(--fg-1)') : 'var(--fg-4)',
            transition: 'border-color 120ms, box-shadow 120ms',
            position: 'relative',
            userSelect: 'none',
          },
        },
          filled ? d : (isCaret ? h('span', {
            style: {
              width: '2px', height: '26px', background: accent,
              borderRadius: '1px', animation: 'fb-caret 1s steps(1) infinite',
            },
          }) : h('span', { style: { width: '10px', height: '2px', borderRadius: '1px', background: 'var(--border-2)' } })),
        );
      }),
    );
  }

  function fmtCountdown(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  class FBPair extends HTMLElement {
    constructor() {
      super();
      this._digits = ['', '', '', '', '', ''];
      this._error = false;
      this._locked = false;
      this._expired = false;
      this._submitting = false;
      this._lastSubmitted = null;
      this._countdown = 30;
      this._timer = null;

      // Hidden input for keyboard capture — positioned off-screen so it
      // doesn't disrupt layout but remains focusable.
      this._input = document.createElement('input');
      Object.assign(this._input.style, {
        position: 'absolute', opacity: '0',
        width: '1px', height: '1px',
        pointerEvents: 'none', top: '0', left: '0',
      });
      this._input.setAttribute('inputmode', 'numeric');
      this._input.setAttribute('autocomplete', 'off');
    }

    connectedCallback() {
      this.style.display = 'block';
      this.appendChild(this._input);
      this._wireInput();
      // Ensure the backend has a fresh code to display the moment this window
      // opens (idempotent: /ping only mints when none is active).
      FishBowlNet.requestNewPairingCode?.().catch(() => {});
      this._startCountdown();
      this._render();
      this._input.focus();
    }

    disconnectedCallback() {
      clearInterval(this._timer);
    }

    _startCountdown() {
      this._countdown = 30;
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        this._countdown = Math.max(0, this._countdown - 1);
        if (this._countdown === 0) {
          clearInterval(this._timer);
          // The code is no longer valid - switch to the expired screen so the
          // user can fetch a fresh one instead of typing into a dead field.
          this._expired = true;
        }
        this._render();
      }, 1000);
    }

    _wireInput() {
      this._input.addEventListener('input', () => {
        const val = this._input.value.replace(/\D/g, '').slice(0, 6);
        this._input.value = val;
        this._digits = Array.from({ length: 6 }, (_, i) => val[i] || '');
        // Editing clears the error so backspacing a wrong code feels live.
        this._error = false;
        this._locked = false;
        this._render();
        // Auto-evaluate once complete; skip an identical code we already know is
        // wrong so stray keystrokes don't re-spam the backend.
        if (val.length === 6 && val !== this._lastSubmitted) this._submit();
      });

      // Clicking anywhere on the component re-focuses the hidden input.
      this.addEventListener('click', () => this._input.focus());
    }

    async _submit() {
      if (this._submitting) return;
      const code = this._digits.join('');
      if (code.length !== 6) { this._input.focus(); return; }

      if (this._countdown === 0) {
        this._expired = true;
        this._render();
        return;
      }

      this._submitting = true;
      this._render();

      try {
        const result = await FishBowlNet.submitPairingCode(code);
        if (result.ok) {
          clearInterval(this._timer);
          // Rescan of the active tab is triggered by the background on the
          // fishbowlNeedsPairing->false storage transition (this window closes
          // too soon to run the async inject/rescan itself).
          this.dispatchEvent(new CustomEvent('fb-pair-done', { bubbles: true }));
          return;
        } else if (result.locked) {
          // Code consumed by rate-limiting; the only way forward is a new code.
          this._expired = true;
          this._locked = true;
        } else {
          // Wrong code: keep the digits so the user can backspace and fix them,
          // and remember this code so the same value isn't auto-resubmitted.
          this._error = true;
          this._lastSubmitted = code;
        }
      } catch (e) {
        // Network/other failure - allow the same code to be retried.
        console.warn('[FB:Pair] Pairing submission failed', e);
        this._error = true;
      }

      this._submitting = false;
      this._render();
      this._input.focus();
    }

    _retry() {
      this._expired = false;
      this._error = false;
      this._locked = false;
      this._submitting = false;
      this._lastSubmitted = null;
      this._digits = ['', '', '', '', '', ''];
      this._input.value = '';
      // Ask the backend to mint a fresh code (printed in its terminal).
      FishBowlNet.requestNewPairingCode?.().catch(() => {});
      this._startCountdown();
      this._render();
      this._input.focus();
    }

    _render() {
      const digits = this._digits;
      const ready = digits.every((d) => d !== '') && !this._error && !this._submitting;
      const isError = this._error;
      const isExpired = this._expired;

      let pillLabel, pillColor;
      if (this._submitting) {
        pillLabel = 'PAIRING…';
        pillColor = 'var(--fg-3)';
      } else if (isExpired) {
        pillLabel = this._locked ? 'LOCKED' : 'CODE EXPIRED';
        pillColor = 'var(--c-mal)';
      } else if (isError) {
        pillLabel = 'INVALID CODE';
        pillColor = 'var(--c-mal)';
      } else if (ready) {
        pillLabel = 'READY TO PAIR';
        pillColor = 'var(--c-ok)';
      } else {
        pillLabel = 'AWAITING CODE';
        pillColor = 'var(--c-sus)';
      }

      const card = h('div', {
        class: 'fb-surface',
        style: {
          width: W + 'px',
          background: 'var(--bg-1)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-2)',
          overflow: 'hidden',
          boxSizing: 'border-box',
        },
      });

      // ── Header strip ──
      card.appendChild(h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--bg-2)',
        },
      },
        h('span', {
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '9px',
            fontFamily: 'var(--font-mono)', fontWeight: '600', fontSize: '14px',
            letterSpacing: '-0.02em', color: 'var(--fg-1)',
          },
          html: `<span><span style="color:var(--accent)">fish</span><span>bowl</span></span>`,
        }),
        h('span', {
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: 'var(--t-xs)', fontFamily: 'var(--font-mono)',
            color: pillColor,
            padding: '3px 9px',
            background: 'var(--bg-1)',
            border: '1px solid var(--border-1)',
            borderRadius: '999px',
            letterSpacing: '0.04em',
          },
        },
          h('span', {
            style: {
              width: '6px', height: '6px', borderRadius: '50%',
              background: 'currentColor',
              boxShadow: ready ? '0 0 6px currentColor' : 'none',
            },
          }),
          pillLabel,
        ),
      ));

      // ── Body ──
      const body = h('div', { style: { padding: '20px' } });

      if (isExpired) {
        // Distinct expired/locked screen: no dead input, just a Retry action
        // that mints a fresh code and restarts the flow.
        body.appendChild(h('h1', {
          style: {
            margin: '0 0 6px',
            fontFamily: 'var(--font-ui)', fontSize: '18px', fontWeight: '600',
            letterSpacing: '-0.01em', color: 'var(--fg-1)',
          },
        }, this._locked ? 'Too many attempts' : 'Pairing code expired'));

        body.appendChild(h('p', {
          style: {
            margin: '0 0 18px', fontSize: 'var(--t-md)',
            color: 'var(--fg-3)', lineHeight: '1.5',
          },
        }, this._locked
          ? 'That code was locked after too many attempts. Get a fresh code and try again.'
          : 'That pairing code timed out before it was used. Get a fresh code and try again.'));

        body.appendChild(h('button', {
          style: {
            appearance: 'none', cursor: 'pointer',
            width: '100%', height: '52px',
            background: 'var(--accent)', color: 'var(--bg-0)',
            border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-ui)', fontSize: 'var(--t-lg)', fontWeight: '600',
            letterSpacing: '0.01em',
          },
          onclick: () => this._retry(),
        }, 'Retry'));
      } else {
        body.appendChild(h('h1', {
          style: {
            margin: '0 0 6px',
            fontFamily: 'var(--font-ui)', fontSize: '18px', fontWeight: '600',
            letterSpacing: '-0.01em', color: 'var(--fg-1)',
          },
        }, 'Pair with the backend'));

        body.appendChild(h('p', {
          style: {
            margin: '0 0 18px', fontSize: 'var(--t-md)',
            color: 'var(--fg-3)', lineHeight: '1.5',
          },
        }, 'The FishBowl backend is waiting for a 6-digit pairing code.'));

        body.appendChild(h('p', {
          style: {
            margin: '0 0 18px', fontSize: 'var(--t-sm)',
            color: 'var(--fg-3)', lineHeight: '1.7',
          },
        },
          'Find it in the terminal where you started ', code('fishbowl'),
          '. It is checked automatically as you type; if it expires, use ',
          code('Retry'), ' for a fresh one.',
        ));

        // Digit boxes only - the code is evaluated automatically when complete.
        body.appendChild(digitBoxes({ digits, error: isError }));

        // Error banner (wrong code) - digits are kept so the user can backspace.
        if (isError) {
          body.appendChild(h('div', {
            style: {
              marginTop: '14px',
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 12px',
              background: 'var(--c-mal-soft)',
              border: '1px solid var(--c-mal-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--t-sm)', color: 'var(--c-mal)',
            },
          },
            h('span', { style: { fontFamily: 'var(--font-mono)', fontWeight: '700', flexShrink: '0' } }, '!'),
            h('span', null, 'Incorrect code. Backspace to edit the digits, or wait for a new code.'),
          ));
        }
      }

      card.appendChild(body);

      // ── Footer ──
      card.appendChild(h('div', {
        style: {
          padding: '12px 20px',
          borderTop: '1px solid var(--border-1)',
          background: 'var(--bg-2)',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: 'var(--t-xs)', color: 'var(--fg-4)', lineHeight: '1.5',
        },
      },
        h('span', {
          style: {
            fontFamily: 'var(--font-mono)',
            color: (this._countdown <= 5 || isExpired || isError) ? 'var(--c-mal)' : 'var(--fg-3)',
            flexShrink: '0',
          },
        }, fmtCountdown(this._countdown)),
        h('span', { style: { width: '1px', height: '12px', background: 'var(--border-1)', flexShrink: '0' } }),
        h('span', null, 'Codes are valid for 30 seconds; a fresh one is issued automatically when needed.'),
      ));

      // Swap content without touching the hidden input.
      const hadFocus = this._input === document.activeElement;
      while (this.firstChild && this.firstChild !== this._input) {
        this.removeChild(this.firstChild);
      }
      this.insertBefore(card, this._input);
      if (hadFocus) this._input.focus();
    }
  }

  if (!document.getElementById('fb-pair-kf')) {
    const st = document.createElement('style');
    st.id = 'fb-pair-kf';
    st.textContent = '@keyframes fb-caret { 0%,50% { opacity: 1 } 50.01%,100% { opacity: 0 } }';
    document.head.appendChild(st);
  }

  fbDef('fb-pair', FBPair);
})();
