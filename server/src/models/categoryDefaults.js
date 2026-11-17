// The categories the app shipped with. They are copied into the database the first time the
// server starts; after that everything is edited from the portal (Inventory → Manage Categories).
const sel = (key, label, options, appliesTo = []) => ({ key, label, type: 'select', options, appliesTo });
const txt = (key, label, placeholder = '', appliesTo = []) => ({ key, label, type: 'text', placeholder, options: [], appliesTo });

export const DEFAULT_CATEGORIES = [
  {
    name: 'System', icon: 'System',
    subCategories: ['Laptop', 'Desktop', 'All-in-One', 'Workstation', 'Mac'],
    brands: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer', 'MSI'],
    fields: [
      sel('processor', 'Processor', ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'Intel Core Ultra 5', 'Intel Core Ultra 7', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Apple M2', 'Apple M3', 'Apple M4']),
      sel('ram', 'RAM', ['4 GB', '8 GB', '16 GB', '32 GB', '64 GB']),
      sel('storage', 'Storage', ['256 GB SSD', '512 GB SSD', '1 TB SSD', '2 TB SSD', '1 TB HDD', '512 GB SSD + 1 TB HDD']),
      sel('os', 'Operating System', ['Windows 11 Pro', 'Windows 11 Home', 'Windows 10 Pro', 'macOS', 'Ubuntu', 'No OS']),
      sel('screen', 'Screen Size', ['13"', '14"', '15.6"', '16"', '17"'], ['Laptop', 'All-in-One', 'Mac']),
      txt('graphics', 'Graphics', 'e.g. Integrated / RTX 4060'),
    ],
  },
  {
    name: 'Monitor', icon: 'Monitor',
    subCategories: ['LED', 'IPS', 'Curved', 'Ultrawide', 'Touch'],
    brands: ['Dell', 'LG', 'Samsung', 'HP', 'BenQ', 'Acer', 'ViewSonic', 'Lenovo'],
    fields: [
      sel('size', 'Screen Size', ['19"', '22"', '24"', '27"', '32"', '34"']),
      sel('resolution', 'Resolution', ['1366×768 (HD)', '1920×1080 (Full HD)', '2560×1440 (QHD / 2K)', '3440×1440 (UW-QHD)', '3840×2160 (4K UHD)']),
      sel('refreshRate', 'Refresh Rate', ['60 Hz', '75 Hz', '100 Hz', '144 Hz', '165 Hz']),
      txt('ports', 'Ports', 'e.g. HDMI, DisplayPort, USB-C'),
    ],
  },
  {
    name: 'Mouse', icon: 'Mouse',
    subCategories: ['Wired', 'Wireless', 'Bluetooth', 'Ergonomic', 'Gaming'],
    brands: ['Logitech', 'Dell', 'HP', 'Microsoft', 'Lenovo', 'Zebronics'],
    fields: [
      sel('connectivity', 'Connectivity', ['USB Wired', 'USB Receiver (2.4 GHz)', 'Bluetooth', 'USB-C']),
      sel('dpi', 'DPI', ['1000', '1600', '4000', '8000+']),
    ],
  },
  {
    name: 'Keyboard', icon: 'Keyboard',
    subCategories: ['Wired', 'Wireless', 'Mechanical', 'Keyboard + Mouse Combo'],
    brands: ['Logitech', 'Dell', 'HP', 'Microsoft', 'Lenovo', 'Zebronics'],
    fields: [
      sel('connectivity', 'Connectivity', ['USB Wired', 'USB Receiver (2.4 GHz)', 'Bluetooth', 'USB-C']),
      sel('layout', 'Layout', ['Full Size', 'TKL (Tenkeyless)', 'Compact']),
    ],
  },
  {
    name: 'Headset', icon: 'Headset',
    subCategories: ['Wired', 'Wireless', 'Bluetooth', 'USB'],
    brands: ['Jabra', 'Logitech', 'Poly', 'Sony', 'JBL', 'boAt'],
    fields: [
      sel('connectivity', 'Connectivity', ['3.5 mm Jack', 'USB-A', 'USB-C', 'Bluetooth', 'USB Dongle']),
      sel('type', 'Type', ['Mono', 'Stereo']),
      sel('mic', 'Microphone', ['Noise Cancelling Mic', 'Standard Mic', 'No Mic']),
    ],
  },
  {
    name: 'Printer', icon: 'Printer',
    subCategories: ['Laser', 'Inkjet', 'All-in-One', 'Label', 'Scanner'],
    brands: ['HP', 'Canon', 'Epson', 'Brother'],
    fields: [
      sel('print', 'Print', ['Mono', 'Color']),
      sel('connectivity', 'Connectivity', ['USB', 'Wi-Fi', 'Ethernet', 'Wi-Fi + Ethernet']),
    ],
  },
  {
    name: 'Networking', icon: 'Networking',
    subCategories: ['Router', 'Switch', 'Access Point', 'Firewall', 'LAN Cable'],
    brands: ['TP-Link', 'Cisco', 'D-Link', 'Netgear', 'Ubiquiti'],
    fields: [
      txt('ports', 'Ports', 'e.g. 8 × Gigabit'),
      sel('speed', 'Speed', ['100 Mbps', '1 Gbps', '2.5 Gbps', '10 Gbps']),
    ],
  },
  {
    name: 'Mobile', icon: 'Mobile',
    subCategories: ['Smartphone', 'Tablet', 'SIM Card'],
    brands: ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Google'],
    fields: [
      sel('storage', 'Storage', ['64 GB', '128 GB', '256 GB', '512 GB'], ['Smartphone', 'Tablet']),
      sel('ram', 'RAM', ['4 GB', '6 GB', '8 GB', '12 GB'], ['Smartphone', 'Tablet']),
    ],
  },
  {
    name: 'Other', icon: 'Other',
    subCategories: ['Accessory', 'Cable / Adapter', 'Furniture', 'Stationery'],
    brands: [],
    fields: [],
  },
];
