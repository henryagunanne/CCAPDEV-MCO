![Course](https://img.shields.io/badge/Course-CCAPDEV-blue)
![Institution](https://img.shields.io/badge/Institution-De%20La%20Salle%20University-green)

![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![Express](https://img.shields.io/badge/Framework-Express-blue)
![Jest](https://img.shields.io/badge/Testing-Jest-red)
![HTML5](https://img.shields.io/badge/HTML5-%3E%3D5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-%3E%3D3-1572B6?logo=css3&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-v5-purple?logo=bootstrap&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?logo=javascript&logoColor=black)
![jQuery](https://img.shields.io/badge/jQuery-v3.6-blue?logo=jquery&logoColor=white)

![License](https://img.shields.io/badge/License-MIT-yellow)
![Academic Project](https://img.shields.io/badge/Project-Type%3A%20Academic-lightgrey)

---

# CCAPDEV-MCO

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
- Implement **RESTful routing and MVC principles**
- Develop dynamic frontend views with clean separation of concerns
- Apply **automated testing** using Jest
- Follow **software engineering best practices** in structure, naming, and documentation
- Collaborate effectively in a team-based development environment

---

## 🧩 Technology Stack

| Layer | Technologies Used |
|------|------------------|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express |
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

```

### Running the Application

```bash
npm start
```
or
```bash
npm server.js
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

### 📌 Skills Demonstrated (Recruiter-Focused)
- Full-Stack Web Development
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

