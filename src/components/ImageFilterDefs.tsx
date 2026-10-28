import { FILTERS, filterElementId, type FilterStrength, type FilterType } from '../store/viewportDisplayStore'

const STRENGTHS: FilterStrength[] = [1, 2, 3]

/** 3×3 convolution kernels; strength scales how far each departs from "no change". */
function kernel(type: FilterType, strength: FilterStrength) {
  const a = [0.5, 1, 2][strength - 1]
  switch (type) {
    case 'sharpen':
      return [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0]
    case 'edge':
      return [-a, -a, -a, -a, 8 * a, -a, -a, -a, -a]
    case 'emboss':
      return [-2 * a, -a, 0, -a, 1, a, 0, a, 2 * a]
    default:
      return null
  }
}

function FilterPrimitive({ type, strength }: { type: FilterType; strength: FilterStrength }) {
  const matrix = kernel(type, strength)
  if (matrix) {
    // Emboss keeps mid-grey where the image is flat; the others keep the image itself.
    const bias = type === 'emboss' ? 0.5 : 0
    return <feConvolveMatrix order="3" kernelMatrix={matrix.join(' ')} divisor="1" bias={bias} preserveAlpha="true" edgeMode="duplicate" />
  }
  if (type === 'smooth') return <feGaussianBlur stdDeviation={[0.6, 1, 1.6][strength - 1]} />
  return <feMorphology operator={type === 'erode' ? 'erode' : 'dilate'} radius={strength} />
}

/**
 * SVG filters applied to viewport canvases with CSS `filter: url(#…)`. They
 * run on the GPU and change only what is displayed, never the image data.
 */
export function ImageFilterDefs() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        {FILTERS.flatMap((type) =>
          STRENGTHS.map((strength) => (
            <filter key={`${type}-${strength}`} id={filterElementId({ type, strength })} colorInterpolationFilters="sRGB">
              <FilterPrimitive type={type} strength={strength} />
            </filter>
          )),
        )}
      </defs>
    </svg>
  )
}
