import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import { makeWidget, setStyles, Styles } from '../gjs/widget.js';
import { TrackerClickVisibility } from '../prefs/schema/TrackerClickVisibility.js';
import { SettingsSubscriber } from '../prefs/SettingsSubscriber.js';
import { Shape } from './Shape.js';

export class Circle implements Shape {
  private static readonly CLICK_DIAGNOSTICS_ENV =
    'POINTER_TRACKER_DEBUG_CLICKS';
  private static readonly CLICK_DIAGNOSTICS_PREFIX =
    '[Pointer Tracker][Click Diagnostics]';

  widget = makeWidget();

  private static readonly CLICK_FLASH_DURATION_MAX_MS = 5000;
  private static readonly CLICK_FLASH_DURATION_MIN_MS = 20;
  private static readonly CLICK_FLASH_DEFAULT_DURATION_MS = 250;

  private styles: Styles = {};

  private settingsSub: SettingsSubscriber;
  private baseColor = '';
  private clickColor = '';
  private clickVisibility = TrackerClickVisibility.AS_WELL;
  private isClickFlashing = false;
  private clickFlashDurationMs = Circle.CLICK_FLASH_DEFAULT_DURATION_MS;
  private clickFlashTimeout: ReturnType<typeof setTimeout> | null = null;
  private clickDiagnosticsEnabled = Circle.isClickDiagnosticsEnabled();

  constructor(settings: Gio.Settings) {
    this.settingsSub = new SettingsSubscriber(settings);

    this.settingsSub.connect('changed::tracker-size', () => this.updateSize());
    this.updateSize();

    this.settingsSub.connect('changed::tracker-color', () =>
      this.updateColor(),
    );
    this.updateColor();

    this.settingsSub.connect('changed::tracker-click-color', () =>
      this.updateClickColor(),
    );
    this.updateClickColor();

    this.settingsSub.connect('changed::tracker-click-visibility', () =>
      this.updateClickVisibility(),
    );
    this.updateClickVisibility();

    this.settingsSub.connect('changed::tracker-click-duration', () =>
      this.updateClickDuration(),
    );
    this.updateClickDuration();

    this.settingsSub.connect('changed::tracker-opacity', () =>
      this.updateOpacity(),
    );
    this.updateOpacity();
  }

  destroy() {
    if (this.clickFlashTimeout) {
      clearTimeout(this.clickFlashTimeout);
      this.clickFlashTimeout = null;
    }

    this.isClickFlashing = false;

    this.settingsSub.disconnect();
  }

  onPointerButtonPress(button: number): boolean {
    let handled = false;

    if (!this.isFlashButton(button)) {
      this.logClickDiagnostics('ignoring unsupported button', {
        button,
      });
      return false;
    }

    if (this.clickVisibility === TrackerClickVisibility.NEVER) {
      this.logClickDiagnostics('click visibility set to NEVER', {
        button,
      });
      return false;
    }

    handled = true;
    this.logClickDiagnostics('showing click feedback', {
      button,
      clickVisibility: TrackerClickVisibility[this.clickVisibility],
      clickFlashDurationMs: this.clickFlashDurationMs,
    });

    this.isClickFlashing = true;
    this.renderColor();

    if (this.clickFlashTimeout) {
      clearTimeout(this.clickFlashTimeout);
    }

    this.clickFlashTimeout = setTimeout(() => {
      this.clickFlashTimeout = null;
      this.isClickFlashing = false;
      this.renderColor();
    }, this.clickFlashDurationMs);

    return handled;
  }

  updateSize(): void {
    const size = this.settingsSub.settings.get_int('tracker-size');

    this.styles['width'] = `${size}px`;
    this.styles['height'] = `${size}px`;
    this.styles['border-radius'] = `${size / 2}px`;
    setStyles(this.widget, this.styles);

    const alignScale = Meta.is_wayland_compositor() ? 2 : 1;
    this.widget.set_translation(-size / alignScale, -size / alignScale, 0);
  }

  updateColor(): void {
    this.baseColor = this.settingsSub.settings.get_string('tracker-color');
    this.renderColor();
  }

  updateClickColor(): void {
    this.clickColor = this.settingsSub.settings.get_string(
      'tracker-click-color',
    );
    this.renderColor();
  }

  updateClickVisibility(): void {
    this.clickVisibility = this.settingsSub.settings.get_enum(
      'tracker-click-visibility',
    ) as TrackerClickVisibility;
    this.renderColor();
  }

  updateClickDuration(): void {
    const durationMs = this.settingsSub.settings.get_int(
      'tracker-click-duration',
    );
    this.clickFlashDurationMs = Math.max(
      Circle.CLICK_FLASH_DURATION_MIN_MS,
      Math.min(Circle.CLICK_FLASH_DURATION_MAX_MS, durationMs),
    );
  }

  updateOpacity(): void {
    const opacitySetting = this.settingsSub.settings.get_int('tracker-opacity');
    this.widget.opacity = Math.ceil(opacitySetting * 2.55);
  }

  private isFlashButton(button: number): boolean {
    return (
      button === Clutter.BUTTON_PRIMARY || button === Clutter.BUTTON_SECONDARY
    );
  }

  private renderColor() {
    let color = this.baseColor;

    if (this.clickVisibility === TrackerClickVisibility.ONLY) {
      color = this.isClickFlashing ? this.clickColor : 'transparent';
    } else if (
      this.clickVisibility === TrackerClickVisibility.AS_WELL &&
      this.isClickFlashing
    ) {
      color = this.clickColor;
    }

    this.styles['background-color'] = color;
    setStyles(this.widget, this.styles);
  }

  private logClickDiagnostics(
    message: string,
    details: Record<string, unknown>,
  ) {
    if (!this.clickDiagnosticsEnabled) {
      return;
    }

    console.warn(`${Circle.CLICK_DIAGNOSTICS_PREFIX} ${message}`, details);
  }

  private static isClickDiagnosticsEnabled(): boolean {
    const envValue = GLib.getenv(Circle.CLICK_DIAGNOSTICS_ENV);
    if (!envValue) {
      return false;
    }

    const normalized = envValue.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
}
