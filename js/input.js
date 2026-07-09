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
        if (!this.down[key]) {
          this.pressed[key] = true;
          if (key === "left" || key === "right") this.checkDash(key);
        }
        this.down[key] = true;
      });

      window.addEventListener("keyup", (event) => {
        const key = this.normalize(event.key);
        if (key) this.down[key] = false;
      });
    }

    normalize(key) {
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
