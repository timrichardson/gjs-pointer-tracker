import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function makeIdleRow(
  settings: Gio.Settings,
  navView: Adw.NavigationView,
): Gtk.Widget {
  const idleSettingsRow = new Adw.ActionRow({
    title: _('Idle settings'),
    subtitle: _('Inactivity settings of the tracker'),
    activatable: true,
  });
  const nextButton = new Gtk.Button({
    child: new Gtk.Image({ icon_name: 'go-next-symbolic' }),
    focusable: false,
    can_focus: false,
    has_frame: false,
  });
  nextButton.set_can_target(false);
  nextButton.set_receives_default(false);
  idleSettingsRow.add_suffix(nextButton);

  const idleSettingsNavPage = new Adw.NavigationPage({
    title: _('Idle settings'),
  });
  const idleSettingsPage = new Adw.PreferencesPage();
  const idleSettingsGroup = new Adw.PreferencesGroup();

  const fadeActiveRow = new Adw.SwitchRow({
    title: _('Fade on idle'),
    subtitle: _('If the tracker should fade out on inactivity'),
    active: settings.get_boolean('tracker-idle-fade-active'),
  });
  settings.bind(
    'tracker-idle-fade-active',
    fadeActiveRow,
    'active',
    Gio.SettingsBindFlags.DEFAULT,
  );
  idleSettingsGroup.add(fadeActiveRow);

  const fadeTimeoutRow = new Adw.SpinRow({
    title: _('Idle fade timeout'),
    subtitle: _(
      'Inactivity timeout before the tracker fades out (in seconds, 0 for never)',
    ),
    digits: 1,
    adjustment: new Gtk.Adjustment({
      lower: 0,
      upper: 5,
      step_increment: 0.1,
    }),
    value: settings.get_int('tracker-idle-fade-timeout') / 1000,
  });
  fadeTimeoutRow.adjustment.connect('value-changed', (widget) => {
    settings.set_int('tracker-idle-fade-timeout', widget.value * 1000);
  });
  idleSettingsGroup.add(fadeTimeoutRow);

  const fadeDurationRow = new Adw.SpinRow({
    title: _('Idle fade duration'),
    subtitle: _('Transition duration of the fade out animation (in seconds)'),
    digits: 1,
    adjustment: new Gtk.Adjustment({
      lower: 0,
      upper: 5,
      step_increment: 0.1,
    }),
    value: settings.get_int('tracker-idle-fade-duration') / 1000,
  });
  fadeDurationRow.adjustment.connect('value-changed', (widget) => {
    settings.set_int('tracker-idle-fade-duration', widget.value * 1000);
  });
  idleSettingsGroup.add(fadeDurationRow);

  function onActiveChange() {
    const active = settings.get_boolean('tracker-idle-fade-active');
    fadeTimeoutRow.set_sensitive(active);
    fadeDurationRow.set_sensitive(active);
  }
  settings.connect('changed::tracker-idle-fade-active', () => onActiveChange());
  onActiveChange();

  idleSettingsPage.add(idleSettingsGroup);

  const pageBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
  });
  pageBox.append(new Adw.HeaderBar());
  pageBox.append(idleSettingsPage);
  idleSettingsNavPage.set_child(pageBox);

  idleSettingsRow.connect('activated', () => {
    navView.push(idleSettingsNavPage);
  });

  return idleSettingsRow;
}
