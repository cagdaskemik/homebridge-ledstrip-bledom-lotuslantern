const Device = require("./Device");

let Service, Characteristic;

("use strict");
module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("@bjclopes/homebridge-ledstrip-bledom", "LedStrip", LedStrip);
};

function LedStrip(log, config, api) {
  this.log = function (message, error = false) {
    const prefix = "[@cagdaskemik/homebridge-ledstrip-bledob]";
    if (error) {
      log.error(`${prefix} ERROR: ${message}`);
    } else {
      log(`${prefix}: ${message}`);
    }
  };

  if (!config || !config.uuid) {
    this.log("No UUID provided in config - plugin cannot initialize", true);
    return;
  }

  this.config = config;
  this.homebridge = api;
  this.uuid = config.uuid;
  this.name = config.name || "LED Strip";

  this.log(`Initializing LED Strip with UUID: ${this.uuid}`);

  // Initialize main services
  this.initializeServices();

  // Initialize device
  this.initializeDevice();
}

LedStrip.prototype = {
  initializeServices: function () {
    this.log("Setting up HomeKit services");

    // Initialize the lightbulb service
    this.bulb = new Service.Lightbulb(this.name);

    // Setup power characteristic
    this.bulb.getCharacteristic(Characteristic.On).on("get", this.getPower.bind(this)).on("set", this.setPower.bind(this));

    // Setup brightness characteristic
    this.bulb.getCharacteristic(Characteristic.Brightness).on("get", this.getBrightness.bind(this)).on("set", this.setBrightness.bind(this));

    // Setup hue characteristic
    this.bulb.getCharacteristic(Characteristic.Hue).on("get", this.getHue.bind(this)).on("set", this.setHue.bind(this));

    // Setup saturation characteristic
    this.bulb.getCharacteristic(Characteristic.Saturation).on("get", this.getSaturation.bind(this)).on("set", this.setSaturation.bind(this));

    this.log("HomeKit services setup completed");
  },

  initializeDevice: function () {
    this.log(`Initializing device connection to ${this.uuid}`);
    this.device = new Device(this.uuid);

    // Optional: Setup connection state monitoring
    setInterval(() => {
      this.log(`Connection status check - Connected: ${this.device.connected}`);
    }, 30000); // Check every 30 seconds
  },

  getServices: function () {
    if (!this.bulb) {
      this.log("No bulb service available", true);
      return [];
    }

    this.log("Getting services for HomeKit");

    // Setup information service
    const infoService = new Service.AccessoryInformation();
    infoService
      .setCharacteristic(Characteristic.Manufacturer, "BLEDOM")
      .setCharacteristic(Characteristic.Model, "LED Strip Controller")
      .setCharacteristic(Characteristic.SerialNumber, this.uuid)
      .setCharacteristic(Characteristic.FirmwareRevision, "1.0.0");

    return [infoService, this.bulb];
  },

  getPower: function (callback) {
    this.log(`Getting power state: ${this.device.power} (Connected: ${this.device.connected})`);
    callback(null, this.device.power);
  },

  setPower: function (value, callback) {
    this.log(`Setting power state to: ${value}`);

    this.device
      .set_power(value)
      .then(() => {
        this.log(`Power state successfully set to: ${value}`);
        callback(null);
      })
      .catch((error) => {
        this.log(`Failed to set power state: ${error.message}`, true);
        callback(error);
      });
  },

  getBrightness: function (callback) {
    this.log(`Getting brightness level: ${this.device.brightness}`);
    callback(null, this.device.brightness);
  },

  setBrightness: function (value, callback) {
    this.log(`Setting brightness to: ${value}`);

    this.device
      .set_brightness(value)
      .then(() => {
        this.log(`Brightness successfully set to: ${value}`);
        callback(null);
      })
      .catch((error) => {
        this.log(`Failed to set brightness: ${error.message}`, true);
        callback(error);
      });
  },

  getHue: function (callback) {
    this.log(`Getting hue value: ${this.device.hue}`);
    callback(null, this.device.hue);
  },

  setHue: function (value, callback) {
    this.log(`Setting hue to: ${value}`);

    this.device
      .set_hue(value)
      .then(() => {
        this.log(`Hue successfully set to: ${value}`);
        callback(null);
      })
      .catch((error) => {
        this.log(`Failed to set hue: ${error.message}`, true);
        callback(error);
      });
  },

  getSaturation: function (callback) {
    this.log(`Getting saturation value: ${this.device.saturation}`);
    callback(null, this.device.saturation);
  },

  setSaturation: function (value, callback) {
    this.log(`Setting saturation to: ${value}`);

    this.device
      .set_saturation(value)
      .then(() => {
        this.log(`Saturation successfully set to: ${value}`);
        callback(null);
      })
      .catch((error) => {
        this.log(`Failed to set saturation: ${error.message}`, true);
        callback(error);
      });
  },

  // Utility method for handling unexpected errors
  handleError: function (error, message) {
    this.log(`${message}: ${error.message}`, true);
    if (error.stack) {
      this.log(`Stack trace: ${error.stack}`, true);
    }
  },
};
