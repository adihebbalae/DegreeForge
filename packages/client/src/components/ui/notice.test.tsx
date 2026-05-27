// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Notice } from './notice'

afterEach(cleanup)

describe('Notice', () => {
  it('renders the message text', () => {
    render(<Notice variant="info" message="Skill map data is not loaded." />)
    expect(screen.getByText('Skill map data is not loaded.')).toBeDefined()
  })

  it('renders with warn variant class', () => {
    const { container } = render(<Notice variant="warn" message="N prereq violations." />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('amber')
  })

  it('renders with error variant class', () => {
    const { container } = render(<Notice variant="error" message="Could not read the file." />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('red')
  })

  it('fires the primary action callback when clicked', () => {
    const onClick = vi.fn()
    render(
      <Notice
        variant="error"
        message="Could not read the file."
        action={{ label: 'Open file again', onClick }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open file again' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('fires secondary action callback when clicked', () => {
    const primary = vi.fn()
    const secondary = vi.fn()
    render(
      <Notice
        variant="error"
        message="Could not read the file."
        action={{ label: 'Open file again', onClick: primary }}
        secondaryAction={{ label: 'Paste plain text', onClick: secondary }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Paste plain text' }))
    expect(secondary).toHaveBeenCalledTimes(1)
    expect(primary).not.toHaveBeenCalled()
  })

  it('renders no button when no action provided', () => {
    render(<Notice variant="info" message="All prerequisites satisfied." />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
