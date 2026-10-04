export function handlePreviewKeyDown(event, onClose, closeButton, openButton) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
  } else if (event.key === 'Tab') {
    const buttons = [closeButton, openButton].filter(Boolean)
    if (buttons.length < 2) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}
