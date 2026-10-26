import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        {/*
          The page itself never scrolls — screens use `.screen` to fill this
          box and put their scrollbars inside the grid, both directions.
        */}
        <main className="flex-1 min-h-0 overflow-auto p-2">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
