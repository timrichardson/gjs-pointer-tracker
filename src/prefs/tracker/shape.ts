import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { TrackerShape } from '../schema/TrackerShape.js';

export function makeShapeRow(settings: Gio.Settings, condRows: Gtk.Widget[]) {
  const shapeLabelList = new Gtk.StringList();
  shapeLabelList.append(_('Circle'));
  shapeLabelList.append(_('Cursor'));

  function updateCircleRows(shape: TrackerShape) {
    for (const condRow of condRows) {
      condRow.set_sensitive(shape === TrackerShape.CIRCLE);
    }
  }

  const initialShape = settings.get_enum('tracker-shape');
  const shapeRow = new Adw.ComboRow({
    title: _('Shape'),
    subtitle: _('Shape of the tracker'),
    model: shapeLabelList,
    selected: initialShape,
  });
  shapeRow.connect('notify::selected', (widget) => {
    settings.set_enum('tracker-shape', widget.selected);
    updateCircleRows(widget.selected);
  });
  updateCircleRows(initialShape);

  return shapeRow;
}
