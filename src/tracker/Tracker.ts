import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
// @ts-ignore
import { getPointerWatcher } from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
import { makeWidget } from '../gjs/widget.js';
import { TrackerShape } from '../prefs/schema/TrackerShape.js';
import { SettingsSubscriber } from '../prefs/SettingsSubscriber.js';
import { exhausted } from '../ts/exhausted.js';
import { Circle } from './Circle.js';
import { Cursor } from './Cursor.js';
import { Shape } from './Shape.js';

export class Tracker {
  private isActive = false;

  private MIN_WATCHER_INTERVAL = 10;
  private pointerListener: Record<any, any> | null = null;
  private pointerButtonPressSub: number | null = null;

  private widget = makeWidget();
  private shape: Shape | null = null;

  private settingsSub: SettingsSubscriber;

  private fadeOutTransition: Clutter.Transition;
  private fadeOutTimeout: GLib.Source | null = null;

  constructor(private settings: Gio.Settings) {
    this.settingsSub = new SettingsSubscriber(settings);

    this.settingsSub.connect('changed::tracker-shape', () =>
      this.updateShape(),
    );
    this.updateShape();

    this.fadeOutTransition = new Clutter.PropertyTransition({
      property_name: 'opacity',
      duration: this.settingsSub.settings.get_int('tracker-idle-fade-duration'),
      progress_mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
    function uintValue(value: number) {
      const v = new GObject.Value();
      v.init(GObject.TYPE_UINT);
      v.set_uint(value);
      return v;
    }
    this.fadeOutTransition.set_from(uintValue(255));
    this.fadeOutTransition.set_to(uintValue(0));
    this.settingsSub.connect('changed::tracker-idle-fade-duration', () => {
      const duration = this.settingsSub.settings.get_int(
        'tracker-idle-fade-duration',
      );
      this.fadeOutTransition.set_duration(duration);
    });
    this.widget.add_transition('fade-out', this.fadeOutTransition);

    this.settingsSub.connect('changed::tracker-idle-fade-active', () => {
      const active = this.settingsSub.settings.get_boolean(
        'tracker-idle-fade-active',
      );
      if (active) {
        this.rescheduleFadeOut();
      } else {
        this.unscheduleFadeOut();
      }
    });
  }

  destroy() {
    this.unscheduleFadeOut();
    this.unsubscribePointerButtonPress();

    this.settingsSub.disconnect();

    this.shape?.destroy();

    this.setActive(false);
    this.widget.destroy();
  }

  setActive(active: boolean) {
    if (this.isActive === active) return;
    this.isActive = active;

    if (active) {
      Main.layoutManager.uiGroup.add_child(this.widget);

      this.pointerListener = getPointerWatcher().addWatch(
        this.MIN_WATCHER_INTERVAL,
        (x: number, y: number) => this.updatePosition(x, y),
      );
      this.subscribePointerButtonPress();
      const [initialX, initialY] = global.get_pointer();
      this.updatePosition(initialX, initialY);

      if (this.shouldFadeOut()) {
        this.rescheduleFadeOut();
      }
    } else {
      Main.layoutManager.uiGroup.remove_child(this.widget);

      this.pointerListener?.remove();
      this.pointerListener = null;
      this.unsubscribePointerButtonPress();

      this.unscheduleFadeOut();
    }
  }

  updatePosition(x: number, y: number) {
    this.raiseToTop();
    this.widget.set_position(x, y);

    this.resetFadeOutState();
  }

  raiseToTop() {
    const parent = this.widget.get_parent();
    if (!parent) return;
    parent.set_child_above_sibling(this.widget, null);
  }

  updateShape() {
    const shape: TrackerShape =
      this.settingsSub.settings.get_enum('tracker-shape');
    this.widget.remove_all_children();
    this.shape?.destroy();

    switch (shape) {
      case TrackerShape.CIRCLE:
        this.shape = new Circle(this.settings);
        break;
      case TrackerShape.CURSOR:
        this.shape = new Cursor();
        break;
      default:
        exhausted(shape);
    }

    if (this.shape) {
      this.widget.add_child(this.shape.widget);
    }
  }

  private shouldFadeOut() {
    const active = this.settingsSub.settings.get_boolean(
      'tracker-idle-fade-active',
    );
    return active && !(this.shape instanceof Tracker);
  }

  private resetFadeOutState() {
    this.fadeOutTransition.stop();
    this.widget.opacity = 255;
    if (this.shouldFadeOut()) {
      this.rescheduleFadeOut();
    }
  }

  private unscheduleFadeOut() {
    this.fadeOutTimeout && clearTimeout(this.fadeOutTimeout);
    this.fadeOutTimeout = null;
  }

  private rescheduleFadeOut() {
    this.unscheduleFadeOut();

    const timeoutMs = this.settingsSub.settings.get_int(
      'tracker-idle-fade-timeout',
    );
    this.fadeOutTimeout = setTimeout(
      () => this.fadeOutTransition.start(),
      timeoutMs,
    );
  }

  private subscribePointerButtonPress() {
    if (this.pointerButtonPressSub !== null) {
      return;
    }

    this.pointerButtonPressSub = global.stage.connect(
      'captured-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
          if (!this.isActive || !this.shape) {
            return Clutter.EVENT_PROPAGATE;
          }

          if (this.shape.onPointerButtonPress(event.get_button())) {
            this.resetFadeOutState();
          }
        }

        return Clutter.EVENT_PROPAGATE;
      },
    );
  }

  private unsubscribePointerButtonPress() {
    if (this.pointerButtonPressSub === null) {
      return;
    }

    global.stage.disconnect(this.pointerButtonPressSub);
    this.pointerButtonPressSub = null;
  }
}
