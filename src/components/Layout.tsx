import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { PageBanner } from './PageBanner'
import { useAutoColumnResize } from './useAutoColumnResize'

export function Layout() {
  useAutoColumnResize()
  // Hiding the menu gives the grids the full width; the choice is remembered.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('tt_sidebar') === '1' } catch { return false }
  })
  const toggle = () => setCollapsed(c => {
    const n = !c
    try { localStorage.setItem('tt_sidebar', n ? '1' : '0') } catch { /* private mode */ }
    return n
  })
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar collapsed={collapsed} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header collapsed={collapsed} onToggleSidebar={toggle} />
        {/*
          The banner sits here rather than inside each screen, so every screen
          opens the same way the old app's did without thirty files having to
          agree with each other.

          The page itself never scrolls — screens use `.screen` to fill the box
          below and put their scrollbars inside the grid, both directions.
        */}
        <main className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col gap-2">
          <PageBanner />
          <div className="flex-1 min-h-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
