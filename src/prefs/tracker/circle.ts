import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { makeColorPicker } from '../color-picker.js';
import { TrackerClickVisibility } from '../schema/TrackerClickVisibility.js';

export function makeCircleRows(settings: Gio.Settings): Gtk.Widget[] {
  const sizeRow = new Adw.SpinRow({
    title: _('Size'),
    subtitle: _('Size of the tracker'),
    adjustment: new Gtk.Adjustment({
      lower: 8,
      upper: 1024,
      step_increment: 8,
    }),
    value: settings.get_int('tracker-size'),
  });
  sizeRow.adjustment.connect('value-changed', (widget) => {
    settings.set_int('tracker-size', widget.value);
  });

  const colorRow = new Adw.ActionRow({
    title: _('Color'),
    subtitle: _('Default color of the tracker'),
  });
  const colorBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
  });
  const colorPicker = makeColorPicker(settings, 'tracker-color');
  colorBox.append(colorPicker);
  colorRow.add_suffix(colorBox);

  const opacityRow = new Adw.SpinRow({
    title: _('Opacity'),
    subtitle: _('Opacity of the tracker'),
    adjustment: new Gtk.Adjustment({
      lower: 0,
      upper: 100,
      step_increment: 10,
    }),
    value: settings.get_int('tracker-opacity'),
  });
  opacityRow.adjustment.connect('value-changed', (widget) => {
    settings.set_int('tracker-opacity', widget.value);
  });

  const clickVisibilityLabelList = new Gtk.StringList();
  clickVisibilityLabelList.append(_('Never'));
  clickVisibilityLabelList.append(_('Only'));
  clickVisibilityLabelList.append(_('As well'));

  const initialClickVisibility = settings.get_enum(
    'tracker-click-visibility',
  ) as TrackerClickVisibility;
  const clickVisibilityRow = new Adw.ComboRow({
    title: _('Show clicks'),
    subtitle: _('When click indicators are shown'),
    model: clickVisibilityLabelList,
    selected: initialClickVisibility,
  });
  clickVisibilityRow.connect('notify::selected', (widget) => {
    settings.set_enum(
      'tracker-click-visibility',
      widget.selected as TrackerClickVisibility,
    );
  });
  settings.connect('changed::tracker-click-visibility', () => {
    const clickVisibility = settings.get_enum(
      'tracker-click-visibility',
    ) as TrackerClickVisibility;
    if (clickVisibilityRow.selected !== clickVisibility) {
      clickVisibilityRow.selected = clickVisibility;
    }
  });

  const clickColorRow = new Adw.ActionRow({
    title: _('Click color'),
    subtitle: _('Color of click indicators'),
  });
  const clickColorBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
  });
  const clickColorPicker = makeColorPicker(settings, 'tracker-click-color');
  clickColorBox.append(clickColorPicker);
  clickColorRow.add_suffix(clickColorBox);

  const clickDurationRow = new Adw.SpinRow({
    title: _('Click duration'),
    subtitle: _('Duration of click feedback in milliseconds'),
    adjustment: new Gtk.Adjustment({
      lower: 20,
      upper: 5000,
      step_increment: 10,
    }),
    value: settings.get_int('tracker-click-duration'),
  });
  clickDurationRow.adjustment.connect('value-changed', (widget) => {
    settings.set_int('tracker-click-duration', widget.value);
  });

  return [
    sizeRow,
    colorRow,
    opacityRow,
    clickVisibilityRow,
    clickColorRow,
    clickDurationRow,
  ];
}
