import React from 'react'

const svg = (children: React.ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const Chevron = ({ open }: { open: boolean }) => (
  <span className={`chevron${open ? ' open' : ''}`}>{svg(<path d="M6 4l4 4-4 4" />, 14)}</span>
)
export const NotebookIcon = () => svg(<><rect x="3" y="2" width="10" height="12" rx="1.5" /><path d="M6 2v12" /></>)
export const SectionIcon = () => svg(<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />)
export const PageIcon = () => svg(<><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></>)
export const Plus = () => svg(<path d="M8 3v10M3 8h10" />)
export const Dots = () => svg(<><circle cx="3.5" cy="8" r=".8" fill="currentColor" /><circle cx="8" cy="8" r=".8" fill="currentColor" /><circle cx="12.5" cy="8" r=".8" fill="currentColor" /></>)
