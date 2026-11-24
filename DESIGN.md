# DataFlow design

## Color scheme

Use cool slate tones as the base for the canvas, panels, tables, and editor. Support both light and dark modes.

### Proposed starting palette

| Role | Light mode | Dark mode |
| --- | --- | --- |
| Canvas background | `#F1F5F9` | `#0F172A` |
| Panel background | `#FFFFFF` | `#1E293B` |
| Primary text | `#0F172A` | `#F1F5F9` |
| Secondary text | `#475569` | `#CBD5E1` |
| Decorative divider | `#E2E8F0` | `#334155` |
| Control border | `#64748B` | `#94A3B8` |
| Keyboard focus ring | `#334155` | `#E2E8F0` |
| Primary button background | `#334155` | `#CBD5E1` |
| Primary button text | `#FFFFFF` | `#0F172A` |

Use these roles as shared color tokens so that changing themes updates every surface together. Use labels, icons, or patterns alongside color for status messages, SQL diffs, and chart series.

### Proposed theme behavior

Follow the device theme by default. Let users choose Light, Dark, or System, and remember their choice on that device.

### Contrast

Aim for at least 4.5:1 for normal text and 3:1 for control borders and focus indicators against adjacent surfaces. Verify the final controls and states when the UI is implemented. [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

## Table styles

Let users preview and apply a preset to a whole table. A style can define header and footer formatting, row striping, gridlines, borders, and text emphasis. Use a slate palette for the built-in presets, with a light and dark variant for each. [Reference: table styles in Apple Numbers](https://support.apple.com/en-gb/guide/numbers/tan6698de8db/mac)

### Proposed presets

| Preset | Appearance |
| --- | --- |
| Plain | Quiet header and subtle horizontal rules |
| Banded | Alternating row backgrounds for long tables |
| Emphasis | Strong header and a distinct footer for totals |
| Grid | Visible cell borders for dense data entry |

Save the style choice with the table's presentation settings so it can be compared and restored with the workspace. A style applies to the header and footer if the table has them. Changing styles affects appearance only.

### Possible additions

Let users adjust individual style settings, reset overrides, and save named presets for reuse across tables or within an organization.
