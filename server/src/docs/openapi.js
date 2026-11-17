// OpenAPI 3 description of the Aspire System Management API.
// Served at /api/openapi.json and as interactive docs at /api/docs.

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ok = (schema, description = 'OK') => ({ 200: { description, ...json(schema) } });
const created = (schema) => ({ 201: { description: 'Created', ...json(schema) } });
const body = (schema, required = true) => ({ required, ...json(schema) });
const idParam = (name = 'id', description = 'Record id (MongoDB ObjectId)') => ({
  name, in: 'path', required: true, description, schema: { type: 'string' },
});
const q = (name, description, schema = { type: 'string' }, required = false) => ({ name, in: 'query', required, description, schema });
const OkTrue = { type: 'object', properties: { ok: { type: 'boolean', example: true } } };
const arr = (s) => ({ type: 'array', items: s });

// Who may call an endpoint (shown in the docs)
const perm = (p) => `\n\n**Permission:** \`${p}\` (Administrators always have it).`;
const writes = (p) => `\n\n**Permission:** reading is open to any signed-in user; this change needs \`${p}\`.`;

// Add / edit item as form-data (file upload)
const ITEM_FORM = {
  type: 'object',
  required: ['name', 'category', 'totalQuantity', 'unitPrice'],
  properties: {
    name: { type: 'string', example: 'LG 27UL' }, category: { type: 'string', example: 'Monitor' }, subCategory: { type: 'string', example: 'LED' },
    brand: { type: 'string', example: 'LG' }, model: { type: 'string', example: '27UL' },
    specs: { type: 'string', example: '{"size":"27 inch"}', description: 'JSON string (keys from GET /api/categories/forms)' },
    totalQuantity: { type: 'integer', example: 3 }, unit: { type: 'string', example: 'pcs' }, unitPrice: { type: 'number', example: 65000, description: 'Required' },
    vendor: { type: 'string' }, purchaseDate: { type: 'string', format: 'date' }, warrantyUntil: { type: 'string', format: 'date' },
    description: { type: 'string' },
    image: { type: 'string', format: 'binary', description: 'Picture file (max 5 MB). Leave out to keep the current one.' },
    removeImage: { type: 'string', enum: ['true'], description: 'Edit only: "true" removes the current picture' },
  },
};

