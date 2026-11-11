# Design handoff — El Pesado ordering screens

Visual source of truth for the customer ordering flow. These files were exported from the
Claude design canvas "Burritos El Pesado — Ordering Page".

## Files

| File | Screen | Route (planned) |
|---|---|---|
| `mockups/01-menu.dc.html` | 01 · Menú | `/` |
| `mockups/02-item-detail.dc.html` | 02 · Detalle del producto | `/item/[id]` |
| `mockups/03-cart.dc.html` | 03 · Tu pedido | `/cart` |
| `mockups/04-checkout.dc.html` | 04 · Checkout | `/checkout` |
| `mockups/05-verify-otp.dc.html` | 05 · Código SMS | `/checkout/verify` |
| `mockups/06-confirmation.dc.html` | 06 · Pedido recibido | `/order/[id]` |
| `mockups/00-desktop-ordering-page.dc.html` | Desktop layout reference (menu + cart sidebar, ≥1024px) | same routes, responsive |
| `assets/logo.jpg` | Logo → copy to `frontend/public/logo.jpg` | — |

## How to read the `.dc.html` files

They are HTML mockups with **inline styles**, which means exact hex colors, px sizes, borders and
shadows can be read straight from the markup. They also use a small template syntax that is
NOT part of the app:

- `{{ name }}` = a value filled in from the `renderVals()` script at the bottom of the file
- `<sc-for list="{{items}}" as="it">` = a loop, `<sc-if value="{{x}}">` = a conditional
- `<x-dc>`, `<helmet>`, `support.js`, `class Component extends DCLogic` = mockup runtime, ignore
- `src="/_blob/..."` = the logo; use `/logo.jpg` instead

Treat them as a **visual spec**: rebuild with React + Tailwind and do not copy the template syntax.
`00-desktop-ordering-page.dc.html` contains the real 55-item menu snapshot and a working cart/checkout
state machine that can be used as a behavior reference, but production data comes from the API.

## Design tokens

| Token | Value | Use |
|---|---|---|
| navy | `#1B2A5C` | text, 2px borders, header, tab bar |
| orange | `#F08A24` | primary actions (always navy text on orange, never white) |
| yellow | `#FFD23F` | title, selected states, image placeholders |
| red | `#C62A1E` | title outline, "Requerido"/badges (white text) |
| white | `#FFFFFF` | page background |
| paper | `#FFF8F2` | subtle fills (selected option, inputs, notes) |
| muted | `#5A4636` | secondary text |
| line | `#E9C9AE` | list dividers |
| cream | `#FCE6D4` | ONLY behind the logo |
| radius | 4px (small controls, chips) / 6px (cards, buttons) | no pills, no big rounding |
| shadow | `3px 3px 0 #1B2A5C` | hard offset shadow on primary buttons / featured cards |
| fonts | Lilita One (headings, buttons), Nunito 400–900 (body) | Google Fonts |

Food photos are pending: every image slot shows 🌯 (🥤 for drinks) on a yellow box until
`menu_items.image_url` is filled.
