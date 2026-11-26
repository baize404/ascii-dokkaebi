const KEY = 'ascii-dokkaebi.settings';

/** 每個設定的預設值與合法範圍（用來驗證讀回來的資料） */
export const SETTINGS_SCHEMA = {
  musicVolume: { default: 0.5, type: 'number', min: 0, max: 1 },
  ambienceVolume: { default: 0.6, type: 'number', min: 0, max: 1 },
  sfxVolume: { default: 0.8, type: 'number', min: 0, max: 1 },
  ascii: { default: true, type: 'boolean' },
  density: { default: 'normal', type: 'enum', values: ['fine', 'normal', 'coarse'] },
  quality: { default: 'auto', type: 'enum', values: ['auto', 'low', 'medium', 'high'] },
  uiScale: { default: 'normal', type: 'enum', values: ['small', 'normal', 'large'] },
  cameraShake: { default: true, type: 'boolean' },
  reduceMotion: { default: false, type: 'boolean' },
  showFps: { default: false, type: 'boolean' },
};

function validate(key, value) {
  const rule = SETTINGS_SCHEMA[key];
  if (!rule) return undefined;
  if (rule.type === 'number') return Number.isFinite(value) ? Math.min(rule.max, Math.max(rule.min, value)) : undefined;
  if (rule.type === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (rule.type === 'enum') return rule.values.includes(value) ? value : undefined;
  return undefined;
}

/**
 * 設定管理：讀寫 localStorage、驗證數值、變更時通知訂閱者。
 * 事件：settings:change { key, value, all }
 */
export class Settings {
  constructor(bus, storage = globalThis.localStorage) {
    this.bus = bus;
    this.storage = storage;
    this.values = Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([k, r]) => [k, r.default]));
    try {
      const saved = JSON.parse(this.storage?.getItem(KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        for (const [k, v] of Object.entries(saved)) {
          const ok = validate(k, v);
          if (ok !== undefined) this.values[k] = ok;
        }
      }
    } catch {
      // 設定壞掉就用預設值
    }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    const ok = validate(key, value);
    if (ok === undefined || ok === this.values[key]) return false;
    this.values[key] = ok;
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // 無法儲存時這次遊玩仍有效
    }
    this.bus?.emit('settings:change', { key, value: ok, all: this.values });
    return true;
  }

  reset() {
    for (const [k, r] of Object.entries(SETTINGS_SCHEMA)) this.set(k, r.default);
  }
}
