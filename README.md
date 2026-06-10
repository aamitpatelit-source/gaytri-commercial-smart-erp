# Gaytri Commercial Smart ERP

An enterprise-grade, offline-first AI-powered Employee Attendance and Payroll management system with Face Recognition verification.

---

## 📂 Project Architecture

```
gaytri-commercial-smart-erp/
├── backend/                  # Node.js + Express + TypeScript Backend
│   ├── database/             # PostgreSQL migrations & SQL schemas
│   ├── src/                  # Controllers, Middlewares, and Routings
│   └── .env.example
├── web_admin/                # Next.js App Router Web Admin Dashboard (Tailwind CSS)
│   ├── src/app/              # Next.js Routes (Dashboard, Roster, Payroll, Inventory)
│   └── src/components/       # Custom Glassmorphic layouts
└── mobile_app/               # Flutter Material 3 Mobile Client (Clean Architecture)
    ├── lib/core/             # Services: Face recognition, SQLite storage
    ├── lib/data/             # Serializations & Database Models
    └── lib/presentation/     # Splash, Logins, dashboards, scan viewfinder
```

---

## 🛠️ Environment Configuration & Launch Guide

### 1. PostgreSQL Database Config
Create a database named `gaytri_erp` in PostgreSQL, then configure your `.env` in `/backend`:
```env
PORT=5000
JWT_SECRET=gaytri_commercial_smart_erp_jwt_secret_2026
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=YOUR_PASSWORD
DB_NAME=gaytri_erp
```

To run the backend server:
```bash
cd backend
npm install
npm run dev
```
*Note: The backend is self-bootstrapping. On startup, it automatically verifies and seeds default departments, shifts, and a default administrator account:*
- **Employee ID**: `GC-0001`
- **Password**: `AdminPassword123`

### 2. Next.js Web Admin Console Launch
Configure Tailwind configurations and start the Web portal:
```bash
cd web_admin
npm install
npm run dev
```
Login with the seeded Administrator account credentials (`GC-0001` / `AdminPassword123`).

---

## 📑 Core API Routes (Documentation v1.0)

All protected endpoint requests require header `Authorization: Bearer <jwt_token>`.

### Authentication
- `POST /api/v1/auth/login`
  - Body: `{ "employee_id": "GC-0001", "password": "AdminPassword123" }`
  - Output: Return status, auth JWT Token, and profile metadata.
- `GET /api/v1/auth/me`
  - Output: Current profile status and shift assignments.

### Employee Management (Roster)
- `GET /api/v1/employees`
  - Output: Roster list of all registered employees with face enrollment flags.
- `POST /api/v1/employees`
  - Access: `ADMIN` only.
  - Body: Register properties (Name, Dept, Mobile, Joining Date, Shift, Salary).
- `POST /api/v1/employees/:id/face`
  - Body: `{ "face_embedding": [float array of 128 elements], "profile_photo_url": "url_string" }`
  - Output: Logs face signature vectors.

### Attendance Check
- `POST /api/v1/attendance/verify`
  - Body: `{ "face_embedding": [128 floats], "gps_lat": 23.0225, "gps_lng": 72.5714, "device_id": "Redmi K50" }`
  - Logic: Computes dot-product cosine similarity matching against registered signatures. Calculates status (Late vs Present check-ins, or Check-Outs).
- `POST /api/v1/attendance/sync`
  - Body: Bulk uploads offline SQLite logs captured during network disconnects.

---

## 📱 Flutter & Android SDK Setup Guide

Follow these instructions to compile and build the Android application locally on your computer.

### Prerequisites

1. **Install Java JDK 17**:
   - Download the installer from [Eclipse Adoptium](https://adoptium.net) (Temurin JDK 17).
   - Ensure `JAVA_HOME` environment variable is pointing to the installation path.

2. **Install Flutter SDK**:
   - Download the latest stable bundle from [Flutter Website](https://docs.flutter.dev/get-started/install/windows).
   - Extract the zip folder (e.g. into `C:\src\flutter`).
   - Add `C:\src\flutter\bin` to your User Environment `PATH` variables.
   - Run verification check in terminal:
     ```bash
     flutter doctor
     ```

3. **Install Android Studio & Command-Line SDKs**:
   - Install Android Studio from [Android Studio Site](https://developer.android.com/studio).
   - Open Android Studio -> Tools -> SDK Manager.
   - Select **Android 13.0 (Tiramisu)** or Android 14.
   - Go to SDK Tools tab and verify that the following are checked:
     - *Android SDK Build-Tools*
     - *Android SDK Command-line Tools (latest)*
     - *Android Emulator*
     - *NDK (Side by side)* (Required for TensorFlow Lite / OpenCV C++ builds)
   - Click Apply to download and configure.
   - Set environment variables:
     - `ANDROID_HOME` pointing to `C:\Users\YOUR_USERNAME\AppData\Local\Android\Sdk`

### Building the Mobile Application APK
Run commands:
```bash
cd mobile_app
flutter pub get
flutter build apk --release
```
The output file will be written to:
`mobile_app/build/app/outputs/flutter-apk/app-release.apk`
Copy this file onto the Android manager device to deploy the app.
