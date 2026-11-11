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
ADMIN_EMAIL=admin@yourdomain.com
```

The application will refuse to start when the required values are missing in a non-test environment.

### Provisioning the First Administrator

The first administrator is created with a dedicated one-time CLI command. This avoids automatically creating a default admin account during normal startup.

```bash
npm run provision:admin
```

The script will prompt for:
- the approved administrator email address
- the initial password, entered securely without echoing it back to the terminal

It refuses to create another administrator if one already exists, and it does not print the password to the console.

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

### Running the Application

```bash
npm start
```
or
```bash
node server.js
```

### The application will be available at:
```bash
http://localhost:3000
```

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
- Standardize user authentication and authorization
- Improve database models and fields
- Persistent database deployment
- Enhance test coverage
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