export function buildSpec(serverUrl = '/') {
  return withPagination({
    openapi: '3.0.3',
    info: {
      title: 'Aspire System Management API',
      version: '1.0.0',
      description: [
        'REST API behind the Aspire System Management portal: inventory, employees, departments, item assignments and returns, reports, users, notifications and the Recycle Bin.',
        '',
        '**Sign in:** `POST /api/auth/login` with email and password returns a `token`. Send it on every other request as `Authorization: Bearer <token>`. Tokens last 7 days by default (`JWT_EXPIRES`).',
        '',
        '**Errors:** every error is JSON `{ "message": "..." }` with status 400 (bad input), 401 (not signed in or token expired), 403 (no permission), 404 (not found) or 409 (duplicate).',
        '',
        '**Stock rule:** Available = Total − Assigned. Assigning more than is available is refused, as is returning more than an employee holds.',
        '',
        '**Deletes** move the record to the Recycle Bin for 30 days.',
      ].join('\n'),
    },
    servers: [{ url: serverUrl, description: 'This server' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Sign in and your own profile' },
      { name: 'Inventory', description: 'Items and stock' },
      { name: 'Categories', description: '**Mobile app: use `GET /api/categories/forms` — ONE call returns every category with its brands, sub-categories and the exact fields for each sub-category.** Load it once, keep it in the app, and pick from it when the user chooses a category / sub-category. Save with `POST /api/items` (answers in `specs`, by field `key`). The step-by-step calls (list / form) and the manage calls (POST / PUT / DELETE) are below.' },
      { name: 'Employees' },
      { name: 'Departments' },
      { name: 'Assignments', description: 'Issue items to employees and record returns' },
      { name: 'Repairs', description: 'Damaged / lost items. Flow: **Damaged → In repair → Repaired** (back in stock) or **Scrapped** (written off). Lost is written off at once. Damaged and In repair units are not available: `available = total − assigned − outOfServiceQuantity`.' },
      { name: 'Search', description: 'One search across employees, inventory, assignments, repairs, departments, categories and (with the users permission) login accounts.' },
      { name: 'Reports' },
      { name: 'Users', description: 'Login accounts and permissions' },
      { name: 'Notifications', description: 'Change log for administrators' },
      { name: 'Recycle Bin' },
      { name: 'System' },
    ],
    paths: {
      // ---------------- System ----------------
      '/api/health': {
        get: { tags: ['System'], summary: 'Server and database status', security: [], responses: ok({ type: 'object', properties: { ok: { type: 'boolean' }, db: { type: 'boolean' } } }) },
      },

      // ---------------- Auth ----------------
      '/api/auth/login': {
        post: {
          tags: ['Auth'], summary: 'Sign in', security: [],
          requestBody: body({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'admin@aspire.com' }, password: { type: 'string', example: 'Admin@123' } } }),
          responses: { ...ok({ type: 'object', properties: { token: { type: 'string' }, user: ref('User') } }), 401: { description: 'Invalid email or password' }, 403: { description: 'Account disabled' } },
        },
      },
      '/api/auth/me': {
        get: { tags: ['Auth'], summary: 'The signed-in user (with effectivePermissions)', responses: ok(ref('User')) },
        put: {
          tags: ['Auth'], summary: 'Update your own name, phone or designation',
          requestBody: body({ type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, designation: { type: 'string' } } }),
          responses: ok(ref('User')),
        },
      },
      '/api/auth/me/password': {
        put: {
          tags: ['Auth'], summary: 'Change your password',
          requestBody: body({ type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 6 } } }),
          responses: ok(OkTrue),
        },
      },

      // ---------------- Inventory ----------------
      '/api/items': {
        get: {
          tags: ['Inventory'], summary: 'List items',
          parameters: [q('search', 'Matches name, brand, model or sub-category'), q('category', 'A category name from GET /api/categories/list, or All'), q('status', 'Active (use this in the app for assignable stock), Inactive, or leave out / All for both', { type: 'string', enum: ['Active', 'Inactive', 'All'] })],
          responses: ok(arr(ref('Item'))),
        },
        post: {
          tags: ['Inventory'], summary: 'Add an item (JSON, or form-data with an image file)',
          description: `Send **multipart/form-data** to upload a picture: field \`image\` = the file (JPG, PNG, WEBP or GIF, max 5 MB), \`specs\` = a JSON string, all other fields as text. The saved \`image\` is a path like \`/uploads/items/1731.jpg\` — show it as \`<server>/uploads/items/1731.jpg\`. Plain JSON still works.${writes('inventory')}`,
          requestBody: { required: true, content: { 'multipart/form-data': { schema: ITEM_FORM }, 'application/json': { schema: ref('ItemInput') } } },
          responses: created(ref('Item')),
        },
      },
      '/api/items/categories': { get: { tags: ['Inventory'], summary: 'Category names only (full details: GET /api/categories)', responses: ok(arr({ type: 'string' })) } },
      '/api/items/{id}': {
        get: { tags: ['Inventory'], summary: 'One item and who currently holds it', parameters: [idParam()], responses: ok({ type: 'object', properties: { item: ref('Item'), holders: arr(ref('Assignment')) } }) },
        put: {
          tags: ['Inventory'], summary: 'Edit an item', description: `Total quantity cannot go below what is currently assigned.${writes('inventory')}`,
          parameters: [idParam()], requestBody: { required: true, content: { 'multipart/form-data': { schema: ITEM_FORM }, 'application/json': { schema: ref('ItemInput') } } }, responses: ok(ref('Item')),
        },
      },
      '/api/items/{id}/status': {
        patch: {
          tags: ['Inventory'], summary: 'Mark an item Active or Inactive (inventory is never deleted)',
          description: `Inactive items keep their stock and history but cannot be assigned until made Active again. \`DELETE /api/items/:id\` is not available (405).${writes('inventory')}`,
          parameters: [idParam()],
          requestBody: body({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['Active', 'Inactive'], example: 'Inactive' } } }),
          responses: ok(ref('Item')),
        },
      },
      '/api/items/{id}/stock': {
        post: {
          tags: ['Inventory'], summary: 'Add stock to an existing item', description: writes('inventory'), parameters: [idParam()],
          requestBody: body({ type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 1 }, notes: { type: 'string', example: 'PO-2291 new purchase' } } }),
          responses: ok(ref('Item')),
        },
      },

      // ---------------- Categories ----------------
      '/api/categories/forms': {
        get: {
          tags: ['Categories'], summary: '★ All form data in one call (recommended for the app)',
          description: [
            'Returns an **array** — one object per category, each containing only its own data:',
            '`name` → Category dropdown · `brands` → Brand dropdown (`brandInput` = `text` means no list, show a text box) · `subCategories[].name` → Sub-category dropdown · `subCategories[].fields` → the inputs to show for that sub-category (`input` = `dropdown` uses `options`, or `text` / `number`).',
            'Add `?category=Keyboard` to get just that one category (still an array with 1 object).',
            'Tip: call it when the app starts and keep the result; call again only to refresh (the server answers **304 Not Modified** when nothing changed if the app sends the `If-None-Match` ETag).',
          ].join('\n\n'),
          parameters: [q('category', 'Optional — return only this category (any letter case)', { type: 'string', example: 'Keyboard' })],
          responses: ok(arr({ type: 'object', properties: {
            _id: { type: 'string', example: '6650f1c2a9e4b1d3c8f0a222' },
            name: { type: 'string', example: 'Keyboard' },
            icon: { type: 'string', example: 'Keyboard' },
            brands: { type: 'array', items: { type: 'string' }, example: ['Logitech', 'Dell', 'HP'] },
            brandInput: { type: 'string', enum: ['dropdown', 'text'], example: 'dropdown' },
            subCategories: arr({ type: 'object', properties: {
              name: { type: 'string', example: 'Wireless' },
              fields: arr({ type: 'object', properties: {
                key: { type: 'string', example: 'connectivity' }, label: { type: 'string', example: 'Connectivity' },
                input: { type: 'string', enum: ['dropdown', 'text', 'number'], example: 'dropdown' },
                options: { type: 'array', items: { type: 'string' }, example: ['USB Receiver (2.4 GHz)', 'Bluetooth'] },
                placeholder: { type: 'string', example: '' },
              } }),
            } }),
          } })),
        },
      },
      '/api/categories/list': {
        get: {
          tags: ['Categories'], summary: 'Step 1 — Category dropdown',
          description: 'Names only, in display order. Use `name` in step 2.',
          responses: ok(arr({ type: 'object', properties: {
            _id: { type: 'string', example: '6650f1c2a9e4b1d3c8f0a111' }, name: { type: 'string', example: 'Camera' },
            icon: { type: 'string', example: 'Other' }, subCategoryCount: { type: 'integer', example: 4 }, itemCount: { type: 'integer', example: 1 },
          } })),
        },
      },
      '/api/categories/form': {
        get: {
          tags: ['Categories'], summary: 'Step 2 & 3 — Sub-categories, brands and spec fields for a category',
          description: [
            'Call with `category` after the user picks a category → fill the **Sub-category** dropdown from `subCategories` and the **Brand** dropdown from `brands` (if `brandInput` is `text`, show a text box).',
            'Call again with `subCategory` after the user picks one → `fields` then holds only the inputs for that sub-category. Show one input per field: `input` = `dropdown` (use `options`), `text` or `number`.',
            'Save: `POST /api/items` with `category`, `subCategory`, `brand`, `name`, `totalQuantity` and `specs` = `specsTemplate` filled in.',
            'Without `subCategory`, `fields` lists every field with `showFor` (`all` or the sub-categories it belongs to).',
          ].join('\n\n'),
          parameters: [
            q('category', 'Category name (any letter case), e.g. Camera', { type: 'string', example: 'Camera' }, true),
            q('subCategory', 'Optional — the chosen sub-category, e.g. CCTV', { type: 'string', example: 'CCTV' }),
          ],
          responses: ok({ type: 'object', properties: {
            category: { type: 'string', example: 'Camera' },
            subCategory: { type: 'string', nullable: true, example: 'CCTV' },
            subCategories: { type: 'array', items: { type: 'string' }, example: ['DSLR', 'Mirrorless', 'Webcam', 'CCTV'] },
            brands: { type: 'array', items: { type: 'string' }, example: ['Canon', 'Nikon', 'Sony', 'Logitech', 'Hikvision'] },
            brandInput: { type: 'string', enum: ['dropdown', 'text'], example: 'dropdown' },
            fields: arr({ type: 'object', properties: {
              key: { type: 'string', example: 'nightVisionRangeM' }, label: { type: 'string', example: 'Night Vision Range (m)' },
              input: { type: 'string', enum: ['dropdown', 'text', 'number'], example: 'number' },
              options: { type: 'array', items: { type: 'string' }, example: [] }, placeholder: { type: 'string', example: 'e.g. 30' },
            } }),
            specsTemplate: { type: 'object', additionalProperties: { type: 'string' }, example: { resolution: '', connection: '', nightVisionRangeM: '' } },
          } }),
        },
      },
      '/api/categories': {
        get: {
          tags: ['Categories'], summary: 'All categories with sub-categories, brands and spec fields',
          description: 'Build the Add Item form from this: Category dropdown = `name`, Sub-category = `subCategories`, Brand = `brands`, then one input per entry in `fields` (only those whose `appliesTo` is empty or contains the chosen sub-category). Save the answers in the item\'s `specs` using each field\'s `key`.',
          responses: ok(arr(ref('Category'))),
        },
        post: { tags: ['Categories'], summary: 'Add a category', description: writes('inventory'), requestBody: body(ref('CategoryInput')), responses: created(ref('Category')) },
      },
      '/api/categories/{id}': {
        get: { tags: ['Categories'], summary: 'One category', parameters: [idParam()], responses: ok(ref('Category')) },
        put: { tags: ['Categories'], summary: 'Edit a category', description: `Renaming also renames the category on its items.${writes('inventory')}`, parameters: [idParam()], requestBody: body(ref('CategoryInput')), responses: ok(ref('Category')) },
        delete: { tags: ['Categories'], summary: 'Delete a category (to Recycle Bin)', description: `Refused while items use it.${writes('inventory')} Also needs \`delete\`.`, parameters: [idParam()], responses: ok(OkTrue) },
      },

      // ---------------- Employees ----------------
      '/api/employees': {
        get: {
          tags: ['Employees'], summary: 'List employees (with assignedCount)',
          parameters: [q('search', 'Employee ID or name'), q('department', 'Department id'), q('status', 'Active or Inactive')],
          responses: ok(arr(ref('Employee'))),
        },
        post: { tags: ['Employees'], summary: 'Add an employee', description: `employeeId is generated (EMP-00001…) when left out.${writes('employees')}`, requestBody: body(ref('EmployeeInput')), responses: created(ref('Employee')) },
      },
      '/api/employees/next-id': { get: { tags: ['Employees'], summary: 'Next free Employee ID', responses: ok({ type: 'object', properties: { employeeId: { type: 'string', example: 'EMP-00130' } } }) } },
      '/api/employees/{id}': {
        get: {
          tags: ['Employees'], summary: 'One employee with assignments and history',
          parameters: [idParam('id', 'Mongo id **or** Employee ID such as EMP-00125')],
          responses: ok({ type: 'object', properties: { employee: ref('Employee'), assignments: arr(ref('Assignment')), history: arr(ref('Activity')) } }),
        },
        put: { tags: ['Employees'], summary: 'Edit an employee', description: writes('employees'), parameters: [idParam()], requestBody: body(ref('EmployeeInput')), responses: ok(ref('Employee')) },
        delete: { tags: ['Employees'], summary: 'Delete an employee (to Recycle Bin)', description: `Refused while they still hold items.${writes('employees')} Also needs \`delete\`.`, parameters: [idParam()], responses: ok(OkTrue) },
      },

      // ---------------- Departments ----------------
      '/api/departments': {
        get: { tags: ['Departments'], summary: 'List departments (with employeeCount and assignedItems)', responses: ok(arr(ref('Department'))) },
        post: { tags: ['Departments'], summary: 'Add a department', description: writes('departments'), requestBody: body(ref('DepartmentInput')), responses: created(ref('Department')) },
      },
      '/api/departments/{id}': {
        put: { tags: ['Departments'], summary: 'Edit a department', description: writes('departments'), parameters: [idParam()], requestBody: body(ref('DepartmentInput')), responses: ok(ref('Department')) },
        delete: { tags: ['Departments'], summary: 'Delete a department (to Recycle Bin)', description: `Refused while it has employees.${writes('departments')} Also needs \`delete\`.`, parameters: [idParam()], responses: ok(OkTrue) },
      },

      // ---------------- Assignments ----------------
      '/api/assignments': {
        get: {
          tags: ['Assignments'], summary: 'List assignments',
          parameters: [q('status', 'Active (still with the employee), Assigned, Partially Returned, Returned or Transferred'), q('search', 'Employee name, Employee ID or item'), q('item', 'Item id'), q('department', 'Department id'), q('category', 'Category name, e.g. System'), q('employee', 'Employee id'), q('limit', 'Max rows (default 2000, max 5000)', { type: 'integer' })],
          responses: ok(arr(ref('Assignment'))),
        },
        post: {
          tags: ['Assignments'], summary: 'Assign an item to an employee',
          description: `Either pass \`employeeId\` (existing employee's Mongo id) **or** \`departmentId\` + \`employeeCode\` (+ \`employeeName\` when the code is new — the employee is then created).${writes('assignments')}`,
          requestBody: body(ref('AssignInput')),
          responses: created({ type: 'object', properties: { assignment: ref('Assignment'), item: ref('Item'), employee: ref('Employee'), employeeCreated: { type: 'boolean' } } }),
        },
      },
      '/api/assignments/{id}': { get: { tags: ['Assignments'], summary: 'One assignment', parameters: [idParam()], responses: ok(ref('Assignment')) } },
      '/api/assignments/summary': {
        get: {
          tags: ['Assignments'], summary: 'Per department: items out and number of employees',
          description: 'Same filters as the list (default status=Active). `departments` is sorted by quantity, highest first.',
          parameters: [q('status', 'Active (default), Assigned, Partially Returned or Returned'), q('category', 'Category name'), q('item', 'Item id'), q('search', 'Employee name, ID or item')],
          responses: ok({ type: 'object', properties: {
            total: { type: 'object', properties: { quantity: { type: 'integer', example: 11 }, employees: { type: 'integer', example: 6 }, assignments: { type: 'integer', example: 8 }, departments: { type: 'integer', example: 5 } } },
            departments: arr({ type: 'object', properties: {
              departmentId: { type: 'string' }, department: { type: 'string', example: 'IT' },
              quantity: { type: 'integer', example: 4, description: 'Units with employees of this department' },
              employees: { type: 'integer', example: 2 }, assignments: { type: 'integer', example: 3 },
            } }),
          } }),
        },
      },
      '/api/assignments/{id}/reassign': {
        post: {
          tags: ['Assignments'], summary: 'Reassign — move an item straight to another employee',
          description: `Takes \`quantity\` (default: everything the current employee holds) back from the current holder and gives it to the new employee in one step. Total stock doesn't change; history shows "Reassigned from / to". Send \`employeeId\` (existing employee) **or** \`employeeCode\` + \`departmentId\` (+ \`employeeName\` for a new ID). Inactive items can't be reassigned.${writes('assignments')}`,
          parameters: [idParam()],
          requestBody: body({ type: 'object', properties: {
            employeeId: { type: 'string', example: '6650f1c2a9e4b1d3c8f0a333' },
            employeeCode: { type: 'string', example: 'EMP-00160' }, departmentId: { type: 'string' }, employeeName: { type: 'string' },
            quantity: { type: 'integer', example: 1 }, date: { type: 'string', format: 'date', example: '2026-11-17' }, notes: { type: 'string', example: 'Team change' },
          } }),
          responses: created({ type: 'object', properties: { from: ref('Assignment'), to: ref('Assignment'), employee: ref('Employee'), employeeCreated: { type: 'boolean' } } }),
        },
      },
      '/api/assignments/{id}/return': {
        post: {
          tags: ['Assignments'], summary: 'Record a return (full or partial)', description: writes('assignments'), parameters: [idParam()],
          requestBody: body({ type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 1 }, returnDate: { type: 'string', format: 'date' }, condition: { type: 'string', enum: ['Good', 'Damaged', 'Lost'], description: 'Damaged → goes to Repairs (not back in stock). Lost → written off.' }, notes: { type: 'string' }, damageType: { type: 'string', enum: ['Screen broken', 'Body damage', "Won't turn on", 'Keys / ports', 'Water damage', 'Software'] }, description: { type: 'string', example: 'Crack on bottom-left corner' }, responsible: { type: 'string', enum: ['Normal wear', 'Employee'] }, photo: { type: 'string', description: 'Optional image as a data URL (max ~2 MB)' } } }),
          responses: ok(ref('Assignment')),
        },
      },

      // ---------------- Search ----------------
      '/api/search': {
        get: {
          tags: ['Search'], summary: 'Global search (top search bar)',
          description: 'Type at least 2 characters. Results are grouped by type, each with a `link` to open it in the web app and `total` = all matches of that type.',
          parameters: [q('q', 'Text to find, e.g. dell, EMP-0012, rohan, Sharma Computers', { type: 'string' }), q('limit', 'Results per group (1–20, default 5)', { type: 'integer' })],
          responses: ok({ type: 'object', properties: {
            query: { type: 'string', example: 'dell' }, total: { type: 'integer', example: 7 },
            groups: arr({ type: 'object', properties: {
              type: { type: 'string', enum: ['employees', 'items', 'assignments', 'repairs', 'departments', 'categories', 'users'] },
              label: { type: 'string', example: 'Inventory' }, total: { type: 'integer', example: 3 }, more: { type: 'string', example: '/inventory?search=dell' },
              results: arr({ type: 'object', properties: { id: { type: 'string' }, title: { type: 'string', example: 'Dell Latitude 5420' }, subtitle: { type: 'string', example: 'System · Laptop · 4 of 6 available' }, badge: { type: 'string' }, link: { type: 'string', example: '/inventory?search=Dell%20Latitude%205420' } } }),
            } }),
          } }),
        },
      },

      // ---------------- Repairs ----------------
      '/api/repairs': {
        get: {
          tags: ['Repairs'], summary: 'List damaged / in repair / repaired / scrapped items',
          parameters: [
            q('status', 'Damaged, In repair, Repaired, Scrapped (incl. Lost), Done (Repaired + Scrapped + Lost). Empty = all', { type: 'string', enum: ['Damaged', 'In repair', 'Repaired', 'Scrapped', 'Lost', 'Done'] }),
            q('from', 'Only records closed on/after this date, e.g. first day of the month', { type: 'string', format: 'date' }),
            q('withPhoto', 'Send 1 to include the photo (data URL) in each row', { type: 'string', enum: ['1'] }),
            q('department', 'Department id'), q('item', 'Item id'), q('search', 'Item, employee, vendor or damage type'),
            q('page', 'Page number (opt-in pagination)', { type: 'integer' }), q('limit', 'Rows per page (max 100)', { type: 'integer' }),
          ],
          responses: ok(arr(ref('Repair'))),
        },
      },
      '/api/repairs/summary': {
        get: { tags: ['Repairs'], summary: 'Counts for the cards on the Repairs page', responses: ok({ type: 'object', properties: {
          damaged: { type: 'integer', example: 2, description: 'Damaged, not sent yet' }, inRepair: { type: 'integer', example: 2 }, overdue: { type: 'integer', example: 1, description: 'In repair past the expected date' },
          repairedThisMonth: { type: 'integer', example: 1 }, spentThisMonth: { type: 'number', example: 3200 }, repaired: { type: 'integer' }, scrapped: { type: 'integer' }, lost: { type: 'integer' },
          writtenOff: { type: 'integer', description: 'scrapped + lost' }, needsAction: { type: 'integer', description: 'damaged + inRepair (menu badge)' },
        } }) },
      },
      '/api/repairs/vendors': {
        get: { tags: ['Repairs'], summary: 'Vendors used before, most recent first (chips in Send to repair)', responses: ok(arr({ type: 'object', properties: { name: { type: 'string', example: 'Sharma Computers' }, times: { type: 'integer', example: 3 }, lastUsed: { type: 'string', format: 'date-time' } } })) },
      },
      '/api/repairs/options': {
        get: { tags: ['Repairs'], summary: 'Dropdown values: damage types, repair by, responsible', responses: ok({ type: 'object', properties: { damageTypes: arr({ type: 'string' }), repairBy: arr({ type: 'string' }), responsible: arr({ type: 'string' }) } }) },
      },
      '/api/repairs/report': {
        post: {
          tags: ['Repairs'], summary: 'Report damage or loss',
          description: `Send **assignmentId** when an employee has the item (it is taken back from them now), or **itemId** for office stock.${writes('inventory')}`,
          requestBody: body({ type: 'object', required: ['quantity'], properties: { assignmentId: { type: 'string' }, itemId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 }, lost: { type: 'boolean', description: 'true = lost (written off) instead of damaged' }, date: { type: 'string', format: 'date' }, damageType: { type: 'string', enum: ['Screen broken', 'Body damage', "Won't turn on", 'Keys / ports', 'Water damage', 'Software'] }, description: { type: 'string', example: 'Crack on bottom-left corner' }, responsible: { type: 'string', enum: ['Normal wear', 'Employee'] }, photo: { type: 'string', description: 'Optional image as a data URL (max ~2 MB)' } } }),
          responses: created(ref('Repair')),
        },
      },
      '/api/repairs/{id}': {
        get: { tags: ['Repairs'], summary: 'One record (with photo)', parameters: [idParam()], responses: ok(ref('Repair')) },
      },
      '/api/repairs/{id}/send': {
        post: {
          tags: ['Repairs'], summary: 'Send a Damaged item to repair → In repair', description: writes('inventory'), parameters: [idParam()],
          requestBody: body({ type: 'object', properties: { by: { type: 'string', enum: ['Outside vendor', 'In-house IT', 'Brand service centre (warranty)'] }, vendor: { type: 'string', example: 'Sharma Computers', description: 'Required' }, contact: { type: 'string' }, jobNo: { type: 'string' }, sentAt: { type: 'string', format: 'date' }, expectedAt: { type: 'string', format: 'date' }, estimatedCost: { type: 'number', example: 3500, description: 'Required' }, notes: { type: 'string' } }, required: ['vendor', 'estimatedCost'] }),
          responses: ok(ref('Repair')),
        },
      },
      '/api/repairs/{id}/result': {
        post: {
          tags: ['Repairs'], summary: 'Result: Repaired (back in stock), Not repaired (back to Damaged) or Scrapped (written off)', description: `Works from Damaged or In repair.${writes('inventory')}`, parameters: [idParam()],
          requestBody: body({ type: 'object', required: ['outcome'], properties: { outcome: { type: 'string', enum: ['Repaired', 'Not repaired', 'Scrapped'], description: 'Not repaired = came back unfixed → status goes back to Damaged' }, date: { type: 'string', format: 'date' }, finalCost: { type: 'number', example: 3200 }, notes: { type: 'string' } } }),
          responses: ok(ref('Repair')),
        },
      },

      // ---------------- Reports ----------------
      '/api/reports/dashboard': {
        get: {
          tags: ['Reports'], summary: 'Dashboard totals, per-category stock, recent activity, low stock',
          description: 'Use **summary**, **categories**, **runningLow** and **recentActivity** — they match the portal Dashboard labels. The other keys are the originals the web portal uses.',
          responses: ok({ type: 'object', properties: {
            summary: { type: 'object', properties: {
              totalStock: { type: 'integer', example: 721, description: 'Total stock' },
              withEmployees: { type: 'integer', example: 13, description: 'With employees' },
              onTheShelf: { type: 'integer', example: 708, description: 'On the shelf' },
              openAssignments: { type: 'integer', example: 11, description: 'Open assignments' },
              departments: { type: 'integer', example: 6, description: 'Departments' },
              activeEmployees: { type: 'integer', example: 9 },
              itemTypes: { type: 'integer', example: 14, description: 'Different items in Inventory' },
            } },
            categories: arr({ type: 'object', properties: {
              category: { type: 'string', example: 'Headset' }, onTheShelf: { type: 'integer', example: 73 },
              total: { type: 'integer', example: 75 }, withEmployees: { type: 'integer', example: 2 }, isLow: { type: 'boolean', example: false },
            } }),
            runningLow: { type: 'object', properties: {
              count: { type: 'integer', example: 1, description: 'Items with 5 or fewer on the shelf' },
              threshold: { type: 'integer', example: 5 },
              items: arr({ type: 'object', properties: {
                _id: { type: 'string' }, name: { type: 'string', example: 'LG 45' }, category: { type: 'string', example: 'Monitor' },
                subCategory: { type: 'string' }, brand: { type: 'string', example: 'LG' }, model: { type: 'string' },
                left: { type: 'integer', example: 1, description: '"1 left"' }, total: { type: 'integer', example: 5 },
                withEmployees: { type: 'integer', example: 4 }, unit: { type: 'string', example: 'pcs' },
              } }),
            } },
            recentActivity: arr({ type: 'object', properties: {
              _id: { type: 'string' }, action: { type: 'string', enum: ['Assigned', 'Returned'] },
              text: { type: 'string', example: 'Returned 1 × Samsung 34rer from dfgrg' },
              itemName: { type: 'string' }, quantity: { type: 'integer' }, employeeName: { type: 'string' },
              employeeCode: { type: 'string', example: 'EMP-00125' }, departmentName: { type: 'string', example: 'IT' }, date: { type: 'string', format: 'date-time' },
            } }),
            totals: { type: 'object', properties: { total: { type: 'integer' }, assigned: { type: 'integer' }, available: { type: 'integer' }, items: { type: 'integer' } } },
            byCategory: arr({ type: 'object', properties: { category: { type: 'string' }, total: { type: 'integer' }, assigned: { type: 'integer' }, available: { type: 'integer' } } }),
            employees: { type: 'integer' }, departments: { type: 'integer' }, activeAssignments: { type: 'integer' },
            recent: arr(ref('Activity')), lowStock: arr(ref('Item')), lowStockCount: { type: 'integer', example: 3, description: 'How many items have 5 or fewer on the shelf (lowStock lists up to 10 of them)' },
          } }),
        },
      },
      '/api/reports/stock': { get: { tags: ['Reports'], summary: 'All items, sorted by category and name', responses: ok(arr(ref('Item'))) } },
      '/api/reports/by-department': { get: { tags: ['Reports'], summary: 'Quantity held per department and category', responses: ok(arr({ type: 'object', properties: { department: { type: 'string' }, category: { type: 'string' }, quantity: { type: 'integer' } } })) } },
      '/api/reports/activity': {
        get: {
          tags: ['Reports'], summary: 'Movement history',
          parameters: [q('from', 'Start date YYYY-MM-DD', { type: 'string', format: 'date' }), q('to', 'End date YYYY-MM-DD', { type: 'string', format: 'date' }), q('type', 'ASSIGN, RETURN, STOCK_ADD or STOCK_UPDATE')],
          responses: ok(arr(ref('Activity'))),
        },
      },

      // ---------------- Users ----------------
      '/api/users': {
        get: { tags: ['Users'], summary: 'List login accounts', description: perm('users'), responses: ok(arr(ref('User'))) },
        post: { tags: ['Users'], summary: 'Create a login', description: `Only an Administrator can create Administrators.${perm('users')}`, requestBody: body(ref('UserInput')), responses: created(ref('User')) },
      },
      '/api/users/permissions': { get: { tags: ['Users'], summary: 'Permission keys and their labels', description: perm('users'), responses: ok({ type: 'object', additionalProperties: { type: 'string' } }) } },
      '/api/users/{id}': {
        put: { tags: ['Users'], summary: 'Edit a login / reset password / set permissions', description: `Send \`password\` only to reset it.${perm('users')}`, parameters: [idParam()], requestBody: body(ref('UserInput')), responses: ok(ref('User')) },
        delete: { tags: ['Users'], summary: 'Delete a login (to Recycle Bin)', description: perm('users'), parameters: [idParam()], responses: ok(OkTrue) },
      },

      // ---------------- Notifications ----------------
      '/api/notifications': {
        get: {
          tags: ['Notifications'], summary: 'Change notifications, newest first', description: perm('notifications'),
          parameters: [q('unread', 'true for unread only'), q('entity', 'Item, Assignment, Employee, Department, User or Recycle Bin'), q('limit', 'Max rows (default 100, max 500)', { type: 'integer' })],
          responses: ok(arr(ref('Notification'))),
        },
      },
      '/api/notifications/unread-count': { get: { tags: ['Notifications'], summary: 'Unread count (for a badge)', description: perm('notifications'), responses: ok({ type: 'object', properties: { count: { type: 'integer' } } }) } },
      '/api/notifications/{id}/read': { post: { tags: ['Notifications'], summary: 'Mark one as read', description: perm('notifications'), parameters: [idParam()], responses: ok(OkTrue) } },
      '/api/notifications/read-all': { post: { tags: ['Notifications'], summary: 'Mark all as read', description: perm('notifications'), responses: ok(OkTrue) } },

      // ---------------- Recycle Bin ----------------
      '/api/trash': {
        get: {
          tags: ['Recycle Bin'], summary: 'Deleted records', description: perm('recycleBin'), parameters: [q('kind', 'Item, Employee, Department or User')],
          responses: ok({ type: 'object', properties: { retentionDays: { type: 'integer', example: 30 }, items: arr(ref('TrashEntry')) } }),
        },
        delete: { tags: ['Recycle Bin'], summary: 'Empty the Recycle Bin (permanent)', description: '**Administrators only.** Permanent — cannot be undone.', responses: ok({ type: 'object', properties: { ok: { type: 'boolean' }, deletedCount: { type: 'integer' } } }) },
      },
      '/api/trash/{id}/restore': { post: { tags: ['Recycle Bin'], summary: 'Restore a record', description: perm('recycleBin'), parameters: [idParam('id', 'Recycle Bin entry id')], responses: ok(OkTrue) } },
      '/api/trash/{id}': { delete: { tags: ['Recycle Bin'], summary: 'Permanently delete one entry', description: '**Administrators only.** Staff can delete records (they go to the Recycle Bin) and restore them, but cannot delete permanently.', parameters: [idParam('id', 'Recycle Bin entry id')], responses: ok(OkTrue) } },
    },

    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Repair: {
          type: 'object',
          properties: {
            _id: { type: 'string' }, item: { type: 'string' }, itemName: { type: 'string', example: 'LG 45 Monitor' }, category: { type: 'string', example: 'Monitor' },
            quantity: { type: 'integer', example: 1 },
            assignment: { type: 'string', description: 'Empty for office stock' }, employeeCode: { type: 'string', example: '122474' }, employeeName: { type: 'string', example: 'dikhsha' }, departmentName: { type: 'string', example: 'Human Resources' },
            damageType: { type: 'string', example: 'Screen broken' }, description: { type: 'string' }, responsible: { type: 'string', enum: ['Normal wear', 'Employee'] },
            reportedAt: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['Damaged', 'In repair', 'Repaired', 'Scrapped', 'Lost'] },
            overdueDays: { type: 'integer', example: 0, description: 'In repair past expectedAt' },
            repair: { type: 'object', properties: { by: { type: 'string' }, vendor: { type: 'string' }, contact: { type: 'string' }, jobNo: { type: 'string' }, sentAt: { type: 'string', format: 'date-time' }, expectedAt: { type: 'string', format: 'date-time' }, estimatedCost: { type: 'number' }, notes: { type: 'string' } } },
            result: { type: 'object', properties: { outcome: { type: 'string', enum: ['Repaired', 'Scrapped', 'Lost'] }, date: { type: 'string', format: 'date-time' }, finalCost: { type: 'number' }, notes: { type: 'string' } } },
          },
        },
        CategoryField: {
        type: 'object',
        properties: {
          key: { type: 'string', example: 'connectivity', description: 'Key used in item.specs (made from the label if left out)' },
          label: { type: 'string', example: 'Connectivity' },
          type: { type: 'string', enum: ['select', 'text', 'number'], example: 'select' },
          options: { type: 'array', items: { type: 'string' }, example: ['Wired', 'Bluetooth'], description: 'Dropdown values (type = select)' },
          placeholder: { type: 'string', example: '' },
          appliesTo: { type: 'array', items: { type: 'string' }, example: ['In-ear'], description: 'Show only for these sub-categories (empty = all)' },
        },
      },
      CategoryInput: {
        type: 'object',
        required: ['name', 'subCategories'],
        properties: {
          name: { type: 'string', example: 'Headphone' },
          icon: { type: 'string', enum: ['System', 'Monitor', 'Mouse', 'Keyboard', 'Headset', 'Printer', 'Networking', 'Mobile', 'Other'], example: 'Headset' },
          subCategories: { type: 'array', items: { type: 'string' }, example: ['Over-ear', 'In-ear', 'Neckband'] },
          brands: { type: 'array', items: { type: 'string' }, example: ['Sony', 'JBL', 'boAt'] },
          fields: { type: 'array', items: ref('CategoryField') },
          order: { type: 'integer', example: 10 },
        },
      },
      Category: {
        allOf: [
          { type: 'object', properties: { _id: { type: 'string' } } },
          ref('CategoryInput'),
          { type: 'object', properties: { itemCount: { type: 'integer', example: 0, description: 'Items using this category' } } },
        ],
      },
      Item: {
          type: 'object',
          properties: {
            _id: { type: 'string' }, name: { type: 'string', example: 'Dell Latitude 5550' },
            category: { type: 'string', example: 'System' }, subCategory: { type: 'string', example: 'Laptop' },
            brand: { type: 'string', example: 'Dell' }, model: { type: 'string', example: 'Latitude 5550' },
            specs: { type: 'object', additionalProperties: { type: 'string' }, example: { processor: 'Intel Core i5', ram: '16 GB', storage: '512 GB SSD' } },
            totalQuantity: { type: 'integer', example: 125 }, assignedQuantity: { type: 'integer', example: 82 }, availableQuantity: { type: 'integer', example: 43 },
            unit: { type: 'string', example: 'pcs' }, unitPrice: { type: 'number' }, vendor: { type: 'string' },
            purchaseDate: { type: 'string', format: 'date-time' }, warrantyUntil: { type: 'string', format: 'date-time' },
            description: { type: 'string' }, image: { type: 'string', description: 'Image as a data URL' },
            status: { type: 'string', enum: ['Active', 'Inactive'], example: 'Active', description: 'Inactive = retired, cannot be assigned' },
            specDetails: arr({
              type: 'object', description: 'The specs with their labels, in the order set in Manage Categories (only the fields for this sub-category)',
              properties: { key: { type: 'string', example: 'resolution' }, label: { type: 'string', example: 'Resolution' }, value: { type: 'string', example: '4K' } },
            }),
            usage: {
              type: 'object', description: 'Only in GET /api/items: who has it right now (full list per employee: GET /api/items/:id → holders)',
              properties: {
                employees: { type: 'integer', example: 3 },
                departments: arr({ type: 'object', properties: { name: { type: 'string', example: 'IT' }, quantity: { type: 'integer', example: 3 }, employees: { type: 'integer', example: 2 } } }),
              },
            },
            createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ItemInput: {
          type: 'object', required: ['name', 'category', 'totalQuantity', 'unitPrice'],
          properties: {
            name: { type: 'string' }, category: { type: 'string' }, subCategory: { type: 'string' }, brand: { type: 'string' }, model: { type: 'string' },
            specs: { type: 'object', additionalProperties: { type: 'string' } }, totalQuantity: { type: 'integer', minimum: 0 }, unit: { type: 'string' },
            unitPrice: { type: 'number' }, vendor: { type: 'string' }, purchaseDate: { type: 'string', format: 'date' }, warrantyUntil: { type: 'string', format: 'date' },
            description: { type: 'string' }, image: { type: 'string' },
          },
        },
        Employee: {
          type: 'object',
          properties: {
            _id: { type: 'string' }, employeeId: { type: 'string', example: 'EMP-00125' }, name: { type: 'string', example: 'Rahul Sharma' },
            department: { type: 'object', properties: { _id: { type: 'string' }, name: { type: 'string', example: 'IT' } } },
            designation: { type: 'string' }, location: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
            status: { type: 'string', enum: ['Active', 'Inactive'] }, assignedCount: { type: 'integer', description: 'Items currently held (list endpoint only)' },
          },
        },
        EmployeeInput: {
          type: 'object', required: ['name', 'department'],
          properties: { employeeId: { type: 'string' }, name: { type: 'string' }, department: { type: 'string', description: 'Department id' }, designation: { type: 'string' }, location: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, status: { type: 'string', enum: ['Active', 'Inactive'] } },
        },
        Department: {
          type: 'object',
          properties: { _id: { type: 'string' }, name: { type: 'string', example: 'IT' }, code: { type: 'string', example: 'IT' }, description: { type: 'string' }, employeeCount: { type: 'integer' }, assignedItems: { type: 'integer' } },
        },
        DepartmentInput: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' } } },
        Assignment: {
          type: 'object',
          properties: {
            _id: { type: 'string' }, item: { type: 'string' }, employee: { type: 'string' },
            itemName: { type: 'string' }, category: { type: 'string' }, employeeCode: { type: 'string' }, employeeName: { type: 'string' }, departmentName: { type: 'string' },
            quantity: { type: 'integer' }, returnedQuantity: { type: 'integer' }, outstandingQuantity: { type: 'integer' },
            issueDate: { type: 'string', format: 'date-time' }, notes: { type: 'string' },
            status: { type: 'string', enum: ['Assigned', 'Partially Returned', 'Returned', 'Transferred'], description: 'Transferred = everything was reassigned to other employee(s)' },
            transferredQuantity: { type: 'integer', example: 0, description: 'Part of returnedQuantity that was reassigned (see returns[].transfer)' },
            transferredFrom: { type: 'object', nullable: true, description: 'Set when this assignment came from a reassignment',
              properties: { assignment: { type: 'string' }, employeeCode: { type: 'string', example: 'EMP-00131' }, employeeName: { type: 'string', example: 'Jatin Sharma' }, departmentName: { type: 'string', example: 'IT' } } },
            returns: arr({ type: 'object', properties: { quantity: { type: 'integer' }, returnDate: { type: 'string', format: 'date-time' }, condition: { type: 'string' }, notes: { type: 'string' } } }),
          },
        },
        AssignInput: {
          type: 'object', required: ['itemId', 'quantity'],
          properties: {
            itemId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 }, issueDate: { type: 'string', format: 'date' }, notes: { type: 'string' },
            employeeId: { type: 'string', description: 'Existing employee (Mongo id)' },
            departmentId: { type: 'string', description: 'With employeeCode, when not passing employeeId' },
            employeeCode: { type: 'string', example: 'EMP-00125' }, employeeName: { type: 'string', description: 'Required when employeeCode is new' },
            designation: { type: 'string' }, location: { type: 'string' },
          },
        },
        Activity: {
          type: 'object',
          properties: {
            _id: { type: 'string' }, type: { type: 'string', enum: ['ASSIGN', 'RETURN', 'STOCK_ADD', 'STOCK_UPDATE'] },
            itemName: { type: 'string' }, employeeCode: { type: 'string' }, employeeName: { type: 'string' }, departmentName: { type: 'string' },
            quantity: { type: 'integer' }, notes: { type: 'string' }, date: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', enum: ['Admin', 'Staff'] },
            permissions: arr({ type: 'string' }), effectivePermissions: { ...arr({ type: 'string' }), description: 'What the app should allow (Admin = all)' },
            phone: { type: 'string' }, designation: { type: 'string' }, status: { type: 'string', enum: ['Active', 'Inactive'] }, lastLogin: { type: 'string', format: 'date-time' },
          },
        },
        UserInput: {
          type: 'object',
          properties: {
            name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string', minLength: 6 }, role: { type: 'string', enum: ['Admin', 'Staff'] },
            status: { type: 'string', enum: ['Active', 'Inactive'] }, phone: { type: 'string' }, designation: { type: 'string' },
            permissions: { ...arr({ type: 'string', enum: ['inventory', 'departments', 'employees', 'assignments', 'delete', 'notifications', 'recycleBin', 'users'] }) },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            _id: { type: 'string' }, action: { type: 'string', example: 'updated' }, entity: { type: 'string', example: 'Item' }, entityName: { type: 'string' },
            message: { type: 'string' }, changes: arr({ type: 'object', properties: { field: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } }),
            actor: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, email: { type: 'string' } } },
            read: { type: 'boolean' }, createdAt: { type: 'string', format: 'date-time' },
          },
        },
        TrashEntry: {
          type: 'object',
          properties: {
            _id: { type: 'string' }, kind: { type: 'string', enum: ['Item', 'Department', 'Employee', 'User'] }, name: { type: 'string' }, summary: { type: 'string' },
            deletedBy: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' } } },
            createdAt: { type: 'string', format: 'date-time', description: 'When it was deleted' }, daysLeft: { type: 'integer' },
          },
        },
        Error: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
  });
}

// Every list endpoint accepts ?page=&limit= (opt-in). Without `page` it returns the plain array as before.
const PAGED = ['/api/items', '/api/employees', '/api/departments', '/api/assignments', '/api/users',
  '/api/notifications', '/api/trash', '/api/reports/stock', '/api/reports/activity'];

function withPagination(spec) {
  for (const path of PAGED) {
    const op = spec.paths[path]?.get;
    if (!op) continue;
    op.parameters = [
      ...(op.parameters || []).filter((x) => x.name !== 'limit' && x.name !== 'page'),
      q('page', 'Page number, from 1. Send it to get a paged result: { data, page, limit, total, totalPages }' + (path === '/api/trash' ? ' (Recycle Bin keeps its { retentionDays, items } shape and adds page, limit, total, totalPages)' : ''), { type: 'integer', minimum: 1 }),
      q('limit', 'Rows per page with `page` (default 25, max 100)', { type: 'integer', minimum: 1, maximum: 100 }),
    ];
    op.description = [op.description, 'Paginated when `page` is sent.'].filter(Boolean).join(' ');
  }
  return spec;
}
