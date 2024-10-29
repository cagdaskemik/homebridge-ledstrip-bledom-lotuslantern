const noble = require("@abandonware/noble");
const MAX_RETRY_DELAY = 30000;
const INITIAL_RETRY_DELAY = 1000;

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
    r = g = b = l;
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

function log(message, error = false) {
  const prefix = `[@cagdaskemik/homebridge-ledstrip-bledob]`;
  if (error) {
    console.error(`${prefix} ERROR:`, message);
  } else {
    console.log(`${prefix}:`, message);
  }
}

class Device {
  constructor(uuid) {
    this.uuid = uuid;
    this.connected = false;
    this.power = false;
    this.brightness = 100;
    this.hue = 0;
    this.saturation = 0;
    this.l = 0.5;
    this.peripheral = undefined;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.connectionTimeout = null;
    this.disconnectTimer = null;

    this.initializeBLE();
  }

  initializeBLE() {
    noble.on("stateChange", (state) => {
      log(`Bluetooth adapter state changed to: ${state}`);
      if (state === "poweredOn") {
        this.startScanning();
      } else {
        this.handleDisconnection("Bluetooth adapter powered off");
      }
    });

    noble.on("discover", async (peripheral) => {
      log(`Discovered device: ${peripheral.uuid} (${peripheral.advertisement.localName})`);
      if (peripheral.uuid === this.uuid) {
        log(`Found target device: ${this.uuid}`);
        this.peripheral = peripheral;
        noble.stopScanning();
      }
    });
  }

  async startScanning() {
    try {
      log("Starting BLE scan...");
      await noble.startScanningAsync();
    } catch (error) {
      log(`Error starting scan: ${error.message}`, true);
    }
  }

  handleDisconnection(reason) {
    log(`Disconnection occurred: ${reason}`);
    if (this.peripheral) {
      this.peripheral.disconnect();
    }
    this.connected = false;
    this.write = null;
    this.connectionAttempts = 0;
    clearTimeout(this.disconnectTimer);
  }

  async ensureConnection() {
    if (this.connected && this.write) {
      return true;
    }

    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      log("Max connection attempts reached. Waiting before retry.", true);
      this.connectionAttempts = 0;
      return false;
    }

    try {
      this.connectionAttempts++;
      log(`Connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}`);

      if (!this.peripheral) {
        await this.startScanning();
        return false;
      }

      await this.peripheral.connectAsync();
      log("Connected successfully");
      this.connected = true;

      const { characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(["fff0"], ["fff3"]);

      if (!characteristics || characteristics.length === 0) {
        throw new Error("No characteristics found");
      }

      this.write = characteristics[0];
      this.connectionAttempts = 0;

      // Setup disconnect listener
      this.peripheral.once("disconnect", () => {
        this.handleDisconnection("Device initiated disconnect");
      });

      return true;
    } catch (error) {
      log(`Connection error: ${error.message}`, true);
      return false;
    }
  }

  async writeCommand(buffer, operation) {
    if (!(await this.ensureConnection())) {
      log(`Failed to execute ${operation} - Connection not available`, true);
      return false;
    }

    return new Promise((resolve, reject) => {
      this.write.write(buffer, true, (error) => {
        if (error) {
          log(`Error during ${operation}: ${error.message}`, true);
          reject(error);
          return;
        }
        log(`Successfully executed ${operation}`);
        this.scheduleDisconnect();
        resolve(true);
      });
    });
  }

  scheduleDisconnect() {
    clearTimeout(this.disconnectTimer);
    this.disconnectTimer = setTimeout(async () => {
      if (this.peripheral && this.connected) {
        log("Scheduled disconnect executing...");
        await this.peripheral.disconnectAsync();
        this.connected = false;
        log("Device disconnected as scheduled");
      }
    }, 5000);
  }

  async set_power(status) {
    try {
      const buffer = Buffer.from(`7e0404${status ? "f00001" : "000000"}ff00ef`, "hex");
      const result = await this.writeCommand(buffer, `set power to ${status}`);
      if (result) {
        this.power = status;
      }
    } catch (error) {
      log(`Power operation failed: ${error.message}`, true);
    }
  }

  async set_brightness(level) {
    if (level > 100 || level < 0) {
      log(`Invalid brightness level: ${level}`, true);
      return;
    }

    try {
      const level_hex = ("0" + level.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e0401${level_hex}01ffff00ef`, "hex");
      const result = await this.writeCommand(buffer, `set brightness to ${level}`);
      if (result) {
        this.brightness = level;
      }
    } catch (error) {
      log(`Brightness operation failed: ${error.message}`, true);
    }
  }

  async set_rgb(r, g, b) {
    try {
      const rhex = ("0" + r.toString(16)).slice(-2);
      const ghex = ("0" + g.toString(16)).slice(-2);
      const bhex = ("0" + b.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e070503${rhex}${ghex}${bhex}10ef`, "hex");
      await this.writeCommand(buffer, `set RGB to ${r},${g},${b}`);
    } catch (error) {
      log(`RGB operation failed: ${error.message}`, true);
    }
  }

  async set_hue(hue) {
    try {
      this.hue = hue;
      const rgb = hslToRgb(hue / 360, this.saturation / 100, this.l);
      await this.set_rgb(rgb[0], rgb[1], rgb[2]);
    } catch (error) {
      log(`Hue operation failed: ${error.message}`, true);
    }
  }

  async set_saturation(saturation) {
    try {
      this.saturation = saturation;
      const rgb = hslToRgb(this.hue / 360, saturation / 100, this.l);
      await this.set_rgb(rgb[0], rgb[1], rgb[2]);
    } catch (error) {
      log(`Saturation operation failed: ${error.message}`, true);
    }
  }
}

module.exports = Device;
