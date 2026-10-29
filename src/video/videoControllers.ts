/** What keyboard commands can do with a video viewport. */
export interface VideoController {
  toggle: () => void
  step: (frames: number) => void
  changeSpeed: (direction: 1 | -1) => void
}

/** Mounted video viewports by id, so global shortcuts reach the right <video>. */
export const videoControllers = new Map<string, VideoController>()
