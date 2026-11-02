import { useLocation } from 'react-router-dom'

/*
 * The navy banner every screen in the previous app opened with: the title in
 * caps, a badge saying what kind of screen it is, and one line explaining
 * what the screen is for.
 *
 * It renders here, once, from the route rather than in each screen. Thirty
 * screens each writing their own heading is thirty chances for one to drift,
 * and the drift is exactly what made the new screens look like a different
 * product from the old ones.
 *
 * Actions stay in each screen's own toolbar underneath. They differ per
 * screen and belong next to the thing they act on.
 */

interface Page { title: string; badge?: string; sub?: string }

const PAGES: Record<string, Page> = {
  '/': {
    title: 'Operations Dashboard', badge: 'Live',
    sub: 'Jobs in progress, tools in the field, and what is waiting on someone.',
  },
  '/jobs': {
    title: 'Drilling Jobs Register', badge: 'Operations',
    sub: 'Every job, its rig and well, what it is worth and where it has reached.',
  },
  '/job-tools-list': {
    title: 'Job Tools List', badge: 'Operations',
    sub: 'What went out on each job and what has come back.',
  },
  '/tool-history': {
    title: 'Tool Movement History', badge: 'Audit Trail',
    sub: 'Every dispatch and return for a tool, paired ticket by ticket.',
  },
  '/delivery-tickets': {
    title: 'Delivery Tickets', badge: 'Dispatch',
    sub: 'Tools sent to a rig, by ticket, with the lines signed for.',
  },
  '/receiving-tickets': {
    title: 'Receiving Tickets', badge: 'Returns',
    sub: 'Tools coming back from a rig, and the condition they arrived in.',
  },
  '/utilization': {
    title: 'Daily Utilization', badge: 'Field Log',
    sub: 'Operating and standby days per tool — what the invoice is built from.',
  },
  '/gate-pass': {
    title: 'Security Gate Pass', badge: 'Gate Control',
    sub: 'What left the yard and what came back through the gate.',
  },

  '/inventory-dashboard': {
    title: 'Inventory Dashboard', badge: 'Assets & Inventory',
    sub: 'What the fleet holds, what is out, and what is unaccounted for.',
  },
  '/inventory': {
    title: 'Assets and Inventory Catalog', badge: 'Assets & Inventory',
    sub: 'Every tool held, our own and sub-contracted, by asset number and size.',
  },
  '/missing-tools': {
    title: 'Tools Not in Inventory', badge: 'Exceptions',
    sub: 'Serials seen on tickets that match no inventory record.',
  },
  '/categories': {
    title: 'Tool Categories & Sizes', badge: 'Master Data',
    sub: 'The category and size vocabulary the contracts are priced against.',
  },
  '/po-grn': {
    title: 'Purchase Orders & Goods Inward', badge: 'Procurement',
    sub: 'Purchase orders copied from Epicor, and what has been received against them.',
  },
  '/sub-rental-inward': {
    title: 'Third-Party Sub-Rental Inward', badge: 'Vendor Rental Assets',
    sub: 'Tools hired in from sub-contractors — what we hold and what it costs us.',
  },
  '/sub-rentals': {
    title: 'Third-Party Sub-Rental Inward', badge: 'Vendor Rental Assets',
    sub: 'Tools hired in from sub-contractors — what we hold and what it costs us.',
  },
  '/consumables': {
    title: 'Consumables & Store', badge: 'Store Issue (SIV)',
    sub: 'Stock held at base. Items are issued from a maintenance job, not from here.',
  },

  '/maintenance-dashboard': {
    title: 'Maintenance & QC Dashboard', badge: 'Workshop',
    sub: 'Inspections and maintenance orders, and what is overdue.',
  },
  '/inspection': {
    title: 'QC Inspection Bay', badge: 'Quality Control',
    sub: 'Inspection records, results and certification against each tool.',
  },
  '/maintenance': {
    title: 'Maintenance Orders', badge: 'Workshop',
    sub: 'Repair and overhaul jobs, their priority and where each has reached.',
  },

  '/billing-dashboard': {
    title: 'Billing Dashboard', badge: 'Billing & Cost Control',
    sub: 'What has been invoiced, what is approved, and what is still open.',
  },
  '/invoices': {
    title: 'Invoicing', badge: 'Billing & Cost Control',
    sub: 'Invoices raised against jobs, with their legal numbers and amounts.',
  },
  '/tool-revenue': {
    title: 'Tool Revenue & Utilization', badge: 'Billing & Cost Control',
    sub: 'Days on hire and what they earned, against what hired-in tools cost.',
  },
  '/monthly-expenses': {
    title: 'Monthly Expense Grid & P&L', badge: 'Cost Control',
    sub: 'Costs by month and category, against the revenue they supported.',
  },
  '/pending-rental-costs': {
    title: 'Pending Rental Costs', badge: 'Action Required',
    sub: 'Hired-in tools received by Stores and still waiting for a day rate.',
  },

  '/contracts-dashboard': {
    title: 'Contracts Dashboard', badge: 'Contracts',
    sub: 'Agreements in force, their value and what has been invoiced to date.',
  },
  '/contracts': {
    title: 'Master Contract Register', badge: 'Contracts',
    sub: 'Client agreements, their PBG security, validity and rate schedules.',
  },
  '/clients': {
    title: 'Clients', badge: 'Master Data',
    sub: 'Operators we work for, and how their names map onto job records.',
  },
  '/suppliers': {
    title: 'Suppliers', badge: 'Master Data',
    sub: 'Vendors and sub-contractors we buy from or hire tools from.',
  },

  '/users': {
    title: 'User Management', badge: 'Administration',
    sub: 'Who can sign in, and what each role is allowed to change.',
  },
  '/settings': {
    title: 'Global Configurations', badge: 'Administration',
    sub: 'Dropdown values and settings the team maintains without a deploy.',
  },
  '/data-import': {
    title: 'Data Import', badge: 'Administration',
    sub: 'Bringing ticket and tool data in from spreadsheets.',
  },
  '/db-inspector': {
    title: 'Database Inspector', badge: 'Administration',
    sub: 'Tables, row counts and columns as the live database actually holds them.',
  },
}

function resolve(pathname: string): Page | null {
  if (PAGES[pathname]) return PAGES[pathname]
  // /jobs/JOB-26-00001 shows the register's banner rather than nothing.
  const base = '/' + pathname.split('/')[1]
  return PAGES[base] || null
}

export function PageBanner() {
  const { pathname } = useLocation()
  const page = resolve(pathname)
  if (!page) return null

  return (
    <div className="banner">
      <span className="banner-title">{page.title}</span>
      {page.badge && <span className="banner-badge">{page.badge}</span>}
      {page.sub && <span className="banner-sub">{page.sub}</span>}
    </div>
  )
}
