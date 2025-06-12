# scripts/test_env.py

import os
from dotenv import load_dotenv
from pathlib import Path

# env_path = Path(__file__).resolve().parents[2] / '.env'
env_path = Path(__file__).resolve().parents[1] / 'backend' / '.env'

print("Loading from:", env_path)
load_dotenv(dotenv_path=env_path)

print("DB_USER:", os.getenv("DB_USER"))
print("DB_PASSWORD:", os.getenv("DB_PASSWORD"))
print("DB_HOST:", os.getenv("DB_HOST"))
print("DB_NAME:", os.getenv("DB_NAME"))
print("DB_PORT:", os.getenv("DB_PORT"))
