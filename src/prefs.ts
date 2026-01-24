import Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { pushPrefsPage } from './prefs/tracker/tracker.js';

export default class PointerTrackerPreferences extends ExtensionPreferences {
  async fillPreferencesWindow(window: Adw.PreferencesWindow) {
    window.default_width = 460;
    window.default_height = 800;

    const navView = new Adw.NavigationView();

    pushPrefsPage(this, navView);

    window.set_content(navView);
  }
}
