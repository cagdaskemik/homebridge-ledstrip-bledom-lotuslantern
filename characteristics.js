const { Characteristic } = require("homebridge");

class EffectCharacteristic extends Characteristic {
  constructor() {
    super("Effect", "F0000001-0000-1000-8000-0026BB765291");
    this.setProps({
      format: Characteristic.Formats.UINT8,
      maxValue: 255,
      minValue: 0,
      validValues: [
        0, // None
        0x87, // Jump RGB
        0x88, // Jump RGBYCMW
        0x89, // Crossfade RGB
        0x8a, // Crossfade RGBYCMW
        0x96, // Blink Red
        0x97, // Blink Green
        0x98, // Blink Blue
        0x95, // Blink RGBYCMW
      ],
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  }
}

class EffectSpeedCharacteristic extends Characteristic {
  constructor() {
    super("Effect Speed", "F0000002-0000-1000-8000-0026BB765291");
    this.setProps({
      format: Characteristic.Formats.UINT8,
      unit: Characteristic.Units.PERCENTAGE,
      maxValue: 100,
      minValue: 0,
      minStep: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  }
}

module.exports = {
  EffectCharacteristic,
  EffectSpeedCharacteristic,
};
