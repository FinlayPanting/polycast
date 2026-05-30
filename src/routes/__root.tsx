import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="flex flex-col bg-[#13101f]" style={{ height: '100dvh' }}>
      <main className="flex-1 overflow-y-auto min-h-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

function BottomNav() {
  return (
    <nav className="flex-shrink-0 bg-[#1c1930] border-t border-white/8" style={{ paddingBottom: 'min(env(safe-area-inset-bottom, 0px), 40px)' }}>
      <div className="h-16 flex items-center px-2">
        <NavItem to="/" label="Home" icon={<HomeIcon />} />
        <NavItem to="/episodes" label="Episodes" icon={<EpisodesIcon />} />
        <NavItem to="/settings" label="Settings" icon={<SettingsIcon />} />
      </div>
    </nav>
  )
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex-1 flex flex-col items-center gap-1 py-2 text-zinc-500 [&.active]:text-brand transition-colors"
      activeOptions={to === '/' ? { exact: true } : undefined}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )
}

function HomeIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline strokeLinecap="round" strokeLinejoin="round" points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function EpisodesIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-3.5-3.5M12 15l3.5-3.5" />
      <circle cx="12" cy="19" r="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8a7 7 0 0114 0" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
