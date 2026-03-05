/**
 * Timer component — visual countdown synced to server timestamp
 */
export class Timer {
    constructor(containerEl, onTick, onExpire) {
        this.container = containerEl;
        this.onTick = onTick;
        this.onExpire = onExpire;
        this.intervalId = null;
        this.remaining = 0;
        this.total = 0;
    }

    start(durationMs) {
        this.stop();
        this.total = durationMs;
        this.remaining = durationMs;
        this.render();

        this.intervalId = setInterval(() => {
            this.remaining -= 100;
            if (this.remaining <= 0) {
                this.remaining = 0;
                this.stop();
                this.render();
                if (this.onExpire) this.onExpire();
            } else {
                this.render();
                if (this.onTick) this.onTick(this.remaining);
            }
        }, 100);
    }

    startFromTimestamp(startedAt, durationMs) {
        const elapsed = Date.now() - startedAt;
        const remainingMs = Math.max(0, durationMs - elapsed);
        if (remainingMs <= 0) {
            this.remaining = 0;
            this.total = durationMs;
            this.render();
            if (this.onExpire) this.onExpire();
            return;
        }
        this.start(remainingMs);
        this.total = durationMs;
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    render() {
        const seconds = Math.ceil(this.remaining / 1000);
        const fraction = this.total > 0 ? this.remaining / this.total : 0;
        const urgency = fraction < 0.25 ? 'urgent' : fraction < 0.5 ? 'warning' : '';

        this.container.innerHTML = `
      <div class="timer ${urgency}">
        <div class="timer-bar-track">
          <div class="timer-bar-fill" style="width: ${fraction * 100}%"></div>
        </div>
        <span class="timer-seconds">${seconds}s</span>
      </div>
    `;
    }

    getRemaining() {
        return this.remaining;
    }
}
