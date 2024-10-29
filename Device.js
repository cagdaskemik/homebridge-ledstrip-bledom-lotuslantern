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

function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}][@cagdaskemik/ledstrip-bledom]`;

  switch (level) {
    case "error":
      console.error(`${prefix} ERROR:`, message);
      break;
    case "warn":
      console.warn(`${prefix} WARN:`, message);
      break;
    default:
      console.log(`${prefix}:`, message);
  }
}

module.exports = class Device {
  constructor(uuid) {
    this.uuid = uuid;
    this.connected = false;
    this.state = {
      power: false,
      brightness: 100,
      hue: 0,
      saturation: 0,
      l: 0.5,
      effect: null,
      effectSpeed: 50,
    };
    this.peripheral = undefined;
    this.write = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.disconnectTimer = null;
    this.isReconnecting = false;
    this.connectionRetryDelay = INITIAL_RETRY_DELAY;
    this.connectionTimeout = null;
    this.writeQueue = [];
    this.isProcessingQueue = false;

    noble.on("stateChange", async (state) => {
      try {
        if (state === "poweredOn") {
          log("Bluetooth powered on, starting scan...");
          await noble.startScanningAsync();
        } else {
          log(`Bluetooth state changed to: ${state}`);
          if (this.peripheral) {
            await this.peripheral.disconnectAsync();
          }
          this.connected = false;
        }
      } catch (error) {
        log(`Error in stateChange handler: ${error.message}`, "error");
      }
    });

    noble.on("discover", async (peripheral) => {
      try {
        log(`Discovered device: ${peripheral.uuid} - ${peripheral.advertisement.localName}`);
        if (peripheral.uuid === this.uuid) {
          this.peripheral = peripheral;
          await noble.stopScanningAsync();
          log("Found target device, stopped scanning");
          this.connectWithRetry();
        }
      } catch (error) {
        log(`Error in discover handler: ${error.message}`, "error");
      }
    });
  }

  async connectWithRetry() {
    try {
      await this.connectAndGetWriteCharacteristics();
      this.connectionRetryDelay = INITIAL_RETRY_DELAY;
    } catch (error) {
      log(`Connection failed: ${error.message}`, "error");

      if (this.connectionRetryDelay < MAX_RETRY_DELAY) {
        this.connectionRetryDelay *= 2;
      }

      this.connectionTimeout = setTimeout(() => {
        this.connectWithRetry();
      }, this.connectionRetryDelay);
    }
  }

  async connectAndGetWriteCharacteristics() {
    try {
      if (this.isReconnecting) {
        log("Already attempting to reconnect, skipping...", "warn");
        return;
      }

      this.isReconnecting = true;

      if (!this.peripheral) {
        log("No peripheral found, starting scan...");
        await noble.startScanningAsync();
        return;
      }

      log(`Connecting to ${this.peripheral.uuid}...`);
      await this.peripheral.connectAsync();
      log("Connected successfully");

      const { characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(["fff0"], ["fff3"]);

      if (!characteristics || characteristics.length === 0) {
        throw new Error("No characteristics found");
      }

      this.write = characteristics[0];
      this.connected = true;
      this.reconnectAttempts = 0;

      this.peripheral.once("disconnect", () => {
        log("Device disconnected");
        this.handleDisconnect();
      });

      // Process any pending writes
      this.processWriteQueue();
    } catch (error) {
      log(`Connection error: ${error.message}`, "error");
      this.connected = false;
      await this.handleDisconnect();
    } finally {
      this.isReconnecting = false;
    }
  }

  async handleDisconnect() {
    this.connected = false;
    this.write = null;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => {
        this.connectWithRetry();
      }, 5000);
    } else {
      log("Max reconnection attempts reached. Please check the device.", "warn");
      setTimeout(() => {
        this.reconnectAttempts = 0;
      }, 60000);
    }
  }

  async queueWrite(buffer) {
    return new Promise((resolve, reject) => {
      this.writeQueue.push({ buffer, resolve, reject });
      this.processWriteQueue();
    });
  }

  async processWriteQueue() {
    if (this.isProcessingQueue || this.writeQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.writeQueue.length > 0) {
      const { buffer, resolve, reject } = this.writeQueue[0];

      try {
        await this.writeToDevice(buffer);
        resolve();
      } catch (error) {
        reject(error);
      }

      this.writeQueue.shift();
    }

    this.isProcessingQueue = false;
  }

  async writeToDevice(buffer) {
    const maxAttempts = 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        if (!this.write || !this.connected) {
          await this.connectAndGetWriteCharacteristics();
        }

        await new Promise((resolve, reject) => {
          if (!this.write) {
            reject(new Error("Write characteristic not available"));
            return;
          }

          this.write.write(buffer, true, (err) => {
            if (err) {
              log(`Write error: ${err.message}`, "error");
              reject(err);
            } else {
              this.debounceDisconnect();
              resolve();
            }
          });
        });

        return;
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          throw new Error(`Failed to write after ${maxAttempts} attempts: ${error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  debounceDisconnect() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
    }

    this.disconnectTimer = setTimeout(async () => {
      if (this.peripheral && this.connected) {
        try {
          log("Disconnecting due to inactivity...");
          await this.peripheral.disconnectAsync();
          log("Disconnected successfully");
          this.connected = false;
        } catch (error) {
          log(`Disconnect error: ${error.message}`, "error");
        }
      }
    }, 5000);
  }

  async set_power(status) {
    try {
      const buffer = Buffer.from(`7e0404${status ? "f00001" : "000000"}ff00ef`, "hex");
      log(`Setting power: ${status}`);
      await this.queueWrite(buffer);
      this.state.power = status;
    } catch (error) {
      log(`Set power error: ${error.message}`, "error");
      throw error;
    }
  }

  async set_brightness(level) {
    try {
      if (level > 100 || level < 0) {
        throw new Error(`Invalid brightness level: ${level}`);
      }
      const level_hex = ("0" + level.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e0401${level_hex}01ffff00ef`, "hex");
      log(`Setting brightness: ${level}`);
      await this.queueWrite(buffer);
      this.state.brightness = level;
    } catch (error) {
      log(`Set brightness error: ${error.message}`, "error");
      throw error;
    }
  }

  async set_rgb(r, g, b) {
    try {
      const rhex = ("0" + r.toString(16)).slice(-2);
      const ghex = ("0" + g.toString(16)).slice(-2);
      const bhex = ("0" + b.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e070503${rhex}${ghex}${bhex}10ef`, "hex");
      log(`Setting RGB: ${r},${g},${b}`);
      await this.queueWrite(buffer);
    } catch (error) {
      log(`Set RGB error: ${error.message}`, "error");
      throw error;
    }
  }

  async set_hue(hue) {
    try {
      this.state.hue = hue;
      const rgb = hslToRgb(hue / 360, this.state.saturation / 100, this.state.l);
      await this.set_rgb(rgb[0], rgb[1], rgb[2]);
    } catch (error) {
      log(`Set hue error: ${error.message}`, "error");
      throw error;
    }
  }

  async set_saturation(saturation) {
    try {
      this.state.saturation = saturation;
      const rgb = hslToRgb(this.state.hue / 360, saturation / 100, this.state.l);
      await this.set_rgb(rgb[0], rgb[1], rgb[2]);
    } catch (error) {
      log(`Set saturation error: ${error.message}`, "error");
      throw error;
    }
  }

  async set_effect(effect) {
    try {
      const buffer = Buffer.from(`7e000303${effect.toString(16)}030000ef`, "hex");
      log(`Setting effect: ${effect}`);
      await this.queueWrite(buffer);
      this.state.effect = effect;
    } catch (error) {
      log(`Set effect error: ${error.message}`, "error");
      throw error;
    }
  }

  async set_effect_speed(speed) {
    try {
      if (speed > 100 || speed < 0) {
        throw new Error(`Invalid effect speed: ${speed}`);
      }
      const speed_hex = ("0" + speed.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e000202${speed_hex}000000ef`, "hex");
      log(`Setting effect speed: ${speed}`);
      await this.queueWrite(buffer);
      this.state.effectSpeed = speed;
    } catch (error) {
      log(`Set effect speed error: ${error.message}`, "error");
      throw error;
    }
  }

  getState() {
    return { ...this.state };
  }
};
