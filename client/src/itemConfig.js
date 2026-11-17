// Category → sub-categories, brands and the spec fields shown in the Add Item form.
// Edit this file to add your own options — no other code changes needed.
// Field types: 'select' (options) or 'text'. "Other…" lets admins type a custom value.

export const ITEM_CONFIG = {
  System: {
    subCategories: ['Laptop', 'Desktop', 'All-in-One', 'Workstation', 'Mac'],
    brands: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer', 'MSI'],
    specs: [
      { key: 'processor', label: 'Processor', type: 'select', options: ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'Intel Core Ultra 5', 'Intel Core Ultra 7', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Apple M2', 'Apple M3', 'Apple M4'] },
      { key: 'ram', label: 'RAM', type: 'select', options: ['4 GB', '8 GB', '16 GB', '32 GB', '64 GB'] },
      { key: 'storage', label: 'Storage', type: 'select', options: ['256 GB SSD', '512 GB SSD', '1 TB SSD', '2 TB SSD', '1 TB HDD', '512 GB SSD + 1 TB HDD'] },
      { key: 'os', label: 'Operating System', type: 'select', options: ['Windows 11 Pro', 'Windows 11 Home', 'Windows 10 Pro', 'macOS', 'Ubuntu', 'No OS'] },
      { key: 'screen', label: 'Screen Size', type: 'select', options: ['13"', '14"', '15.6"', '16"', '17"', 'N/A (Desktop)'] },
      { key: 'graphics', label: 'Graphics', type: 'text', placeholder: 'e.g. Integrated / RTX 4060' },
    ],
  },
  Monitor: {
    subCategories: ['LED', 'IPS', 'Curved', 'Ultrawide', 'Touch'],
    brands: ['Dell', 'LG', 'Samsung', 'HP', 'BenQ', 'Acer', 'ViewSonic', 'Lenovo'],
    specs: [
      { key: 'size', label: 'Screen Size', type: 'select', options: ['19"', '22"', '24"', '27"', '32"', '34"'] },
      { key: 'resolution', label: 'Resolution', type: 'select', options: ['1366×768 (HD)', '1920×1080 (Full HD)', '2560×1440 (QHD / 2K)', '3440×1440 (UW-QHD)', '3840×2160 (4K UHD)'] },
      { key: 'refreshRate', label: 'Refresh Rate', type: 'select', options: ['60 Hz', '75 Hz', '100 Hz', '144 Hz', '165 Hz'] },
      { key: 'ports', label: 'Ports', type: 'text', placeholder: 'e.g. HDMI, DisplayPort, USB-C' },
    ],
  },
  Mouse: {
    subCategories: ['Wired', 'Wireless', 'Bluetooth', 'Ergonomic', 'Gaming'],
    brands: ['Logitech', 'Dell', 'HP', 'Microsoft', 'Lenovo', 'Zebronics'],
    specs: [
      { key: 'connectivity', label: 'Connectivity', type: 'select', options: ['USB Wired', 'USB Receiver (2.4 GHz)', 'Bluetooth', 'USB-C'] },
      { key: 'dpi', label: 'DPI', type: 'select', options: ['1000', '1600', '4000', '8000+'] },
    ],
  },
  Keyboard: {
    subCategories: ['Wired', 'Wireless', 'Mechanical', 'Keyboard + Mouse Combo'],
    brands: ['Logitech', 'Dell', 'HP', 'Microsoft', 'Lenovo', 'Zebronics'],
    specs: [
      { key: 'connectivity', label: 'Connectivity', type: 'select', options: ['USB Wired', 'USB Receiver (2.4 GHz)', 'Bluetooth', 'USB-C'] },
      { key: 'layout', label: 'Layout', type: 'select', options: ['Full Size', 'TKL (Tenkeyless)', 'Compact'] },
    ],
  },
  Headset: {
    subCategories: ['Wired', 'Wireless', 'Bluetooth', 'USB'],
    brands: ['Jabra', 'Logitech', 'Poly', 'Sony', 'JBL', 'boAt'],
    specs: [
      { key: 'connectivity', label: 'Connectivity', type: 'select', options: ['3.5 mm Jack', 'USB-A', 'USB-C', 'Bluetooth', 'USB Dongle'] },
      { key: 'type', label: 'Type', type: 'select', options: ['Mono', 'Stereo'] },
      { key: 'mic', label: 'Microphone', type: 'select', options: ['Noise Cancelling Mic', 'Standard Mic', 'No Mic'] },
    ],
  },
  Printer: {
    subCategories: ['Laser', 'Inkjet', 'All-in-One', 'Label', 'Scanner'],
    brands: ['HP', 'Canon', 'Epson', 'Brother'],
    specs: [
      { key: 'print', label: 'Print', type: 'select', options: ['Mono', 'Color'] },
      { key: 'connectivity', label: 'Connectivity', type: 'select', options: ['USB', 'Wi-Fi', 'Ethernet', 'Wi-Fi + Ethernet'] },
    ],
  },
  Networking: {
    subCategories: ['Router', 'Switch', 'Access Point', 'Firewall', 'LAN Cable'],
    brands: ['TP-Link', 'Cisco', 'D-Link', 'Netgear', 'Ubiquiti'],
    specs: [
      { key: 'ports', label: 'Ports', type: 'text', placeholder: 'e.g. 8 × Gigabit' },
      { key: 'speed', label: 'Speed', type: 'select', options: ['100 Mbps', '1 Gbps', '2.5 Gbps', '10 Gbps'] },
    ],
  },
  Mobile: {
    subCategories: ['Smartphone', 'Tablet', 'SIM Card'],
    brands: ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Google'],
    specs: [
      { key: 'storage', label: 'Storage', type: 'select', options: ['64 GB', '128 GB', '256 GB', '512 GB'] },
      { key: 'ram', label: 'RAM', type: 'select', options: ['4 GB', '6 GB', '8 GB', '12 GB'] },
    ],
  },
  Other: {
    subCategories: ['Accessory', 'Cable / Adapter', 'Furniture', 'Stationery'],
    brands: [],
    specs: [],
  },
};

export const CATEGORIES = Object.keys(ITEM_CONFIG);

// Short one-line spec summary for tables, e.g. "Intel Core i5 · 16 GB · 512 GB SSD"
export const specSummary = (item) =>
  (ITEM_CONFIG[item.category]?.specs || [])
    .map((f) => item.specs?.[f.key])
    .filter(Boolean)
    .slice(0, 4)
    .join(' · ');
