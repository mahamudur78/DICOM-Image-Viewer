// Vertebra labels in order from the skull down, for the spine labelling tool.

export const SPINE_LABELS = [
  ...Array.from({ length: 7 }, (_, i) => `C${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `L${i + 1}`),
  'S1',
]

let next = 0

/** The label the next click places, then advances (staying on S1 at the end). */
export function nextSpineLabel() {
  const label = SPINE_LABELS[next]
  next = Math.min(next + 1, SPINE_LABELS.length - 1)
  return label
}

export const peekSpineLabel = () => SPINE_LABELS[next]

/** Sets the label placed next; returns false for an unknown label. */
export function setNextSpineLabel(label: string) {
  const index = SPINE_LABELS.indexOf(label.trim().toUpperCase())
  if (index < 0) return false
  next = index
  return true
}
