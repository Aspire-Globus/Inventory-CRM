# Inventory & Employee Assignment System

React (Vite) frontend + Node/Express API + MongoDB (Mongoose).

## Setup

Requirements: Node 18+, MongoDB 5+ (local or Atlas).

```bash
# 1. API
cd server
cp .env.example .env        # set MONGODB_URI if not local
npm install
npm run seed                # optional: sample data (Rahul Sharma EMP-00125 etc.)
npm run dev                 # http://localhost:5000

# 2. Frontend (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173  (proxies /api → :5000)
```

Production: `cd client && npm run build`, then `cd server && npm start` — the API also serves `client/dist`, so one port runs everything.

## Workflow

| Step | Where |
|---|---|
| Add inventory (name, category, total qty, unit, image) | Inventory → Add Inventory Item |
| Add employees (unique Employee ID auto-suggested, department) | Employees → Add Employee |
| Assign items (pick item + qty, look up employee by ID, confirm department) | Assignments → Assign Item, or row menu on Inventory / Employees |
| Check stock & records | Inventory table, Dashboard, Employee page (Assigned / History / All) |
| Return items (partial or full, condition, notes) | Employee page or Assignments → Return |

## Key rules (enforced on the server)

- **Available = Total − Currently Assigned.** `assignedQuantity` is stored on the item; available is computed.
- **No over-assignment.** Assigning uses an atomic conditional update (`total − assigned ≥ qty`), so two admins clicking at once can't oversell stock. Works on a standalone MongoDB — no replica set needed.
- **Returns can't exceed what the employee holds** (same atomic guard on the assignment).
- **Total can't be lowered below what's currently assigned.**
- **History is never erased.** Assignments are kept with every return appended; an `activities` collection logs every assign/return/stock change. Items or employees with history can't be deleted (set employee to *Inactive* instead).
- Assignment records snapshot item/employee/department names so history stays accurate after renames or department moves.

## Collections

- `items` — name, category, totalQuantity, assignedQuantity, unit, description, image
- `employees` — employeeId (unique), name, department, designation, location, email, phone, status
- `departments` — name (unique), code, description
- `assignments` — item, employee, snapshots, quantity, returnedQuantity, returns[], issueDate, notes, status
- `activities` — append-only movement log

## API

```
GET    /api/items?search=&category=        POST /api/items        PUT /api/items/:id
POST   /api/items/:id/stock                GET  /api/items/:id    (with current holders)
DELETE /api/items/:id                      (only if never assigned)

GET    /api/employees?search=&department=  POST /api/employees    PUT /api/employees/:id
GET    /api/employees/:id                  (Mongo id or EMP code → employee, assignments, history)
GET    /api/employees/next-id

GET/POST /api/departments                  PUT/DELETE /api/departments/:id

GET    /api/assignments?status=Active|Returned&search=
POST   /api/assignments                    { itemId, employeeId, quantity, issueDate, notes }
POST   /api/assignments/:id/return         { quantity, returnDate, condition, notes }

GET    /api/reports/dashboard | /stock | /by-department | /activity?from=&to=&type=
```

## Next steps (not in initial scope)

Admin login (JWT), serial-number tracking per asset, audit of who performed each action.
