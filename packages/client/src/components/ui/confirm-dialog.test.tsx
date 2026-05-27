// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfirmDialog } from './confirm-dialog'

afterEach(cleanup)

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Reset plan',
    consequence: 'Removes all planned courses across 8 semesters. Completed courses are preserved.',
    confirmLabel: 'Reset Plan',
    onConfirm: vi.fn(),
  }

  it('renders the title and consequence', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Reset plan')).toBeDefined()
    expect(screen.getByText(/Removes all planned courses/)).toBeDefined()
  })

  it('calls onConfirm and closes when confirm button clicked', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        {...defaultProps}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset Plan' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    const onOpenChange = vi.fn()
    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not render visible content when open is false', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />)
    // Radix Dialog with open=false is aria-hidden; no visible title in the document
    const title = document.querySelector('[role="dialog"]')
    expect(title).toBeNull()
  })
})
