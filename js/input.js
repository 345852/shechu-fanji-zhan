(function () {
  class Input {
    constructor() {
      this.down = {};
      this.pressed = {};
      this.lastDirTap = { left: 0, right: 0 };
      this.dashDir = 0;

      window.addEventListener("keydown", (event) => {
        const key = this.normalize(event.key);
        if (!key) return;
        if (["left", "right", "up", "space", "s", "j", "k", "l", "q", "e", "1", "2", "3", "enter", "p"].includes(key)) {
          event.preventDefault();
        }
        this.setKey(key, true);
      });

      window.addEventListener("keyup", (event) => {
        const key = this.normalize(event.key);
        if (key) this.setKey(key, false);
      });

      this.bindTouchControls();
    }

    normalize(key) {
      if (["left", "right", "up", "space", "s", "j", "k", "l", "q", "e", "1", "2", "3", "enter", "p"].includes(key)) return key;
      if (key === "ArrowLeft" || key === "a" || key === "A") return "left";
      if (key === "ArrowRight" || key === "d" || key === "D") return "right";
      if (key === "ArrowUp" || key === "w" || key === "W") return "up";
      if (key === " ") return "space";
      if (key === "s" || key === "S" || key === "ArrowDown") return "s";
      if (key === "j" || key === "J") return "j";
      if (key === "k" || key === "K") return "k";
      if (key === "l" || key === "L") return "l";
      if (key === "q" || key === "Q") return "q";
      if (key === "e" || key === "E") return "e";
      if (key === "1") return "1";
      if (key === "2") return "2";
      if (key === "3") return "3";
      if (key === "Enter") return "enter";
      if (key === "p" || key === "P") return "p";
      return "";
    }

    setKey(key, isDown) {
      if (!key) return;
      if (isDown) {
        if (!this.down[key]) {
          this.pressed[key] = true;
          if (key === "left" || key === "right") this.checkDash(key);
        }
        this.down[key] = true;
      } else {
        this.down[key] = false;
      }
    }

    bindTouchControls() {
      if (!window.document || !window.document.querySelectorAll) return;
      const buttons = Array.from(window.document.querySelectorAll("[data-press]"));
      buttons.forEach((button) => {
        const keys = String(button.dataset.press || "")
          .split(/\s+/)
          .map((key) => this.normalize(key))
          .filter(Boolean);
        if (keys.length === 0) return;

        const press = (event) => {
          event.preventDefault();
          button.classList.add("is-pressed");
          if (event.pointerId !== undefined && button.setPointerCapture) {
            try { button.setPointerCapture(event.pointerId); } catch (error) { /* ignore released pointers */ }
          }
          keys.forEach((key) => this.setKey(key, true));
        };
        const release = (event) => {
          event.preventDefault();
          button.classList.remove("is-pressed");
          keys.forEach((key) => this.setKey(key, false));
        };

        button.addEventListener("pointerdown", press);
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
        button.addEventListener("contextmenu", (event) => event.preventDefault());
      });
    }

    checkDash(key) {
      const now = performance.now();
      const slot = key === "left" ? "left" : "right";
      if (now - this.lastDirTap[slot] < 260) this.dashDir = key === "left" ? -1 : 1;
      this.lastDirTap[slot] = now;
    }

    consume(key) {
      const value = !!this.pressed[key];
      this.pressed[key] = false;
      return value;
    }

    afterFrame() {
      this.pressed = {};
      this.dashDir = 0;
    }
  }

  window.Input = Input;
}());
