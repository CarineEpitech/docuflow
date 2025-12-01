# Design Guidelines: Notion-like Documentation Tool

## Design Approach

**Reference-Based Approach**: Drawing inspiration from **Notion**, **Linear**, and **Obsidian** to create a productivity-focused documentation experience that prioritizes content clarity, efficient navigation, and powerful editing capabilities.

**Core Principles**:
- Content-first: UI should fade into the background
- Spatial clarity: Clear hierarchy between navigation, content, and actions
- Productive efficiency: Minimal friction for common tasks
- Information density: Maximize usable space without overwhelming

---

## Layout System

### Application Structure

**Three-column layout**:
1. **Sidebar** (240px fixed): Project navigation with collapsible sections
2. **Page Tree** (280px resizable): Document hierarchy for active project
3. **Editor Canvas** (fluid, max-width: 860px centered): Main content area

**Spacing System**: Use Tailwind units **2, 3, 4, 6, 8, 12, 16** for consistent rhythm
- Component padding: `p-4` to `p-6`
- Section spacing: `space-y-6` to `space-y-8`
- Micro spacing: `gap-2` to `gap-3`

---

## Typography Hierarchy

**Font Stack**: 
- **UI/Interface**: Inter (400, 500, 600)
- **Content/Editor**: System font stack for optimal readability

**Hierarchy**:
- **H1 (Page Title)**: 2.5rem (40px), font-weight 700, tracking tight, mb-8
- **H2 (Editor Heading 1)**: 1.875rem (30px), font-weight 700, mt-12, mb-4
- **H3 (Editor Heading 2)**: 1.5rem (24px), font-weight 600, mt-8, mb-3
- **Body (Paragraph)**: 1rem (16px), font-weight 400, line-height 1.7, mb-3
- **Small Text (Meta)**: 0.875rem (14px), font-weight 500, opacity-70
- **Code Blocks**: JetBrains Mono, 0.9rem (14.4px)

---

## Component Library

### Navigation Components

**Sidebar (Projects)**:
- Fixed 240px width with scrollable content
- Project items: 36px height, rounded corners, hover state with subtle background
- Nested indent: 16px per level
- Icons: 16px × 16px, positioned left
- Active state: Subtle left border accent (3px)

**Page Tree**:
- Resizable 200-400px range (default 280px)
- Drag handles on hover (6-dot grid icon, 16px)
- Nested pages: 20px indent per level
- Expand/collapse chevrons: 12px icons
- Page items: 32px height, full-width clickable
- Breadcrumb trail: Top of editor, text-sm, separated by "/" with 8px spacing

**Top Navigation Bar**:
- 64px height, border-bottom
- Search input: 320px width, rounded-lg, positioned center-right
- User menu: 32px avatar, right-aligned with 16px margin

### Editor Components

**Block Container**:
- Max-width: 860px, centered with `mx-auto`
- Each block: Relative positioning for drag handle placement
- Drag handle: Absolute left (-32px), 20px × 20px, opacity-0 default, opacity-100 on hover
- Block spacing: 4px between blocks
- Hover state: Subtle background on entire block

**Slash Command Menu**:
- Dropdown: 280px width, max-height 400px, rounded-lg
- Items: 40px height, with icon (20px) + text layout
- Grouped sections with 12px font-weight 600 headers
- Keyboard navigation: Highlighted item with subtle background
- Icons: Heroicons outline style

**Inline Toolbar** (appears on text selection):
- Floating: Positioned above selection with 8px offset
- Compact button group: 32px height buttons, 2px gap
- Icons only: 16px size (Bold, Italic, Underline, Strikethrough, Highlight)
- Rounded pill shape for entire toolbar

**Block Types**:
- Paragraph: Standard text, mb-3
- Heading blocks: Appropriate mb/mt as specified in typography
- Lists: 24px left padding, 6px item spacing
- Checkboxes: 20px × 20px boxes with 12px gap to text
- Code blocks: Rounded-lg, p-4, syntax highlighting via PrismJS
- Quote blocks: Left border (4px), pl-4, italic text
- Divider: 1px height, my-8, full-width
- Callout: Rounded-lg, p-4, flex layout with icon (24px) + content

### Media Blocks

**Image Block**:
- Max-width: 100% of content area
- Rounded corners (8px)
- Click to expand modal: Full-screen with 24px padding
- Caption field below: text-sm, text-center, mt-2

**Video Block**:
- Aspect ratio 16:9 maintained
- Rounded corners (8px)
- Play controls: Native browser controls

### Form Elements

**Search Input**:
- Height: 40px
- Rounded: 8px
- Icon: Left-positioned magnifying glass (16px), 12px from edge
- Text padding: pl-10, pr-4
- Keyboard shortcut hint: Right-aligned, text-xs, opacity-50

**Document Title Input**:
- Borderless, font-size 40px (matches H1)
- Placeholder: "Untitled" with reduced opacity
- Full-width, py-6

**Block Content Inputs**:
- Inline editing: No visible borders
- Focus state: Subtle outline
- Placeholder text: Reduced opacity with helpful hints ("Type / for commands")

### Modal & Overlay Components

**New Project Modal**:
- 480px width, centered
- Rounded-lg, p-6
- Title: text-xl, font-weight 600, mb-6
- Form fields: 48px height inputs, 8px gap
- Actions: Right-aligned button group (Cancel + Create)

**Delete Confirmation**:
- 400px width
- Rounded-lg, p-6
- Warning icon: 48px, centered top
- Text: text-center, mb-6
- Destructive action button: Right-aligned

**Image Upload Drop Zone**:
- Dashed border (2px), rounded-lg
- 200px height when empty
- Drag-over state: Solid border
- Icon: Upload cloud (48px), centered
- Text: "Drop image here or click to upload", text-sm

---

## Interaction Patterns

**Drag & Drop**:
- Drag handle: Appears on left on hover (6-dot grid icon)
- Dragging state: Reduced opacity (0.5), cursor grabbing
- Drop indicator: 2px horizontal line showing insert position
- Smooth transitions: 150ms ease

**Keyboard Shortcuts**:
- Display in tooltips: text-xs, monospace font
- Common shortcuts clearly communicated in UI (e.g., "⌘K to search")

**Loading States**:
- Skeleton screens for page tree and content
- Spinner: 24px, centered for actions
- Optimistic updates for immediate feedback

---

## Responsive Behavior

**Desktop (1280px+)**: Full three-column layout
**Tablet (768-1279px)**: Collapsible sidebars with overlay
**Mobile (<768px)**: Single column, hamburger menu for navigation

---

## Accessibility

- Skip to content link
- Keyboard navigation throughout (Tab, Arrow keys)
- ARIA labels for icon-only buttons
- Focus indicators: 2px outline with offset
- Reduced motion support for animations

---

## Images

**No hero images required** - This is a utility application focused on productivity. All visual elements should support functionality, not marketing appeal.