# CCAPDEV-MCO

---
![Course](https://img.shields.io/badge/Course-CCAPDEV-blue)
![Institution](https://img.shields.io/badge/Institution-De%20La%20Salle%20University-green)

![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![Express](https://img.shields.io/badge/Framework-Express-blue)
![Express%20Handlebars](https://img.shields.io/badge/View%20Engine-Express%20Handlebars-orange)
![Jest](https://img.shields.io/badge/Testing-Jest-red)
![HTML5](https://img.shields.io/badge/HTML5-%3E%3D5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-%3E%3D3-1572B6?logo=css3&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-v5-purple?logo=bootstrap&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?logo=javascript&logoColor=black)
![jQuery](https://img.shields.io/badge/jQuery-v3.6-blue?logo=jquery&logoColor=white)

![License](https://img.shields.io/badge/License-MIT-yellow)
![Academic Project](https://img.shields.io/badge/Project-Type%3A%20Academic-lightgrey)

--- 

**Major Course Output (MCO) — CCAPDEV**  
A full-stack web application developed as a major academic deliverable, demonstrating industry-standard backend architecture, frontend integration, and automated testing using modern JavaScript technologies.

---

## 🧠 Project Overview

CCAPDEV-MCO is a comprehensive full-stack application created as part of the **CCAPDEV Major Course Output** requirement. The project emphasizes clean software architecture, modular design, and real-world development practices aligned with professional engineering standards.

This repository is intended to serve both as an **academic submission** and a **portfolio-ready project**, showcasing the ability to design, implement, test, and document a maintainable web application.

---

## 👥 Team Members

| Name | Primary Responsibilities |
|-----|--------------------------|
| **Henry Agunanne** | Backend Architecture, Server Logic, Database Integration |
| **Ken Latido** | Frontend Development, UI/UX Implementation |
| **Matthew Lapura** | Feature Development, System Integration |
| **Alek John Medran** | Testing, Validation, Quality Assurance |

---

## 🎯 Learning Objectives & Outcomes

Through this project, the team demonstrated the ability to:

- Design a **scalable backend architecture** using Node.js and Express
- Implement **MVC principles** with clear separation of concerns
- Render **dynamic server-side pages** using Express Handlebars
- Develop reusable layouts, partials, and view templates
- Apply **RESTful routing** and structured middleware
- Implement **automated testing** using Jest
- Follow **software engineering best practices** in structure, naming, and documentation
- Collaborate effectively in a team-based development environment

---

## 🧩 Technology Stack

| Layer | Technologies Used |
|------|------------------|
| Frontend | HTML, CSS, JavaScript |
| View Engine | Express Handlebars |
| Backend | Node.js, Express |
| Database | MongoDB |
| Testing | Jest |
| Tooling | npm, Git |
| Architecture | MVC Pattern |

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm
- MongoDB Community Edition

> ⚠️ **Important:**  
> MongoDB **must be running** before starting the application. The server depends on an active MongoDB connection.

---

## 🗄️ Running MongoDB

### macOS (using Homebrew)

1. Install MongoDB (if not yet installed):

```bash
brew tap mongodb/brew
brew install mongodb-community
```

2. Start the MongoDB service:

```bash
brew services start mongodb-community
```

3. Verify MongoDB is running:

```bash
mongosh
```

If the MongoDB shell opens successfully, the database is running.


### Windows

1. Download and install **MongoDB Community Server** from the official website:  
   https://www.mongodb.com/try/download/community

2. During installation, ensure that:
   - **“Install MongoDB as a Service”** is checked (recommended)

3. Start MongoDB manually (if it is not running automatically):
   - Open **Services**
   - Locate **MongoDB Server**
   - Click **Start**

4. Verify MongoDB is running:

```bash
mongosh
```

--- 

### Installation

```bash
git clone https://github.com/henryagunanne/CCAPDEV-MCO.git
cd CCAPDEV-MCO
npm install
cp .env.example .env
```

### Environment Configuration

Before starting the application, configure the required environment variables in `.env`:

```bash
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/airlineDB
SESSION_SECRET=replace-with-a-long-random-secret
PASSPORT_ENCRYPTION_KEY=base64-encoded-32-byte-key
MFA_ENCRYPTION_KEY=base64-encoded-32-byte-key
ADMIN_EMAIL=admin@yourdomain.com
DPO_CONTACT=approved-DPO-contact
```

Generate each encryption key independently with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and keep them outside MongoDB, source control, and backups. Keep `MFA_ENCRYPTION_KEY` stable across deployments; changing it without first re-encrypting enrolled MFA secrets will prevent administrators from verifying their authenticators. The application will refuse to start when required values are missing in a non-test environment. Configure the approved DPO contact and publish the versioned holiday calendars before processing privacy requests.

### MCO2 Privacy Data Operations

The privacy migration and C-18 retention job are dry-run by default. Review their counts before any write operation:

```bash
npm run migrate:privacy-data
npm run retention:c18
```

Applying either operation requires the script-specific confirmation flag (`--apply --confirm=APPLY-PRIVACY-MIGRATION` or `--apply --confirm=RUN-MCO2-C18`). Do not use those flags against existing data without explicit approval and a verified backup. Retention uses `Flight.completedAt` as the last-flight completion signal; the application does not currently define a workflow that sets that field, so passenger retention actions are skipped until an authoritative completion source is configured.

### Provisioning the First Administrator

The first administrator is created with a dedicated one-time CLI command. This avoids automatically creating a default admin account during normal startup.

```bash
npm run provision:admin
```

The script will prompt for:
- the approved administrator email address
- the initial password, entered securely without echoing it back to the terminal

It refuses to create another administrator if one already exists, and it does not print the password to the console.

The provisioned account is the protected administrator-management authority. Administrators with the existing `user_access_admin` role may manage accounts only within their own permission set; other roles do not receive account-management access. From **Admin Management**, an authorized administrator can create employed accounts, assign an available role, and activate or deactivate accounts. Role and status changes are audited and require the affected administrator to sign in again.

New administrators receive a one-time setup link to choose their own password. The link expires after 24 hours and is displayed only after account creation; share it with the administrator using a secure channel. No email integration is configured by this application. For an existing installation, configure `ADMIN_EMAIL` to the original provisioned administrator's email address; that account is marked as the protected administrator the next time it accesses an admin page.

### Administrator MFA

Administrators enroll an authenticator on their first login and must enter a fresh authenticator code on every subsequent login. Password authentication alone creates only a five-minute MFA-pending session and does not grant administrator access. Existing `mfaVerified` database values do not bypass the challenge.

After completing login MFA, an administrator with Security Center access can replace their authenticator by verifying the current authenticator or using one unused recovery code, then confirming a code from the new authenticator. The previous authenticator remains valid until replacement is confirmed. Recovery codes are shown once, stored as hashes, and invalidated when the authenticator is replaced. Keep recovery codes securely; if both the authenticator and recovery codes are lost, use the controlled administrator account recovery process.

### Preparing Flight Seat Configurations

Before bookings are enabled, import the supplied synthetic seat configurations and reconcile existing reservations. Both commands are read-only by default and require an explicit `--apply` to write data. Configure `MONGODB_URI` in `.env` first.

```bash
# Review the planned flight/layout matches
npm run import:aircraft-configurations

# Apply the layout import only after reviewing the dry-run output
npm run import:aircraft-configurations -- --apply

# Audit active reservations, seat claims, and capacity
npm run migrate:booking-integrity

# Apply the allocation/index/capacity migration only when the audit reports no conflicts
npm run migrate:booking-integrity -- --apply
```

The migration intentionally stops when existing reservations need reconciliation, including round trips without a return seat. Resolve those conflicts before applying. Do not run either `--apply` command against a production database without an approved backup and deployment window. Booking and seat-availability endpoints remain unavailable until the migration verifies the unique seat index and marks booking integrity ready.


## Database seeding

See [`scripts/seeds/README.md`](scripts/seeds/README.md) for the non-destructive `npm run seed` workflow, model coverage, execution order, and legacy booking-integrity migration guidance. Application startup no longer inserts demo records automatically. Provision administrators separately with `npm run provision:admin`.


### Running the Application

```bash
npm run dev
```
or to start without the file watcher:
```bash
npm start
```

### The application will be available at:
```bash
http://localhost:3000
```
Both commands use HTTP development mode.

## Local HTTPS Setup (Production Simulation)

Production simulation uses a local HTTPS listener on the configured `PORT`. The default certificate paths are relative to the project root:

```text
certs/localhost.pem
certs/localhost-key.pem
```

The certificate must cover `localhost`, `127.0.0.1`, and `::1`. Do not put generated certificates or private keys in Git.

### Windows

1. Install mkcert, for example with Chocolatey from an elevated PowerShell:

   ```powershell
   choco install mkcert
   ```

   Alternatively, install it with another supported Windows package manager.
2. Verify it is installed:

   ```powershell
   mkcert -version
   ```
3. Install and trust the local CA:

   ```powershell
   mkcert -install
   ```
4. From the project root, create the certificate directory and generate the localhost certificate:

   ```powershell
   New-Item -ItemType Directory -Force certs
   mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1
   ```
5. Inspect the local CA directory:

   ```powershell
   mkcert -CAROOT
   ```

   The CA private key is stored in that CA directory. Never share it, copy it into the repository, or commit it.

### macOS

1. If Homebrew is not installed, install it using the instructions at [brew.sh](https://brew.sh/).
2. Install mkcert and verify it:

   ```bash
   brew install mkcert
   mkcert -version
   ```
3. Install and trust the local CA:

   ```bash
   mkcert -install
   ```
4. From the project root, create the certificate directory and generate the localhost certificate:

   ```bash
   mkdir -p certs
   mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1
   ```
5. Inspect the local CA directory:

   ```bash
   mkcert -CAROOT
   ```

   Keep the CA private key in that directory. Never share it, copy it into the repository, or commit it.

### Run the application

Development continues to use HTTP:

```bash
npm run dev
# or
npm start
```

Open `http://localhost:3000`.

For production simulation, set `NODE_ENV=production` and use the local certificates. The npm script also selects production mode:

PowerShell:

```powershell
$env:NODE_ENV = "production"
$env:TLS_MODE = "local"
npm run start:production
```

macOS/Linux:

```bash
export NODE_ENV=production
export TLS_MODE=local
npm run start:production
```

Open `https://localhost:3000`. To use different certificate locations, set `TLS_CERT_PATH` and `TLS_KEY_PATH` to paths relative to the project root. Absolute paths and paths outside the project are rejected.

For an actual deployment behind a TLS-terminating reverse proxy, use `NODE_ENV=production` and `TLS_MODE=proxy`, configure `TRUSTED_PROXY_CIDRS` for the proxy, and let the proxy manage the public certificate. Do not deploy the local mkcert certificates or CA private key.

### Troubleshooting and security notes

- **Browser trust warning:** run `mkcert -install` for the current OS user, then restart the browser. Confirm you opened `https://localhost:3000` and generated the certificate for all three required hostnames.
- **Missing certificate or private key:** production simulation intentionally fails instead of falling back to HTTP. Generate the files above, or set `TLS_CERT_PATH` and `TLS_KEY_PATH` to valid project-relative paths.
- **Hostname mismatch:** regenerate the certificate with `localhost 127.0.0.1 ::1` and browse using one of those names.
- **`mkcert` not recognized:** complete the package-manager installation and restart the terminal so its updated `PATH` is loaded.
- **CA installation fails:** use an account with permission to add a trusted local CA, rerun `mkcert -install`, and check `mkcert -CAROOT`. Never distribute or commit the CA private key.
- **Port already in use:** stop the other local service or set a different `PORT` before starting the app.
- **Regenerating certificates:** rerun the certificate command from the project root. If the local CA was changed or reinstalled, trust it again with `mkcert -install` and restart the browser.
- Local mkcert certificates are only for development and production simulation. Actual production must use a trusted CA or managed TLS infrastructure.
- HTTPS to this app does not automatically encrypt MongoDB or third-party service connections; configure those connections separately.
- Never commit or share the localhost private key, the local CA private key, or any production private key.

### Optional: Stopping MongoDB

**macOS**

```bash
brew services stop mongodb-community
```

**Windows**
- Stop MongoDB Server from the Services menu 


---


### 🧪 Testing
Automated tests are implemented using Jest to ensure correctness and stability.
```bash
npm test
```

---

### 📄 Project Documentation
The official MCO Project Specifications Document is included in this repository. It outlines the system requirements, scope, and evaluation criteria for academic review.

---

### 📌 Skills Demonstrated
- Full-Stack Web Development
- Server-Side Rendering with Express Handlebars
- RESTful API Design
- MVC Architecture
- Backend Engineering with Node.js
- Frontend Integration
- Automated Testing & QA
- Version Control with Git
- Technical Documentation
- Team Collaboration

---

### 🔮 Future Improvements
- UI/UX refinements
- Deployment to cloud infrastructure

---

### 📄 License
This project is licensed under the **MIT License**.  
See the [LICENSE](./LICENSE) file for full details.

---

## 📄 AI Assistance Disclosure

This README file was generated with the assistance of ChatGPT and was reviewed, edited, and verified by the project authors.  
All source code, system design, and implementation were fully developed by the authors. 
