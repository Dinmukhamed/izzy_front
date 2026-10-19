import type { Directive, DirectiveBinding } from 'vue'

type FitTextOptions = {
  min: number
  max: number
}

type FitTextState = {
  options: FitTextOptions
  resizeObserver: ResizeObserver
  mutationObserver: MutationObserver
  animationFrame?: number
  lastText: string
}

const states = new WeakMap<HTMLElement, FitTextState>()

function scheduleFit(element: HTMLElement) {
  const state = states.get(element)
  if (!state) return
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
  state.animationFrame = requestAnimationFrame(() => fitText(element, state.options))
}

function fitText(element: HTMLElement, options: FitTextOptions) {
  const container = element.parentElement
  if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) return

  let lower = options.min
  let upper = options.max
  let best = options.min

  while (upper - lower > 0.25) {
    const candidate = (lower + upper) / 2
    element.style.fontSize = `${candidate}px`

    const fits =
      element.scrollWidth <= container.clientWidth + 1 &&
      element.scrollHeight <= container.clientHeight + 1

    if (fits) {
      best = candidate
      lower = candidate
    } else {
      upper = candidate
    }
  }

  element.style.fontSize = `${best}px`
}

export const vFitText: Directive<HTMLElement, FitTextOptions> = {
  mounted(element, binding) {
    const state: FitTextState = {
      options: binding.value,
      resizeObserver: new ResizeObserver(() => scheduleFit(element)),
      mutationObserver: new MutationObserver(() => scheduleFit(element)),
      lastText: element.textContent || '',
    }

    states.set(element, state)
    if (element.parentElement) state.resizeObserver.observe(element.parentElement)
    state.mutationObserver.observe(element, { childList: true, characterData: true, subtree: true })
    void document.fonts?.ready.then(() => scheduleFit(element))
    scheduleFit(element)
  },
  updated(element, binding: DirectiveBinding<FitTextOptions>) {
    const state = states.get(element)
    if (!state) return

    const text = element.textContent || ''
    if (state.options.min !== binding.value.min || state.options.max !== binding.value.max || state.lastText !== text) {
      state.options = binding.value
      state.lastText = text
      scheduleFit(element)
    }
  },
  unmounted(element) {
    const state = states.get(element)
    if (!state) return
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
    state.resizeObserver.disconnect()
    state.mutationObserver.disconnect()
    states.delete(element)
  },
}
