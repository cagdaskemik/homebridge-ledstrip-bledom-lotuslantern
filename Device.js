const noble = require("@abandonware/noble");

const EFFECTS = {
  JUMP_RGB: 0x87,
  JUMP_RGBYCMW: 0x88,
  CROSSFADE_RED: 0x8b,
  CROSSFADE_GREEN: 0x8c,
  CROSSFADE_BLUE: 0x8d,
  CROSSFADE_YELLOW: 0x8e,
  CROSSFADE_CYAN: 0x8f,
  CROSSFADE_MAGENTA: 0x90,
  CROSSFADE_WHITE: 0x91,
  CROSSFADE_RG: 0x92,
  CROSSFADE_RB: 0x93,
  CROSSFADE_GB: 0x94,
  CROSSFADE_RGB: 0x89,
  CROSSFADE_RGBYCMW: 0x8a,
  BLINK_RED: 0x96,
  BLINK_GREEN: 0x97,
  BLINK_BLUE: 0x98,
  BLINK_YELLOW: 0x99,
  BLINK_CYAN: 0x9a,
  BLINK_MAGENTA: 0x9b,
  BLINK_WHITE: 0x9c,
  BLINK_RGBYCMW: 0x95,
};

function hslToRgb(h, s, l) {
  var r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    var hue2rgb = function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function log(message) {
  console.log(`[@bjclopes/homebridge-ledstrip-bledom]:`, message);
}

module.exports = class Device {
  constructor(uuid) {
    this.uuid = uuid;
    this.connected = false;
    this.power = false;
    this.brightness = 100;
    this.hue = 0;
    this.saturation = 0;
    this.l = 0.5;
    this.peripheral = undefined;

    noble.on("stateChange", (state) => {
      if (state == "poweredOn") {
        noble.startScanningAsync();
      } else {
        if (this.peripheral) this.peripheral.disconnect();
        this.connected = false;
      }
    });

    noble.on("discover", async (peripheral) => {
      console.log("[@bjclopes/homebridge-ledstrip-bledom]:", peripheral.uuid, peripheral.advertisement.localName);
      if (peripheral.uuid == this.uuid) {
        this.peripheral = peripheral;
        noble.stopScanning();
      }
    });
  }

  async connectAndGetWriteCharacteristics() {
    if (!this.peripheral) {
      noble.startScanningAsync();
      return;
    }
    log(`Connecting to ${this.peripheral.uuid}...`);
    await this.peripheral.connectAsync();
    log(`Connected`);
    this.connected = true;
    const { characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(["fff0"], ["fff3"]);
    this.write = characteristics[0];
  }

  async debounceDisconnect() {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (this.peripheral) {
          log("Disconnecting...");
          await this.peripheral.disconnectAsync();
          log("Disconnected");
          this.connected = false;
        }
      }, 5000);
    };
  }

  async set_power(status) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      const buffer = Buffer.from(`7e0404${status ? "f00001" : "000000"}ff00ef`, "hex");
      log(buffer);
      this.write.write(buffer, true, (err) => {
        if (err) console.log("Error:", err);
        this.power = status;
        this.debounceDisconnect();
      });
    }
  }

  async set_brightness(level) {
    if (level > 100 || level < 0) return;
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      const level_hex = ("0" + level.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e0401${level_hex}01ffff00ef`, "hex");
      log(buffer);
      this.write.write(buffer, true, (err) => {
        if (err) console.log("Error:", err);
        this.brightness = level;
        this.debounceDisconnect();
      });
    }
  }

  async set_rgb(r, g, b) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      const rhex = ("0" + r.toString(16)).slice(-2);
      const ghex = ("0" + g.toString(16)).slice(-2);
      const bhex = ("0" + b.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e070503${rhex}${ghex}${bhex}10ef`, "hex");
      log(buffer);
      this.write.write(buffer, true, (err) => {
        if (err) console.log("Error:", err);
        this.debounceDisconnect();
      });
    }
  }

  async set_hue(hue) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      this.hue = hue;
      const rgb = hslToRgb(hue / 360, this.saturation / 100, this.l);
      this.set_rgb(rgb[0], rgb[1], rgb[2]);
      this.debounceDisconnect();
    }
  }

  async set_saturation(saturation) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      this.saturation = saturation;
      const rgb = hslToRgb(this.hue / 360, saturation / 100, this.l);
      this.set_rgb(rgb[0], rgb[1], rgb[2]);
      this.debounceDisconnect();
    }
  }

  async set_effect(effect) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      const buffer = Buffer.from(`7e000303${effect.toString(16)}030000ef`, "hex");
      log(buffer);
      this.write.write(buffer, true, (err) => {
        if (err) console.log("Error:", err);
        this.debounceDisconnect();
      });
    }
  }

  async set_effect_speed(speed) {
    if (speed > 100 || speed < 0) return;
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      const speed_hex = ("0" + speed.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e000202${speed_hex}000000ef`, "hex");
      log(buffer);
      this.write.write(buffer, true, (err) => {
        if (err) console.log("Error:", err);
        this.debounceDisconnect();
      });
    }
  }
};
