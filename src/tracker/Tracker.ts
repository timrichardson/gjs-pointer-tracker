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
  private static readonly CLICK_DIAGNOSTICS_ENV =
    'POINTER_TRACKER_DEBUG_CLICKS';
  private static readonly CLICK_DIAGNOSTICS_PREFIX =
    '[Pointer Tracker][Click Diagnostics]';

  private isActive = false;

  private MIN_WATCHER_INTERVAL = 10;
  private pointerListener: Record<any, any> | null = null;
  private pointerButtonPressSub: number | null = null;
  private stageEventSub: number | null = null;
  private pointerEventCount = 0;
  private pointerButtonPressCount = 0;
  private pointerButtonPressHandledCount = 0;
  private stageEventSignalCount = 0;
  private stageEventSignalButtonPressCount = 0;
  private clickDiagnosticsEnabled = Tracker.isClickDiagnosticsEnabled();

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

      this.logClickDiagnostics('tracker active', {
        stage: global.stage ? 'available' : 'missing',
      });
    } else {
      Main.layoutManager.uiGroup.remove_child(this.widget);

      this.pointerListener?.remove();
      this.pointerListener = null;
      this.unsubscribePointerButtonPress();

      this.unscheduleFadeOut();

      this.logClickDiagnosticsSummary('tracker inactive');
      this.resetClickDiagnostics();
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

    const diagnosticsEnabled = this.clickDiagnosticsEnabled;

    if (diagnosticsEnabled) {
      this.logClickDiagnostics('subscribing to stage captured-event');
    }

    this.pointerButtonPressSub = global.stage.connect(
      'captured-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => {
        if (diagnosticsEnabled) {
          this.pointerEventCount += 1;
        }

        const eventType = event.type();
        if (diagnosticsEnabled && this.pointerEventCount <= 5) {
          this.logClickDiagnostics('captured stage event', {
            eventType: this.getEventTypeName(eventType),
            eventTypeValue: eventType,
            eventCount: this.pointerEventCount,
          });
        }

        if (eventType === Clutter.EventType.BUTTON_PRESS) {
          if (diagnosticsEnabled) {
            this.pointerButtonPressCount += 1;
          }

          const button = event.get_button();
          if (diagnosticsEnabled) {
            this.logClickDiagnostics('button press captured', {
              button,
              isActive: this.isActive,
              shape: this.shape ? this.shape.constructor.name : 'none',
              pressCount: this.pointerButtonPressCount,
            });
          }

          if (!this.isActive || !this.shape) {
            return Clutter.EVENT_PROPAGATE;
          }

          const handled = this.shape.onPointerButtonPress(button);
          if (diagnosticsEnabled) {
            this.logClickDiagnostics('shape button handler result', {
              button,
              handled,
            });
          }

          if (handled) {
            if (diagnosticsEnabled) {
              this.pointerButtonPressHandledCount += 1;
            }
            this.resetFadeOutState();
          }
        }

        return Clutter.EVENT_PROPAGATE;
      },
    );

    if (diagnosticsEnabled) {
      try {
        this.stageEventSub = global.stage.connect(
          'event',
          (_actor: Clutter.Actor, event: Clutter.Event) => {
            this.stageEventSignalCount += 1;

            const eventType = event.type();
            if (this.stageEventSignalCount <= 5) {
              this.logClickDiagnostics('stage event signal observed', {
                eventType: this.getEventTypeName(eventType),
                eventTypeValue: eventType,
                eventCount: this.stageEventSignalCount,
              });
            }

            if (eventType === Clutter.EventType.BUTTON_PRESS) {
              this.stageEventSignalButtonPressCount += 1;
              this.logClickDiagnostics('stage event signal button press', {
                button: event.get_button(),
                pressCount: this.stageEventSignalButtonPressCount,
              });
            }

            return Clutter.EVENT_PROPAGATE;
          },
        );
        this.logClickDiagnostics('subscribed to stage event signal', {
          subscriptionId: this.stageEventSub,
        });
      } catch (error) {
        this.logClickDiagnostics('failed to subscribe to stage event signal', {
          error: `${error}`,
        });
        this.stageEventSub = null;
      }
    }

    this.logClickDiagnostics('subscribed to stage captured-event', {
      subscriptionId: this.pointerButtonPressSub,
    });
  }

  private unsubscribePointerButtonPress() {
    if (this.pointerButtonPressSub === null) {
      return;
    }

    this.logClickDiagnostics('unsubscribing from stage captured-event', {
      subscriptionId: this.pointerButtonPressSub,
    });

    global.stage.disconnect(this.pointerButtonPressSub);
    this.pointerButtonPressSub = null;

    if (this.stageEventSub !== null) {
      this.logClickDiagnostics('unsubscribing from stage event signal', {
        subscriptionId: this.stageEventSub,
      });
      global.stage.disconnect(this.stageEventSub);
      this.stageEventSub = null;
    }
  }

  private getEventTypeName(eventType: Clutter.EventType): string {
    switch (eventType) {
      case Clutter.EventType.BUTTON_PRESS:
        return 'BUTTON_PRESS';
      case Clutter.EventType.BUTTON_RELEASE:
        return 'BUTTON_RELEASE';
      case Clutter.EventType.MOTION:
        return 'MOTION';
      default:
        return `OTHER(${eventType})`;
    }
  }

  private logClickDiagnostics(
    message: string,
    details?: Record<string, unknown>,
  ) {
    if (!this.clickDiagnosticsEnabled) {
      return;
    }

    if (details) {
      console.warn(`${Tracker.CLICK_DIAGNOSTICS_PREFIX} ${message}`, details);
      return;
    }

    console.warn(`${Tracker.CLICK_DIAGNOSTICS_PREFIX} ${message}`);
  }

  private logClickDiagnosticsSummary(context: string) {
    this.logClickDiagnostics(`${context} summary`, {
      totalCapturedEvents: this.pointerEventCount,
      totalButtonPresses: this.pointerButtonPressCount,
      totalHandledButtonPresses: this.pointerButtonPressHandledCount,
      totalStageEventSignals: this.stageEventSignalCount,
      totalStageEventSignalButtonPresses: this.stageEventSignalButtonPressCount,
    });
  }

  private resetClickDiagnostics() {
    this.pointerEventCount = 0;
    this.pointerButtonPressCount = 0;
    this.pointerButtonPressHandledCount = 0;
    this.stageEventSignalCount = 0;
    this.stageEventSignalButtonPressCount = 0;
  }

  private static isClickDiagnosticsEnabled(): boolean {
    const envValue = GLib.getenv(Tracker.CLICK_DIAGNOSTICS_ENV);
    if (!envValue) {
      return false;
    }

    const normalized = envValue.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
}
