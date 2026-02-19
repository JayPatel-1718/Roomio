# 🏨 ROOOMIO — MVP Feature Status Document

> **Author:** Jay Patel  
> **Last Updated:** 2026-02-19  
> **App Version:** 2.4.0 (Build 902)  
> **Project:** Rooomio — AI-Powered Hospitality Management Platform  
> **Tech Stack:** React Native (Expo SDK 54) + Firebase (Firestore + Auth) + Gemini AI  
> **Platforms:** Android, iOS, Web (Firebase Hosting), Desktop (Electron)  
> **Repository:** `new/Rooomio` directory  
> **Reference:** `rooomio_mvp_roadmap.pdf` (original MVP roadmap)

---

## 📋 TABLE OF CONTENTS

1. [Project Overview](#project-overview)
2. [Architecture Summary](#architecture-summary)
3. [Feature Status Legend](#feature-status-legend)
4. [IMPLEMENTED Features (✅ Done)](#implemented-features)
5. [PARTIALLY Implemented Features (🟡 In Progress)](#partially-implemented-features)
6. [NOT YET Implemented Features (❌ Remaining)](#not-yet-implemented-features)
7. [NEWLY Suggested Features (🆕 New)](#newly-suggested-features)
8. [Database Schema (Firestore)](#database-schema)
9. [File Structure Reference](#file-structure-reference)
10. [Known Issues & Tech Debt](#known-issues--tech-debt)
11. [Deployment Status](#deployment-status)

---

## 📖 PROJECT OVERVIEW

**Rooomio** is an AI-powered hospitality management platform designed for hotel owners/admins. It provides a complete dashboard to manage rooms, guests, food orders, service requests, menu management, analytics, and multi-property support. The app targets small-to-mid-size hotels, PGs (Paying Guests), and villa rental businesses in India.

**Core Value Proposition:**
- One-tap room assignment & guest check-in/checkout
- Real-time service request tracking (food orders, housekeeping, etc.)
- AI-powered menu scanning (OCR + Gemini) and AI menu rewriting
- QR-code-based guest self-service
- Multi-property type support (Hotel, PG, Villa)
- Analytics dashboard with revenue, occupancy, and service insights
- Cross-platform: Mobile (Android/iOS), Web, and Desktop (Electron)

---

## 🏗️ ARCHITECTURE SUMMARY

```
┌─────────────────────────────────────────────────────────┐
│                     ROOOMIO APP                          │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│  │  Splash   │→│  Home    │→│  Login   │→│Onboarding ││
│  │  Screen   │  │  Screen  │  │  Screen  │  │  Screen  ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘│
│                                    ↓                     │
│  ┌──────────────────────────────────────────────────────┐│
│  │              OWNERSHIP SELECTOR                       ││
│  │    Hotel ←→ PG Dashboard ←→ Villa Dashboard          ││
│  └──────────────────────────────────────────────────────┘│
│                    ↓ (Hotel selected)                    │
│  ┌──────────────────────────────────────────────────────┐│
│  │             HOTEL TABS (Main Dashboard)               ││
│  │  ┌─────────┐┌─────┐┌──────┐┌────────┐┌───────────┐ ││
│  │  │Dashboard ││Menu ││Rooms ││Tracking││ Analytics │ ││
│  │  └─────────┘└─────┘└──────┘└────────┘└───────────┘ ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────────┐│
│  │  MODALS              │  │  SERVICES                    ││
│  │  • Add Guest         │  │  • Firebase Auth             ││
│  │  • Add Villa         │  │  • Firestore DB              ││
│  │                      │  │  • AI Service (Gemini)       ││
│  │                      │  │  • OCR Service               ││
│  │                      │  │  • Push Notifications        ││
│  └─────────────────────┘  └─────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Key Dependencies:**
- `firebase` v12.8.0 — Auth + Firestore
- `expo` SDK 54 — Cross-platform framework
- `@google/generative-ai` — Gemini AI for menu parsing & rewriting
- `expo-notifications` — Push notifications
- `expo-image-picker` / `expo-document-picker` — Camera & file uploads
- `expo-av` — Notification sounds
- `@react-native-community/datetimepicker` — Date/time pickers
- `expo-secure-store` — Secure credential storage
- `electron` + `electron-builder` — Desktop app packaging

---

## 🏷️ FEATURE STATUS LEGEND

| Symbol | Meaning |
|--------|---------|
| ✅ | **Fully Implemented** — Feature is complete, functional, and in production |
| 🟡 | **Partially Implemented** — Core logic exists but incomplete or has known gaps |
| ❌ | **Not Yet Implemented** — Planned in MVP roadmap but not built yet |
| 🆕 | **New Suggestion** — Not in original roadmap but recommended for the product |

---

## ✅ IMPLEMENTED FEATURES

### 1. Authentication & User Management
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1.1 | Admin Email/Password Login | ✅ | Firebase Auth with email+password; implemented in `admin-login.tsx` |
| 1.2 | Save Login Credentials | ✅ | Uses `expo-secure-store` + `AsyncStorage`; remembers email after 3+ logins |
| 1.3 | Auto-fill Saved Account | ✅ | Shows "Continue as [email]" after repeated logins |
| 1.4 | Login Success Animation | ✅ | Animated checkmark with success screen after login |
| 1.5 | Session Persistence | ✅ | `onAuthStateChanged` checks auth state; redirects to dashboard if logged in |
| 1.6 | Protected Routes | ✅ | Ownership/dashboard screens redirect to login if unauthenticated |
| 1.7 | User Profile Initialization | ✅ | `initializeUserProfile()` in `userData.js` creates Firestore user doc on first login |

### 2. Onboarding Flow (First-Time Setup)
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.1 | Multi-step Onboarding Wizard | ✅ | 4-step animated flow in `onboarding.tsx` |
| 2.2 | Hotel Name Input | ✅ | Step 1 — Admin enters hotel name |
| 2.3 | Floor-based Room Configuration | ✅ | Step 2 — Configure floor name, rooms per floor, starting room number; supports multiple floors |
| 2.4 | Room Preview Before Setup | ✅ | Step 3 — Preview all room numbers generated from floor configs |
| 2.5 | QR Code Generation | ✅ | Step 4 — Generates hotel-specific QR code for guest self-service |
| 2.6 | QR Code Download | ✅ | Downloadable QR code image for printing |
| 2.7 | Auto Room Creation in Firestore | ✅ | `setupRooms.ts` bulk-creates room documents under `users/{uid}/rooms` |
| 2.8 | First-Login Detection | ✅ | `userHasRooms()` checks if rooms exist; routes to onboarding if not |

### 3. Dashboard (Main Admin View)
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 3.1 | Real-time Service Request Feed | ✅ | Live Firestore `onSnapshot` listener for pending service requests |
| 3.2 | Real-time Food Order Feed | ✅ | Live listener for pending food orders |
| 3.3 | Accept/Decline Service Requests | ✅ | Admin can accept service requests with single tap |
| 3.4 | Accept Food Orders with ETA | ✅ | Modal with time selection (5/10/15/20/30/45/60 min) before accepting food orders |
| 3.5 | Push Notifications | ✅ | `expo-notifications` for new order/request alerts |
| 3.6 | Notification Sound | ✅ | Custom sound using `expo-av` Audio component |
| 3.7 | Notification Permission Handling | ✅ | One-time permission alert with graceful fallback |
| 3.8 | Dark/Light Mode Support | ✅ | `useColorScheme()` hook for theme detection |
| 3.9 | Responsive Layout | ✅ | `useWindowDimensions()` adapts for mobile/tablet/desktop |

### 4. Room Management
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 4.1 | Room Grid Display | ✅ | Color-coded rooms (green=available, red=occupied) in `rooms.tsx` (2928 lines) |
| 4.2 | Guest Check-in (Room Assignment) | ✅ | Modal form with guest name, mobile, meal plan, check-in/checkout dates |
| 4.3 | Guest Checkout | ✅ | Manual checkout with confirmation; clears room data |
| 4.4 | Auto Checkout (Cloud Function) | ✅ | Firebase Cloud Function `autoCheckoutRooms` runs every 5 minutes |
| 4.5 | Room Detail View | ✅ | Expandable card showing guest info, food orders, service requests |
| 4.6 | Edit Room / Guest Details | ✅ | `openEditModal()` function to modify room assignment |
| 4.7 | Meal Plan Selection | ✅ | Toggle breakfast/lunch/dinner meal plans at check-in |
| 4.8 | Food Order History per Room | ✅ | `getCurrentGuestFoodOrders()` scoped to current guest session |
| 4.9 | Service Request History per Room | ✅ | `getServiceRequestsForRoom()` scoped to current check-in period |
| 4.10 | Revenue per Room | ✅ | `totalForRoom()` calculates food + service charges for current guest |
| 4.11 | INR Currency Formatting | ✅ | `formatINR()` helper for Indian Rupee display |
| 4.12 | Date/Time Picker (Cross-Platform) | ✅ | Web: `datetime-local` input; Android: sequential date→time picker; iOS: native picker |
| 4.13 | Web-Safe Confirmation Dialog | ✅ | Custom `askConfirm()` modal replaces `Alert.alert()` for web compatibility |

### 5. Menu Management
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 5.1 | Category-Based Menu Display | ✅ | 6 default categories: Breakfast, Lunch, Dinner, Beverages, Desserts, Snacks |
| 5.2 | Add Menu Item (Manual) | ✅ | Form with name, price, description, veg/non-veg toggle |
| 5.3 | Edit Menu Item | ✅ | In-place editing with modal form |
| 5.4 | Delete Menu Item | ✅ | Confirmation dialog before delete |
| 5.5 | Toggle Item Availability | ✅ | Quick switch to mark items available/unavailable |
| 5.6 | Dynamic Category Support | ✅ | Supports 20+ category types including regional (Indian, Continental, etc.) |
| 5.7 | AI Menu Scan — Camera | ✅ | Capture menu photo → OCR → Gemini AI → structured items |
| 5.8 | AI Menu Scan — Gallery | ✅ | Pick image from gallery → same OCR+AI pipeline |
| 5.9 | AI Menu Scan — PDF/File | ✅ | Upload PDF → extract text → Gemini AI parsing |
| 5.10 | AI Parsed Items Review Modal | ✅ | Review, edit, toggle parsed items before saving |
| 5.11 | Bulk Save Parsed Items | ✅ | Save all AI-parsed items to Firestore at once |
| 5.12 | AI Menu Rewrite | ✅ | `generateAIMenuText()` rewrites dish descriptions using Gemini |
| 5.13 | AI Rewrite History & Undo | ✅ | Navigate between AI rewrite versions; revert changes |
| 5.14 | Veg/Non-Veg Indicator | ✅ | Green/red dot indicator on menu items |
| 5.15 | OCR.space Integration | ✅ | `extractTextOCR()` in `aiService.ts` for text extraction |
| 5.16 | Gemini AI Integration | ✅ | `structureWithGemini()` for structured data extraction from raw text |
| 5.17 | Category Normalization | ✅ | `normalizeCategory()` maps aliases (e.g., "starters" → "snacks") |

### 6. Order & Service Tracking
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 6.1 | Multi-Status Tracking System | ✅ | Statuses: `pending` → `accepted` → `ready` → `completed` → `archived` |
| 6.2 | Real-Time Status Updates | ✅ | `onSnapshot` listeners in `Tracking.tsx` (2365 lines) |
| 6.3 | Status Progression Controls | ✅ | One-tap status advancement buttons |
| 6.4 | Estimated Time Display | ✅ | Countdown timer for accepted orders with estimated completion |
| 6.5 | Progress Bar | ✅ | Visual progress indicator based on elapsed/estimated time |
| 6.6 | Archive Completed Requests | ✅ | Batch archive all completed requests |
| 6.7 | Delete Archived Requests | ✅ | Batch cleanup of archived data |
| 6.8 | Stat Cards (Active/Pending/Done) | ✅ | Color-coded summary statistics |
| 6.9 | Checked-Out Guest Cleanup | ✅ | `cleanupCheckedOutFoodOrders()` removes orphaned orders |
| 6.10 | Detail Modal per Request | ✅ | `openDetails()` shows full request info including room, guest, order items |
| 6.11 | App State Change Detection | ✅ | `handleAppStateChange()` refreshes data when app comes to foreground |

### 7. Analytics Dashboard
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 7.1 | Revenue Calculation | ✅ | Total revenue from food orders + service charges |
| 7.2 | Revenue Change % | ✅ | Period-over-period revenue comparison |
| 7.3 | Occupancy Rate | ✅ | Active rooms / total rooms percentage |
| 7.4 | Service Request Breakdown | ✅ | Total, pending, in-progress, completed counts |
| 7.5 | Time Range Selector | ✅ | 7 Days / 30 Days / 12 Months filter |
| 7.6 | Metric Cards | ✅ | `MetricCard` component with icon, value, label, color |
| 7.7 | Guest Statistics | ✅ | Total guests, checked-in guests, avg stay duration |
| 7.8 | Order & Request Counts | ✅ | Total orders, total service requests, pending counts |
| 7.9 | Day/Hour Heatmap Data | ✅ | Weekday and hourly distribution constants defined |
| 7.10 | Top Items Analytics | ✅ | Most ordered items with count and revenue |
| 7.11 | Loading States | ✅ | `ActivityIndicator` while data loads |

### 8. Multi-Property Support
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 8.1 | Property Type Selector | ✅ | `ownership.tsx` — Select Hotel (active), PG, or Villa |
| 8.2 | Hotel Dashboard | ✅ | Full-featured hotel management (tabs: Dashboard, Menu, Rooms, Tracking, Analytics) |
| 8.3 | PG Dashboard (UI Shell) | ✅ | `pg-dashboard.tsx` — Sidebar nav, room grid, stat cards, resident/payment/ticket models |
| 8.4 | Villa Dashboard (UI Shell) | ✅ | `villa-dashboard.tsx` — Sidebar nav, property cards, booking list, task/payment models |
| 8.5 | Add Villa Modal | ✅ | `add-villa.tsx` — Form to add villa with name, location, beds, baths, price, status |
| 8.6 | Properties List | ✅ | `properties.tsx` — Filter & search villa properties with status badges |

### 9. App Infrastructure
| # | Feature | Status | Details |
|---|---------|--------|---------|
| 9.1 | Custom Splash Screen | ✅ | `CustomSplash.tsx` + `splash.tsx` — Animated logo reveal |
| 9.2 | Home/Landing Screen | ✅ | Feature cards, CTA button, version display |
| 9.3 | Expo Router Navigation | ✅ | File-based routing with `Stack` and `Tabs` navigators |
| 9.4 | Tab Bar Navigation | ✅ | 5 tabs: Dashboard, Menu, Rooms, Tracking, Analytics |
| 9.5 | Font Loading | ✅ | Ionicons + FontAwesome font loading with error handling |
| 9.6 | Firebase Configuration | ✅ | `firebaseConfig.ts` — Firestore + Auth initialization |
| 9.7 | Web Build (Expo Export) | ✅ | `npm run build:web` compiles for web deployment |
| 9.8 | Firebase Hosting Deploy | ✅ | `npm run deploy:web` builds and deploys to `roomio.web.app` |
| 9.9 | Electron Desktop App | ✅ | `electron-main.js` + `electron-builder` config for Windows .exe |
| 9.10 | Vercel Config | ✅ | `vercel.json` configured for alternative web deployment |

---

## 🟡 PARTIALLY IMPLEMENTED FEATURES

### P1. PG (Paying Guest) Dashboard
| # | Feature | Status | Gap |
|---|---------|--------|-----|
| P1.1 | PG Room Management | 🟡 | UI and data models exist, but CRUD operations for rooms not fully wired |
| P1.2 | Resident Management | 🟡 | `PgResidentDoc` type defined; listing and assignment logic incomplete |
| P1.3 | PG Payment Tracking | 🟡 | `PgPaymentDoc` model exists; no payment CRUD or receipt generation |
| P1.4 | PG Ticket/Complaint System | 🟡 | `PgTicketDoc` with status/priority types defined; no ticket creation flow |
| P1.5 | PG Floor-wise Room Map | 🟡 | `FloorGroup` + `RoomBubble` components exist; data binding incomplete |

### P2. Villa Dashboard
| # | Feature | Status | Gap |
|---|---------|--------|-----|
| P2.1 | Villa Property CRUD | 🟡 | Add villa works; edit/delete not implemented |
| P2.2 | Villa Booking Management | 🟡 | `BookingDoc` type exists; booking creation/listing not functional |
| P2.3 | Villa Task Management | 🟡 | `TaskDoc` model with status; no task creation or status update UI |
| P2.4 | Villa Revenue Analytics | 🟡 | `PaymentDoc` defined; no revenue calculations or charts |
| P2.5 | Villa Image Upload | 🟡 | Image URL field exists but no image upload/storage integration |

### P3. Auto Checkout Cloud Function
| # | Feature | Status | Gap |
|---|---------|--------|-----|
| P3.1 | Auto Checkout Logic | 🟡 | Cloud Function exists but queries global `rooms` collection instead of per-user `users/{uid}/rooms` sub-collection. Will not work correctly with the current multi-tenant data model. |

### P4. Analytics Visualizations
| # | Feature | Status | Gap |
|---|---------|--------|-----|
| P4.1 | Charts/Graphs | 🟡 | Data calculations are complete but no actual chart library integrated (no bar charts, line graphs, or pie charts rendered). Only metric cards shown. |
| P4.2 | Heatmap Display | 🟡 | Day/hour constants defined but heatmap not rendered visually |

---

## ❌ NOT YET IMPLEMENTED FEATURES (FROM MVP ROADMAP)

### R1. Guest-Facing Features
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| R1.1 | Guest QR Code Scanning | 🔴 HIGH | Guests scan hotel QR → opens guest portal for ordering food / requesting services |
| R1.2 | Guest Self-Service Portal | 🔴 HIGH | Web-based portal where guests can browse menu, place orders, request services |
| R1.3 | Guest Order Tracking | 🔴 HIGH | Guests see real-time status of their food orders and service requests |
| R1.4 | Guest Feedback/Rating | 🟠 MED | Guests rate their experience (room, food, service) after checkout |
| R1.5 | Guest Chat with Admin | 🟢 LOW | In-app messaging between guest and hotel admin |

### R2. Payment & Billing
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| R2.1 | Bill Generation | 🔴 HIGH | Generate final checkout bill with itemized food + service charges |
| R2.2 | Invoice PDF Export | 🔴 HIGH | Download/share bill as PDF |
| R2.3 | Payment Gateway (UPI/Card) | 🟠 MED | Online payment integration (Razorpay/PhonePe/UPI) |
| R2.4 | Payment Status Tracking | 🟠 MED | Track paid/unpaid/partial payments per guest |
| R2.5 | Revenue Reports Export | 🟢 LOW | Export analytics data as CSV/PDF |

### R3. Inventory & Housekeeping
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| R3.1 | Room Status Expanded | 🟠 MED | Add "maintenance", "dirty", "cleaning" statuses beyond available/occupied |
| R3.2 | Housekeeping Task Queue | 🟠 MED | Auto-create cleaning tasks when rooms are checked out |
| R3.3 | Inventory Tracking | 🟢 LOW | Track consumables (toiletries, linen, etc.) per room |
| R3.4 | Staff Assignment | 🟢 LOW | Assign housekeeping staff to specific rooms/tasks |

### R4. Multi-User & Roles
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| R4.1 | Staff Accounts | 🟠 MED | Create sub-accounts for hotel staff with limited permissions |
| R4.2 | Role-Based Access | 🟠 MED | Roles: Owner, Manager, Receptionist, Kitchen Staff |
| R4.3 | Activity Logs | 🟢 LOW | Track who performed which action and when |

### R5. Communication
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| R5.1 | SMS/WhatsApp Notifications | 🟠 MED | Send check-in confirmation, checkout reminder, food-ready alerts to guests |
| R5.2 | Email Notifications | 🟢 LOW | Booking confirmation emails |
| R5.3 | Admin Alert Customization | 🟢 LOW | Choose which events trigger push notifications |

### R6. Settings & Configuration
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| R6.1 | Admin Profile Settings | 🟠 MED | Edit hotel name, contact info, logo |
| R6.2 | Room Price Configuration | 🟠 MED | Set rates per room type |
| R6.3 | Tax Configuration | 🟠 MED | Configure GST/tax rates for billing |
| R6.4 | Currency Settings | 🟢 LOW | Support currencies beyond INR |
| R6.5 | Theme Customization | 🟢 LOW | Custom brand colors |

---

## 🆕 NEWLY SUGGESTED FEATURES

These features are NOT in the original MVP roadmap but are recommended based on code analysis, market trends, and user needs:

### N1. Enhanced AI Features
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| N1.1 | AI Chat Assistant | 🟠 MED | In-app AI assistant for hotel operations advice (e.g., "How should I price my rooms?") |
| N1.2 | AI Demand Prediction | 🟢 LOW | Predict busy periods based on historical booking data |
| N1.3 | AI Guest Sentiment Analysis | 🟢 LOW | Analyze guest feedback for improvement suggestions |
| N1.4 | AI Menu Pricing Suggestions | 🟠 MED | Suggest menu item prices based on location and competition |

### N2. Multi-Language Support
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| N2.1 | Hindi/Regional Language UI | 🟠 MED | i18n support for the admin dashboard |
| N2.2 | Guest Portal Multi-Language | 🟠 MED | Guests choose their preferred language |

### N3. Offline Mode
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| N3.1 | Offline Data Caching | 🟠 MED | Cache room/menu/order data for use without internet |
| N3.2 | Offline-First Sync | 🟢 LOW | Queue actions when offline, sync when connected |

### N4. Advanced Dashboard
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| N4.1 | Real-Time Occupancy Map | 🟠 MED | Visual floor plan with live room status |
| N4.2 | Competitor Pricing Monitor | 🟢 LOW | Track competitor hotel prices from OTAs |
| N4.3 | Custom Dashboard Widgets | 🟢 LOW | Drag-and-drop widget arrangement |
| N4.4 | Chart Library Integration | 🔴 HIGH | Add `react-native-chart-kit` or `victory-native` for actual graph visualizations |

### N5. Integration Ecosystem
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| N5.1 | OTA Channel Manager | 🟠 MED | Sync room availability with Booking.com, MakeMyTrip, etc. |
| N5.2 | POS Integration | 🟢 LOW | Integration with restaurant POS for order sync |
| N5.3 | Google Calendar Sync | 🟢 LOW | Sync bookings to admin's calendar |
| N5.4 | Accounting Software Export | 🟢 LOW | Export data to Tally/QuickBooks |

### N6. Security & Compliance
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| N6.1 | Two-Factor Auth (2FA) | 🟠 MED | Add phone/OTP-based 2FA for admin login |
| N6.2 | Data Encryption at Rest | 🟢 LOW | Encrypt sensitive guest data in Firestore |
| N6.3 | GDPR/Data Privacy Compliance | 🟢 LOW | Guest data deletion on request |
| N6.4 | Firestore Security Rules | 🔴 HIGH | Implement proper read/write rules (currently may be open) |

### N7. Guest Experience
| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| N7.1 | Dynamic Menu Display for Guests | 🔴 HIGH | Guests scan QR → see categorized menu with availability |
| N7.2 | Cart & Checkout for Guests | 🔴 HIGH | Guests add items to cart and place orders |
| N7.3 | Special Dietary Filters | 🟠 MED | Filter menu by veg, vegan, gluten-free |
| N7.4 | Room Service Catalog | 🟠 MED | Browse and order toiletries, towels, pillows, etc. |

---

## 🗃️ DATABASE SCHEMA (Firestore)

```
firestore/
├── users/
│   └── {adminUid}/
│       ├── [Document Fields]
│       │   ├── email: string
│       │   ├── name: string
│       │   ├── hotelName: string
│       │   ├── onboardingCompleted: boolean
│       │   ├── createdAt: Timestamp
│       │   └── lastLogin: Timestamp
│       │
│       ├── rooms/
│       │   └── {roomId}/
│       │       ├── roomNumber: number
│       │       ├── status: "available" | "occupied"
│       │       ├── guestName: string | null
│       │       ├── guestMobile: string | null
│       │       ├── guestId: string | null
│       │       ├── mealPlan: ["breakfast","lunch","dinner"]
│       │       ├── assignedAt: Timestamp | null
│       │       ├── checkoutAt: Timestamp | null
│       │       └── createdAt: Timestamp
│       │
│       ├── menu/
│       │   └── {menuItemId}/
│       │       ├── name: string
│       │       ├── category: string
│       │       ├── description: string
│       │       ├── price: number
│       │       ├── isAvailable: boolean
│       │       ├── isVeg: boolean
│       │       ├── createdAt: Timestamp
│       │       └── updatedAt: Timestamp
│       │
│       ├── serviceRequests/
│       │   └── {requestId}/
│       │       ├── type: string
│       │       ├── status: "pending"|"accepted"|"ready"|"completed"|"archived"
│       │       ├── roomNumber: number
│       │       ├── guestName: string
│       │       ├── guestMobile: string
│       │       ├── estimatedTime: number (minutes)
│       │       ├── charges: number
│       │       ├── notes: string
│       │       ├── source: string
│       │       ├── createdAt: Timestamp
│       │       ├── acceptedAt: Timestamp
│       │       ├── readyAt: Timestamp
│       │       └── completedAt: Timestamp
│       │
│       ├── foodOrders/
│       │   └── {orderId}/
│       │       ├── roomNumber: number
│       │       ├── guestName: string
│       │       ├── guestMobile: string
│       │       ├── items: [{name, qty, price}]
│       │       ├── totalAmount: number
│       │       ├── status: string
│       │       ├── estimatedTime: number
│       │       ├── source: string
│       │       ├── createdAt: Timestamp
│       │       ├── acceptedAt: Timestamp
│       │       └── completedAt: Timestamp
│       │
│       ├── villas/          (for villa property type)
│       │   └── {villaId}/
│       │       ├── name, location, status, pricePerNight
│       │       ├── beds, baths, imageUrl
│       │       └── createdAt: Timestamp
│       │
│       ├── bookings/        (for villa bookings)
│       ├── tasks/           (for villa maintenance)
│       ├── payments/        (for villa payments)
│       ├── pgRooms/         (for PG rooms)
│       ├── pgResidents/     (for PG residents)
│       ├── pgPayments/      (for PG payments)
│       └── pgTickets/       (for PG complaints)
```

---

## 📁 FILE STRUCTURE REFERENCE

```
new/Rooomio/
├── app/
│   ├── _layout.tsx           # Root layout (Stack navigator + custom splash)
│   ├── index.tsx             # Entry redirect
│   ├── splash.tsx            # Animated splash screen
│   ├── home.tsx              # Landing/welcome screen
│   ├── admin-login.tsx       # Admin login form (1060 lines)
│   ├── login-success.tsx     # Post-login success animation
│   ├── onboarding.tsx        # First-time setup wizard (527 lines)
│   ├── ownership.tsx         # Property type selector (Hotel/PG/Villa)
│   ├── properties.tsx        # Villa property listing (778 lines)
│   ├── pg-dashboard.tsx      # PG management dashboard (979 lines)
│   ├── villa-dashboard.tsx   # Villa management dashboard (982 lines)
│   ├── (tabs)/
│   │   ├── _layout.tsx       # Tab navigator (5 tabs)
│   │   ├── dashboard.tsx     # Main admin dashboard (1320 lines)
│   │   ├── Menu.tsx          # Menu management + AI scan (1050 lines)
│   │   ├── rooms.tsx         # Room management (2928 lines) ⭐ LARGEST FILE
│   │   ├── Tracking.tsx      # Order/service tracking (2365 lines)
│   │   └── analytics.tsx     # Analytics dashboard (1472 lines)
│   └── modals/
│       ├── add-guest.tsx     # Guest check-in form (1464 lines)
│       └── add-villa.tsx     # Add villa form (666 lines)
├── components/
│   ├── CustomSplash.tsx      # Splash screen component
│   └── ui/                   # UI primitives
├── firebase/
│   └── firebaseConfig.ts     # Firebase initialization
├── functions/
│   └── index.js              # Firebase Cloud Functions (auto-checkout)
├── hooks/
│   ├── use-color-scheme.ts   # Theme detection
│   └── use-theme-color.ts    # Theme color utility
├── lib/
│   └── aiService.ts          # AI/OCR/Gemini integration (339 lines)
├── utils/
│   ├── auth.js               # Auth utilities
│   ├── setupRooms.ts         # Room bulk creation
│   └── userData.js           # User data access helpers
├── assets/
│   └── images/               # Logo and static assets
├── package.json              # Dependencies and scripts
├── firebase.json             # Firebase hosting config
├── vercel.json               # Vercel deployment config
├── electron-main.js          # Electron entry point
└── app.json                  # Expo app configuration
```

---

## ⚠️ KNOWN ISSUES & TECH DEBT

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | `rooms.tsx` is 2928 lines | 🟠 MED | Should be refactored into smaller components (RoomCard, RoomDetailModal, etc.) |
| 2 | Cloud Function uses wrong path | 🔴 HIGH | `autoCheckoutRooms` queries `rooms` collection instead of `users/{uid}/rooms` |
| 3 | No Firestore Security Rules | 🔴 HIGH | Database may be open to unauthorized access |
| 4 | Firebase API key in source | 🟠 MED | Config hardcoded in `firebaseConfig.ts` (acceptable for client-side Firebase, but `.env` better) |
| 5 | No error boundary | 🟡 LOW | App crashes if an unhandled JS error occurs |
| 6 | No unit tests | 🟠 MED | Zero test files in the project |
| 7 | No chart visualizations | 🟠 MED | Analytics data is calculated but displayed only as numbers, no graphs |
| 8 | PG/Villa dashboards are UI-only | 🟠 MED | Models and UI exist but data operations are incomplete |
| 9 | OCR.space API key hardcoded | 🟠 MED | Should be moved to environment variables |
| 10 | No image storage | 🟡 LOW | Villa images use URL strings but no Firebase Storage integration |

---

## 🚀 DEPLOYMENT STATUS

| Platform | Status | URL/Config |
|----------|--------|------------|
| **Web (Firebase Hosting)** | ✅ Live | `roomio.web.app` / `roomio-admin.web.app` |
| **Web (Vercel)** | ✅ Configured | `vercel.json` present |
| **Android (Expo Go)** | ✅ Works | `npx expo start --android` |
| **iOS (Expo Go)** | ✅ Works | `npx expo start --ios` |
| **Desktop (Electron)** | ✅ Configured | `npm run dist` builds Windows .exe |
| **Play Store (APK/AAB)** | ❌ Not done | EAS Build configured (`eas.json`) but not published |
| **App Store (iOS)** | ❌ Not done | Not submitted |

---

## 📊 OVERALL PROGRESS SUMMARY

| Category | Implemented | Partial | Remaining | New Suggestions |
|----------|------------|---------|-----------|-----------------|
| Auth & User Management | 7 | 0 | 0 | 1 |
| Onboarding | 8 | 0 | 0 | 0 |
| Dashboard | 9 | 0 | 0 | 3 |
| Room Management | 13 | 0 | 4 | 1 |
| Menu Management | 17 | 0 | 0 | 2 |
| Tracking | 11 | 0 | 0 | 0 |
| Analytics | 11 | 2 | 0 | 1 |
| Multi-Property | 6 | 5 | 0 | 0 |
| Infrastructure | 10 | 1 | 0 | 1 |
| Guest-Facing | 0 | 0 | 5 | 4 |
| Payments & Billing | 0 | 0 | 5 | 0 |
| Housekeeping | 0 | 0 | 4 | 0 |
| Multi-User & Roles | 0 | 0 | 3 | 0 |
| Communication | 0 | 0 | 3 | 0 |
| Settings | 0 | 0 | 5 | 0 |
| **TOTAL** | **92** | **8** | **29** | **13** |

### 🎯 Completion Rate: **~72%** of MVP features fully implemented

---

## 🗺️ RECOMMENDED PRIORITY ORDER FOR REMAINING WORK

### Phase 1 — Critical (Next 2 weeks)
1. ❌ **Guest QR Scanning + Self-Service Portal** (R1.1, R1.2, N7.1, N7.2) — This is the core differentiator
2. ❌ **Bill Generation + Invoice PDF** (R2.1, R2.2) — Must-have for any hotel
3. 🔴 **Fix Cloud Function path** (Tech Debt #2)
4. 🔴 **Firestore Security Rules** (N6.4)
5. 🔴 **Chart Library Integration** (N4.4) — Complete analytics visuals

### Phase 2 — Important (Next 4 weeks)
6. ❌ **Guest Order Tracking** (R1.3)
7. ❌ **Payment Gateway** (R2.3)
8. 🟡 **Complete PG Dashboard** (P1.1-P1.5)
9. 🟡 **Complete Villa Dashboard** (P2.1-P2.5)
10. ❌ **SMS/WhatsApp Notifications** (R5.1)

### Phase 3 — Nice to Have (Next 2 months)
11. ❌ **Staff Accounts & Roles** (R4.1, R4.2)
12. ❌ **Housekeeping System** (R3.1-R3.4)
13. ❌ **Admin Settings Page** (R6.1-R6.5)
14. 🆕 **AI Chat Assistant** (N1.1)
15. 🆕 **Multi-Language Support** (N2.1, N2.2)

---

*This document is designed to provide complete context to any AI assistant or developer continuing work on Rooomio. It includes all implemented code references, database structure, and remaining feature requirements.*
