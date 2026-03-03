# Stork Movement Explorer

A Node/Express + PostgreSQL web application for visualising and clustering white stork GPS migration data.

The system includes a Python-based preprocessing pipeline for ingesting and transforming raw GPS datasets before loading them into the database.

---

## Overview

The application consists of:

- PostgreSQL database (stores processed movement data)
- Node/Express server (serves the web interface)
- Frontend visualisation layer
- Python data processing pipeline (runs once to prepare data)

---

## Dataset

The original migration datasets (4 CSV files) are available at:

[Kaggle Dataset Link](https://www.kaggle.com/datasets/kristopherkilsby/stork-dataset-2016-2022)


After downloading, place the CSV files in:

backend/datasets/

The preprocessing pipeline is currently configured specifically for these four files.

If using different datasets, file paths must be updated in:

backend/app/services/data_processing.py  
backend/run_script.py

Note:  
The initial preprocessing step takes approximately 120–130 minutes on first run.

---

## System Requirements

- Node.js 18+
- npm
- Python 3.10+
- PostgreSQL 14+

Recommended:
- Python virtual environment (venv)

---

## Installation

### 1. Clone Repository

git clone https://github.com/kriskilsby/storkproject.git  
cd storkproject  

---

### 2. Database Setup

1. Install PostgreSQL.
2. Create a new database.
3. Create a file:

backend/.env

Add:

DB_NAME=your_database_name  
DB_USER=your_username  
DB_PASSWORD=your_password  
DB_HOST=localhost  
DB_PORT=5432  

4. Create database schema by running:

backend/db/table-setup.sql

---

### 3. Python Setup (Data Processing)

Create and activate virtual environment (optional but recommended):

# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python -m venv venv
source venv/bin/activate

Install required packages:

pip install -r requirements.txt  

---

### 4. Run Data Processing Pipeline

cd backend  
python run_script.py  

This will:

- Load CSV files  
- Process and clean the data  
- Insert processed records into PostgreSQL  

This step only needs to be completed once unless the dataset changes.

---

### 5. Run the Application

Navigate to the frontend folder:

cd frontend  
npm install  

Start the server:

node server.js  

Development mode (optional):

npm run dev  

A helper PowerShell script is also included:

.\run.ps1  

---

## Storage Requirements

- Approximately 20–30GB storage recommended
- Designed for internal or controlled network deployment

---

## Notes

- No external API integrations required.
- Dataset consists of wildlife GPS tracking data.
- The preprocessing pipeline is tailored to the original dataset structure.
