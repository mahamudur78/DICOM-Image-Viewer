// Default keyboard shortcuts by command id, as `KeyboardEvent.key` in lower
// case, after "ctrl+" (Ctrl or ⌘) and "shift+" (only together with Ctrl). Kept apart from the commands (which need Cornerstone) so they can be
// checked for conflicts, and later customised by the user.

const TOOL_KEYS: Record<string, string> = {
  windowLevel: 'w',
  windowRegion: 'g',
  rotate: 'o',
  shift: 's',
  pan: 'p',
  zoom: 'z',
  magnify: 'm',
  crosshairs: 'c',
  length: 'l',
  angle: 'a',
  ellipse: 'e',
  probe: 'b',
  rectangle: 'q',
  polygon: 'y',
  freehand: 'n',
  bidirectional: 'j',
  arrow: 'u',
  cursor3d: 'k',
}

export const DEFAULT_KEYMAP: Record<string, string[]> = {
  ...Object.fromEntries(Object.entries(TOOL_KEYS).map(([tool, key]) => [`tool.${tool}`, [key]])),
  'view.invert': ['i'],
  'view.reset': ['r'],
  'view.previousImage': ['arrowup', 'arrowleft'],
  'view.nextImage': ['arrowdown', 'arrowright'],
  'view.firstImage': ['home'],
  'view.lastImage': ['end'],
  // 1–9: the nth window of the dropdown; 0: the image's own window.
  ...Object.fromEntries(Array.from({ length: 10 }, (_, n) => [`window.option${n}`, [String(n)]])),
  'display.privacy': ['h'],
  'display.dicomOverlays': ['v'],
  'display.fullscreen': ['f'],
  'display.distractionFree': ['d'],
  'display.exitDistractionFree': ['escape'],
  'cine.toggle': [' '],
  'cine.slower': ['['],
  'cine.faster': [']'],
  'video.previousFrame': ['arrowleft', 'arrowup'],
  'video.nextFrame': ['arrowright', 'arrowdown'],
  'panel.tags': ['t'],
  'panel.measurements': ['x'],
  'objects.keyImage': ['*'],
  // Backspace stays with Cornerstone: it removes the last point of a contour being drawn.
  'measure.deleteSelected': ['delete'],
  'measure.undo': ['ctrl+z'],
  'measure.redo': ['ctrl+shift+z', 'ctrl+y'],
  'export.copyImage': ['ctrl+c'],
  'export.images': ['ctrl+s'],
  'export.print': ['ctrl+p'],
  'help.shortcuts': ['?'],
  'app.settings': ['ctrl+,'],
}

/** The default keys with the user's changes (a command's own list replaces its defaults). */
export function effectiveKeymap(overrides: Record<string, string[]>): Record<string, string[]> {
  return { ...DEFAULT_KEYMAP, ...overrides }
}

/** The key of a keyboard event, as written in keymaps ("ctrl+shift+z", "?", "arrowup"). */
export function keyFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>) {
  const ctrl = event.ctrlKey || event.metaKey
  return `${ctrl ? 'ctrl+' : ''}${ctrl && event.shiftKey ? 'shift+' : ''}${event.key.toLowerCase()}`
}

/** How a key is shown to the user. */
export function keyLabel(key: string) {
  const names: Record<string, string> = { ' ': 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', delete: 'Delete', home: 'Home', end: 'End' }
  return key
    .split('+')
    .map((part) => names[part] ?? (part === 'ctrl' ? 'Ctrl' : part === 'shift' ? 'Shift' : part.length === 1 ? part.toUpperCase() : part))
    .join('+')
}

/**
 * Keys shared by commands that are never available at the same time:
 * arrows scroll images, but step frames in a video.
 */
export const EXCLUSIVE_SHARED_KEYS: Record<string, string[]> = {
  arrowup: ['view.previousImage', 'video.previousFrame'],
  arrowleft: ['view.previousImage', 'video.previousFrame'],
  arrowdown: ['view.nextImage', 'video.nextFrame'],
  arrowright: ['view.nextImage', 'video.nextFrame'],
}

/** Keys bound to more than one command, other than the known exclusive pairs. */
export function keyConflicts(keymap: Record<string, string[]>) {
  const byKey = new Map<string, string[]>()
  for (const [id, keys] of Object.entries(keymap)) for (const key of keys) byKey.set(key, [...(byKey.get(key) ?? []), id])
  return [...byKey].filter(([key, ids]) => ids.length > 1 && [...ids].sort().join() !== [...(EXCLUSIVE_SHARED_KEYS[key] ?? [])].sort().join())
}
