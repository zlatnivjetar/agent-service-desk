# Ticket Workspace Page Overrides

> **PROJECT:** Agent Service Desk
> **Generated:** 2026-03-17 12:20:06
> **Page Type:** Product Detail

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** 1. Hero (date/location/countdown), 2. Speakers grid, 3. Agenda/schedule, 4. Sponsors, 5. Register CTA

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Urgency colors (countdown). Event branding. Speaker cards professional. Sponsor logos neutral.

### Component Overrides

- Avoid: Visual-only error indication
- Avoid: Silent success
- Avoid: Toasts that never disappear

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: WebGL/Three.js 3D, realistic shadows (layers), physics lighting, parallax (3-5 layers), smooth 3D (300-400ms)
- Accessibility: Use aria-live or role=alert for errors
- Feedback: Brief success message
- Feedback: Auto-dismiss after 3-5 seconds
- CTA Placement: Register CTA sticky + After speakers + Bottom
